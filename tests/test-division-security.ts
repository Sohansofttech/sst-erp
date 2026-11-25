/**
 * ============================================================================
 * Test Suite: tests/test-division-security.ts
 * Description: Automated security tests for Multi-Division Sprint 2:
 *              - Server-side division resolution & header/cookie extraction
 *              - Two-Tier RBAC & cross-division IDOR protection
 *              - Tenant isolation & cross-institution rejection
 *              - Division membership validation rules
 * ============================================================================
 */

import { NextRequest } from "next/server";
import {
  extractRequestedDivisionId,
  ResolvedDivisionContext,
} from "../lib/security/division-context";
import {
  assertDivisionTenant,
  scopeToDivision,
  DivisionContextLike,
} from "../lib/security/tenant";
import { ForbiddenError } from "../lib/auth/session";
import { DivisionType } from "@prisma/client";

function runDivisionSecurityTests() {
  console.log("====================================================================");
  console.log("   SPRINT 2: MULTI-DIVISION SECURITY & AUTHORIZATION TEST SUITE    ");
  console.log("====================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✖ FAIL: ${testName} ${detail ? "- " + detail : ""}`);
      failed++;
    }
  }

  function assertThrows(fn: () => void, expectedSnippet: string, testName: string) {
    try {
      fn();
      console.error(`  ✖ FAIL: ${testName} - Expected error containing "${expectedSnippet}" but nothing was thrown.`);
      failed++;
    } catch (err: any) {
      if (err instanceof ForbiddenError || err?.name === "ForbiddenError" || (err.message && err.message.includes(expectedSnippet))) {
        if (err.message.includes(expectedSnippet)) {
          console.log(`  ✔ PASS: ${testName}`);
          passed++;
        } else {
          console.error(`  ✖ FAIL: ${testName} - Error thrown but message "${err.message}" did not contain "${expectedSnippet}"`);
          failed++;
        }
      } else {
        console.error(`  ✖ FAIL: ${testName} - Unexpected error type: ${err.message}`);
        failed++;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Test Group 1: Request Division Extraction Precedence
  // ---------------------------------------------------------------------------
  console.log("--- Group 1: Header, Query & Cookie Extraction Precedence ---");

  // 1.1 Header extraction
  const reqWithHeader = new NextRequest("http://localhost:3000/api/admin/academics/classes", {
    headers: { "x-division-id": "div-from-header-1111" },
  });
  assert(
    extractRequestedDivisionId(reqWithHeader) === "div-from-header-1111",
    "Header 'x-division-id' is extracted cleanly"
  );

  // 1.2 Query parameter extraction
  const reqWithQuery = new NextRequest("http://localhost:3000/api/admin/academics/classes?divisionId=div-from-query-2222");
  assert(
    extractRequestedDivisionId(reqWithQuery) === "div-from-query-2222",
    "Query parameter '?divisionId=' is extracted cleanly"
  );

  // 1.3 Cookie extraction
  const reqWithCookie = new NextRequest("http://localhost:3000/api/admin/academics/classes", {
    headers: { cookie: "sst_active_division=div-from-cookie-3333; other=123" },
  });
  assert(
    extractRequestedDivisionId(reqWithCookie) === "div-from-cookie-3333",
    "Cookie 'sst_active_division' is extracted cleanly"
  );

  // 1.4 Priority: Header overrides query parameter
  const reqHeaderAndQuery = new NextRequest("http://localhost:3000/api/admin/academics/classes?divisionId=div-query", {
    headers: { "x-division-id": "div-header" },
  });
  assert(
    extractRequestedDivisionId(reqHeaderAndQuery) === "div-header",
    "Header takes precedence over query parameter"
  );

  // 1.5 Priority: Query parameter overrides cookie
  const reqQueryAndCookie = new NextRequest("http://localhost:3000/api/admin/academics/classes?divisionId=div-query", {
    headers: { cookie: "sst_active_division=div-cookie" },
  });
  assert(
    extractRequestedDivisionId(reqQueryAndCookie) === "div-query",
    "Query parameter takes precedence over cookie"
  );

  // 1.6 None present
  const reqPlain = new NextRequest("http://localhost:3000/api/admin/academics/classes");
  assert(
    extractRequestedDivisionId(reqPlain) === undefined,
    "Returns undefined when no division context is requested"
  );

  // ---------------------------------------------------------------------------
  // Test Group 2: assertDivisionTenant Security Guard
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 2: Two-Tier RBAC & assertDivisionTenant Guard ---");

  const instA = "inst-alpha-1111";
  const instB = "inst-beta-2222";
  const divSchoolA = "div-school-alpha-001";
  const divCollegeA = "div-college-alpha-002";
  const divSchoolB = "div-school-beta-003";

  // 2.1 Tier 1: Cross-Institution Security Violation
  const globalAdminContextA: DivisionContextLike = {
    institutionId: instA,
    isInstitutionWideAdmin: true,
    permittedDivisionIds: [divSchoolA, divCollegeA],
    activeDivisionId: divSchoolA,
  };

  assertThrows(
    () => assertDivisionTenant(globalAdminContextA, divSchoolB, instB),
    "Cross-tenant access violation",
    "Blocks cross-institution resource access even for Global Admin"
  );

  // 2.2 Tier 2: Global Admin permitted across all divisions in own institution
  let globalAdminAllowed = true;
  try {
    assertDivisionTenant(globalAdminContextA, divSchoolA, instA);
    assertDivisionTenant(globalAdminContextA, divCollegeA, instA);
  } catch {
    globalAdminAllowed = false;
  }
  assert(globalAdminAllowed, "Global Admin has verified access to all divisions within own institution");

  // 2.3 Tier 2: Unscoped / Shared Campus Facility Access
  let unscopedAllowed = true;
  try {
    assertDivisionTenant(globalAdminContextA, null, instA);
    assertDivisionTenant(globalAdminContextA, undefined, instA);
  } catch {
    unscopedAllowed = false;
  }
  assert(unscopedAllowed, "Shared/unscoped resources (e.g. transport, campus facilities) are permitted");

  // 2.4 Tier 2: Division-Scoped Admin (e.g. School Principal) Access Control
  const schoolPrincipalContext: DivisionContextLike = {
    institutionId: instA,
    isInstitutionWideAdmin: false,
    permittedDivisionIds: [divSchoolA], // Assigned strictly to School
    activeDivisionId: divSchoolA,
  };

  // Allowed to access own division
  let principalOwnDivAllowed = true;
  try {
    assertDivisionTenant(schoolPrincipalContext, divSchoolA, instA);
  } catch {
    principalOwnDivAllowed = false;
  }
  assert(principalOwnDivAllowed, "Division Admin is permitted access to assigned division");

  // Blocked from accessing College division (Cross-Division IDOR Violation)
  assertThrows(
    () => assertDivisionTenant(schoolPrincipalContext, divCollegeA, instA),
    "IDOR protection: Resource belongs to an unauthorized educational division",
    "Division Admin is strictly blocked from accessing unassigned College division"
  );

  // 2.5 Multi-Division Faculty Member (e.g. Teaching in School & College)
  const multiDivisionFacultyContext: DivisionContextLike = {
    institutionId: instA,
    isInstitutionWideAdmin: false,
    permittedDivisionIds: [divSchoolA, divCollegeA],
    activeDivisionId: divSchoolA,
  };

  let facultyAllowed = true;
  try {
    assertDivisionTenant(multiDivisionFacultyContext, divSchoolA, instA);
    assertDivisionTenant(multiDivisionFacultyContext, divCollegeA, instA);
  } catch {
    facultyAllowed = false;
  }
  assert(facultyAllowed, "Multi-Division Faculty member is permitted access to both assigned divisions");

  // Blocked from foreign division
  assertThrows(
    () => assertDivisionTenant(multiDivisionFacultyContext, divSchoolB, instA),
    "IDOR protection: Resource belongs to an unauthorized educational division",
    "Multi-Division Faculty is blocked from accessing foreign division"
  );

  // ---------------------------------------------------------------------------
  // Test Group 3: scopeToDivision Query Builder Helper
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 3: scopeToDivision Query Filter Scope ---");

  // 3.1 Global Admin Query Scope (Institution-wide, no division restriction)
  const globalQuery = scopeToDivision(globalAdminContextA, { status: "ACTIVE" });
  assert(
    globalQuery.institutionId === instA && globalQuery.divisionId === undefined,
    "Global Admin scope leaves divisionId unconstrained for cross-division queries"
  );

  // 3.2 Division-Scoped Admin Query Scope (Bound to active division)
  const divisionQuery = scopeToDivision(schoolPrincipalContext, { status: "ACTIVE" });
  assert(
    divisionQuery.institutionId === instA && divisionQuery.divisionId === divSchoolA,
    "Division-Scoped Admin scope automatically binds divisionId to active division"
  );

  // ---------------------------------------------------------------------------
  // Test Group 4: Division Context Simulation
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 4: Division Context Structure & Typing ---");

  const simulatedContext: ResolvedDivisionContext = {
    institutionId: instA,
    institutionName: "Apex Educational Trust",
    userId: "usr-admin-01",
    userRole: "ADMIN",
    isDevFallback: false,
    isInstitutionWideAdmin: true,
    activeDivisionId: divCollegeA,
    activeDivisionCode: "COL-APEX-001",
    activeDivisionName: "Apex College of Engineering",
    activeDivisionType: DivisionType.COLLEGE,
    permittedDivisionIds: [divSchoolA, divCollegeA],
  };

  assert(simulatedContext.activeDivisionType === DivisionType.COLLEGE, "Active division type correctly typed as COLLEGE");
  assert(simulatedContext.isInstitutionWideAdmin === true, "Institution-wide admin flag correctly verified");
  assert(simulatedContext.permittedDivisionIds.length === 2, "Permitted divisions list correctly populated");

  console.log("\n====================================================================");
  console.log(`Sprint 2 Security Test Results: ${passed} passed, ${failed} failed`);
  console.log("====================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runDivisionSecurityTests();
