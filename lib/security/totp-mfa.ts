import crypto from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import db from "@/lib/db";
import { getAuthJwtKey } from "@/lib/auth/jwt-secret";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const MFA_CHALLENGE_COOKIE = "sst_mfa_challenge";
const CHALLENGE_EXPIRY_SECONDS = 5 * 60; // 5 minutes

// In-memory fallback map for test environments or pending migrations
const memoryMfaStore = new Map<string, {
  encryptedSecret: string;
  secretIv: string;
  secretTag: string;
  isEnrolled: boolean;
  enrolledAt: Date | null;
  lastUsedCounter: bigint;
  backupCodes: Array<{ hashedCode: string; used: boolean; usedAt: string | null }>;
}>();

// -----------------------------------------------------------------------------
// 1. Base32 Encoding / Decoding
// -----------------------------------------------------------------------------

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

// -----------------------------------------------------------------------------
// 2. RFC 6238 TOTP Generation and Verification
// -----------------------------------------------------------------------------

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function generateTotpCode(secretBase32: string, timeStep?: number): string {
  const counter = timeStep !== undefined ? timeStep : Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const secretBytes = base32Decode(secretBase32);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", secretBytes);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binaryCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binaryCode % 10 ** DIGITS;
  return otp.toString().padStart(DIGITS, "0");
}

export function verifyTotpCode(params: {
  secretBase32: string;
  code: string;
  lastUsedCounter?: bigint;
  toleranceSteps?: number;
}): { valid: boolean; matchedCounter?: bigint } {
  const cleanCode = params.code.trim();
  if (!/^\d{6}$/.test(cleanCode)) return { valid: false };

  const tolerance = params.toleranceSteps ?? 1; // +/- 1 step (30s)
  const currentStep = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const lastUsed = params.lastUsedCounter ?? BigInt(0);

  for (let stepOffset = -tolerance; stepOffset <= tolerance; stepOffset++) {
    const testStep = BigInt(currentStep + stepOffset);
    if (testStep <= lastUsed) continue; // Replay attack prevention

    const expectedCode = generateTotpCode(params.secretBase32, Number(testStep));
    if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(expectedCode))) {
      return { valid: true, matchedCounter: testStep };
    }
  }

  return { valid: false };
}

// -----------------------------------------------------------------------------
// 3. AES-256-GCM Secret Encryption at Rest
// -----------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const secret = process.env.MFA_ENCRYPTION_KEY || process.env.AUTH_JWT_SECRET || "sst-erp-default-mfa-encryption-key-secure";
  return crypto.scryptSync(secret, "sst-mfa-salt-2026", 32);
}

export function encryptSecret(plainSecret: string): { encrypted: string; iv: string; tag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plainSecret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag,
  };
}

export function decryptSecret(encrypted: string, iv: string, tag: string): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// -----------------------------------------------------------------------------
// 4. Single-Use Backup Recovery Codes
// -----------------------------------------------------------------------------

export function generateBackupCodes(count = 10): { plaintextCodes: string[]; hashedEntries: Array<{ hashedCode: string; used: boolean; usedAt: string | null }> } {
  const plaintextCodes: string[] = [];
  const hashedEntries: Array<{ hashedCode: string; used: boolean; usedAt: string | null }> = [];

  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const code = `${part1}-${part2}`;
    plaintextCodes.push(code);

    const hashedCode = bcrypt.hashSync(code, 8);
    hashedEntries.push({ hashedCode, used: false, usedAt: null });
  }

  return { plaintextCodes, hashedEntries };
}

// -----------------------------------------------------------------------------
// 5. MFA Challenge Tokens (5-Minute Expiry)
// -----------------------------------------------------------------------------

