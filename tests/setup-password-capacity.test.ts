import assert from "node:assert/strict";
import { test } from "node:test";
import Module from "node:module";
import crypto from "crypto";

// Stub server-only so server modules import under node:test.
const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, parent, isMain);
};

const INST = "77777777-7777-4777-8777-777777777777";

function makeDb(overrides: any) {
  const state = { updated: false, txUserUpdate: false };
  const tx: any = {
    user: {
      findUnique: async () => ({ id: "user-1", status: "INACTIVE", isActive: false, institutionId: INST }),
      update: async () => {
        state.txUserUpdate = true;
        return {};
      },
      count: async () => 5,
    },
    institutionSubscription: { findFirst: async () => ({ plan: { maxUsers: 5 } }) },
    $queryRaw: async () => [{ id: INST }],
    institutionStorageUsage: {},
  };
  const db: any = {
    user: {
      findUnique: async () => ({
        id: "user-1",
        email: "a@inst.edu",
        fullName: "A",
        name: "A",
        role: "PARENT",
        institutionId: INST,
        passwordHash: "oldhash",
        status: "INACTIVE",
        isActive: false,
        institution: { id: INST, name: "Inst", slug: "inst", code: "C", status: "ACTIVE", isActive: true },
      }),
      update: async () => {
        state.updated = true;
        return {};
      },
    },
    $transaction: async (fn: any) => fn(tx),
    $queryRaw: async () => [{ slug: "inst", name: "Inst" }],
    $executeRaw: async () => 0,
    $executeRawUnsafe: async () => 0,
    platformSetting: { findUnique: async () => null },
  };
  return { db, state, tx };
}

function installModuleMock(name: string, exportsObj: any) {
  const resolved = require.resolve(name);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj } as any;
}

function loadRoute() {
  const resolved = require.resolve("../app/api/auth/setup-password/route.ts");
  delete require.cache[resolved];
  return require(resolved);
}

test("setup-password rejects activation at capacity with 409 and does not update user", async () => {
  const { db, state } = makeDb({});
  installModuleMock("@/lib/db", { __esModule: true, default: db, db });
  installModuleMock("@/lib/auth/jwt", {
    verifyPasswordSetupToken: async () => ({ userId: "user-1", sig: "sig" }),
    computePasswordSignature: () => "sig",
    signToken: async () => "token",
    AUTH_COOKIE_NAME: "sst_session",
  });
  installModuleMock("@/lib/auth/password-security", {
    validatePasswordStrength: () => ({ valid: true, errors: [] }),
    checkPwnedPassword: async () => ({ compromised: false }),
    hashPassword: async () => "newhash",
  });
  installModuleMock("@/lib/services/institution-lifecycle", { isInstitutionOperational: async () => true });
  installModuleMock("@/lib/security/rbac", { getRoleLandingRoute: () => "/parent/dashboard", isAdminPortalRole: () => false });
  installModuleMock("@/lib/security/rbac-server", { resolveUserPermissionsFromDb: async () => ({ assignedRoles: [], permissions: [] }) });

  const route = loadRoute();
  const req = { json: async () => ({ token: "t", newPassword: "StrongPassw0rd!", confirmPassword: "StrongPassw0rd!" }) } as any;
  const res = await route.POST(req);
  assert.equal(res.status, 409);
  assert.equal(state.updated, false, "user must not be updated when capacity is exhausted");
  assert.equal(state.txUserUpdate, false, "transaction user update must not run on capacity failure");
});

test("setup-password activates when below capacity", async () => {
  const { db, state } = makeDb({});
  // Below capacity: count returns 1 with maxUsers 5.
  (db.$transaction as any) = async (fn: any) => {
    const tx = {
      user: {
        findUnique: async () => ({ id: "user-1", status: "INACTIVE", isActive: false, institutionId: INST }),
        update: async () => {
          state.txUserUpdate = true;
          return {};
        },
        count: async () => 1,
      },
      institutionSubscription: { findFirst: async () => ({ plan: { maxUsers: 5 } }) },
      $queryRaw: async () => [{ id: INST }],
    };
    return fn(tx);
  };
  installModuleMock("@/lib/db", { __esModule: true, default: db, db });
  installModuleMock("@/lib/auth/jwt", {
    verifyPasswordSetupToken: async () => ({ userId: "user-1", sig: "sig" }),
    computePasswordSignature: () => "sig",
    signToken: async () => "token",
    AUTH_COOKIE_NAME: "sst_session",
  });
  installModuleMock("@/lib/auth/password-security", {
    validatePasswordStrength: () => ({ valid: true, errors: [] }),
    checkPwnedPassword: async () => ({ compromised: false }),
    hashPassword: async () => "newhash",
  });
  installModuleMock("@/lib/services/institution-lifecycle", { isInstitutionOperational: async () => true });
  installModuleMock("@/lib/security/rbac", { getRoleLandingRoute: () => "/parent/dashboard", isAdminPortalRole: () => false });
  installModuleMock("@/lib/security/rbac-server", { resolveUserPermissionsFromDb: async () => ({ assignedRoles: [], permissions: [] }) });

  const route = loadRoute();
  const req = { json: async () => ({ token: "t", newPassword: "StrongPassw0rd!", confirmPassword: "StrongPassw0rd!" }) } as any;
  const res = await route.POST(req);
  assert.equal(res.status, 200);
  assert.equal(state.txUserUpdate, true, "user must be activated inside the transaction");
});