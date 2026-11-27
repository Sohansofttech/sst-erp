import assert from "node:assert/strict";
import { test } from "node:test";
import { DivisionType, DivisionStatus } from "@prisma/client";
import {
  getDivisionSubscriptionEntitlements,
  assertDivisionCreationCapacity,
  assertDivisionTypeEntitled,
  DivisionSubscriptionError,
} from "../lib/billing/division-entitlements";

interface FeatureRec {
  code: string;
  isAvailable?: boolean;
}

function makeTx(opts: {
  planCode?: string;
  planActive?: boolean;
  hasSubscription?: boolean;
  currentDivisions?: number;
  planFeatures?: { feature: FeatureRec; enabled: boolean; limitValue?: number | null }[];
  overrides?: { feature: FeatureRec; enabled: boolean; expiresAt?: Date | null }[];
  globalFeatures?: FeatureRec[];
}) {
  const now = new Date();
  const subscription = opts.hasSubscription === false
    ? null
    : {
        status: "ACTIVE",
        plan: {
          code: opts.planCode ?? "GROWTH",
          name: opts.planCode ?? "Growth",
          isActive: opts.planActive !== false,
          features: (opts.planFeatures ?? []).map((pf) => ({
            enabled: pf.enabled,
            limitValue: pf.limitValue ?? null,
            feature: { code: pf.feature.code, isAvailable: pf.feature.isAvailable ?? true },
          })),
        },
      };

  // Filter overrides by expiry (gt now) like production query does.
  const overrides = (opts.overrides ?? []).filter(
    (o) => o.expiresAt === undefined || o.expiresAt === null || o.expiresAt > now
  );

  const tx: any = {
    institutionSubscription: {
      findFirst: async () => subscription,
    },
    institutionDivision: {
      count: async () => opts.currentDivisions ?? 0,
    },
    institutionFeatureOverride: {
      findMany: async () =>
        overrides.map((o) => ({
          enabled: o.enabled,
          feature: { code: o.feature.code, isAvailable: o.feature.isAvailable ?? true },
        })),
    },
    platformFeature: {
      findMany: async () => (opts.globalFeatures ?? []).map((f) => ({ code: f.code, isAvailable: f.isAvailable ?? true })),
    },
  };
  return tx;
}