export async function signMfaChallengeToken(payload: { userId: string; email: string }): Promise<string> {
  return await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    mfaChallenge: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_EXPIRY_SECONDS}s`)
    .sign(getAuthJwtKey());
}

export async function verifyMfaChallengeToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthJwtKey());
    if (payload.mfaChallenge !== true || !payload.userId || !payload.email) {
      return null;
    }
    return { userId: payload.userId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// 6. Database Operations & Enrollment Workflows
// -----------------------------------------------------------------------------

export class MfaDatabaseError extends Error {
  constructor(message = "Database failure while querying MFA status", public cause?: unknown) {
    super(message);
    this.name = "MfaDatabaseError";
  }
}

export async function getAdminMfaRecord(
  userId: string,
  options?: { failClosedOnDbError?: boolean }
) {
  try {
    const dbRecord = await db.platformAdminMfa.findUnique({
      where: { userId },
    });
    // Successful query returning null genuinely means no record exists
    if (dbRecord) return dbRecord;
    return null;
  } catch (error: any) {
    const failClosed = options?.failClosedOnDbError ?? process.env.NODE_ENV === "production";
    if (failClosed) {
      throw new MfaDatabaseError("Database failure while querying MFA status", error);
    }

    // In local non-production/test environments without active table:
    const mem = memoryMfaStore.get(userId);
    if (!mem) return null;
    return {
      id: `mem-${userId}`,
      userId,
      ...mem,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export async function setupAdminMfa(
  userId: string,
  email: string,
  options?: { failClosedOnDbError?: boolean }
) {
  // Check if existing record exists and is already enrolled
  const existing = await getAdminMfaRecord(userId, options);
  if (existing && existing.isEnrolled) {
    throw new Error("MFA is already enrolled for this account. Re-enrollment requires prior authorization and cannot overwrite an active configuration.");
  }

  const secretBase32 = generateTotpSecret();
  const { encrypted, iv, tag } = encryptSecret(secretBase32);
  const { plaintextCodes, hashedEntries } = generateBackupCodes(10);

  // Save to DB or Memory
  try {
    await db.platformAdminMfa.upsert({
      where: { userId },
      create: {
        userId,
        encryptedSecret: encrypted,
        secretIv: iv,
        secretTag: tag,
        isEnrolled: false,
        backupCodes: hashedEntries,
      },
      update: {
        encryptedSecret: encrypted,
        secretIv: iv,
        secretTag: tag,
        isEnrolled: false,
        backupCodes: hashedEntries,
      },
    });
  } catch (error: any) {
    const failClosed = options?.failClosedOnDbError ?? process.env.NODE_ENV === "production";
    if (failClosed) {
      throw new MfaDatabaseError("Failed to persist MFA setup to database", error);
    }
    memoryMfaStore.set(userId, {
      encryptedSecret: encrypted,
      secretIv: iv,
      secretTag: tag,
      isEnrolled: false,
      enrolledAt: null,
      lastUsedCounter: BigInt(0),
      backupCodes: hashedEntries,
    });
  }

  const uri = `otpauth://totp/SST-ERP:${encodeURIComponent(email)}?secret=${secretBase32}&issuer=SST-ERP&digits=6&period=30`;

  return {
    secretBase32,
    otpauthUri: uri,
    backupCodes: plaintextCodes,
  };
}

export async function confirmAdminMfaEnrollment(
  userId: string,
  code: string,
  options?: { failClosedOnDbError?: boolean }
): Promise<boolean> {
  const record = await getAdminMfaRecord(userId, options);
  if (!record) return false;

  const plainSecret = decryptSecret(record.encryptedSecret, record.secretIv, record.secretTag);
  const verification = verifyTotpCode({ secretBase32: plainSecret, code });
  if (!verification.valid || !verification.matchedCounter) return false;

  const now = new Date();
  try {
    await db.platformAdminMfa.update({
      where: { userId },
      data: {
        isEnrolled: true,
        enrolledAt: now,
        lastUsedCounter: verification.matchedCounter,
      },
    });
  } catch (error: any) {
    const failClosed = options?.failClosedOnDbError ?? process.env.NODE_ENV === "production";
    if (failClosed) {
      throw new MfaDatabaseError("Failed to update MFA enrollment in database", error);
    }
    const mem = memoryMfaStore.get(userId);
    if (mem) {
      mem.isEnrolled = true;
      mem.enrolledAt = now;
      mem.lastUsedCounter = verification.matchedCounter;
    }
  }

  return true;
}

