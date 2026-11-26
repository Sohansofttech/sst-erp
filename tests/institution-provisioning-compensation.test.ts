import assert from "node:assert/strict";
import { test } from "node:test";
import Module from "node:module";
import db from "../lib/db";

// The provisioning service transitively imports `server-only` (via
// @/lib/super-admin/prisma). That package throws outside a React server
// context, so no-op it for this node:test run before importing the service.
const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, parent, isMain);
};

const { compensateFailedProvisioning } = require("../lib/services/institution-provisioning.service") as typeof import("../lib/services/institution-provisioning.service");

const INST = "44444444-4444-4444-8444-444444444444";

function mockDb(impl: { executeRaw?: any; delete?: any }) {
  const original = {
    $executeRaw: (db as any).$executeRaw,
    platformInstitution: (db as any).platformInstitution,
  };
  (db as any).$executeRaw = impl.executeRaw ?? (async () => 1);
  (db as any).platformInstitution = {
    ...(original.platformInstitution ?? {}),
    delete: impl.delete ?? (async () => ({})),
  };
  return () => {
    (db as any).$executeRaw = original.$executeRaw;
    (db as any).platformInstitution = original.platformInstitution;
  };
}

test("compensation removes app-db row and platform institution (scoped id)", async () => {
  let deletedAppId: any = null;
  let deletedPlatformId: any = null;
  const restore = mockDb({
    executeRaw: async (strings: TemplateStringsArray, ...vals: any[]) => {
      // Tagged template: the institution id is the interpolated value.
      deletedAppId = vals[0];
      assert.ok(strings.join("").includes("DELETE FROM institutions"));
      return 1;
    },
    delete: async ({ where }: any) => {
      deletedPlatformId = where.id;
      return {};
    },
  });
  try {
    const res = await compensateFailedProvisioning(INST);
    assert.equal(res.appRowRemoved, true);
    assert.equal(res.platformRemoved, true);
    assert.equal(res.errors.length, 0);
    assert.equal(deletedAppId, INST);
    assert.equal(deletedPlatformId, INST);
  } finally {
    restore();
  }
});

test("app-db cleanup failure is reported and does not block platform cleanup", async () => {
  let platformDeleted = false;
  const restore = mockDb({
    executeRaw: async () => {
      throw new Error("app db down");
    },
    delete: async () => {
      platformDeleted = true;
      return {};
    },
  });
  try {
    const res = await compensateFailedProvisioning(INST);
    assert.equal(res.appRowRemoved, false);
    assert.equal(res.platformRemoved, true);
    assert.equal(platformDeleted, true);
    assert.ok(res.errors.some((e) => e.includes("app-db")));
  } finally {
    restore();
  }
});

test("platform cleanup failure is surfaced (incomplete cleanup)", async () => {
  const restore = mockDb({
    executeRaw: async () => 1,
    delete: async () => {
      throw new Error("platform delete failed");
    },
  });
  try {
    const res = await compensateFailedProvisioning(INST);
    assert.equal(res.appRowRemoved, true);
    assert.equal(res.platformRemoved, false);
    assert.ok(res.errors.some((e) => e.includes("platform")));
  } finally {
    restore();
  }
});

test("compensation never throws even if both steps fail", async () => {
  const restore = mockDb({
    executeRaw: async () => {
      throw new Error("app down");
    },
    delete: async () => {
      throw new Error("platform down");
    },
  });
  try {
    const res = await compensateFailedProvisioning(INST);
    assert.equal(res.appRowRemoved, false);
    assert.equal(res.platformRemoved, false);
    assert.equal(res.errors.length, 2);
  } finally {
    restore();
  }
});