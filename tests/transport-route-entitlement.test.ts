import assert from "node:assert/strict";
import { test } from "node:test";
import Module from "node:module";

const INST = "88888888-8888-4888-8888-888888888888";

const MOCKED_MODULES = [
  "@/lib/db",
  "@/lib/security/admin-auth",
  "@/lib/security/rbac",
  "@/lib/security/support-access",
  "@/lib/super-admin/feature-access",
  "@/lib/services/institution-admin.service",
];

const ROUTE_MODULE = "../app/api/admin/transport/route.ts";

function installModuleMock(name: string, exportsObj: any) {
  const resolved = require.resolve(name);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj } as any;
}

// Runs a test body with fully isolated mocks: the original Module._load and all
// touched require.cache entries are saved and restored in a finally block.
async function withIsolatedMocks(featureAllowed: boolean, body: (loadRoute: () => any) => Promise<void>) {
  const originalLoad = (Module as any)._load;
  const savedCache: Record<string, any> = {};
  const touched = [...MOCKED_MODULES.map((m) => require.resolve(m)), require.resolve(ROUTE_MODULE)];
  for (const key of touched) {
    savedCache[key] = require.cache[key];
    delete require.cache[key];
  }

  (Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    installModuleMock("@/lib/db", { __esModule: true, default: {}, db: {} });
    installModuleMock("@/lib/security/admin-auth", {
      resolveAdminContext: async () => ({ institutionId: INST }),
      requireActiveSubscription: async () => ({ institutionId: INST, userId: "u1" }),
      handleAdminApiError: (e: any) => {
        const status = e?.statusCode || 500;
        return { status, json: async () => ({ success: false, error: e?.message }) };
      },
    });
    installModuleMock("@/lib/security/rbac", {
      PERMISSIONS: { TRANSPORT_READ: "TRANSPORT_READ", TRANSPORT_WRITE: "TRANSPORT_WRITE" },
    });
    installModuleMock("@/lib/security/support-access", {
      requireReadReq: async () => {},
      requireWriteReq: async () => {},
    });
    installModuleMock("@/lib/super-admin/feature-access", {
      requireInstitutionFeatureAccess: async () => {
        if (!featureAllowed) {
          const err: any = new Error("Feature access denied: FEATURE_UNAVAILABLE");
          err.statusCode = 403;
          throw err;
        }
        return { allowed: true, limit: null, reason: "PLAN_ENTITLEMENT" };
      },
    });
    installModuleMock("@/lib/services/institution-admin.service", {
      getTransportAllocations: async () => [],
      getTransportCatalog: async () => [],
      getTransportMaintenance: async () => [],
      createTransportAllocation: async () => ({ id: "a1" }),
      deleteTransportAllocation: async () => ({ id: "a1" }),
      saveTransportCatalogItem: async () => ({ routeNumber: "R1" }),
      createTransportMaintenanceRecord: async () => ({ id: "m1" }),
    });

    const loadRoute = () => require(ROUTE_MODULE);
    await body(loadRoute);
  } finally {
    (Module as any)._load = originalLoad;
    for (const key of touched) {
      if (savedCache[key]) require.cache[key] = savedCache[key];
      else delete require.cache[key];
    }
  }
}

function makeReq(method: string, body?: any, query?: string) {
  return {
    method,
    nextUrl: { searchParams: new URLSearchParams(query || "") },
    json: async () => body || {},
  } as any;
}

test("GET denies without TRANSPORT entitlement", async () => {
  await withIsolatedMocks(false, async (loadRoute) => {
    const res = await loadRoute().GET(makeReq("GET"));
    assert.equal(res.status, 403);
  });
});

test("GET allows with TRANSPORT entitlement", async () => {
  await withIsolatedMocks(true, async (loadRoute) => {
    const res = await loadRoute().GET(makeReq("GET"));
    assert.equal(res.status, 200);
  });
});

test("POST denies without TRANSPORT entitlement", async () => {
  await withIsolatedMocks(false, async (loadRoute) => {
    const res = await loadRoute().POST(makeReq("POST", { type: "MAINTENANCE", vehicleNumber: "V1", summary: "s" }));
    assert.equal(res.status, 403);
  });
});

test("POST allows with TRANSPORT entitlement", async () => {
  await withIsolatedMocks(true, async (loadRoute) => {
    const res = await loadRoute().POST(makeReq("POST", { type: "MAINTENANCE", vehicleNumber: "V1", summary: "s" }));
    assert.equal(res.status, 200);
  });
});

test("DELETE denies without TRANSPORT entitlement", async () => {
  await withIsolatedMocks(false, async (loadRoute) => {
    const res = await loadRoute().DELETE(makeReq("DELETE", undefined, "id=a1"));
    assert.equal(res.status, 403);
  });
});

test("DELETE allows with TRANSPORT entitlement", async () => {
  await withIsolatedMocks(true, async (loadRoute) => {
    const res = await loadRoute().DELETE(makeReq("DELETE", undefined, "id=a1"));
    assert.equal(res.status, 200);
  });
});