export async function verifyAdminMfaLogin(
  userId: string,
  params: { totpCode?: string | null; backupCode?: string | null },
  options?: { failClosedOnDbError?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const record = await getAdminMfaRecord(userId, options);
  if (!record || !record.isEnrolled) {
    return { success: false, error: "MFA is not enrolled for this account." };
  }

  const failClosed = options?.failClosedOnDbError ?? process.env.NODE_ENV === "production";

  // 1. Verify TOTP Code
  if (params.totpCode) {
    const plainSecret = decryptSecret(record.encryptedSecret, record.secretIv, record.secretTag);
    const verification = verifyTotpCode({
      secretBase32: plainSecret,
      code: params.totpCode,
      lastUsedCounter: record.lastUsedCounter,
    });

    if (!verification.valid || !verification.matchedCounter) {
      return { success: false, error: "Invalid or expired authentication code." };
    }

    // Atomic conditional update to prevent concurrent replay attacks
    try {
      const updatedCount = await db.$executeRaw`
        UPDATE "PlatformAdminMfa"
        SET "lastUsedCounter" = ${verification.matchedCounter}, "updatedAt" = NOW()
        WHERE "userId" = ${userId}::uuid AND "lastUsedCounter" < ${verification.matchedCounter}
      `;

      if (updatedCount === 0) {
        return { success: false, error: "Authentication code already used or expired." };
      }
    } catch (error: any) {
      if (failClosed) {
        throw new MfaDatabaseError("Database failure while verifying TOTP counter", error);
      }
      // In-memory atomic check fallback in non-production
      const mem = memoryMfaStore.get(userId);
      if (mem) {
        if (mem.lastUsedCounter >= verification.matchedCounter) {
          return { success: false, error: "Authentication code already used or expired." };
        }
        mem.lastUsedCounter = verification.matchedCounter;
      }
    }

    return { success: true };
  }

  // 2. Verify Single-Use Backup Recovery Code
  if (params.backupCode) {
    const cleanCode = params.backupCode.trim().toUpperCase();

    // Database atomic transaction with row lock
    try {
      const txResult = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<any[]>`
          SELECT id, "backupCodes"
          FROM "PlatformAdminMfa"
          WHERE "userId" = ${userId}::uuid
          FOR UPDATE
        `;

        if (!rows || rows.length === 0) {
          return { success: false, error: "MFA record not found." };
        }

        const currentCodes = (rows[0].backupCodes as any[]) || [];
        let matchedIndex = -1;

        for (let i = 0; i < currentCodes.length; i++) {
          if (!currentCodes[i].used && bcrypt.compareSync(cleanCode, currentCodes[i].hashedCode)) {
            matchedIndex = i;
            break;
          }
        }

        if (matchedIndex === -1) {
          return { success: false, error: "Invalid or previously used backup recovery code." };
        }

        // Burn the code atomically
        currentCodes[matchedIndex].used = true;
        currentCodes[matchedIndex].usedAt = new Date().toISOString();

        await tx.platformAdminMfa.update({
          where: { userId },
          data: { backupCodes: currentCodes },
        });

        return { success: true };
      });

      return txResult;
    } catch (err: any) {
      if (err?.message?.includes("Invalid or previously used") || err?.message?.includes("MFA record not found")) {
        return { success: false, error: err.message };
      }

      if (failClosed) {
        throw new MfaDatabaseError("Database failure while consuming backup code", err);
      }

      // In-memory atomic fallback in non-production
      const mem = memoryMfaStore.get(userId);
      if (!mem) return { success: false, error: "MFA record not found." };

      const codes = mem.backupCodes || [];
      let matchedIndex = -1;

      for (let i = 0; i < codes.length; i++) {
        if (!codes[i].used && bcrypt.compareSync(cleanCode, codes[i].hashedCode)) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex === -1) {
        return { success: false, error: "Invalid or previously used backup recovery code." };
      }

      codes[matchedIndex].used = true;
      codes[matchedIndex].usedAt = new Date().toISOString();
      mem.backupCodes = codes;

      return { success: true };
    }
  }

  return { success: false, error: "Either TOTP code or backup code is required." };
}

export { MFA_CHALLENGE_COOKIE };
