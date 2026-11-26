/**
 * Phase P0.5 Stage C.5 / C.5.1 / C.5.3 — Super Admin Transaction Context Tests (Mocked & Static)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";

const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "server-only") return {};
  return origLoad.apply(this, arguments);
};

async function main() {
  const { withSuperAdminContext, getActiveSuperAdminTx } = await import(
    "../lib/super-admin/context"
  );
  const { DatabaseConfigurationError } = await import("../lib/db/role-pools");
  const { ForbiddenError, UnauthorizedError } = await import("../lib/auth/session");
  const { computePasswordSignature } = await import("../lib/auth/jwt");

  const validSig = computePasswordSignature("hashed_pw");
  const saPrincipal = async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    email: "sa@platform.edu",
    passwordSig: validSig,
    source: "jwt" as const,
    developmentMode: false,
  });

  // 1. Unauthenticated request rejected (zero DB calls)
  let dbTouched = false;
  await assert.rejects(
    () =>
      withSuperAdminContext(async () => "should-not-run", {
        verifyPrincipal: async () => {
          throw new UnauthorizedError("Super Admin authentication is required.");
        },
        getDb: () => {
          dbTouched = true;
          return {} as any;
        },
      }),
    UnauthorizedError
  );
  assert.equal(dbTouched, false);
  console.log("PASS [Check 1]: Unauthenticated request rejected with zero DB queries");

  // 2. Non-Super-Admin / missing userId rejected before DB
  await assert.rejects(
    () =>
      withSuperAdminContext(async () => "should-not-run", {
        verifyPrincipal: async () => ({
          userId: null,
          email: "teacher@inst.edu",
          source: "jwt",
          developmentMode: false,
        }),
        getDb: () => {
          dbTouched = true;
          return {} as any;
        },
      }),
    ForbiddenError
  );
  assert.equal(dbTouched, false);
  console.log("PASS [Check 2]: Non-Super-Admin / missing principal ID rejected before DB");

  // 3. Missing SUPER_ADMIN_DATABASE_URL fails closed (503)
  const prevSuperUrl = process.env.SUPER_ADMIN_DATABASE_URL;
  delete process.env.SUPER_ADMIN_DATABASE_URL;
  try {
    await assert.rejects(
      () => withSuperAdminContext(async () => "should-not-run", { verifyPrincipal: saPrincipal }),
      (err: any) =>
        err instanceof DatabaseConfigurationError &&
        err.statusCode === 503 &&
        err.envVar === "SUPER_ADMIN_DATABASE_URL"
    );
    console.log("PASS [Check 3]: Missing SUPER_ADMIN_DATABASE_URL fails closed (503)");
  } finally {
    if (prevSuperUrl !== undefined) process.env.SUPER_ADMIN_DATABASE_URL = prevSuperUrl;
  }

  // 4. SET LOCAL ROLE executes strictly BEFORE any table query; wrapWithMapping & nesting preserved
  const opSequence: string[] = [];
  let rolledBack = false;
  const orderedMockDb: any = {
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const rawTx = {
        $executeRaw: async (strings: TemplateStringsArray) => {
          opSequence.push(strings.join("?").trim());
          return 0;
        },
        user: {
          findUnique: async ({ where }: any) => {
            opSequence.push("user.findUnique");
            return {
              id: where.id,
              email: "sa@platform.edu",
              role: "SUPER_ADMIN",
              platformRole: "SUPER_ADMIN",
              isActive: true,
              status: "ACTIVE",
              passwordHash: "hashed_pw",
            };
          },
        },
        platformUser: {
          findUnique: async ({ where }: any) => {
            opSequence.push("platformUser.findUnique");
            return {
              id: where.id,
              email: "sa@platform.edu",
              platformRole: "SUPER_ADMIN",
              status: "ACTIVE",
            };
          },
        },
        institution: {
          count: async () => {
            opSequence.push("institution.count");
            return 42;
          },
        },
      };
      try {
        return await fn(rawTx);
      } catch (e) {
        rolledBack = true;
        throw e;
      }
    },
  };

  const count = await withSuperAdminContext(
    async () => {
      assert.ok(getActiveSuperAdminTx() !== null);
      return withSuperAdminContext(
        async (innerTx) => (innerTx as any).institutions.count(),
        { verifyPrincipal: saPrincipal, getDb: () => orderedMockDb }
      );
    },
    { verifyPrincipal: saPrincipal, getDb: () => orderedMockDb }
  );
  assert.equal(count, 42);
  assert.equal(getActiveSuperAdminTx(), null);
  assert.deepEqual(opSequence, [
    "SET LOCAL ROLE erp_super_admin;",
    "user.findUnique",
    "platformUser.findUnique",
    "institution.count",
  ]);
  console.log("PASS [Check 4]: SET LOCAL ROLE executes strictly BEFORE any table query; wrapWithMapping & nesting preserved");

  // 5. Spoofed JWT role claim rejected inside tx & rolls back
  rolledBack = false;
  const spoofedRoleDb: any = {
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const rawTx = {
        $executeRaw: async () => 0,
        user: {
          findUnique: async ({ where }: any) => ({
            id: where.id,
            email: "teacher@inst.edu",
            role: "TEACHER",
            platformRole: "NONE",
            isActive: true,
            status: "ACTIVE",
            passwordHash: "hashed_pw",
          }),
        },
      };
      try {
        return await fn(rawTx);
      } catch (e) {
        rolledBack = true;
        throw e;
      }
    },
  };
  await assert.rejects(
    () => withSuperAdminContext(async () => "should-not-run", { verifyPrincipal: saPrincipal, getDb: () => spoofedRoleDb }),
    ForbiddenError
  );
  assert.equal(rolledBack, true);
  console.log("PASS [Check 5]: Spoofed JWT role claim rejected by in-transaction DB verification & rolled back");

  // 6. Revoked Super Admin rejected inside tx & rolls back
  rolledBack = false;
  const revokedPlatformDb: any = {
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const rawTx = {
        $executeRaw: async () => 0,
        user: {
          findUnique: async ({ where }: any) => ({
            id: where.id,
            email: "sa@platform.edu",
            role: "SUPER_ADMIN",
            platformRole: "SUPER_ADMIN",
            isActive: true,
            status: "ACTIVE",
            passwordHash: "hashed_pw",
          }),
        },
        platformUser: {
          findUnique: async ({ where }: any) => ({
            id: where.id,
            email: "sa@platform.edu",
            platformRole: "SUPER_ADMIN",
            status: "SUSPENDED",
          }),
        },
      };
      try {
        return await fn(rawTx);
      } catch (e) {
        rolledBack = true;
        throw e;
      }
    },
  };
  await assert.rejects(
    () => withSuperAdminContext(async () => "should-not-run", { verifyPrincipal: saPrincipal, getDb: () => revokedPlatformDb }),
    ForbiddenError
  );
  assert.equal(rolledBack, true);
  console.log("PASS [Check 6]: Revoked Super Admin rejected inside transaction & rolled back");

  // 7. Development bypass rejected outside NODE_ENV === "development"
  const prevNodeEnv = process.env.NODE_ENV;
  const prevBypass = process.env.SUPER_ADMIN_DEV_AUTH_BYPASS;
  try {
    (process.env as any).NODE_ENV = "production";
    process.env.SUPER_ADMIN_DEV_AUTH_BYPASS = "true";
    await assert.rejects(
      () => withSuperAdminContext(async () => "should-not-run", { verifyPrincipal: saPrincipal, getDb: () => orderedMockDb }),
      ForbiddenError
    );
    delete process.env.SUPER_ADMIN_DEV_AUTH_BYPASS;
    await assert.rejects(
      () =>
        withSuperAdminContext(async () => "should-not-run", {
          verifyPrincipal: async () => ({
            userId: null,
            email: null,
            source: "dev_bypass",
            developmentMode: true,
          }),
          getDb: () => orderedMockDb,
        }),
      ForbiddenError
    );
    console.log("PASS [Check 7]: Development bypass rejected in production");
  } finally {
    (process.env as any).NODE_ENV = prevNodeEnv;
    if (prevBypass === undefined) delete process.env.SUPER_ADMIN_DEV_AUTH_BYPASS;
    else process.env.SUPER_ADMIN_DEV_AUTH_BYPASS = prevBypass;
  }

  // 8. Static check: erp_super_admin_login has zero direct table DML grants
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), "prisma/migrations/11_rls_roles_foundation/migration.sql"),
    "utf8"
  );
  assert.ok(!/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b[^;]*TO\s+erp_super_admin_login/i.test(sql));
  console.log("PASS [Check 8]: erp_super_admin_login has zero direct table DML grants");
}

main().catch((err) => {
  console.error("STAGE C.5 TEST FAILED:", err);
  process.exit(1);
});
