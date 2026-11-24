import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import assert from "assert";
import { NextRequest } from "next/server";
import db from "../lib/db";

// Route Handlers & Services
import * as AYRoute from "../app/api/admin/academics/academic-years/route";
import { getAcademicYears, getDashboardMetrics } from "../lib/services/institution-admin.service";

let passedCount = 0;
let failedCount = 0;

async function it(desc: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${desc}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✘ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

function makeReq(url: string, method: string = "GET", body?: any, instId: string = "inst_apex") {
  const init: any = {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-institution-id": instId,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

async function runMultiTenantAcademicYearTests() {
  console.log("\n========================================================");
  console.log(" MULTI-TENANT ACADEMIC YEAR ARCHITECTURE TEST SUITE");
  console.log(" Verifying Multi-Tenant Scoping, Isolation & Contracts");
  console.log("========================================================\n");

  const TENANT_APEX = "inst_apex";
  const TENANT_DEMO = "inst_demo_school";
  const TENANT_AAROHAN = "0772a46b-05dd-4ee7-beaa-f39e423bbf23";
  const TENANT_NON_EXISTENT = "inst_empty_placeholder_tenant_99999";

  // ==========================================================================
  // SECTION 1: DATABASE MULTI-TENANT QUERY SCOPING (READ-ONLY)
  // ==========================================================================
  console.log("[SECTION 1] Database Multi-Tenant Query Scoping");

  await it("Tenant inst_apex returns its own academic years from database", async () => {
    const years = await getAcademicYears(TENANT_APEX);
    assert.ok(Array.isArray(years), "Expected an array of academic years");
    assert.strictEqual(years.length, 2, `Expected 2 academic years for inst_apex, got ${years.length}`);
    const names = years.map((y) => y.name).sort();
    assert.deepStrictEqual(names, ["2024-2025", "2025-2026"]);
    const active = years.find((y) => y.isCurrent);
    assert.ok(active, "Expected an active academic year for inst_apex");
    assert.strictEqual(active?.name, "2025-2026");
  });

  await it("Tenant inst_demo_school returns its own academic years from database", async () => {
    const years = await getAcademicYears(TENANT_DEMO);
    assert.ok(Array.isArray(years), "Expected an array of academic years");
    assert.strictEqual(years.length, 2, `Expected 2 academic years for inst_demo_school, got ${years.length}`);
    const names = years.map((y) => y.name).sort();
    assert.deepStrictEqual(names, ["2025-26", "2026-27"]);
    const active = years.find((y) => y.isCurrent);
    assert.ok(active, "Expected an active academic year for inst_demo_school");
    assert.strictEqual(active?.name, "2026-27");
  });

  await it("Tenant Aarohan (0772a46b-05dd-4ee7-beaa-f39e423bbf23) returns its authentic created record", async () => {
    const years = await getAcademicYears(TENANT_AAROHAN);
    assert.ok(Array.isArray(years), "Expected an array of academic years");
    assert.strictEqual(years.length, 1, `Expected 1 academic year for Aarohan, got ${years.length}`);
    assert.strictEqual(years[0].name, "2026-2027");
  });

  await it("Non-existent tenant returns empty array without errors", async () => {
    const years = await getAcademicYears(TENANT_NON_EXISTENT);
    assert.ok(Array.isArray(years), "Expected an array of academic years");
    assert.strictEqual(years.length, 0, `Expected 0 academic years for non-existent tenant, got ${years.length}`);
  });

  // ==========================================================================
  // SECTION 2: API ROUTE MULTI-TENANT ISOLATION
  // ==========================================================================
  console.log("\n[SECTION 2] API Route Isolation (/api/admin/academics/academic-years)");

  await it("GET API returns 200 with scoped records for inst_apex", async () => {
    const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "GET", undefined, TENANT_APEX);
    const res = await AYRoute.GET(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.length, 2);
    // Ensure all returned records belong strictly to inst_apex
    for (const item of json.data) {
      assert.strictEqual(item.institutionId, TENANT_APEX);
    }
  });

  await it("GET API returns 200 with scoped records for inst_demo_school", async () => {
    const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "GET", undefined, TENANT_DEMO);
    const res = await AYRoute.GET(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.length, 2);
    for (const item of json.data) {
      assert.strictEqual(item.institutionId, TENANT_DEMO);
    }
  });

  await it("GET API returns 200 with scoped record for Aarohan (no cross-tenant leakage)", async () => {
    const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "GET", undefined, TENANT_AAROHAN);
    const res = await AYRoute.GET(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.strictEqual(json.data.length, 1, "Aarohan must return exactly 1 record");
    assert.strictEqual(json.data[0].name, "2026-2027");
  });

  await it("GET API returns 200 with empty array for non-existent tenant", async () => {
    const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "GET", undefined, TENANT_NON_EXISTENT);
    const res = await AYRoute.GET(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.strictEqual(json.data.length, 0, "Non-existent tenant must return exactly []");
  });

  // ==========================================================================
  // SECTION 3: DASHBOARD SERVICE MULTI-TENANT SCOPING
  // ==========================================================================
  console.log("\n[SECTION 3] Dashboard Service Active Academic Year Multi-Tenancy");

  await it("getDashboardMetrics for inst_apex resolves activeAcademicYear as 2025-2026", async () => {
    const overview = await getDashboardMetrics(TENANT_APEX);
    assert.strictEqual(overview.connected, true);
    assert.ok(overview.activeAcademicYear, "Expected activeAcademicYear to be present");
    assert.strictEqual(overview.activeAcademicYear.name, "2025-2026");
  });

  await it("getDashboardMetrics for inst_demo_school resolves activeAcademicYear as 2026-27", async () => {
    const overview = await getDashboardMetrics(TENANT_DEMO);
    assert.strictEqual(overview.connected, true);
    assert.ok(overview.activeAcademicYear, "Expected activeAcademicYear to be present");
    assert.strictEqual(overview.activeAcademicYear.name, "2026-27");
  });

  await it("getDashboardMetrics for Aarohan returns 2026-2027 active academic year", async () => {
    const overview = await getDashboardMetrics(TENANT_AAROHAN);
    assert.strictEqual(overview.connected, true);
    assert.ok(overview.activeAcademicYear, "Expected activeAcademicYear to be present for Aarohan");
    assert.strictEqual(overview.activeAcademicYear.name, "2026-2027");
  });

  await it("getDashboardMetrics for non-existent tenant returns null activeAcademicYear", async () => {
    const overview = await getDashboardMetrics(TENANT_NON_EXISTENT);
    assert.strictEqual(overview.connected, true);
    assert.strictEqual(overview.activeAcademicYear, null, "Active academic year must be null for non-existent tenant");
  });

  // ==========================================================================
  // SECTION 4: CLIENT PRESENTATION CONTRACTS (HEADER, SIDEBAR, DASHBOARD)
  // ==========================================================================
  console.log("\n[SECTION 4] Client Presentation Contracts Verification");

  // Contract functions replicating the exact logic in AdminHeader, AdminSidebar, Admin Dashboard
  const resolveHeaderLabel = (activeAY: { name: string } | undefined, isLoading: boolean) => {
    return isLoading ? "Loading..." : (activeAY?.name || "Not Set");
  };

  const resolveSidebarFooter = (activeAY: { name: string } | undefined, isLoading: boolean) => {
    return isLoading ? "Loading..." : (activeAY ? `AY ${activeAY.name}` : "No Academic Year Set");
  };

  const resolveDashboardSession = (activeAY: { name: string } | undefined, dashboardAY: { name: string } | null, isLoading: boolean) => {
    return isLoading ? "Loading..." : (dashboardAY?.name || activeAY?.name || "Not Set");
  };

  await it("Presentation contract for empty tenant (Aarohan) displays genuine empty states", () => {
    const activeAY = undefined;
    const dashboardAY = null;
    const isLoading = false;

    assert.strictEqual(resolveHeaderLabel(activeAY, isLoading), "Not Set");
    assert.strictEqual(resolveSidebarFooter(activeAY, isLoading), "No Academic Year Set");
    assert.strictEqual(resolveDashboardSession(activeAY, dashboardAY, isLoading), "Not Set");
  });

  await it("Presentation contract while loading displays Loading...", () => {
    const activeAY = undefined;
    const dashboardAY = null;
    const isLoading = true;

    assert.strictEqual(resolveHeaderLabel(activeAY, isLoading), "Loading...");
    assert.strictEqual(resolveSidebarFooter(activeAY, isLoading), "Loading...");
    assert.strictEqual(resolveDashboardSession(activeAY, dashboardAY, isLoading), "Loading...");
  });

  await it("Presentation contract for populated tenant (inst_apex) displays 2025-2026", () => {
    const activeAY = { name: "2025-2026" };
    const dashboardAY = { name: "2025-2026" };
    const isLoading = false;

    assert.strictEqual(resolveHeaderLabel(activeAY, isLoading), "2025-2026");
    assert.strictEqual(resolveSidebarFooter(activeAY, isLoading), "AY 2025-2026");
    assert.strictEqual(resolveDashboardSession(activeAY, dashboardAY, isLoading), "2025-2026");
  });

  // ==========================================================================
  // SECTION 5: TENANT-SCOPED STORAGE CACHE KEY VERIFICATION
  // ==========================================================================
  console.log("\n[SECTION 5] Tenant-Scoped Storage Key Contracts");

  const getTenantAYCacheKey = (prefix: string, tenantId: string) => {
    return `${prefix}ay_${tenantId}`;
  };

  await it("Generates distinct storage keys per tenant preventing cross-tenant pollution", () => {
    const prefix = "sst_erp_inst_admin_";
    const keyApex = getTenantAYCacheKey(prefix, TENANT_APEX);
    const keyDemo = getTenantAYCacheKey(prefix, TENANT_DEMO);
    const keyAarohan = getTenantAYCacheKey(prefix, TENANT_AAROHAN);

    assert.strictEqual(keyApex, "sst_erp_inst_admin_ay_inst_apex");
    assert.strictEqual(keyDemo, "sst_erp_inst_admin_ay_inst_demo_school");
    assert.strictEqual(keyAarohan, "sst_erp_inst_admin_ay_0772a46b-05dd-4ee7-beaa-f39e423bbf23");

    assert.notStrictEqual(keyApex, keyDemo);
    assert.notStrictEqual(keyApex, keyAarohan);
    assert.notStrictEqual(keyDemo, keyAarohan);
  });

  // ==========================================================================
  // SECTION 6: ACADEMIC YEAR CREATION & ENUM FIX VERIFICATION (ROLLBACK SAFE)
  // ==========================================================================
  console.log("\n[SECTION 6] Academic Year Creation & Status Storage Verification");

  await it("Prisma tx.academicYear.create creates record with text status without PostgreSQL 42704 error", async () => {
    let createdRecord: any = null;
    try {
      await db.$transaction(async (tx) => {
        createdRecord = await tx.academicYear.create({
          data: {
            institutionId: TENANT_AAROHAN,
            name: "2026-2027 QA VALIDATION",
            startDate: new Date("2026-06-01"),
            endDate: new Date("2027-05-31"),
            isCurrent: true,
          },
        });
        // Intentionally throw rollback to preserve pristine database state without test data pollution
        throw new Error("ROLLBACK_SAFETY_CHECK");
      });
    } catch (err: any) {
      if (err.message !== "ROLLBACK_SAFETY_CHECK") {
        throw err;
      }
    }

    assert.ok(createdRecord, "Record should have been returned from tx.academicYear.create");
    assert.strictEqual(createdRecord.institutionId, TENANT_AAROHAN);
    assert.strictEqual(createdRecord.name, "2026-2027 QA VALIDATION");
    assert.strictEqual(createdRecord.status, "ACTIVE", "Status must default to ACTIVE string");
    assert.strictEqual(createdRecord.isCurrent, true);
    assert.ok(createdRecord.id, "Generated UUID ID must be present");
  });

  await it("Verifies database status column stores string status correctly without enum restriction", async () => {
    let customStatusRecord: any = null;
    try {
      await db.$transaction(async (tx) => {
        customStatusRecord = await tx.academicYear.create({
          data: {
            institutionId: TENANT_AAROHAN,
            name: "2027-2028 UPCOMING VALIDATION",
            startDate: new Date("2027-06-01"),
            endDate: new Date("2028-05-31"),
            isCurrent: false,
            status: "UPCOMING",
          },
        });
        throw new Error("ROLLBACK_SAFETY_CHECK");
      });
    } catch (err: any) {
      if (err.message !== "ROLLBACK_SAFETY_CHECK") {
        throw err;
      }
    }

    assert.ok(customStatusRecord, "Record should have been returned");
    assert.strictEqual(customStatusRecord.status, "UPCOMING", "Custom string status UPCOMING should be stored");
  });

  await it("Verifies database remains completely clean after rollback verification", async () => {
    const years = await getAcademicYears(TENANT_AAROHAN);
    assert.strictEqual(years.length, 1, "Aarohan must preserve its 1 authentic record (no test data pollution)");
    assert.strictEqual(years[0].name, "2026-2027");
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log("\n========================================================");
  console.log(` RESULTS: ${passedCount} passed, ${failedCount} failed`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runMultiTenantAcademicYearTests()
  .catch((err) => {
    console.error("Test execution threw unhandled error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
