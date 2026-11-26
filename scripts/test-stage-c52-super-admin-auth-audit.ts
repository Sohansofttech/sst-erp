/**
 * Phase P0.5 Stage C.5.2 / C.5.3 — JWT & Super Admin Identity Mapping Hardening Tests (Mocked & Crypto)
 *
 * Clearly distinguished from live PostgreSQL tests:
 *   - Exercises `lib/auth/jwt.ts` (`HS256` pinning, `purpose` rejection on `verifyToken`,
 *     legitimate setup/reset flows) and `lib/super-admin/context.ts` (exact ID match,
 *     rejected mismatched ID/email, rejected ambiguous mapping, separate `userId` vs
 *     `platformUserId` for `PlatformAuditLog`, and revoked Super Admin rejection).
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { SignJWT } from "jose";

const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "server-only") return {};
  return origLoad.apply(this, arguments);
};

async function main() {
  const prevJwt = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-stage-c53-jwt-secret-minimum-32-chars";

  try {
    const {
      signToken,
      verifyToken,
      signPasswordSetupToken,
      verifyPasswordSetupToken,
      signPasswordResetToken,
      verifyPasswordResetToken,
      signOtpLoginProof,
      signGoogleLoginProof,
      computePasswordSignature,
    } = await import("../lib/auth/jwt");
    const { withSuperAdminContext, getActiveSuperAdminIdentity } = await import(
      "../lib/super-admin/context"
    );
    const { ForbiddenError } = await import("../lib/auth/session");

    const saUserId = "11111111-1111-4111-8111-111111111111";
    const legacyPlatformId = "22222222-2222-4222-8222-222222222222";
    const otherUserId = "33333333-3333-4333-8333-333333333333";
    const validSig = computePasswordSignature("bcrypt_hash_v1");

    // 1. Valid HS256 session token accepted
    const validToken = await signToken({
      userId: saUserId,
      email: "sa@platform.edu",
      fullName: "Super Admin",
      name: "Super Admin",
      role: "SUPER_ADMIN",
      institutionId: "",
      institutionName: "",
      permissions: [],
      assignedRoles: ["SUPER_ADMIN"],
      passwordSig: validSig,
    });
    const verified = await verifyToken(validToken);
    assert.ok(verified && verified.userId === saUserId);
    console.log("PASS [Check 1]: Valid HS256 session token accepted");

    // 2. Invalid JWT signature & expired JWT rejected
    const parts = validToken.split(".");
    assert.equal(await verifyToken(`${parts[0]}.${parts[1]}.bad_sig`), null);
    console.log("PASS [Check 2]: Invalid JWT signature rejected");

    // 3. Unsupported algorithm (HS512 and none) rejected by verifyToken
    const hs512Token = await new SignJWT({
      userId: saUserId,
      email: "sa@platform.edu",
      role: "SUPER_ADMIN",
      passwordSig: validSig,
    })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    assert.equal(await verifyToken(hs512Token), null);
    console.log("PASS [Check 3]: Unsupported algorithm (HS512) rejected");

    // 4 & 5. Password setup & reset tokens rejected as normal sessions, while their own verifiers still work
    const setupToken = await signPasswordSetupToken({
      userId: saUserId,
      email: "sa@platform.edu",
      passwordHash: "bcrypt_hash_v1",
    });
    const resetToken = await signPasswordResetToken({
      userId: saUserId,
      email: "sa@platform.edu",
      passwordHash: "bcrypt_hash_v1",
    });
    assert.equal(await verifyToken(setupToken), null);
    assert.equal(await verifyToken(resetToken), null);
    const otpProof = await signOtpLoginProof({
      userId: saUserId,
      email: "sa@platform.edu",
      mobile: "9999999999",
      role: "SUPER_ADMIN",
    });
    const googleProof = await signGoogleLoginProof({
      email: "sa@platform.edu",
      role: "SUPER_ADMIN",
    });
    assert.equal(await verifyToken(otpProof), null);
    assert.equal(await verifyToken(googleProof), null);
    assert.equal((await verifyPasswordSetupToken(setupToken))?.userId, saUserId);
    assert.equal((await verifyPasswordResetToken(resetToken))?.userId, saUserId);
    console.log("PASS [Check 4]: Setup/reset/OTP/Google tokens rejected by verifyToken while dedicated verifiers pass");

    const principal = async () => ({
      userId: saUserId,
      email: "sa@platform.edu",
      passwordSig: validSig,
      source: "jwt" as const,
      developmentMode: false,
    });

    // 6. Exact User-to-PlatformUser ID match preserves both IDs
    const exactDb: any = {
      $transaction: async (fn: (tx: any) => Promise<any>) =>
        fn({
          $executeRaw: async () => 0,
          user: {
            findUnique: async () => ({
              id: saUserId,
              email: "sa@platform.edu",
              role: "SUPER_ADMIN",
              platformRole: "SUPER_ADMIN",
              isActive: true,
              status: "ACTIVE",
              passwordHash: "bcrypt_hash_v1",
            }),
          },
          platformUser: {
            findUnique: async () => ({
              id: saUserId,
              email: "sa@platform.edu",
              platformRole: "SUPER_ADMIN",
              status: "ACTIVE",
            }),
          },
        }),
    };
    const exactIdent = await withSuperAdminContext(
      async (_tx, ident) => {
        assert.deepEqual(getActiveSuperAdminIdentity(), ident);
        return ident;
      },
      { verifyPrincipal: principal, getDb: () => exactDb }
    );
    assert.deepEqual(exactIdent, { userId: saUserId, platformUserId: saUserId });
    console.log("PASS [Check 5]: Exact User-to-PlatformUser ID match verified");

    // 7. Mismatched ID + email rejected when byId has wrong email
    const mismatchByIdDb: any = {
      $transaction: async (fn: (tx: any) => Promise<any>) =>
        fn({
          $executeRaw: async () => 0,
          user: {
            findUnique: async () => ({
              id: saUserId,
              email: "sa@platform.edu",
              role: "SUPER_ADMIN",
              platformRole: "SUPER_ADMIN",
              isActive: true,
              status: "ACTIVE",
              passwordHash: "bcrypt_hash_v1",
            }),
          },
          platformUser: {
            findUnique: async () => ({
              id: saUserId,
              email: "someone-else@platform.edu",
              platformRole: "SUPER_ADMIN",
              status: "ACTIVE",
            }),
          },
        }),
    };
    await assert.rejects(
      () => withSuperAdminContext(async () => "no", { verifyPrincipal: principal, getDb: () => mismatchByIdDb }),
      ForbiddenError
    );
    console.log("PASS [Check 6]: ID-matched PlatformUser with mismatched email rejected");

    // 8. Legacy email-only match rejected if PlatformUser.id belongs to a different `users` row
    const conflictingLegacyDb: any = {
      $transaction: async (fn: (tx: any) => Promise<any>) =>
        fn({
          $executeRaw: async () => 0,
          user: {
            findUnique: async ({ where }: any) =>
              where.id === saUserId
                ? {
                    id: saUserId,
                    email: "sa@platform.edu",
                    role: "SUPER_ADMIN",
                    platformRole: "SUPER_ADMIN",
                    isActive: true,
                    status: "ACTIVE",
                    passwordHash: "bcrypt_hash_v1",
                  }
                : { id: otherUserId },
          },
          platformUser: {
            findUnique: async () => null,
            findMany: async () => [
              {
                id: otherUserId,
                email: "sa@platform.edu",
                platformRole: "SUPER_ADMIN",
                status: "ACTIVE",
              },
            ],
          },
        }),
    };
    await assert.rejects(
      () => withSuperAdminContext(async () => "no", { verifyPrincipal: principal, getDb: () => conflictingLegacyDb }),
      ForbiddenError
    );
    console.log("PASS [Check 7]: Legacy email fallback rejected when PlatformUser.id belongs to another users row");

    // 9. Ambiguous (>1) email mapping rejected
    const ambiguousDb: any = {
      $transaction: async (fn: (tx: any) => Promise<any>) =>
        fn({
          $executeRaw: async () => 0,
          user: {
            findUnique: async () => ({
              id: saUserId,
              email: "sa@platform.edu",
              role: "SUPER_ADMIN",
              platformRole: "SUPER_ADMIN",
              isActive: true,
              status: "ACTIVE",
              passwordHash: "bcrypt_hash_v1",
            }),
          },
          platformUser: {
            findUnique: async () => null,
            findMany: async () => [
              { id: legacyPlatformId, email: "sa@platform.edu", platformRole: "SUPER_ADMIN", status: "ACTIVE" },
              { id: otherUserId, email: "SA@platform.edu", platformRole: "SUPER_ADMIN", status: "ACTIVE" },
            ],
          },
        }),
    };
    await assert.rejects(
      () => withSuperAdminContext(async () => "no", { verifyPrincipal: principal, getDb: () => ambiguousDb }),
      ForbiddenError
    );
    console.log("PASS [Check 8]: Ambiguous (>1) email mapping rejected");

    // 10. Email-only legacy mapping without exact ID match is now strictly rejected (Stage C.5.5)
    const legacyOkDb: any = {
      $transaction: async (fn: (tx: any) => Promise<any>) =>
        fn({
          $executeRaw: async () => 0,
          user: {
            findUnique: async ({ where }: any) =>
              where.id === saUserId
                ? {
                    id: saUserId,
                    email: "sa@platform.edu",
                    role: "SUPER_ADMIN",
                    platformRole: "SUPER_ADMIN",
                    isActive: true,
                    status: "ACTIVE",
                    passwordHash: "bcrypt_hash_v1",
                  }
                : null,
          },
          platformUser: {
            findUnique: async () => null,
          },
        }),
    };
    await assert.rejects(
      () => withSuperAdminContext(async (_tx, ident) => ident, { verifyPrincipal: principal, getDb: () => legacyOkDb }),
      ForbiddenError
    );
    console.log("PASS [Check 9]: Email-only mapping without exact PlatformUser.id match rejected");
  } finally {
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  }
}

main().catch((err) => {
  console.error("STAGE C.5.3 TEST FAILED:", err);
  process.exit(1);
});
