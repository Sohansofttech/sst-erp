import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as planHelpers from "../lib/billing/subscription-plan";

const realRequire = createRequire(__filename);
const id = "550e8400-e29b-41d4-a716-446655440000";

function loadModule(path: string, stubs: Record<string, unknown>) {
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, (...args: never[]) => Promise<unknown>> = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => name in stubs ? stubs[name] : realRequire(name),
    console,
    BigInt,
  }, { filename: path });
  return exports;
}

function harness() {
  const writes: Record<string, unknown>[] = [];
  let stored: Record<string, unknown> = {
    id, price: 100, currency: "INR", billingCycle: "MONTHLY", customCycleDays: null,
    studentLimit: 50, maxUsers: 7, storageLimitMb: null, archivedAt: null,
    _count: { subscriptions: 1 },
  };
  const tx = {
    $queryRaw: async () => [],
    platformFeature: { count: async () => 0 },
    subscriptionPlan: {
      findFirst: async () => stored,
      create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); stored = { ...stored, ...data }; return { id }; },
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); stored = { ...stored, ...data }; return { id }; },
    },
    institutionSubscription: { findFirst: async () => null },
    planFeature: { deleteMany: async () => {}, createMany: async () => {} },
    platformAuditLog: { create: async () => {} },
  };
  const prisma = {
    $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
    subscriptionPlan: { findUnique: async () => stored },
  };
  const common = {
    "@prisma/client": { Prisma: { PrismaClientKnownRequestError: class extends Error {} } },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/super-admin/prisma": { prisma },
    "@/lib/super-admin/require-super-admin": { requireSuperAdmin: async () => ({ id }) },
    "@/lib/institution-type-config": {},
  };
  const management = loadModule("app/subscriptions/actions.ts", {
    ...common,
    "@/lib/billing/subscription-period": {},
    "@/lib/subscriptions/management-data": { hasStudentLimitColumn: async () => true },
  });
  const superAdmin = loadModule("app/super-admin/(protected)/[section]/actions.ts", {
    ...common,
    "@/lib/billing/subscription-plan": planHelpers,
    "@/app/subscriptions/actions": {},
  });
  return { writes, management, superAdmin, getStored: () => stored };
}

const input = {
  code: "BASIC", name: "Basic", description: "", price: 100, currency: "INR",
  billingCycle: "MONTHLY", customCycleDays: null, studentLimit: 50, storageLimitMb: null,
  institutionTypes: ["SCHOOL", "ACADEMY"], isActive: true, features: [], maxUsers: 123,
};

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (key === "institutionTypes") for (const type of value as string[]) data.append(key, type);
    else if (value !== null && !Array.isArray(value)) data.set(key, String(value));
  }
  return data;
}

test("management create and edit persist student limit and types without writing legacy data", async () => {
  const h = harness();
  assert.equal((await h.management.saveSubscriptionPlan(input as never) as { success: boolean }).success, true);
  assert.equal(h.writes[0].studentLimit, 50);
  assert.deepEqual(Array.from(h.writes[0].institutionTypes as string[]), input.institutionTypes);
  assert.equal("maxUsers" in h.writes[0], false);
  assert.equal(h.getStored().maxUsers, 7);

  assert.equal((await h.management.saveSubscriptionPlan({ ...input, id } as never) as { success: boolean }).success, true);
  assert.equal("maxUsers" in h.writes[1], false);
  assert.equal(h.writes[1].studentLimit, 50);
  assert.deepEqual(Array.from(h.writes[1].institutionTypes as string[]), input.institutionTypes);
  assert.equal(h.getStored().maxUsers, 7);
  const denied = await h.management.saveSubscriptionPlan({ ...input, id, studentLimit: 51 } as never) as { success: boolean };
  assert.equal(denied.success, false);
  assert.equal(h.writes.length, 2);
  const invalid = await h.management.saveSubscriptionPlan({ ...input, institutionTypes: ["OTHER"] } as never) as { success: boolean };
  assert.equal(invalid.success, false);
});

test("super admin forms persist student limit and types without rewriting legacy values", async () => {
  const h = harness();
  await h.superAdmin.createPlan(form() as never);
  assert.equal(h.writes[0].studentLimit, 50);
  assert.deepEqual(Array.from(h.writes[0].institutionTypes as string[]), input.institutionTypes);
  assert.equal("maxUsers" in h.writes[0], false);
  const update = form();
  update.set("id", id);
  await h.superAdmin.updatePlan(update as never);
  assert.equal("maxUsers" in h.writes[1], false);
  assert.equal(h.writes[1].studentLimit, 50);
  assert.deepEqual(Array.from(h.writes[1].institutionTypes as string[]), input.institutionTypes);
  assert.equal(h.getStored().maxUsers, 7);
  update.set("studentLimit", "51");
  await assert.rejects(h.superAdmin.updatePlan(update as never), /existing subscription terms/);
  assert.equal(h.writes.length, 2);
});

test("plan API forwards compatible types and rejects invalid types", async () => {
  let forwarded: Record<string, unknown> | undefined;
  const route = loadModule("app/api/subscription/plans/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status }) } },
    "@/lib/super-admin/require-super-admin": { requireSuperAdmin: async () => ({ id }) },
    "@/lib/subscriptions/management-data": {},
    "@/lib/subscriptions/api-auth": {},
    "@/app/subscriptions/actions": { saveSubscriptionPlan: async (body: Record<string, unknown>) => { forwarded = body; return { success: true }; } },
  });
  const request = (body: unknown) => ({ json: async () => body });
  await route.POST(request(input) as never);
  assert.equal(forwarded?.studentLimit, 50);
  assert.deepEqual(Array.from(forwarded?.institutionTypes as string[]), input.institutionTypes);
  assert.equal("maxUsers" in forwarded!, false);
  await route.POST(request({ ...input, institutionTypes: undefined }) as never);
  assert.deepEqual(Array.from(forwarded?.institutionTypes as string[]), []);
  const response = await route.POST(request({ ...input, institutionTypes: ["OTHER"] }) as never) as { status: number };
  assert.equal(response.status, 400);
});

test("plan interfaces and displays do not expose the legacy user limit", () => {
  for (const file of [
    "app/super-admin/(protected)/[section]/page.tsx", "components/subscriptions/Management.tsx",
    "components/subscriptions/SubscriptionSection.tsx", "components/admin/InstitutionSubscriptions.tsx",
    "app/subscription/page.tsx", "lib/subscriptions/management-data.ts",
  ]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /maxUsers|legacy user limit|maximum users/i, file);
  }
});
