import db from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/session";

/**
 * SAF-007 Support Access Enforcement
 *
 * Separate, institution-scoped authorization for Super Admins performing support
 * troubleshooting. This is intentionally NOT part of requireSuperAdmin() (identity)
 * or resolveAdminContext() (identity + tenant). Each protected route handler must
 * call requireRead()/requireWrite() explicitly with the authenticated actor id and
 * the resolved institution id.
 *
 * Invariants:
 * - READ_SUPPORT_CONTEXT never authorizes WRITE and vice versa.
 * - Authorization is always evaluated live against the database (no caching).
 * - A development authentication bypass never satisfies support authorization.
 * - Expiry and revocation are enforced at authorization time.
 * - Activation (APPROVED -> ACTIVE) and its audit event share one transaction and
 *   fail closed if auditing fails.
 */

export const SUPPORT_READ = "READ_SUPPORT_CONTEXT" as const;
export const SUPPORT_WRITE = "WRITE_SUPPORT_CONTEXT" as const;
export type SupportAction = typeof SUPPORT_READ | typeof SUPPORT_WRITE;

export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 480;

export type SupportDenyReason =
  | "NO_IDENTITY"
  | "DEV_BYPASS"
  | "NO_SESSION"
  | "WRONG_SCOPE"
  | "NOT_APPROVED"
  | "NOT_STARTED"
  | "EXPIRED"
  | "REVOKED"
  | "DENIED"
  | "ENDED"
  | "AUDIT_FAILURE";

export class SupportAccessDeniedError extends ForbiddenError {
  readonly reason: SupportDenyReason;
  constructor(reason: SupportDenyReason, message?: string) {
    super(message ?? `Support access denied: ${reason}`);
    this.name = "SupportAccessDeniedError";
    this.reason = reason;
  }
}

export interface SupportAccessParams {
  /** Authenticated actor id (never caller-supplied). */
  actorId: string | null | undefined;
  /** Resolved institution id from the authenticated context. */
  institutionId: string;
  /** Exact permission required for this operation. */
  requiredAction: SupportAction;
  /** True when the request was authenticated via the development bypass. */
  developmentMode?: boolean;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validateDurationMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES;
}

async function recordDenial(
  params: SupportAccessParams,
  reason: SupportDenyReason
): Promise<void> {
  try {
    await db.platformAuditLog.create({
      data: {
        userId: isValidUuid(params.actorId ?? "") ? (params.actorId as string) : null,
        institutionId: isValidUuid(params.institutionId) ? params.institutionId : null,
        action: "SUPPORT_ACCESS_DENIED",
        entity: "SupportAccessSession",
        entityId: null,
        result: "FAILURE",
        metadata: {
          reason,
          requiredAction: params.requiredAction,
        },
      },
    });
  } catch {
    // Denial auditing is best-effort and must never grant access.
  }
}

/**
 * Authorize a Super Admin support operation against a specific institution.
 * Performs a live database read on every call. Throws SupportAccessDeniedError
 * (HTTP 403) when not authorized.
 *
 * On first authorized use of an APPROVED session, atomically transitions it to
 * ACTIVE together with an audit event in the same transaction (fail-closed).
 */