test("globally unavailable MULTI_DIVISION_ACCESS on GROWTH (no relation) forces max=1", async () => {
  // GROWTH tier default is 3; global disable must override it to 1.
  const tx = makeTx({
    planCode: "GROWTH",
    currentDivisions: 1,
    globalFeatures: [{ code: "MULTI_DIVISION_ACCESS", isAvailable: false }],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.equal(ent.maxDivisions, 1);
  assert.equal(ent.canCreateMore, false);
});

test("globally unavailable MULTI_DIVISION_ACCESS on ENTERPRISE (no relation) forces max=1", async () => {
  // ENTERPRISE tier default is unlimited; global disable must override to 1.
  const tx = makeTx({
    planCode: "ENTERPRISE",
    currentDivisions: 2,
    globalFeatures: [{ code: "MULTI_DIVISION_ACCESS", isAvailable: false }],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.equal(ent.maxDivisions, 1);
  assert.equal(ent.canCreateMore, false);
});

test("globally unavailable division type excluded despite GROWTH tier default", async () => {
  // GROWTH default allows MONTESSORI; global disable must exclude it.
  const tx = makeTx({
    planCode: "GROWTH",
    globalFeatures: [{ code: `DIVISION_TYPE_${DivisionType.MONTESSORI}`, isAvailable: false }],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.ok(!ent.allowedDivisionTypes.includes(DivisionType.MONTESSORI));
  assert.ok(ent.disallowedDivisionTypes.includes(DivisionType.MONTESSORI));
});

test("globally unavailable division type excluded despite ENTERPRISE tier default", async () => {
  const tx = makeTx({
    planCode: "ENTERPRISE",
    globalFeatures: [{ code: `DIVISION_TYPE_${DivisionType.HIGHER_SECONDARY}`, isAvailable: false }],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.ok(!ent.allowedDivisionTypes.includes(DivisionType.HIGHER_SECONDARY));
});

test("globally unavailable features cannot be granted by enabled plan features", async () => {
  const tx = makeTx({
    planCode: "STARTER",
    currentDivisions: 0,
    planFeatures: [
      { feature: { code: "MULTI_DIVISION_ACCESS" }, enabled: true, limitValue: null },
      { feature: { code: `DIVISION_TYPE_${DivisionType.MONTESSORI}` }, enabled: true },
    ],
    globalFeatures: [
      { code: "MULTI_DIVISION_ACCESS", isAvailable: false },
      { code: `DIVISION_TYPE_${DivisionType.MONTESSORI}`, isAvailable: false },
    ],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.equal(ent.maxDivisions, 1, "STARTER default; plan feature cannot grant unlimited");
  assert.ok(!ent.allowedDivisionTypes.includes(DivisionType.MONTESSORI));
});

test("globally unavailable features cannot be granted by enabled institution overrides", async () => {
  const tx = makeTx({
    planCode: "STARTER",
    currentDivisions: 0,
    overrides: [
      { feature: { code: "MULTI_DIVISION_ACCESS" }, enabled: true },
      { feature: { code: `DIVISION_TYPE_${DivisionType.MONTESSORI}` }, enabled: true },
    ],
    globalFeatures: [
      { code: "MULTI_DIVISION_ACCESS", isAvailable: false },
      { code: `DIVISION_TYPE_${DivisionType.MONTESSORI}`, isAvailable: false },
    ],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.equal(ent.maxDivisions, 1);
  assert.ok(!ent.allowedDivisionTypes.includes(DivisionType.MONTESSORI));
});

test("missing global feature records preserve tier defaults", async () => {
  // No globalFeatures records at all -> GROWTH default (3, includes MONTESSORI).
  const tx = makeTx({ planCode: "GROWTH", currentDivisions: 0 });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.equal(ent.maxDivisions, 3);
  assert.ok(ent.allowedDivisionTypes.includes(DivisionType.MONTESSORI));
});

test("available global feature preserves override priority (override grants unlimited)", async () => {
  const tx = makeTx({
    planCode: "STARTER",
    currentDivisions: 0,
    overrides: [{ feature: { code: "MULTI_DIVISION_ACCESS" }, enabled: true }],
    globalFeatures: [{ code: "MULTI_DIVISION_ACCESS", isAvailable: true }],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.equal(ent.maxDivisions, null);
});

test("available global feature preserves plan-feature priority", async () => {
  const tx = makeTx({
    planCode: "STARTER",
    currentDivisions: 0,
    planFeatures: [{ feature: { code: "MULTI_DIVISION_ACCESS" }, enabled: true, limitValue: 5 }],
    globalFeatures: [{ code: "MULTI_DIVISION_ACCESS", isAvailable: true }],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.equal(ent.maxDivisions, 5);
});

test("expired override remains ignored (falls through to plan/default)", async () => {
  const tx = makeTx({
    planCode: "STARTER",
    currentDivisions: 0,
    overrides: [
      { feature: { code: "MULTI_DIVISION_ACCESS", isAvailable: true }, enabled: true, expiresAt: new Date(Date.now() - 1000) },
    ],
    globalFeatures: [{ code: "MULTI_DIVISION_ACCESS", isAvailable: true }],
  });
  const ent = await getDivisionSubscriptionEntitlements("inst-1", tx);
  assert.equal(ent.maxDivisions, 1, "STARTER default; expired override ignored");
});

test("subscription required error remains correct", async () => {
  const tx = makeTx({ hasSubscription: false });
  await assert.rejects(
    () => assertDivisionCreationCapacity(tx, "inst-1"),
    (e: any) => e instanceof DivisionSubscriptionError && e.code === "SUBSCRIPTION_REQUIRED",
  );
});

test("division quota error remains correct", async () => {
  const tx = makeTx({ planCode: "STARTER", currentDivisions: 1 });
  await assert.rejects(
    () => assertDivisionCreationCapacity(tx, "inst-1"),
    (e: any) => e instanceof DivisionSubscriptionError && e.code === "DIVISION_LIMIT_REACHED",
  );
});

test("assertDivisionTypeEntitled rejects globally unavailable type", async () => {
  const tx = makeTx({
    planCode: "STARTER",
    globalFeatures: [{ code: `DIVISION_TYPE_${DivisionType.MONTESSORI}`, isAvailable: false }],
  });
  await assert.rejects(
    () => assertDivisionTypeEntitled(tx, "inst-1", DivisionType.MONTESSORI),
    (e: any) => e instanceof DivisionSubscriptionError && e.code === "DIVISION_TYPE_NOT_ENTITLED",
  );
});

test("assertDivisionCreationCapacity passes for an entitled available type", async () => {
  const tx = makeTx({ planCode: "GROWTH", currentDivisions: 0 });
  const ent = await assertDivisionCreationCapacity(tx, "inst-1", DivisionType.COLLEGE);
  assert.equal(ent.hasActiveSubscription, true);
  assert.ok(ent.allowedDivisionTypes.includes(DivisionType.COLLEGE));
});