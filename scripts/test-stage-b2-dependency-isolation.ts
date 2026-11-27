/**
 * Phase P0.5 Stage B.2 — Non-Super-Admin Database Dependency Isolation Tests (Static & Mocked)
 *
 * Clearly distinguished from live PostgreSQL integration tests:
 *   - Verifies login no longer transitively depends on `superAdminPrisma`.
 *   - Verifies `syncInstitutionToAppDb` executes via `db` without `SUPER_ADMIN_DATABASE_URL`.
 *   - Verifies `activate/route.ts` fails closed (no fallback to DATABASE_URL) when
 *     `SUPER_ADMIN_DATABASE_URL` is missing.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";

const origLoad = (Module as any)._load;
let capturedQueries: string[] = [];

(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "server-only") return {};
  if (request === "@/lib/db" || request.endsWith("/lib/db") || request.endsWith("\\lib\\db")) {
    return {
      __esModule: true,
      default: {
        $queryRaw: async () => {
          capturedQueries.push("SELECT_PLATFORM_INSTITUTION");
          return [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Test Inst",
              code: "TINST",
              slug: "test-inst",
              type: "COLLEGE",
              status: "ACTIVE",
              email: "admin@test.edu",
              phone: null,
              address: null,
              city: null,
              state: null,
              postalCode: null,
              country: "India",
              website: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        },
        $executeRaw: async () => {
          capturedQueries.push("UPSERT_APP_INSTITUTION");
          return 1;
        },
      },
    };
  }
  return origLoad.apply(this, arguments);
};

async function main() {
  // 1. Static check: login/route.ts & institution-sync.service.ts have zero super-admin/prisma dependency
  const loginSrc = fs.readFileSync(path.resolve(process.cwd(), "app/api/auth/login/route.ts"), "utf8");
  const syncSrc = fs.readFileSync(path.resolve(process.cwd(), "lib/services/institution-sync.service.ts"), "utf8");
  assert.ok(!loginSrc.includes("institution-provisioning.service"), "login/route.ts must not import institution-provisioning.service");
  assert.ok(!loginSrc.includes("super-admin/prisma"), "login/route.ts must not import super-admin/prisma");
  assert.ok(loginSrc.includes("institution-sync.service"), "login/route.ts must import institution-sync.service");
  assert.ok(!syncSrc.includes("super-admin/prisma"), "institution-sync.service.ts must not import super-admin/prisma");
  console.log("PASS [Check 1]: login/route.ts & institution-sync.service.ts are decoupled from superAdminPrisma");

  // 2. Mocked execution: syncInstitutionToAppDb succeeds even when SUPER_ADMIN_DATABASE_URL is unset
  const prevSuperUrl = process.env.SUPER_ADMIN_DATABASE_URL;
  delete process.env.SUPER_ADMIN_DATABASE_URL;
  try {
    const { syncInstitutionToAppDb } = await import("../lib/services/institution-sync.service");
    capturedQueries = [];
    const ok = await syncInstitutionToAppDb("11111111-1111-4111-8111-111111111111");
    assert.equal(ok, true);
    assert.deepEqual(capturedQueries, ["SELECT_PLATFORM_INSTITUTION", "UPSERT_APP_INSTITUTION"]);
    console.log("PASS [Check 2]: syncInstitutionToAppDb runs without SUPER_ADMIN_DATABASE_URL");

    // 3. Backward-compatible re-export exists on institution-provisioning.service.ts
    const provSrc = fs.readFileSync(
      path.resolve(process.cwd(), "lib/services/institution-provisioning.service.ts"),
      "utf8"
    );
    assert.ok(provSrc.includes("export { syncInstitutionToAppDb }"));
    console.log("PASS [Check 3]: institution-provisioning.service.ts preserves syncInstitutionToAppDb re-export");

    // 4. Deferred activation route still fails closed (never falls back to DATABASE_URL)
    const { DatabaseConfigurationError } = await import("../lib/db/role-pools");
    const { prisma: superAdminPrisma } = await import("../lib/super-admin/prisma");
    assert.throws(
      () => superAdminPrisma.institutionAdminInvitation,
      (err: any) => err instanceof DatabaseConfigurationError && err.statusCode === 503
    );
    console.log("PASS [Check 4]: Deferred activation route fails closed without SUPER_ADMIN_DATABASE_URL");
  } finally {
    if (prevSuperUrl !== undefined) process.env.SUPER_ADMIN_DATABASE_URL = prevSuperUrl;
  }
}

main().catch((err) => {
  console.error("STAGE B.2 TEST FAILED:", err);
  process.exit(1);
});