export async function assertSupportAccess(params: SupportAccessParams): Promise<void> {
  // Identity must be present and a real UUID; the dev bypass can never authorize.
  if (params.developmentMode) {
    await recordDenial(params, "DEV_BYPASS");
    throw new SupportAccessDeniedError("DEV_BYPASS", "Development bypass cannot grant support access.");
  }
  if (!params.actorId || !isValidUuid(params.actorId)) {
    await recordDenial(params, "NO_IDENTITY");
    throw new SupportAccessDeniedError("NO_IDENTITY", "A verified actor identity is required for support access.");
  }
  if (!isValidUuid(params.institutionId)) {
    await recordDenial(params, "NO_SESSION");
    throw new SupportAccessDeniedError("NO_SESSION", "A resolved institution context is required for support access.");
  }

  const now = new Date();

  // Live read of the candidate sessions for this actor + institution (scoping by
  // actor + institution is preserved). Multiple sessions per actor+institution are
  // permitted by design (no uniqueness constraint; requests are created freely and
  // approved/revoked per-id). Policy: authorize against the newest session that is
  // GENUINELY AUTHORIZABLE for the required action — i.e. APPROVED/ACTIVE, not
  // ended, started, unexpired, and carrying the required permission. This prevents
  // an invalid newer row (expired/future/wrong-scope/revoked) from blocking an
  // older still-valid session. If none is authorizable, fall back to the newest
  // session overall so the correct denial reason is reported.
  const candidates = await db.supportAccessSession.findMany({
    where: {
      requestedById: params.actorId,
      institutionId: params.institutionId,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      allowedActions: true,
      startsAt: true,
      expiresAt: true,
      endedAt: true,
    },
  });

  const isAuthorizable = (s: (typeof candidates)[number]): boolean => {
    if (s.endedAt) return false;
    if (s.status !== "APPROVED" && s.status !== "ACTIVE") return false;
    if (s.expiresAt <= now) return false;
    if (!s.startsAt || s.startsAt > now) return false;
    const allowed = Array.isArray(s.allowedActions) ? (s.allowedActions as unknown[]) : [];
    return allowed.includes(params.requiredAction);
  };

  const authorizable = candidates.find(isAuthorizable);
  const session = authorizable ?? candidates[0] ?? null;

  const deny = async (reason: SupportDenyReason): Promise<never> => {
    await recordDenial(params, reason);
    throw new SupportAccessDeniedError(reason);
  };

  if (!session) return deny("NO_SESSION");

  // Hard stop states.
  if (session.endedAt) return deny("ENDED");
  if (session.status === "REVOKED") return deny("REVOKED");
  if (session.status === "DENIED") return deny("DENIED");
  if (session.status === "EXPIRED") return deny("EXPIRED");
  if (session.status === "REQUESTED") return deny("NOT_APPROVED");

  // Time-based checks apply to APPROVED and ACTIVE.
  if (session.expiresAt <= now) return deny("EXPIRED");
  if (!session.startsAt || session.startsAt > now) return deny("NOT_STARTED");

  // Exact permission check (READ never implies WRITE, WRITE never implies READ).
  const allowed = Array.isArray(session.allowedActions)
    ? (session.allowedActions as unknown[])
    : [];
  if (!allowed.includes(params.requiredAction)) return deny("WRONG_SCOPE");

  // Lazy activation: APPROVED -> ACTIVE via compare-and-set, then re-read.
  if (session.status === "APPROVED") {
    try {
      await db.$transaction(async (tx) => {
        const flipped = await tx.supportAccessSession.updateMany({
          where: { id: session.id, status: "APPROVED" },
          data: { status: "ACTIVE" },
        });
        // Never authorize on count alone; verify via re-read below. Emit the
        // activation audit event only when this call actually flipped the row,
        // so concurrent first-uses cannot produce duplicate ACTIVATED events.
        if (flipped.count === 1) {
          await tx.platformAuditLog.create({
            data: {
              userId: params.actorId,
              institutionId: params.institutionId,
              action: "SUPPORT_ACCESS_ACTIVATED",
              entity: "SupportAccessSession",
              entityId: session.id,
              result: "SUCCESS",
              metadata: { requiredAction: params.requiredAction },
            },
          });
        }
      });
    } catch {
      // Activation auditing failed -> roll back -> fail closed.
      return deny("AUDIT_FAILURE");
    }

    const reloaded = await db.supportAccessSession.findUnique({
      where: { id: session.id },
      select: { status: true, startsAt: true, expiresAt: true, endedAt: true, allowedActions: true },
    });
    if (
      !reloaded ||
      reloaded.status !== "ACTIVE" ||
      reloaded.endedAt ||
      !reloaded.startsAt ||
      reloaded.startsAt > now ||
      reloaded.expiresAt <= now ||
      !Array.isArray(reloaded.allowedActions) ||
      !(reloaded.allowedActions as unknown[]).includes(params.requiredAction)
    ) {
      return deny("NOT_APPROVED");
    }
    await recordGrant(params, session.id);
    return;
  }

  // Already ACTIVE.
  if (session.status === "ACTIVE") {
    await recordGrant(params, session.id);
    return;
  }

  return deny("NOT_APPROVED");
}

/**
 * Best-effort per-operation grant audit. NOT part of the protected operation's
 * transaction; a failure here never grants or revokes access (access was already
 * authorized by the live read above).
 */
async function recordGrant(params: SupportAccessParams, sessionId: string): Promise<void> {
  try {
    await db.platformAuditLog.create({
      data: {
        userId: params.actorId,
        institutionId: params.institutionId,
        action: "SUPPORT_ACCESS_GRANTED",
        entity: "SupportAccessSession",
        entityId: sessionId,
        result: "SUCCESS",
        metadata: { requiredAction: params.requiredAction },
      },
    });
  } catch {
    // Monitoring/alerting concern only; never affects authorization.
  }
}

/** Guard for institution-scoped READ operations performed by a Super Admin. */
export async function requireRead(
  ctx: { userRole?: string | null; userId?: string | null; institutionId: string; isDevFallback?: boolean }
): Promise<void> {
  if ((ctx.userRole ?? "").toUpperCase() !== "SUPER_ADMIN") return;
  await assertSupportAccess({
    actorId: ctx.userId,
    institutionId: ctx.institutionId,
    requiredAction: SUPPORT_READ,
    developmentMode: ctx.isDevFallback,
  });
}

/** Guard for institution-scoped WRITE operations performed by a Super Admin. */
export async function requireWrite(
  ctx: { userRole?: string | null; userId?: string | null; institutionId: string; isDevFallback?: boolean }
): Promise<void> {
  if ((ctx.userRole ?? "").toUpperCase() !== "SUPER_ADMIN") return;
  await assertSupportAccess({
    actorId: ctx.userId,
    institutionId: ctx.institutionId,
    requiredAction: SUPPORT_WRITE,
    developmentMode: ctx.isDevFallback,
  });
}

/**
 * Request-based variants for handlers that destructure only { institutionId } from
 * the resolved context. Identity (role/userId) is derived from the authenticated
 * request session; the institutionId is the already-resolved tenant. The guard is
 * a no-op for non-Super-Admin roles, so normal admin flows are unaffected.
 */
export async function requireReadReq(req: Request, institutionId: string): Promise<void> {
  const { getSession } = await import("@/lib/auth/session");
  const session = await getSession(req as any);
  if (!session || (session.role ?? "").toUpperCase() !== "SUPER_ADMIN") return;
  await assertSupportAccess({
    actorId: session.userId,
    institutionId,
    requiredAction: SUPPORT_READ,
  });
}

export async function requireWriteReq(req: Request, institutionId: string): Promise<void> {
  const { getSession } = await import("@/lib/auth/session");
  const session = await getSession(req as any);
  if (!session || (session.role ?? "").toUpperCase() !== "SUPER_ADMIN") return;
  await assertSupportAccess({
    actorId: session.userId,
    institutionId,
    requiredAction: SUPPORT_WRITE,
  });
}