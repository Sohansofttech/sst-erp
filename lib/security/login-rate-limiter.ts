import crypto from "crypto";
import db from "@/lib/db";

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: "ACCOUNT" | "IP" | "DATABASE_UNAVAILABLE";
}

const ACCOUNT_MAX_FAILURES = 5;
const IP_MAX_FAILURES = 20;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

// In-memory fallback map for multi-process or table-pending environments
interface MemoryBucket {
  count: number;
  windowStart: number;
  lockedUntil: number | null;
}
const memoryBuckets = new Map<string, MemoryBucket>();

function normalizeIdentifierKey(identifier?: string | null): string | null {
  if (!identifier) return null;
  const clean = identifier.trim().toLowerCase();
  return clean ? `user:${clean}` : null;
}

function normalizeIpKey(ip?: string | null): string | null {
  if (!ip) return null;
  const clean = ip.trim();
  return clean ? `ip:${clean}` : null;
}

function checkMemoryBucket(key: string, maxFailures: number, now: number): { allowed: boolean; retryAfter?: number } {
  const bucket = memoryBuckets.get(key);
  if (!bucket) return { allowed: true };

  if (bucket.lockedUntil && now < bucket.lockedUntil) {
    const retryAfter = Math.ceil((bucket.lockedUntil - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  if (now - bucket.windowStart >= WINDOW_MS) {
    memoryBuckets.delete(key);
    return { allowed: true };
  }

  if (bucket.count >= maxFailures) {
    bucket.lockedUntil = now + LOCKOUT_MS;
    const retryAfter = Math.ceil(LOCKOUT_MS / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

function recordMemoryFailure(key: string, maxFailures: number, now: number): void {
  const bucket = memoryBuckets.get(key) || { count: 0, windowStart: now, lockedUntil: null };
  if (now - bucket.windowStart >= WINDOW_MS) {
    bucket.count = 1;
    bucket.windowStart = now;
    bucket.lockedUntil = null;
  } else {
    bucket.count += 1;
    if (bucket.count >= maxFailures) {
      bucket.lockedUntil = now + LOCKOUT_MS;
    }
  }
  memoryBuckets.set(key, bucket);
}

function resetMemoryBucket(key: string): void {
  memoryBuckets.delete(key);
}

/**
 * Evaluates whether a login attempt is permitted under account and IP rate limits.
 * Checks both database `LoginRateLimit` and in-memory cache fallback.
 */
export async function checkLoginRateLimit(params: {
  ip?: string | null;
  identifier?: string | null;
  failClosedOnDbError?: boolean;
}): Promise<RateLimitCheckResult> {
  const now = Date.now();
  const accountKey = normalizeIdentifierKey(params.identifier);
  const ipKey = normalizeIpKey(params.ip);

  // 1. In-memory check
  if (accountKey) {
    const memCheck = checkMemoryBucket(accountKey, ACCOUNT_MAX_FAILURES, now);
    if (!memCheck.allowed) {
      return { allowed: false, retryAfterSeconds: memCheck.retryAfter, reason: "ACCOUNT" };
    }
  }
  if (ipKey) {
    const memCheck = checkMemoryBucket(ipKey, IP_MAX_FAILURES, now);
    if (!memCheck.allowed) {
      return { allowed: false, retryAfterSeconds: memCheck.retryAfter, reason: "IP" };
    }
  }

  // 2. Database check (multi-instance shared state)
  const keysToCheck = [accountKey, ipKey].filter(Boolean) as string[];
  if (keysToCheck.length === 0) return { allowed: true };

  try {
    const records = await db.loginRateLimit.findMany({
      where: { key: { in: keysToCheck } },
    });

    for (const record of records) {
      const isAccount = record.key.startsWith("user:");
      const maxFailures = isAccount ? ACCOUNT_MAX_FAILURES : IP_MAX_FAILURES;

      // Active lockout
      if (record.lockedUntil && record.lockedUntil.getTime() > now) {
        const retryAfterSeconds = Math.ceil((record.lockedUntil.getTime() - now) / 1000);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, retryAfterSeconds),
          reason: isAccount ? "ACCOUNT" : "IP",
        };
      }

      // Check current window failures
      const windowAge = now - record.windowStart.getTime();
      if (windowAge < WINDOW_MS && record.failureCount >= maxFailures) {
        const lockedUntil = new Date(now + LOCKOUT_MS);
        await db.loginRateLimit.update({
          where: { key: record.key },
          data: { lockedUntil },
        }).catch(() => undefined);

        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000),
          reason: isAccount ? "ACCOUNT" : "IP",
        };
      }
    }
  } catch (error: any) {
    const failClosed = params.failClosedOnDbError ?? process.env.NODE_ENV === "production";
    if (failClosed) {
      console.error("[RateLimiter] Database rate limit check failed (failing closed):", error);
      return {
        allowed: false,
        retryAfterSeconds: 60,
        reason: "DATABASE_UNAVAILABLE",
      };
    }
    // In local non-production environments without active table, in-memory check acts as local fallback
  }

  return { allowed: true };
}

/**
 * Records a failed login attempt for account and IP keys.
 */
export async function recordFailedLogin(params: {
  ip?: string | null;
  identifier?: string | null;
}): Promise<void> {
  const now = Date.now();
  const nowDate = new Date(now);
  const accountKey = normalizeIdentifierKey(params.identifier);
  const ipKey = normalizeIpKey(params.ip);

  // Update memory
  if (accountKey) recordMemoryFailure(accountKey, ACCOUNT_MAX_FAILURES, now);
  if (ipKey) recordMemoryFailure(ipKey, IP_MAX_FAILURES, now);

  // Update Database
  const updates = [
    { key: accountKey, max: ACCOUNT_MAX_FAILURES },
    { key: ipKey, max: IP_MAX_FAILURES },
  ].filter((item): item is { key: string; max: number } => Boolean(item.key));

  for (const item of updates) {
    try {
      const windowCutoff = new Date(now - WINDOW_MS);
      const lockoutDate = new Date(now + LOCKOUT_MS);
      const randomId = crypto.randomUUID();

      await db.$executeRaw`
        INSERT INTO "LoginRateLimit" ("id", "key", "failureCount", "windowStart", "lockedUntil", "updatedAt")
        VALUES (${randomId}::uuid, ${item.key}, 1, ${nowDate}, NULL, ${nowDate})
        ON CONFLICT ("key") DO UPDATE SET
          "failureCount" = CASE
            WHEN "LoginRateLimit"."windowStart" < ${windowCutoff} THEN 1
            ELSE "LoginRateLimit"."failureCount" + 1
          END,
          "windowStart" = CASE
            WHEN "LoginRateLimit"."windowStart" < ${windowCutoff} THEN ${nowDate}
            ELSE "LoginRateLimit"."windowStart"
          END,
          "lockedUntil" = CASE
            WHEN "LoginRateLimit"."windowStart" < ${windowCutoff} THEN NULL
            WHEN "LoginRateLimit"."failureCount" + 1 >= ${item.max} THEN ${lockoutDate}
            ELSE "LoginRateLimit"."lockedUntil"
          END,
          "updatedAt" = ${nowDate};
      `;
    } catch {
      // Fallback handled by memoryBuckets
    }
  }
}

/**
 * Resets failed attempts for an account on successful credential validation.
 */
export async function recordSuccessfulLogin(params: {
  identifier?: string | null;
}): Promise<void> {
  const accountKey = normalizeIdentifierKey(params.identifier);
  if (!accountKey) return;

  resetMemoryBucket(accountKey);

  try {
    await db.loginRateLimit.delete({
      where: { key: accountKey },
    });
  } catch {
    // Ignore not found or DB fallback
  }
}

/**
 * Clears in-memory test rate limit buckets (for testing).
 */
export function _resetAllRateLimitsForTesting(): void {
  memoryBuckets.clear();
}
