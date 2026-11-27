import assert from "node:assert/strict";
import { test } from "node:test";
import db from "../lib/db";
import {
  getInstitutionFeatureAccess,
  requireInstitutionFeatureAccess,
  FeatureAccessError,
} from "../lib/super-admin/feature-access-core";

function mockPrisma(overrides: Record<string, any>) {
  const original: Record<string, any> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = (db as any)[key];
    (db as any)[key] = overrides[key];
  }
  return () => {
    for (const key of Object.keys(overrides)) {
      (db as any)[key] = original[key];
    }
  };
}

function activeSub(planFeatures: any[], extra: Record<string, any> = {}) {
  return {
    status: "ACTIVE",
    startsAt: new Date(Date.now() - 1000),
    endsAt: null,
    plan: { isActive: true, features: planFeatures },
    ...extra,
  };
}

function withMocks(opts: {
  feature?: any;
  subscription?: any;
  override?: any;
  subscriptionThrows?: boolean;
}) {
  return mockPrisma({
    platformFeature: {
      findUnique: async () =>
        opts.feature === undefined ? { id: "f1", isAvailable: true } : opts.feature,
    },
    institutionSubscription: {
      findFirst: async () => {
        if (opts.subscriptionThrows) throw new Error("db down");
        return opts.subscription === undefined ? activeSub([{ enabled: true, limitValue: 5 }]) : opts.subscription;
      },
    },
    institutionFeatureOverride: {
      findUnique: async () => (opts.override === undefined ? null : opts.override),
    },
  });
}

test("enabled plan feature grants access", async () => {
  const restore = withMocks({});
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, true);
    assert.equal(r.reason, "PLAN_ENTITLEMENT");
    assert.equal(r.limit, 5);
  } finally {
    restore();
  }
});

test("disabled plan feature is denied", async () => {
  const restore = withMocks({ subscription: activeSub([{ enabled: false, limitValue: null }]) });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "NOT_INCLUDED_IN_PLAN");
  } finally {
    restore();
  }
});

test("missing feature catalogue record is denied", async () => {
  const restore = withMocks({ feature: null });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "FEATURE_UNAVAILABLE");
  } finally {
    restore();
  }
});

test("globally unavailable feature is denied even with plan + override", async () => {
  const restore = withMocks({
    feature: { id: "f1", isAvailable: false },
    override: { enabled: true, expiresAt: null },
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "FEATURE_UNAVAILABLE");
  } finally {
    restore();
  }
});

test("no subscription is denied", async () => {
  const restore = withMocks({ subscription: null });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "NO_ACTIVE_SUBSCRIPTION");
  } finally {
    restore();
  }
});

test("inactive plan is denied", async () => {
  const restore = withMocks({ subscription: activeSub([{ enabled: true, limitValue: 5 }], { plan: { isActive: false, features: [{ enabled: true, limitValue: 5 }] } }) });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "NO_ACTIVE_SUBSCRIPTION");
  } finally {
    restore();
  }
});

test("ACTIVE subscription grants access", async () => {
  const restore = withMocks({ subscription: activeSub([{ enabled: true, limitValue: 1 }], { status: "ACTIVE" }) });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, true);
  } finally {
    restore();
  }
});

test("TRIALING subscription grants access", async () => {
  const restore = withMocks({ subscription: activeSub([{ enabled: true, limitValue: null }], { status: "TRIALING" }) });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, true);
  } finally {
    restore();
  }
});

test("future subscription start is denied", async () => {
  const restore = withMocks({
    subscription: activeSub([{ enabled: true, limitValue: 5 }], { startsAt: new Date(Date.now() + 100000) }),
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "NO_ACTIVE_SUBSCRIPTION");
  } finally {
    restore();
  }
});

test("expired subscription is denied", async () => {
  const restore = withMocks({
    subscription: activeSub([{ enabled: true, limitValue: 5 }], { endsAt: new Date(Date.now() - 1000) }),
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "NO_ACTIVE_SUBSCRIPTION");
  } finally {
    restore();
  }
});

