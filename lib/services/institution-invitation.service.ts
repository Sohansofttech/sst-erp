import crypto from "crypto";

export function hashInvitationToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function generateInvitationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function invitationBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL must be configured for invitation activation links.");
  }
  return "http://localhost:3000";
}
