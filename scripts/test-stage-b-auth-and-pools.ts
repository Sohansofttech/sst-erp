/**
 * Phase P0.5 Stage B — Authentication & Separate Role-Pool Tests (Mocked / Unit)
 *
 * Clearly distinguished from live PostgreSQL tests:
 *   - Verifies pool separation, fail-closed missing credentials, zero fallback to DATABASE_URL,
 *     two-phase login resolution, unauthorized institution switching rejection, and session/logout
 *     JWT compatibility.
 *   - Live PostgreSQL verification of `erp_auth_login` / `SECURITY DEFINER` RPCs and
 *     `erp_super_admin_login` requires staging DB access (see Stage B Report).
 */
import assert from "node:assert/strict";
import Module from "node:module";

// Stub `server-only` so server-only modules can be imported in tsx CLI tests
const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "server-only") return {};
  return origLoad.apply(this, arguments);
};

async function main() {
  const {
    DatabaseConfigurationError,
    getRoleDb,
    hasRoleDatabaseConfig,
  } = await import("../lib/db/role-pools");
  const { authDb } = await import("../lib/auth/auth-db");
  const { workerDb } = await import("../lib/worker/worker-db");
  const { prisma: superAdminPrisma } = await import("../lib/super-admin/prisma");
  const {
    resolvePreTenantLoginIdentity,
    executeInstitutionLoginPhase,
  } = await import("../lib/auth/two-phase-login");
  const { ForbiddenError, UnauthorizedError } = await import("../lib/auth/session");
  const { signToken, verifyToken, computePasswordSignature } = await import("../lib/auth/jwt");

  // Save & clear privileged DB env vars while keeping DATABASE_URL set to prove NO silent fallback
  const saved = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_DATABASE_URL: process.env.AUTH_DATABASE_URL,
    SUPER_ADMIN_DATABASE_URL: process.env.SUPER_ADMIN_DATABASE_URL,
    WORKER_DATABASE_URL: process.env.WORKER_DATABASE_URL,
  };
  process.env.DATABASE_URL = "postgresql://erp_app_login:placeholder@localhost:5432/postgres";
  delete process.env.AUTH_DATABASE_URL;
  delete process.env.SUPER_ADMIN_DATABASE_URL;
  delete process.env.WORKER_DATABASE_URL;

  try {
    // 1 & 2. Missing privileged DB config fails safely with NO fallback to DATABASE_URL
    assert.equal(hasRoleDatabaseConfig("AUTH"), false);
    assert.equal(hasRoleDatabaseConfig("SUPER_ADMIN"), false);
    assert.equal(hasRoleDatabaseConfig("WORKER"), false);

    assert.throws(
      () => getRoleDb("AUTH"),
      (err: any) => err instanceof DatabaseConfigurationError && err.statusCode === 503 && err.envVar === "AUTH_DATABASE_URL"
    );
    assert.throws(
      () => getRoleDb("SUPER_ADMIN"),
      (err: any) => err instanceof DatabaseConfigurationError && err.statusCode === 503 && err.envVar === "SUPER_ADMIN_DATABASE_URL"
    );
    assert.throws(
      () => getRoleDb("WORKER"),
      (err: any) => err instanceof DatabaseConfigurationError && err.statusCode === 503 && err.envVar === "WORKER_DATABASE_URL"
    );

    // Lazy proxies also fail closed at query access time without falling back
    assert.throws(() => authDb.user, DatabaseConfigurationError);
    assert.throws(() => superAdminPrisma.platformInstitution, DatabaseConfigurationError);
    assert.throws(() => workerDb.biometricDevice, DatabaseConfigurationError);
    console.log("PASS [Check 1]: Missing privileged DB env vars fail closed (no fallback to DATABASE_URL)");
  } finally {
    if (saved.DATABASE_URL !== undefined) process.env.DATABASE_URL = saved.DATABASE_URL;
    else delete process.env.DATABASE_URL;
    if (saved.AUTH_DATABASE_URL !== undefined) process.env.AUTH_DATABASE_URL = saved.AUTH_DATABASE_URL;
    if (saved.SUPER_ADMIN_DATABASE_URL !== undefined) process.env.SUPER_ADMIN_DATABASE_URL = saved.SUPER_ADMIN_DATABASE_URL;
    if (saved.WORKER_DATABASE_URL !== undefined) process.env.WORKER_DATABASE_URL = saved.WORKER_DATABASE_URL;
  }

  // Mock TwoPhaseAuthClient
  const instA = { id: "11111111-1111-4111-8111-111111111111", name: "Inst A", slug: "inst-a", code: "INSTA", status: "ACTIVE", isActive: true };
  const instB = { id: "22222222-2222-4222-8222-222222222222", name: "Inst B", slug: "inst-b", code: "INSTB", status: "ACTIVE", isActive: true };

  const users: Record<string, any> = {
    "student@insta.edu": {
      id: "aaaa1111-1111-4111-8111-111111111111",
      email: "student@insta.edu",
      phone: "9999999999",
      passwordHash: "hash_s",
      role: "STUDENT",
      platformRole: "NONE",
      isActive: true,
      status: "ACTIVE",
      institutionId: instA.id,
      fullName: "Student A",
    },
    "admin@insta.edu": {
      id: "bbbb1111-1111-4111-8111-111111111111",
      email: "admin@insta.edu",
      phone: null,
      passwordHash: "hash_a",
      role: "ADMIN",
      platformRole: "NONE",
      isActive: true,
      status: "ACTIVE",
      institutionId: instA.id,
      fullName: "Admin A",
    },
    "super@platform.edu": {
      id: "cccc1111-1111-4111-8111-111111111111",
      email: "super@platform.edu",
      phone: null,
      passwordHash: "hash_sa",
      role: "SUPER_ADMIN",
      platformRole: "SUPER_ADMIN",
      isActive: true,
      status: "ACTIVE",
      institutionId: null,
      fullName: "Super Admin",
    },
    "archived@insta.edu": {
      id: "dddd1111-1111-4111-8111-111111111111",
      email: "archived@insta.edu",
      phone: null,
      passwordHash: "hash_x",
      role: "STUDENT",
      platformRole: "NONE",
      isActive: true,
      status: "ACTIVE",
      institutionId: instA.id,
      fullName: "Archived Student",
    },
  };

  const mockAuthClient: any = {
    institution: {
      findFirst: async ({ where }: any) => {
        const val = where.OR[0].code.equals.toUpperCase();
        if (val === "INSTA") return instA;
        if (val === "INSTB") return instB;
        return null;
      },
    },
    user: {
      findFirst: async ({ where }: any) => {
        const email = where.email.equals.toLowerCase();
        const u = users[email] || null;
        if (!u) return null;
        if (where.institutionId && u.institutionId !== where.institutionId) return null;
        return u;
      },
    },
    platformSetting: {
      findUnique: async ({ where }: any) => {
        if (where.key === `archived_students:${instA.id}`) {
          return { value: [{ id: "dddd1111-1111-4111-8111-111111111111" }] };
        }
        return null;
      },
    },
  };

  // 3. Normal Student login & Institution resolution
  const stuRes = await resolvePreTenantLoginIdentity(mockAuthClient, {
    email: "student@insta.edu",
    institutionCode: "INSTA",
  });
  assert.equal(stuRes.resolvedInstitutionId, instA.id);
  let ranInInst: string | null = null;
  await executeInstitutionLoginPhase(
    stuRes.resolvedInstitutionId!,
    async () => "ok",
    async (id, fn) => {
      ranInInst = id;
      return fn({});
    }
  );
  assert.equal(ranInInst, instA.id);
  console.log("PASS [Check 2]: Normal student login resolves institution and enters tenant phase");

  // 4. Institution Admin login
  const admRes = await resolvePreTenantLoginIdentity(mockAuthClient, {
    email: "admin@insta.edu",
    institutionCode: "INSTA",
  });
  assert.equal(admRes.user.role, "ADMIN");
  assert.equal(admRes.resolvedInstitutionId, instA.id);
  console.log("PASS [Check 3]: Institution Admin login resolves verified institution");

  // 5. Super Admin login (no institutionId, cannot enter tenant phase with null)
  const saRes = await resolvePreTenantLoginIdentity(mockAuthClient, {
    email: "super@platform.edu",
  });
  assert.equal(saRes.user.role, "SUPER_ADMIN");
  assert.equal(saRes.resolvedInstitutionId, null);
  await assert.rejects(() => executeInstitutionLoginPhase("", async () => null), ForbiddenError);
  console.log("PASS [Check 4]: Super Admin login has null institutionId and stays isolated from tenant context");

  // 6. Unauthorized institution switching / mismatch
  const mismatchClient: any = {
    ...mockAuthClient,
    user: {
      findFirst: async () => users["student@insta.edu"], // belongs to instA even if instB was requested
    },
  };
  await assert.rejects(
    () => resolvePreTenantLoginIdentity(mismatchClient, { email: "student@insta.edu", institutionCode: "INSTB" }),
    ForbiddenError
  );
  console.log("PASS [Check 5]: Unauthorized institution switching (Inst B code for Inst A user) rejected with ForbiddenError");

  // 7. Invalid credentials / unknown institution / archived user
  await assert.rejects(
    () => resolvePreTenantLoginIdentity(mockAuthClient, { email: "student@insta.edu", institutionCode: "INVALID" }),
    UnauthorizedError
  );
  await assert.rejects(
    () => resolvePreTenantLoginIdentity(mockAuthClient, { email: "archived@insta.edu", institutionCode: "INSTA" }),
    ForbiddenError
  );
  console.log("PASS [Check 6]: Invalid institution code and archived account rejected safely");

  // 8. Session token & passwordSig compatibility (logout / password-change invalidation)
  const prevJwtSecret = process.env.JWT_SECRET;
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = "test-only-stage-b-jwt-secret-minimum-32-chars";
  }
  const sig = computePasswordSignature("hash_s");
  const token = await signToken({
    userId: stuRes.user.id,
    email: stuRes.user.email,
    fullName: "Student A",
    name: "Student A",
    role: "STUDENT",
    institutionId: instA.id,
    institutionName: "Inst A",
    permissions: [],
    assignedRoles: ["STUDENT"],
    passwordSig: sig,
  });
  const verified = await verifyToken(token);
  if (prevJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = prevJwtSecret;
  assert.ok(verified);
  assert.equal(verified!.institutionId, instA.id);
  assert.equal(verified!.passwordSig, sig);
  console.log("PASS [Check 7]: JWT session token & passwordSig compatibility preserved");
}

main().catch((err) => {
  console.error("STAGE B TEST FAILED:", err);
  process.exit(1);
});
