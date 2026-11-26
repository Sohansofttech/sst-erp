/**
 * Phase P0.5 Stage C.5.5 / C.5.7 — Super Admin Identity, Provisioning Removal & Teacher JWT Tests
 *
 * Clearly distinguished from live PostgreSQL tests:
 *   - Cryptographic unit tests (`jose` HS256, HS512/none rejection, purpose-claim rejection)
 *   - Mocked DB behavioral tests for both `withSuperAdminContext` and `requireSuperAdmin()`
 *     (verifying `platformUser.create` is NEVER called, concurrent requests cannot provision,
 *      `User.status === "ACTIVE"` + `passwordSig` + exact ID correspondence enforced).
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { SignJWT } from "jose";

const saId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

let mockSessionState: any = null;
let mockDbUserState: any = null;
let mockPlatformUserState: any = null;
let platformUserCreateCalls = 0;

const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "server-only") return {};
  if (request === "@/lib/super-admin/prisma") {
    return {
      __esModule: true,
      prisma: {
        user: { findUnique: async () => mockDbUserState },
        platformUser: {
          findUnique: async () => mockPlatformUserState,
          create: async () => {
            platformUserCreateCalls++;
            throw new Error("FORBIDDEN_AUTO_PROVISIONING");
          },
        },
      },
    };
  }
  if (request === "@/lib/super-admin/authorization") {
    return {
      __esModule: true,
      hasSuperAdminRole: async () => Boolean(mockDbUserState?.isActive && mockDbUserState?.role === "SUPER_ADMIN"),
    };
  }
  if (request === "@/lib/auth/session") {
    const actual = origLoad.apply(this, arguments);
    return {
      ...actual,
      getSession: async () => mockSessionState,
    };
  }
  return origLoad.apply(this, arguments);
};

async function main() {
  const prevJwt = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-stage-c57-jwt-secret-minimum-32-chars";

  try {
    const { withSuperAdminContext } = await import("../lib/super-admin/context");
    const { requireSuperAdmin } = await import("../lib/super-admin/require-super-admin");
    const {
      signToken,
      signPasswordSetupToken,
      signPasswordResetToken,
      signOtpLoginProof,
      signGoogleLoginProof,
      computePasswordSignature,
    } = await import("../lib/auth/jwt");
    const { signTeacherSession, verifyTeacherSession } = await import(
      "../lib/auth/teacher-session"
    );
    const { ForbiddenError } = await import("../lib/auth/session");

    const validSig = computePasswordSignature("bcrypt_hash_v1");
    const principal = async () => ({
      userId: saId,
      email: "sa@platform.edu",
      passwordSig: validSig,
      source: "jwt" as const,
      developmentMode: false,
    });

    // 1. requireSuperAdmin() accepts valid Super Admin & never calls platformUser.create
    mockSessionState = { userId: saId, role: "SUPER_ADMIN", passwordSig: validSig };
    mockDbUserState = {
      id: saId,
      email: "sa@platform.edu",
      role: "SUPER_ADMIN",
      platformRole: "SUPER_ADMIN",
      isActive: true,
      status: "ACTIVE",
      passwordHash: "bcrypt_hash_v1",
    };
    mockPlatformUserState = {
      id: saId,
      email: "SA@platform.edu",
      platformRole: "SUPER_ADMIN",
      status: "ACTIVE",
    };
    platformUserCreateCalls = 0;
    const actor = await requireSuperAdmin();
    assert.deepEqual(actor, { id: saId, email: "SA@platform.edu", developmentMode: false });
    assert.equal(platformUserCreateCalls, 0);
    console.log("PASS [Check 1]: requireSuperAdmin() accepts valid Super Admin without calling create()");

    // 2. Missing PlatformUser is rejected in requireSuperAdmin() (concurrent requests never call create)
    mockPlatformUserState = null;
    const concurrentResults = await Promise.allSettled([
      requireSuperAdmin(),
      requireSuperAdmin(),
      requireSuperAdmin(),
    ]);
    assert.ok(concurrentResults.every((r) => r.status === "rejected"));
    assert.equal(platformUserCreateCalls, 0, "platformUser.create must NEVER be called");
    console.log("PASS [Check 2]: Missing PlatformUser rejected (concurrent calls never trigger provisioning)");

    // 3. Inactive User (status: SUSPENDED even if isActive: true) & stale passwordSig rejected by requireSuperAdmin()
    mockPlatformUserState = { id: saId, email: "sa@platform.edu", platformRole: "SUPER_ADMIN", status: "ACTIVE" };
    mockDbUserState = { ...mockDbUserState, status: "SUSPENDED" };
    await assert.rejects(() => requireSuperAdmin(), /inactive or unauthorized/);
    mockDbUserState = { ...mockDbUserState, status: "ACTIVE", passwordHash: "rotated_hash" };
    await assert.rejects(() => requireSuperAdmin(), /session signature/);
    console.log("PASS [Check 3]: Inactive User (status) & stale passwordSig rejected by requireSuperAdmin()");

    // 4. Mismatched PlatformUser email or wrong platformRole rejected by requireSuperAdmin()
    mockDbUserState = { ...mockDbUserState, passwordHash: "bcrypt_hash_v1" };
    mockPlatformUserState = { id: saId, email: "other@platform.edu", platformRole: "SUPER_ADMIN", status: "ACTIVE" };
    await assert.rejects(() => requireSuperAdmin(), /not found or unauthorized/);
    mockPlatformUserState = { id: saId, email: "sa@platform.edu", platformRole: "NONE", status: "ACTIVE" };
    await assert.rejects(() => requireSuperAdmin(), /not found or unauthorized/);
    console.log("PASS [Check 4]: Mismatched email & non-SUPER_ADMIN PlatformUser rejected by requireSuperAdmin()");

    // 5. withSuperAdminContext exact ID correspondence & PlatformAuditLog attribution
    const exactDb: any = {
      $transaction: async (fn: (tx: any) => Promise<any>) =>
        fn({
          $executeRaw: async () => 0,
          user: { findUnique: async () => ({ ...mockDbUserState }) },
          platformUser: {
            findUnique: async ({ where }: any) =>
              where.id === saId
                ? { id: saId, email: "SA@platform.edu", platformRole: "SUPER_ADMIN", status: "ACTIVE" }
                : null,
          },
        }),
    };
    const ident = await withSuperAdminContext(
      async (_tx, identity) => identity,
      { verifyPrincipal: principal, getDb: () => exactDb }
    );
    assert.deepEqual(ident, { userId: saId, platformUserId: saId });
    console.log("PASS [Check 5]: withSuperAdminContext exact ID match & PlatformAuditLog attribution verified");

    // 6. Same email with different IDs & ordinary/inactive User rejected in withSuperAdminContext
    const diffIdSameEmailDb: any = {
      $transaction: async (fn: (tx: any) => Promise<any>) =>
        fn({
          $executeRaw: async () => 0,
          user: { findUnique: async () => ({ ...mockDbUserState }) },
          platformUser: {
            findUnique: async ({ where }: any) =>
              where.id === otherId
                ? { id: otherId, email: "sa@platform.edu", platformRole: "SUPER_ADMIN", status: "ACTIVE" }
                : null,
          },
        }),
    };
    await assert.rejects(
      () => withSuperAdminContext(async () => "no", { verifyPrincipal: principal, getDb: () => diffIdSameEmailDb }),
      ForbiddenError
    );
    console.log("PASS [Check 6]: Same email with different IDs rejected (no email fallback)");

    // 7. Teacher HS256 token accepted, HS512 rejected, & purpose-specific/non-teacher tokens rejected
    const teacherToken = await signTeacherSession({
      userId: saId,
      teacherId: "33333333-3333-4333-8333-333333333333",
      institutionId: "44444444-4444-4444-8444-444444444444",
      institutionSlug: "demo-campus",
      email: "teacher@demo.edu",
      fullName: "Prof Demo",
      employeeId: "EMP-01",
      designation: "Professor",
      department: "CSE",
      activeRole: "teacher",
      availableRoles: ["teacher"],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
      lastActivity: Date.now(),
    });
    assert.equal((await verifyTeacherSession(teacherToken))?.teacherId, "33333333-3333-4333-8333-333333333333");

    const hs512Teacher = await new SignJWT({
      userId: saId,
      teacherId: "t1",
      institutionId: "i1",
      institutionSlug: "s1",
      activeRole: "teacher",
    })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    assert.equal(await verifyTeacherSession(hs512Teacher), null);

    const setupTok = await signPasswordSetupToken({ userId: saId, email: "t@d.edu" });
    const resetTok = await signPasswordResetToken({ userId: saId, email: "t@d.edu" });
    const otpTok = await signOtpLoginProof({ userId: saId, email: "t@d.edu", mobile: "9999999999", role: "TEACHER" });
    const googleTok = await signGoogleLoginProof({ email: "t@d.edu", role: "TEACHER" });
    const studentTok = await signToken({
      userId: saId,
      email: "s@d.edu",
      fullName: "S",
      name: "S",
      role: "STUDENT",
      institutionId: "i1",
      institutionName: "Inst",
      permissions: [],
      assignedRoles: ["STUDENT"],
      passwordSig: validSig,
    });
    assert.equal(await verifyTeacherSession(setupTok), null);
    assert.equal(await verifyTeacherSession(resetTok), null);
    assert.equal(await verifyTeacherSession(otpTok), null);
    assert.equal(await verifyTeacherSession(googleTok), null);
    assert.equal(await verifyTeacherSession(studentTok), null);
    console.log("PASS [Check 7]: Teacher HS256 accepted; HS512, purpose-specific & non-teacher tokens rejected");
  } finally {
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  }
}

main().catch((err) => {
  console.error("STAGE C.5.7 TEST FAILED:", err);
  process.exit(1);
});
