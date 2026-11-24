import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { normalizeEmail } from "@/lib/auth/email";

export type GooglePortalRole = "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const rolesByModule: Record<string, GooglePortalRole> = {
  student: "STUDENT",
  teacher: "TEACHER",
  admin: "ADMIN",
  "institution-admin": "ADMIN",
  super_admin: "SUPER_ADMIN",
  "super-admin": "SUPER_ADMIN",
  platform: "SUPER_ADMIN",
};

export class GoogleOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

export function hasVerifiedSupabaseOAuthEmail(user: {
  email_confirmed_at?: string | null;
  user_metadata?: unknown;
}): boolean {
  return typeof user.email_confirmed_at === "string" && user.email_confirmed_at.length > 0;
}

export function getGooglePortalRole(module: string): GooglePortalRole | null {
  return rolesByModule[module.trim().toLowerCase()] ?? null;
}

export function createPkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function createGoogleOAuthParameters() {
  const codeVerifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(32).toString("hex"),
    nonce: randomBytes(32).toString("hex"),
    codeVerifier,
    codeChallenge: createPkceChallenge(codeVerifier),
  };
}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  expectedNonce: string,
  keySet: JWTVerifyGetKey = googleJwks,
): Promise<{ sub: string; email: string }> {
  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      payload.email_verified !== true ||
      payload.nonce !== expectedNonce ||
      (typeof payload.azp === "string" && payload.azp !== clientId) ||
      (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)
    ) {
      throw new GoogleOAuthError("Google returned an invalid or unverified account.");
    }

    return { sub: payload.sub, email: normalizeEmail(payload.email) };
  } catch (error) {
    if (error instanceof GoogleOAuthError) throw error;
    throw new GoogleOAuthError("Google identity token validation failed.");
  }
}
