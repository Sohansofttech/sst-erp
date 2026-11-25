import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";
import { GET as authorizeGoogle } from "../app/api/auth/google/authorize/route";
import {
  createGoogleOAuthParameters,
  createPkceChallenge,
  hasVerifiedSupabaseOAuthEmail,
  getGooglePortalRole,
  GoogleOAuthError,
  verifyGoogleIdToken,
} from "../lib/auth/google-oauth";
import { signGoogleLoginProof, verifyGoogleLoginProof } from "../lib/auth/jwt";
import { emailsMatch, normalizeEmail } from "../lib/auth/email";

const originalEnvironment = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
  jwtSecret: process.env.JWT_SECRET,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

async function localGoogleKeys() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-google-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  return {
    privateKey,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
  };
}

async function createGoogleToken(
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"],
  claims: JWTPayload = {},
) {
  const { iss: issuerOverride, ...tokenClaims } = claims;
  return new SignJWT({
    email: "person@example.test",
    email_verified: true,
    nonce: "expected-nonce",
    ...tokenClaims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-google-key" })
    .setIssuer(typeof issuerOverride === "string" ? issuerOverride : "https://accounts.google.com")
    .setAudience("test-client-id")
    .setSubject("google-user-123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

afterEach(() => {
  for (const [name, value] of [
    ["GOOGLE_CLIENT_ID", originalEnvironment.clientId],
    ["GOOGLE_CLIENT_SECRET", originalEnvironment.clientSecret],
    ["GOOGLE_REDIRECT_URI", originalEnvironment.redirectUri],
    ["JWT_SECRET", originalEnvironment.jwtSecret],
    ["NEXT_PUBLIC_SUPABASE_URL", originalEnvironment.supabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", originalEnvironment.supabaseKey],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("maps Google sign-in to each of the four ERP portals", () => {
  assert.equal(getGooglePortalRole("student"), "STUDENT");
  assert.equal(getGooglePortalRole("teacher"), "TEACHER");
  assert.equal(getGooglePortalRole("admin"), "ADMIN");
  assert.equal(getGooglePortalRole("super_admin"), "SUPER_ADMIN");
  assert.equal(getGooglePortalRole("unknown"), null);
});

test("normalizes the requested Super Admin Google email for matching", () => {
  assert.equal(normalizeEmail("  KIRAN@JUNKITOUT.IN "), "kiran@junkitout.in");
  assert.equal(emailsMatch(" Kiran@JunkItOut.in ", "kiran@junkitout.in"), true);
  assert.equal(emailsMatch("other@example.test", "kiran@junkitout.in"), false);
});

test("Supabase Google email must be server-confirmed, not just user metadata", () => {
  assert.equal(hasVerifiedSupabaseOAuthEmail({ email_confirmed_at: "2026-01-01T00:00:00Z" }), true);
  assert.equal(
    hasVerifiedSupabaseOAuthEmail({
      email_confirmed_at: null,
      user_metadata: { email_verified: true },
    }),
    false,
  );
});

test("creates separate state, nonce, and an S256 PKCE challenge", () => {
  const parameters = createGoogleOAuthParameters();
  assert.notEqual(parameters.state, parameters.nonce);
  assert.match(parameters.state, /^[a-f\d]{64}$/);
  assert.match(parameters.nonce, /^[a-f\d]{64}$/);
  assert.equal(parameters.codeChallenge, createPkceChallenge(parameters.codeVerifier));
  assert.match(parameters.codeChallenge, /^[A-Za-z\d_-]{43}$/);
});

test("Google authorize route includes independent state, nonce, and PKCE values", async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/google/callback";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";

  const response = await authorizeGoogle(new Request(
    "http://localhost:3000/api/auth/google/authorize?module=teacher",
  ));
  const redirectUrl = new URL(response.headers.get("location") || "");
  const cookieHeaders = response.headers.getSetCookie();
  const cookieValue = (name: string) => {
    const header = cookieHeaders.find((cookie) => cookie.startsWith(`${name}=`));
    return header?.slice(name.length + 1).split(";")[0];
  };

  assert.equal(response.status, 307);
  assert.equal(redirectUrl.origin, "https://accounts.google.com");
  assert.equal(redirectUrl.searchParams.get("response_type"), "code");
  assert.equal(redirectUrl.searchParams.get("code_challenge_method"), "S256");
  assert.notEqual(redirectUrl.searchParams.get("state"), redirectUrl.searchParams.get("nonce"));
  assert.equal(cookieValue("google_oauth_state"), redirectUrl.searchParams.get("state"));
  assert.equal(cookieValue("google_oauth_nonce"), redirectUrl.searchParams.get("nonce"));
  assert.equal(
    createPkceChallenge(cookieValue("google_oauth_verifier") || ""),
    redirectUrl.searchParams.get("code_challenge"),
  );
});

test("validates Google ID-token signature, audience, issuer, nonce, and verified email", async () => {
  const { privateKey, jwks } = await localGoogleKeys();
  const token = await createGoogleToken(privateKey);

  assert.deepEqual(
    await verifyGoogleIdToken(token, "test-client-id", "expected-nonce", jwks),
    { sub: "google-user-123", email: "person@example.test" },
  );

  await assert.rejects(
    verifyGoogleIdToken(token, "another-client-id", "expected-nonce", jwks),
    GoogleOAuthError,
  );
  await assert.rejects(
    verifyGoogleIdToken(token, "test-client-id", "wrong-nonce", jwks),
    GoogleOAuthError,
  );
  await assert.rejects(
    verifyGoogleIdToken(
      await createGoogleToken(privateKey, { email_verified: false }),
      "test-client-id",
      "expected-nonce",
      jwks,
    ),
    GoogleOAuthError,
  );
  await assert.rejects(
    verifyGoogleIdToken(
      await createGoogleToken(privateKey, { azp: "another-client-id" }),
      "test-client-id",
      "expected-nonce",
      jwks,
    ),
    GoogleOAuthError,
  );
  await assert.rejects(
    verifyGoogleIdToken(
      await createGoogleToken(privateKey, { iss: "https://attacker.example" }),
      "test-client-id",
      "expected-nonce",
      jwks,
    ),
    GoogleOAuthError,
  );

  const otherKeyPair = await generateKeyPair("RS256");
  await assert.rejects(
    verifyGoogleIdToken(
      await createGoogleToken(otherKeyPair.privateKey),
      "test-client-id",
      "expected-nonce",
      jwks,
    ),
    GoogleOAuthError,
  );
});

test("Google login proofs are short-lived signed proofs bound to a portal role", async () => {
  process.env.JWT_SECRET = "test-only-jwt-secret-value-with-more-than-32-characters";
  const proof = await signGoogleLoginProof({
    email: " Person@Example.Test ",
    role: "TEACHER",
  });
  assert.deepEqual(await verifyGoogleLoginProof(proof), {
    email: "person@example.test",
    role: "TEACHER",
  });

  const superAdminProof = await signGoogleLoginProof({
    email: " KIRAN@JUNKITOUT.IN ",
    role: "SUPER_ADMIN",
  });
  assert.deepEqual(await verifyGoogleLoginProof(superAdminProof), {
    email: "kiran@junkitout.in",
    role: "SUPER_ADMIN",
  });

  const tampered = `${proof.slice(0, -1)}${proof.endsWith("a") ? "b" : "a"}`;
  assert.equal(await verifyGoogleLoginProof(tampered), null);
});

test("auth token signing fails closed when JWT_SECRET is missing", async () => {
  delete process.env.JWT_SECRET;
  await assert.rejects(
    signGoogleLoginProof({ email: "person@example.test", role: "STUDENT" }),
    /JWT_SECRET must be configured/,
  );
});
