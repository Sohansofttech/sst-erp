import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { SessionUser } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET || "erp-secret-super-secure-key-32-chars-long!";
const key = new TextEncoder().encode(JWT_SECRET);

export const AUTH_COOKIE_NAME = "erp_session";

/**
 * Generate a deterministic SHA-256 fingerprint from a bcrypt password hash.
 * Used for zero-migration session revocation: whenever passwordHash changes in DB,
 * any token carrying an older fingerprint is immediately invalidated.
 */
export function computePasswordSignature(passwordHash: string): string {
  if (!passwordHash) return "";
  return crypto.createHash("sha256").update(passwordHash).digest("hex");
}

export async function signToken(payload: SessionUser): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as SessionUser;
  } catch (error) {
    return null;
  }
}

/**
 * Sign an expiring, single-use password setup / onboarding token.
 * Embedded with a deterministic hash signature of the current passwordHash,
 * ensuring automatic invalidation as soon as a new password is set.
 */
export async function signPasswordSetupToken(payload: {
  userId: string;
  email: string;
  institutionId?: string;
  passwordHash?: string | null;
}): Promise<string> {
  const sig = computePasswordSignature(payload.passwordHash || "");
  return await new SignJWT({
    purpose: "password_setup",
    userId: payload.userId,
    email: payload.email,
    institutionId: payload.institutionId,
    sig,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function verifyPasswordSetupToken(token: string): Promise<{
  userId: string;
  email: string;
  institutionId?: string;
  sig: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.purpose !== "password_setup") return null;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      institutionId: payload.institutionId as string | undefined,
      sig: payload.sig as string,
    };
  } catch {
    return null;
  }
}

