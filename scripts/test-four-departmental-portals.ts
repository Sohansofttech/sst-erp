import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  getRoleLandingRoute,
  hasPermission,
  isDepartmentalRole,
  isFullAdminRole,
} from "../lib/security/rbac";
import { isAdminPageAuthorized } from "../lib/security/admin-page-guard";
import {
  applyFeeConcession,
  processFeeRefund,
  createHostelAllocation,
  transferHostelAllocation,
  createTransportAllocation,
  recordFeePayment,
  saveFeeStructure,
  saveHostelCatalogRoom,
  saveTransportCatalogItem,
} from "../lib/services/institution-admin.service";

async function runTests() {
  console.log("Running Four Departmental Portals & Centralized Admin Control Tests...\n");

  // 1. RBAC Isolation Matrix & Cross-Department Denial
  const admPerms = DEFAULT_ROLE_PERMISSIONS.ADMISSIONS_OFFICER;
  assert.strictEqual(hasPermission(admPerms, PERMISSIONS.ADMISSIONS_READ, "ADMISSIONS_OFFICER"), true);
  assert.strictEqual(hasPermission(admPerms, PERMISSIONS.ADMISSIONS_WRITE, "ADMISSIONS_OFFICER"), true);
  assert.strictEqual(hasPermission(admPerms, PERMISSIONS.ADMISSIONS_APPROVE, "ADMISSIONS_OFFICER"), true);
  assert.strictEqual(hasPermission(admPerms, PERMISSIONS.STUDENTS_READ, "ADMISSIONS_OFFICER"), true);
  assert.strictEqual(hasPermission(admPerms, PERMISSIONS.FEES_READ, "ADMISSIONS_OFFICER"), false);
  assert.strictEqual(hasPermission(admPerms, PERMISSIONS.HOSTEL_READ, "ADMISSIONS_OFFICER"), false);
  assert.strictEqual(hasPermission(admPerms, PERMISSIONS.TRANSPORT_READ, "ADMISSIONS_OFFICER"), false);

  const accPerms = DEFAULT_ROLE_PERMISSIONS.ACCOUNTANT;
  assert.strictEqual(hasPermission(accPerms, PERMISSIONS.FEES_READ, "ACCOUNTANT"), true);
  assert.strictEqual(hasPermission(accPerms, PERMISSIONS.FEES_WRITE, "ACCOUNTANT"), true);
  assert.strictEqual(hasPermission(accPerms, PERMISSIONS.FEES_CONCESSION, "ACCOUNTANT"), true);
  assert.strictEqual(hasPermission(accPerms, PERMISSIONS.FEES_REFUND, "ACCOUNTANT"), true);
  assert.strictEqual(hasPermission(accPerms, PERMISSIONS.REPORTS_FINANCE, "ACCOUNTANT"), true);
  assert.strictEqual(hasPermission(accPerms, PERMISSIONS.ADMISSIONS_READ, "ACCOUNTANT"), false);
  assert.strictEqual(hasPermission(accPerms, PERMISSIONS.HOSTEL_WRITE, "ACCOUNTANT"), false);

  const hosPerms = DEFAULT_ROLE_PERMISSIONS.HOSTEL_WARDEN;
  assert.strictEqual(hasPermission(hosPerms, PERMISSIONS.HOSTEL_READ, "HOSTEL_WARDEN"), true);
  assert.strictEqual(hasPermission(hosPerms, PERMISSIONS.HOSTEL_WRITE, "HOSTEL_WARDEN"), true);
  assert.strictEqual(hasPermission(hosPerms, PERMISSIONS.STUDENTS_READ, "HOSTEL_WARDEN"), true);
  assert.strictEqual(hasPermission(hosPerms, PERMISSIONS.FEES_WRITE, "HOSTEL_WARDEN"), false);
  assert.strictEqual(hasPermission(hosPerms, PERMISSIONS.TRANSPORT_WRITE, "HOSTEL_WARDEN"), false);

  const trnPerms = DEFAULT_ROLE_PERMISSIONS.TRANSPORT_OFFICER;
  assert.strictEqual(hasPermission(trnPerms, PERMISSIONS.TRANSPORT_READ, "TRANSPORT_OFFICER"), true);
  assert.strictEqual(hasPermission(trnPerms, PERMISSIONS.TRANSPORT_WRITE, "TRANSPORT_OFFICER"), true);
  assert.strictEqual(hasPermission(trnPerms, PERMISSIONS.STUDENTS_READ, "TRANSPORT_OFFICER"), true);
  assert.strictEqual(hasPermission(trnPerms, PERMISSIONS.HOSTEL_WRITE, "TRANSPORT_OFFICER"), false);
  assert.strictEqual(hasPermission(trnPerms, PERMISSIONS.ADMISSIONS_APPROVE, "TRANSPORT_OFFICER"), false);

  const adminPerms = DEFAULT_ROLE_PERMISSIONS.INSTITUTION_ADMIN;
  assert.strictEqual(isFullAdminRole("INSTITUTION_ADMIN"), true);
  assert.strictEqual(isDepartmentalRole("ADMISSIONS_OFFICER"), true);
  assert.strictEqual(hasPermission(adminPerms, PERMISSIONS.ADMISSIONS_APPROVE, "INSTITUTION_ADMIN"), true);
  assert.strictEqual(hasPermission(adminPerms, PERMISSIONS.FEES_REFUND, "INSTITUTION_ADMIN"), true);
  assert.strictEqual(hasPermission(adminPerms, PERMISSIONS.HOSTEL_WRITE, "INSTITUTION_ADMIN"), true);
  assert.strictEqual(hasPermission(adminPerms, PERMISSIONS.TRANSPORT_WRITE, "INSTITUTION_ADMIN"), true);
  console.log("[PASS] 1. RBAC isolation matrix & cross-department denial");

  // 2. Landing Routes & Server-Side Page Protection
  assert.strictEqual(getRoleLandingRoute("ADMISSIONS_OFFICER"), "/admin/admissions");
  assert.strictEqual(getRoleLandingRoute("ACCOUNTANT"), "/admin/fees");
  assert.strictEqual(getRoleLandingRoute("HOSTEL_WARDEN"), "/admin/hostel");
  assert.strictEqual(getRoleLandingRoute("TRANSPORT_OFFICER"), "/admin/transport");
  assert.strictEqual(getRoleLandingRoute("INSTITUTION_ADMIN"), "/admin");

  assert.strictEqual(isAdminPageAuthorized("/admin/admissions", "ADMISSIONS_OFFICER", admPerms), true);
  assert.strictEqual(isAdminPageAuthorized("/admin/fees", "ADMISSIONS_OFFICER", admPerms), false);
  assert.strictEqual(isAdminPageAuthorized("/admin", "ADMISSIONS_OFFICER", admPerms), false);
  assert.strictEqual(isAdminPageAuthorized("/admin/fees", "ACCOUNTANT", accPerms), true);
  assert.strictEqual(isAdminPageAuthorized("/admin/hostel", "ACCOUNTANT", accPerms), false);
  assert.strictEqual(isAdminPageAuthorized("/admin/hostel", "HOSTEL_WARDEN", hosPerms), true);
  assert.strictEqual(isAdminPageAuthorized("/admin/transport", "HOSTEL_WARDEN", hosPerms), false);
  assert.strictEqual(isAdminPageAuthorized("/admin/transport", "TRANSPORT_OFFICER", trnPerms), true);
  assert.strictEqual(isAdminPageAuthorized("/admin/admissions", "TRANSPORT_OFFICER", trnPerms), false);
  assert.strictEqual(isAdminPageAuthorized("/admin", "INSTITUTION_ADMIN", adminPerms), true);
  assert.strictEqual(isAdminPageAuthorized("/admin/roles-permissions", "INSTITUTION_ADMIN", adminPerms), true);
  console.log("[PASS] 2. Landing routes & server-side page authorization");

  // 3. Service validation guards (pure pre-DB validation checks — zero live DB writes)
  await assert.rejects(
    () => saveFeeStructure("inst-1", { name: "", amount: 1000 }),
    /required/i
  );
  await assert.rejects(
    () => saveFeeStructure("inst-1", { name: "Tuition", amount: 0 }),
    /positive amount/i
  );
  await assert.rejects(
    () => recordFeePayment("inst-1", { invoiceId: "inv-1", studentId: "stu-1", amount: 0, paymentMethod: "UPI", transactionRef: "TX-1" }),
    /greater than zero/i
  );
  await assert.rejects(
    () => applyFeeConcession("inst-1", { invoiceId: "inv-1", concessionAmount: -50, reason: "Test" }),
    /greater than zero/i
  );
  await assert.rejects(
    () => applyFeeConcession("inst-1", { invoiceId: "inv-1", concessionAmount: 100, reason: "   " }),
    /Reason is required/i
  );
  await assert.rejects(
    () => processFeeRefund("inst-1", { paymentId: "pay-1", amount: 0, reason: "Overpaid" }),
    /greater than zero/i
  );
  await assert.rejects(
    () => processFeeRefund("inst-1", { paymentId: "pay-1", amount: 500, reason: "" }),
    /reason is required/i
  );
  await assert.rejects(
    () => saveHostelCatalogRoom("inst-1", { hostelName: "Block A", roomNumber: "101", capacity: 0 }),
    /capacity/i
  );
  await assert.rejects(
    () => createHostelAllocation("inst-1", { studentId: "", hostelName: "A", roomNumber: "101", bedNumber: "B1", wardenName: "W", wardenContact: "1" }),
    /required/i
  );
  await assert.rejects(
    () => transferHostelAllocation("inst-1", "alloc-1", { hostelName: "", roomNumber: "102", bedNumber: "B2" }),
    /required for transfer/i
  );
  await assert.rejects(
    () => saveTransportCatalogItem("inst-1", { routeNumber: "", routeName: "R1", vehicleNumber: "KA-01", capacity: 40, driverName: "D", driverContact: "1" }),
    /required/i
  );
  await assert.rejects(
    () => createTransportAllocation("inst-1", { studentId: "", routeNumber: "R-1", routeName: "Route 1", vehicleNumber: "KA-01", driverName: "D", driverContact: "1", pickupPoint: "P", pickupTime: "8AM", dropTime: "5PM" }),
    /required/i
  );
  console.log("[PASS] 3. Service validation guards (Fees, Structures, Refunds, Hostel, Transport)");

  // 4. Exact 7-Item Sidebar, No Duplicate Navigation, & Portal Real-Data Checks
  const root = process.cwd();
  const sidebar = fs.readFileSync(path.join(root, "components/layout/AdminSidebar.tsx"), "utf8");
  const peopleStart = sidebar.indexOf("People & Workload");
  const academicsOpStart = sidebar.indexOf("Academic Operations");
  const peopleSection = sidebar.slice(peopleStart, academicsOpStart);

  const expectedLinks = [
    'href="/admin/admissions"',
    'href="/admin/students"',
    'href="/admin/guardians"',
    'href="/admin/staff"',
    'href="/admin/fees"',
    'href="/admin/hostel"',
    'href="/admin/transport"',
  ];
  let prevIdx = -1;
  for (const link of expectedLinks) {
    const idx = peopleSection.indexOf(link);
    assert.ok(idx > prevIdx, `Expected ${link} in exact order under People & Workload`);
    prevIdx = idx;
  }
  assert.ok(!peopleSection.includes("All Students"), "People & Workload must not contain All Students");
  assert.ok(!peopleSection.includes("Bulk Import Students"), "People & Workload must not contain Bulk Import Students");
  assert.ok(!peopleSection.includes("Import History"), "People & Workload must not contain Import History");
  assert.ok(!peopleSection.includes("/admin/roles-permissions"), "Roles & Permissions must be outside People & Workload");
  assert.ok(!sidebar.includes("Section: Finance & Accounts"), "Duplicate Finance & Accounts section must be removed");
  assert.ok(!sidebar.includes("Section: Campus Management"), "Duplicate Campus Management section must be removed");

  const staffPage = fs.readFileSync(path.join(root, "app/admin/staff/page.tsx"), "utf8");
  assert.ok(staffPage.includes("isDepartmentalStaff"), "Staff page must recognize departmental staff eligibility");
  assert.ok(staffPage.includes("Password Setup Pending"), "Staff page must show Password Setup Pending for departmental staff");

  const feesPage = fs.readFileSync(path.join(root, "app/admin/fees/page.tsx"), "utf8");
  assert.ok(!feesPage.includes("btech_core"), "Fees page must not contain hardcoded template btech_core");
  assert.ok(!feesPage.includes("REC-2026-"), "Fees page must not synthesize fake REC-2026- receipt numbers");
  assert.ok(feesPage.includes("p.receipt?.receiptNumber"), "Fees page must read actual FeeReceipt.receiptNumber");
  assert.ok(feesPage.includes("Receipt Unavailable"), "Fees page must show Receipt Unavailable when missing");
  assert.ok(feesPage.includes("DepartmentStaffPanel"), "Fees page must include DepartmentStaffPanel");

  const hostelPage = fs.readFileSync(path.join(root, "app/admin/hostel/page.tsx"), "utf8");
  assert.ok(!hostelPage.includes("TK-2026-081"), "Hostel page must not contain hardcoded maintenance tickets");
  assert.ok(!hostelPage.includes("Occupied (Aarav)"), "Hostel page must not contain hardcoded room matrix");
  assert.ok(hostelPage.includes("SAVE_ROOM"), "Hostel page must use SAVE_ROOM API action");
  assert.ok(hostelPage.includes("DepartmentStaffPanel"), "Hostel page must include DepartmentStaffPanel");

  const transportPage = fs.readFileSync(path.join(root, "app/admin/transport/page.tsx"), "utf8");
  assert.ok(!transportPage.includes("Bus #01"), "Transport page must not contain hardcoded Bus #01 array");
  assert.ok(!transportPage.includes("ITPL Main Gate Whitefield"), "Transport page must not contain hardcoded route stops array");
  assert.ok(transportPage.includes("SAVE_ROUTE"), "Transport page must use SAVE_ROUTE API action");
  assert.ok(transportPage.includes("DepartmentStaffPanel"), "Transport page must include DepartmentStaffPanel");

  const admissionsPage = fs.readFileSync(path.join(root, "app/admin/admissions/page.tsx"), "utf8");
  assert.ok(admissionsPage.includes("/api/admin/admissions?includeMeta=true"), "Admissions page must load meta from /api/admin/admissions?includeMeta=true");
  assert.ok(!admissionsPage.includes('fetch("/api/admin/academics/'), "Admissions page must not call /api/admin/academics/*");
  assert.ok(admissionsPage.includes("DepartmentStaffPanel"), "Admissions page must include DepartmentStaffPanel");

  const proxyFile = fs.readFileSync(path.join(root, "proxy.ts"), "utf8");
  const layoutFile = fs.readFileSync(path.join(root, "app/admin/layout.tsx"), "utf8");
  assert.ok(proxyFile.includes("isAdminPortalRole"), "proxy.ts must enforce admin portal role authentication");
  assert.ok(!proxyFile.includes("DEFAULT_ROLE_PERMISSIONS"), "proxy.ts must not block database-resolved custom permissions");
  assert.ok(layoutFile.includes("verifyAdminPageAccess"), "app/admin/layout.tsx must enforce verifyAdminPageAccess");

  const adminHeader = fs.readFileSync(path.join(root, "components/layout/AdminHeader.tsx"), "utf8");
  const adminLayout = fs.readFileSync(path.join(root, "components/layout/AdminLayout.tsx"), "utf8");
  assert.ok(adminHeader.includes("ROLE_LABELS"), "AdminHeader must use ROLE_LABELS for departmental role display");
  assert.ok(adminHeader.includes('isLoadingUser ? "Loading..."'), "AdminHeader must show neutral Loading... while resolving role");
  assert.ok(adminLayout.includes("<AdminHeader") && adminLayout.includes("userRole={userRole}"), "AdminLayout must pass server-resolved userRole to AdminHeader");

  const pageGuard = fs.readFileSync(path.join(root, "lib/security/admin-page-guard.ts"), "utf8");
  assert.ok(pageGuard.includes("await connection()"), "verifyAdminPageAccess must call await connection() before JWT/time checks");
  assert.ok(pageGuard.includes("resolveUserPermissionsFromDb(dbUser.id, institutionId, liveRole)"), "verifyAdminPageAccess must pass (userId, institutionId, liveRole) in exact order");
  assert.ok(pageGuard.includes("isAdminPageAuthorized(pathname, liveRole, permissions)"), "server page guard must enforce live database permissions");
  assert.ok(pageGuard.includes('landingRoute || "/admin/login?error=forbidden"'), "denied routes must use a non-looping fallback");

  assert.ok(!admissionsPage.includes("<span>{app.convertedStudentId}</span>"), "Admissions table must never render raw convertedStudentId UUID");
  assert.ok(admissionsPage.includes("Student Record Created") && admissionsPage.includes("Not Enrolled"), "Admissions table must render readable Student Status labels");
  assert.ok(admissionsPage.includes("applicantFirstName: firstName.trim()") && admissionsPage.includes("documents,"), "Admissions edit submit must persist full application fields and documents");

  const importPage = fs.readFileSync(path.join(root, "app/admin/students/import/page.tsx"), "utf8");
  assert.ok(!importPage.includes("<AdminLayout>"), "BulkStudentImportPage must not double-wrap AdminLayout");

  const adminAuth = fs.readFileSync(path.join(root, "lib/security/admin-auth.ts"), "utf8");
  const setupPwd = fs.readFileSync(path.join(root, "app/api/auth/setup-password/route.ts"), "utf8");
  assert.ok(adminAuth.includes("isTemporaryPasswordActive"), "admin-auth.ts must verify temporary password state against DB");
  assert.ok(setupPwd.includes('name: "sst_session"'), "setup-password must synchronize sst_session cookie");

  const auditRoute = fs.readFileSync(path.join(root, "app/api/admin/audit-logs/route.ts"), "utf8");
  const auditPermMatches = auditRoute.match(/requiredPermission:\s*PERMISSIONS\.ADMIN_ALL/g) || [];
  assert.strictEqual(auditPermMatches.length, 2, "GET and POST /api/admin/audit-logs must both require PERMISSIONS.ADMIN_ALL");

  const serviceSrc = fs.readFileSync(path.join(root, "lib/services/institution-admin.service.ts"), "utf8");
  const hostelTransportSlice = serviceSrc.slice(
    serviceSrc.indexOf("export async function getHostelAllocations"),
    serviceSrc.indexOf("export async function deleteTransportAllocation")
  );
  assert.ok(!hostelTransportSlice.includes("include: { student: true }"), "Hostel & Transport allocations must not expose full student PII");
  assert.ok(hostelTransportSlice.includes("ALLOCATION_STUDENT_SELECT"), "Hostel & Transport allocations must use explicit non-PII student select");
  const transferSlice = serviceSrc.slice(
    serviceSrc.indexOf("export async function transferHostelAllocation"),
    serviceSrc.indexOf("export async function getHostelOperations")
  );
  assert.ok(!transferSlice.includes("include: { student: true }"), "transferHostelAllocation must not expose full student PII");
  assert.ok(transferSlice.includes("ALLOCATION_STUDENT_SELECT"), "transferHostelAllocation must use explicit non-PII student select");

  console.log("[PASS] 4. Sidebar, Staff Status, Real-Data Portals, & Server-Side Guard Checks");
  console.log("\nALL FOUR DEPARTMENTAL PORTALS TESTS PASSED.");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
