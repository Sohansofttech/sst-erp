import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import db from "@/lib/db";

export type OtpChallengeErrorCode =
  | "NOT_FOUND"
  | "EXPIRED"
  | "MAX_ATTEMPTS"
  | "INVALID_OTP"
  | "INVALID_CHALLENGE"
  | "ALREADY_USED"
  | "RATE_LIMIT";

export class OtpChallengeError extends Error {
  constructor(message: string, readonly code: OtpChallengeErrorCode) {
    super(message);
    this.name = "OtpChallengeError";
  }
}

const maxAttempts = 5;

export async function createOtpChallenge(mobile: string, otp: string, ttlMinutes: number) {
  const challengeId = randomUUID();
  const tokenHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await db.otpToken.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  await db.otpToken.upsert({
    where: { mobile },
    update: { id: challengeId, tokenHash, expiresAt, attempts: 0, updatedAt: new Date() },
    create: { id: challengeId, mobile, tokenHash, expiresAt },
  });

  return challengeId;
}

async function getValidChallenge(mobile: string, challengeId: string) {
  const token = await db.otpToken.findUnique({ where: { mobile } });
  if (!token) {
    throw new OtpChallengeError("OTP request was not found. Request a new code.", "NOT_FOUND");
  }
  if (token.expiresAt.getTime() <= Date.now()) {
    await db.otpToken.deleteMany({ where: { id: token.id, tokenHash: token.tokenHash } });
    throw new OtpChallengeError("OTP has expired. Request a new code.", "EXPIRED");
  }
  if (token.attempts >= maxAttempts) {
    await db.otpToken.deleteMany({ where: { id: token.id, tokenHash: token.tokenHash } });
    throw new OtpChallengeError("Maximum OTP verification attempts exceeded.", "MAX_ATTEMPTS");
  }
  if (token.id !== challengeId) {
    throw new OtpChallengeError("OTP request is invalid. Request a new code.", "INVALID_CHALLENGE");
  }
  return token;
}

export async function assertOtpChallenge(mobile: string, challengeId: string) {
  await getValidChallenge(mobile, challengeId);
}

export async function recordOtpChallengeFailure(mobile: string, challengeId: string) {
  for (let retry = 0; retry < maxAttempts; retry += 1) {
    const token = await getValidChallenge(mobile, challengeId);
    const updated = await db.otpToken.updateMany({
      where: {
        id: token.id,
        tokenHash: token.tokenHash,
        attempts: token.attempts,
        expiresAt: { gt: new Date() },
      },
      data: { attempts: { increment: 1 } },
    });

    if (updated.count === 0) continue;

    if (token.attempts + 1 >= maxAttempts) {
      await db.otpToken.deleteMany({
        where: { id: token.id, tokenHash: token.tokenHash },
      });
      throw new OtpChallengeError("Maximum OTP verification attempts exceeded.", "MAX_ATTEMPTS");
    }
    return;
  }

  throw new OtpChallengeError("OTP request changed. Request a new code.", "ALREADY_USED");
}

export async function consumeOtpChallenge(mobile: string, challengeId: string) {
  const token = await getValidChallenge(mobile, challengeId);
  const consumed = await db.otpToken.deleteMany({
    where: {
      id: token.id,
      tokenHash: token.tokenHash,
      attempts: token.attempts,
      expiresAt: { gt: new Date() },
    },
  });

  if (consumed.count !== 1) {
    throw new OtpChallengeError("OTP request has already been used. Request a new code.", "ALREADY_USED");
  }
}

export async function verifyAndConsumeOtpChallenge(
  mobile: string,
  challengeId: string,
  otp: string
) {
  for (let retry = 0; retry < maxAttempts; retry += 1) {
    const token = await getValidChallenge(mobile, challengeId);
    if (!(await bcrypt.compare(otp, token.tokenHash))) {
      await recordOtpChallengeFailure(mobile, challengeId);
      throw new OtpChallengeError("Incorrect OTP. Check the code and try again.", "INVALID_OTP");
    }

    const consumed = await db.otpToken.deleteMany({
      where: {
        id: token.id,
        tokenHash: token.tokenHash,
        attempts: token.attempts,
        expiresAt: { gt: new Date() },
      },
    });
    if (consumed.count === 1) return;
  }

  throw new OtpChallengeError("OTP request has already been used. Request a new code.", "ALREADY_USED");
}

export async function deleteOtpChallenge(mobile: string) {
  await db.otpToken.deleteMany({ where: { mobile } });
}

export async function incrementRateLimit(
  mobile: string,
  windowMs = 5 * 60 * 1000,
  maxPerWindow = 5,
  cooldownMs = 60 * 1000
) {
  const updated = await db.$queryRaw<Array<{ mobile: string }>>`
    INSERT INTO "OtpRateLimit" ("mobile", "lastSentAt", "sendCount", "windowStart")
    VALUES (${mobile}, NOW(), 1, NOW())
    ON CONFLICT ("mobile") DO UPDATE SET
      "sendCount" = CASE
        WHEN "OtpRateLimit"."windowStart" <= NOW() - (${windowMs} * INTERVAL '1 millisecond') THEN 1
        ELSE "OtpRateLimit"."sendCount" + 1
      END,
      "windowStart" = CASE
        WHEN "OtpRateLimit"."windowStart" <= NOW() - (${windowMs} * INTERVAL '1 millisecond') THEN NOW()
        ELSE "OtpRateLimit"."windowStart"
      END,
      "lastSentAt" = NOW()
    WHERE
      "OtpRateLimit"."lastSentAt" <= NOW() - (${cooldownMs} * INTERVAL '1 millisecond')
      AND (
        "OtpRateLimit"."windowStart" <= NOW() - (${windowMs} * INTERVAL '1 millisecond')
        OR "OtpRateLimit"."sendCount" < ${maxPerWindow}
      )
    RETURNING "mobile"
  `;

  if (updated.length !== 1) {
    throw new OtpChallengeError("OTP send limit exceeded. Please wait before requesting another code.", "RATE_LIMIT");
  }
}
