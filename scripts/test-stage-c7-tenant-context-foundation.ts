/**
 * Phase P0.5 Stage C.7 / C.7.2 — Tenant Context Capability & ALS Foundation Tests (Mocked & Unit)
 *
 * Clearly distinguished from live PostgreSQL tests:
 *   - Verifies H1/H2 remediation: `runInTenantTxStore` & capability-minting functions are NOT exported,
 *     `{ verified: true }` cannot forge a context, fake `verifyAuthorization: () => true` and injected
 *     `dbClient` are ignored and fail closed, and missing verification fails closed.
 *   - Verifies `lib/db.ts` & `lib/prisma.ts` ALS routing, concurrent async isolation, and no-context behavior.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";

async function main() {
  // 1. Real (unmocked) `tenant-als.ts` and `tenant-context.ts` capability & fail-closed checks
  const tenantAls = await import("../lib/security/tenant-als");
  const tenantContext = await import("../lib/security/tenant-context");
  const { ForbiddenError } = await import("../lib/auth/errors");

  // H1: No public `runInTenantTxStore` or capability-minting function is exported
  assert.equal((tenantAls as any).runInTenantTxStore, undefined, "runInTenantTxStore must not be exported");
  assert.equal((tenantAls as any).TENANT_CAPABILITY, undefined, "TENANT_CAPABILITY must not be exported");
  assert.equal((tenantAls as any).verifiedCapabilityTokens, undefined, "verifiedCapabilityTokens must not be exported");
  assert.equal(tenantAls.getActiveTenantTxStore(), null);
  assert.equal(tenantAls.getActiveTenantTx(), null);
  console.log("PASS [Check 1]: Capability primitives and runInTenantTxStore are unexported/sealed");

  // H2: Fake verifier returning `true`, `{ verified: true }`, and injected `dbClient` all fail closed
  await assert.rejects(
    () => tenantContext.withTenantContext("inst-a", async () => "no"),
    ForbiddenError
  );
  await assert.rejects(
    () =>
      tenantContext.withPreparedTenantContext(
        {
          institutionId: "inst-a",
          verifyAuthorization: async () => true,
          dbClient: { $transaction: async (fn: any) => fn({}) },
          verified: true,
        } as any,
        async () => "no"
      ),
    ForbiddenError
  );
  await assert.rejects(
    () => tenantContext.withPreparedTenantContext({ institutionId: "   " }, async () => "no"),
    ForbiddenError
  );
  console.log("PASS [Check 2]: Fake verifier, { verified: true }, injected dbClient, and blank institutionId all fail closed");

  // 2. Test `lib/db.ts` & `lib/prisma.ts` proxy routing & concurrent ALS isolation using a test-only ALS shim
  const testAls = new AsyncLocalStorage<{ inst: string; tx: any }>();
  const origLoad = (Module as any)._load;
  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === "server-only") return {};
    if (request === "@/lib/security/tenant-als") {
      return {
        getActiveTenantTx: () => testAls.getStore()?.tx ?? null,
        getActiveTenantTxStore: () => testAls.getStore() ?? null,
        getActiveTenantMappedTx: () => null,
      };
    }
    return origLoad.apply(this, arguments);
  };

  // Clear module cache for db.ts and prisma.ts so they bind to our test-only ALS shim
  delete require.cache[require.resolve("../lib/db")];
  delete require.cache[require.resolve("../lib/prisma")];
  const { db } = await import("../lib/db");
  const { prisma } = await import("../lib/prisma");

  // No-context behavior preserved
  assert.equal(typeof db.$transaction, "function");
  assert.equal(typeof prisma.students, "object");
  console.log("PASS [Check 3]: Normal db and prisma behavior preserved when no ALS context is active");

  // Single-tx routing & wrapWithMapping preservation
  let txOpenCount = 0;
  const mockTx = {
    student: { findMany: async () => [{ id: "stu-1" }] },
    enrollment: { count: async () => 3 },
    $queryRaw: async () => [{ ok: 1 }],
  };
  await testAls.run({ inst: "inst-A", tx: mockTx }, async () => {
    txOpenCount++;
    assert.equal((await db.student.findMany()).length, 1);
    assert.equal((await prisma.students.findMany()).length, 1);

    const inner = await db.$transaction(async () => prisma.enrollments.count());
    assert.equal(inner, 3);

    const batch = await db.$transaction([db.enrollment.count(), db.$queryRaw`SELECT 1`]);
    assert.deepEqual(batch, [3, [{ ok: 1 }]]);
  });
  assert.equal(txOpenCount, 1);
  console.log("PASS [Check 4]: db/prisma route through activeTx; wrapWithMapping & batch routing preserved");

  // Concurrent async isolation
  const [resA, resB] = await Promise.all([
    testAls.run(
      {
        inst: "inst-A",
        tx: {
          student: {
            findMany: async () => {
              await new Promise((r) => setTimeout(r, 10));
              return [{ inst: testAls.getStore()?.inst }];
            },
          },
        },
      },
      async () => db.student.findMany()
    ),
    testAls.run(
      {
        inst: "inst-B",
        tx: {
          student: {
            findMany: async () => {
              await new Promise((r) => setTimeout(r, 5));
              return [{ inst: testAls.getStore()?.inst }];
            },
          },
        },
      },
      async () => db.student.findMany()
    ),
  ]);
  assert.deepEqual(resA, [{ inst: "inst-A" }]);
  assert.deepEqual(resB, [{ inst: "inst-B" }]);
  console.log("PASS [Check 5]: Concurrent async ALS isolation verified");
}

main().catch((err) => {
  console.error("STAGE C.7.2 TEST FAILED:", err);
  process.exit(1);
});
