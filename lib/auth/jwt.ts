import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { SessionUser } from "@/types";
import { getAuthJwtKey } from "@/lib/auth/jwt-secret";
import { normalizeEmail } from "@/lib/auth/email";

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
    .sign(getAuthJwtKey());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthJwtKey());
    return payload as unknown as SessionUser;
  } catch {
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
    .sign(getAuthJwtKey());
}

export async function verifyPasswordSetupToken(token: string): Promise<{
  userId: string;
  email: string;
  institutionId?: string;
  sig: string;
  exp?: number;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthJwtKey());
    if (payload.purpose !== "password_setup") return null;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      institutionId: payload.institutionId as string | undefined,
      sig: payload.sig as string,
      exp: payload.exp as number | undefined,
    };
  } catch {
    return null;
  }
}

export async function signPasswordResetToken(payload: {
  userId: string;
  email: string;
  institutionId?: string;
  passwordHash?: string | null;
}): Promise<string> {
  const sig = computePasswordSignature(payload.passwordHash || "");
  return await new SignJWT({
    purpose: "password_reset",
    userId: payload.userId,
    email: payload.email,
    institutionId: payload.institutionId,
    sig,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getAuthJwtKey());
}

export async function verifyPasswordResetToken(token: string): Promise<{
  userId: string;
  email: string;
  institutionId?: string;
  sig: string;
  exp?: number;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthJwtKey());
    if (
      payload.purpose !== "password_reset" ||
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.sig !== "string"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      email: payload.email,
      institutionId: payload.institutionId as string | undefined,
      sig: payload.sig,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function signOtpLoginProof(payload: {
  userId: string;
  email: string;
  mobile: string;
  role: string;
}): Promise<string> {
  return new SignJWT({ purpose: "otp_login", ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(getAuthJwtKey());
}

export async function verifyOtpLoginProof(token: string): Promise<{
  userId: string;
  email: string;
  mobile: string;
  role: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthJwtKey());
    if (
      payload.purpose !== "otp_login" ||
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.mobile !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      email: payload.email,
      mobile: payload.mobile,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export type GoogleLoginRole = "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN";

export async function signGoogleLoginProof(payload: {
  email: string;
  role: GoogleLoginRole;
}): Promise<string> {
  return new SignJWT({
    purpose: "google_login",
    email: normalizeEmail(payload.email),
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(getAuthJwtKey());
}

export async function verifyGoogleLoginProof(token: string): Promise<{
  email: string;
  role: GoogleLoginRole;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthJwtKey());
    const roles: GoogleLoginRole[] = ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"];
    if (
      payload.purpose !== "google_login" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      !roles.includes(payload.role as GoogleLoginRole)
    ) {
      return null;
    }
    return {
      email: payload.email,
      role: payload.role as GoogleLoginRole,
    };
  } catch {
    return null;
  }
}