test("PAST_DUE subscription is denied", async () => {
  const restore = withMocks({ subscription: activeSub([{ enabled: true, limitValue: 5 }], { status: "PAST_DUE" }) });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "NO_ACTIVE_SUBSCRIPTION");
  } finally {
    restore();
  }
});

test("enabled institution override grants access", async () => {
  const restore = withMocks({
    subscription: activeSub([{ enabled: false, limitValue: null }]),
    override: { enabled: true, expiresAt: null },
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, true);
    assert.equal(r.reason, "INSTITUTION_OVERRIDE");
  } finally {
    restore();
  }
});

test("disabled institution override denies access", async () => {
  const restore = withMocks({
    subscription: activeSub([{ enabled: true, limitValue: 5 }]),
    override: { enabled: false, expiresAt: null },
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "INSTITUTION_DISABLED");
  } finally {
    restore();
  }
});

test("expired enabled override falls through to plan entitlement", async () => {
  const restore = withMocks({
    subscription: activeSub([{ enabled: true, limitValue: 7 }]),
    override: { enabled: false, expiresAt: new Date(Date.now() - 1000) },
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, true);
    assert.equal(r.reason, "PLAN_ENTITLEMENT");
  } finally {
    restore();
  }
});

test("expired disabled override falls through to plan entitlement", async () => {
  const restore = withMocks({
    subscription: activeSub([{ enabled: true, limitValue: 7 }]),
    override: { enabled: false, expiresAt: new Date(Date.now() - 1000) },
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, true);
    assert.equal(r.reason, "PLAN_ENTITLEMENT");
  } finally {
    restore();
  }
});

test("global unavailability overrides an enabled institution override", async () => {
  const restore = withMocks({
    feature: { id: "f1", isAvailable: false },
    override: { enabled: true, expiresAt: null },
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-1", "FEAT");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "FEATURE_UNAVAILABLE");
  } finally {
    restore();
  }
});

test("invalid input throws FeatureAccessError", async () => {
  await assert.rejects(
    () => requireInstitutionFeatureAccess("", "FEAT"),
    (e: unknown) => e instanceof FeatureAccessError && e.reason === "INVALID_INPUT",
  );
  await assert.rejects(
    () => requireInstitutionFeatureAccess("inst-1", ""),
    (e: unknown) => e instanceof FeatureAccessError && e.reason === "INVALID_INPUT",
  );
});

test("database errors propagate", async () => {
  const restore = withMocks({ subscriptionThrows: true });
  try {
    await assert.rejects(() => getInstitutionFeatureAccess("inst-1", "FEAT"));
  } finally {
    restore();
  }
});

test("tenant isolation: resolution is scoped to the requested institution", async () => {
  let capturedInstitutionId: string | undefined;
  const restore = mockPrisma({
    platformFeature: { findUnique: async () => ({ id: "f1", isAvailable: true }) },
    institutionSubscription: {
      findFirst: async (args: any) => {
        capturedInstitutionId = args?.where?.institutionId;
        return activeSub([{ enabled: true, limitValue: 5 }]);
      },
    },
    institutionFeatureOverride: { findUnique: async (args: any) => {
      // Only an override for the requested institution applies.
      const iid = args?.where?.institutionId_featureId?.institutionId;
      return iid === "inst-A" ? { enabled: false, expiresAt: null } : null;
    } },
  });
  try {
    const r = await getInstitutionFeatureAccess("inst-A", "FEAT");
    assert.equal(capturedInstitutionId, "inst-A");
    assert.equal(r.allowed, false);
    assert.equal(r.reason, "INSTITUTION_DISABLED");
  } finally {
    restore();
  }
});

test("require throws when not allowed", async () => {
  const restore = withMocks({ subscription: null });
  try {
    await assert.rejects(
      () => requireInstitutionFeatureAccess("inst-1", "FEAT"),
      (e: unknown) => e instanceof FeatureAccessError && e.reason === "NO_ACTIVE_SUBSCRIPTION",
    );
  } finally {
    restore();
  }
});