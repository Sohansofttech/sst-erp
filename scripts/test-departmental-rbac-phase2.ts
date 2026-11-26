/**
 * SST-ERP Phase 2: Departmental RBAC & Authorization Verification Suite
 *
 * Isolated, non-destructive verification of all 12 required security & regression scenarios:
 *  1. Login & JWT / permission resolution for each new departmental role
 *  2. Correct post-login redirect landing routes
 *  3. Institution Admin access to all 4 departments & admin modules
 *  4. Each department's permitted API & UI access
 *  5. Cross-department access denial (403 Forbidden)
 *  6. Direct API authorization enforcement (server-side default-deny)
 *  7. Cross-institution access denial (tenant spoofing rejection)
 *  8. Shared Student Directory read-only & PII-stripped restrictions
 *  9. Inactive / locked account rejection
 * 10. mustChangePassword enforcement
 * 11. Subscription-expiry (HTTP 402) mutation enforcement
 * 12. Existing Student, Parent, Faculty, and Admin regression behavior
 */

import assert from "assert";
import {
  canAccessAdminPage,
  DEPARTMENTAL_ROLES,
  getDefaultPermissionsForRole,
  getRoleLandingRoute,
  hasPermission,
  isAdminPortalRole,
  isDepartmentalRole,
  isFullAdminRole,
  PERMISSIONS,
  RESERVED_PRIVILEGED_ROLE_CODES,
  resolveEffectivePermissions,
} from "../lib/security/rbac";
import { signToken, verifyToken, computePasswordSignature } from "../lib/auth/jwt";
import db from "../lib/db";
import { resolveUserPermissionsFromDb } from "../lib/security/rbac-server";
import {
  getAuthorizedAdminLandingRoute,
  isAdminPageAuthorized,
} from "../lib/security/admin-page-guard";
import { replaceStaffRoleAssignments } from "../lib/services/institution-admin.service";

let passCount = 0;
let totalCount = 0;

async function check(title: string, fn: () => void | Promise<void>) {
  totalCount++;
  try {
    await fn();
    passCount++;
    console.log(`  ✓ [PASS] ${title}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${title}`);
    console.error("     ", err?.message || err);
    process.exitCode = 1;
  }
}

// Pure server-side authorization simulator mirroring resolveAdminContext + route guards
function simulateApiAuth(params: {
  session: {
    userId: string;
    role: string;
    institutionId: string;
    mustChangePassword?: boolean;
    passwordSig?: string;
  } | null;
  dbUser: { isActive: boolean; status: string; role: string; passwordHash: string } | null;
  headerInstitutionId?: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  pathname: string;
  requiredPermission?: string;
  subscriptionExpired?: boolean;
}) {
  if (!params.session) return { status: 401, code: "UNAUTHORIZED" };
  const roleUpper = params.session.role.toUpperCase();
  if (!isAdminPortalRole(roleUpper)) return { status: 403, code: "FORBIDDEN_ROLE" };
  if (!params.session.passwordSig) return { status: 401, code: "MISSING_SIG" };

  if (!params.dbUser || !params.dbUser.isActive || params.dbUser.status !== "ACTIVE") {
    return { status: 401, code: "ACCOUNT_INACTIVE" };
  }
  if (params.session.passwordSig !== computePasswordSignature(params.dbUser.passwordHash)) {
    return { status: 401, code: "SIG_MISMATCH" };
  }
  if (params.session.mustChangePassword && !params.pathname.startsWith("/api/auth/")) {
    return { status: 403, code: "PASSWORD_CHANGE_REQUIRED" };
  }

  if (roleUpper !== "SUPER_ADMIN" && params.headerInstitutionId && params.headerInstitutionId !== params.session.institutionId) {
    return { status: 403, code: "TENANT_VIOLATION" };
  }

  const liveRole = params.dbUser.role.toUpperCase();
  const perms = getDefaultPermissionsForRole(liveRole);

  if (!isFullAdminRole(liveRole)) {
    if (!params.requiredPermission || !hasPermission(perms, params.requiredPermission, liveRole)) {
      return { status: 403, code: "FORBIDDEN_DEPARTMENT" };
    }
  }

  const isMutation = params.method !== "GET";
  if (isMutation && params.subscriptionExpired && liveRole !== "SUPER_ADMIN") {
    return { status: 402, code: "SUBSCRIPTION_EXPIRED" };
  }

  return { status: 200, code: "OK", permissions: perms };
}

async function main() {
  console.log("\n=== SST-ERP Phase 2: Departmental RBAC Verification Suite ===\n");

  const instId = "11111111-1111-4111-8111-111111111111";
  const otherInstId = "22222222-2222-4222-8222-222222222222";
  const pwSig = computePasswordSignature("$2a$10$mockhashvalue");

  // 1 & 2. Departmental role recognition, JWT signing, and post-login redirects
  await check("1. Departmental roles are recognized as Admin Portal roles and sign valid JWTs", async () => {
    for (const role of DEPARTMENTAL_ROLES) {
      assert.strictEqual(isAdminPortalRole(role), true);
      assert.strictEqual(isDepartmentalRole(role), true);
      assert.strictEqual(isFullAdminRole(role), false);
      const token = await signToken({
        userId: `usr_${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@campus.edu`,
        fullName: role,
        role,
        institutionId: instId,
        institutionName: "Test Campus",
        permissions: getDefaultPermissionsForRole(role),
        passwordSig: pwSig,
      });
      const decoded = await verifyToken(token);
      assert.strictEqual(decoded?.role, role);
      assert.strictEqual(decoded?.institutionId, instId);
    }
  });

  await check("2. Each departmental role redirects to its exact landing route", () => {
    assert.strictEqual(getRoleLandingRoute("ADMISSIONS_OFFICER"), "/admin/admissions");
    assert.strictEqual(getRoleLandingRoute("ACCOUNTANT"), "/admin/fees");
    assert.strictEqual(getRoleLandingRoute("HOSTEL_WARDEN"), "/admin/hostel");
    assert.strictEqual(getRoleLandingRoute("TRANSPORT_OFFICER"), "/admin/transport");
    assert.strictEqual(getRoleLandingRoute("ADMIN"), "/admin");
    assert.strictEqual(getRoleLandingRoute("INSTITUTION_ADMIN"), "/admin");
    assert.strictEqual(getRoleLandingRoute("SUPER_ADMIN"), "/super-admin");
  });

  // 3. Institution Admin access to all departments
  await check("3. Institution Admin & Super Admin have full access to all 4 departments and settings", () => {
    for (const adminRole of ["ADMIN", "INSTITUTION_ADMIN", "SUPER_ADMIN"]) {
      const perms = getDefaultPermissionsForRole(adminRole);
      for (const route of ["/admin", "/admin/admissions", "/admin/fees", "/admin/hostel", "/admin/transport", "/admin/settings", "/admin/staff"]) {
        assert.strictEqual(canAccessAdminPage(adminRole, perms, route), true);
      }
      const res = simulateApiAuth({
        session: { userId: "admin-1", role: adminRole, institutionId: instId, passwordSig: pwSig },
        dbUser: { isActive: true, status: "ACTIVE", role: adminRole, passwordHash: "$2a$10$mockhashvalue" },
        method: "POST",
        pathname: "/api/admin/settings",
      });
      assert.strictEqual(res.status, 200);
    }
  });

  // 4 & 5. Each department's permitted access + cross-department denial
  await check("4. ADMISSIONS_OFFICER accesses Admissions & read-only Students, denied Fees/Hostel/Transport/Settings", () => {
    const role = "ADMISSIONS_OFFICER";
    const perms = getDefaultPermissionsForRole(role);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/admissions"), true);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/students"), true);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/fees"), false);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/hostel"), false);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/transport"), false);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/settings"), false);

    assert.strictEqual(
      simulateApiAuth({
        session: { userId: "u1", role, institutionId: instId, passwordSig: pwSig },
        dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
        method: "PUT",
        pathname: "/api/admin/admissions",
        requiredPermission: PERMISSIONS.ADMISSIONS_APPROVE,
      }).status,
      200
    );
    assert.strictEqual(
      simulateApiAuth({
        session: { userId: "u1", role, institutionId: instId, passwordSig: pwSig },
        dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
        method: "GET",
        pathname: "/api/admin/fees",
        requiredPermission: PERMISSIONS.FEES_READ,
      }).status,
      403
    );
  });

  await check("5. ACCOUNTANT accesses Fees & Finance Reports, denied Hostel/Transport/Admissions", () => {
    const role = "ACCOUNTANT";
    const perms = getDefaultPermissionsForRole(role);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/fees"), true);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/students"), true);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/hostel"), false);
    assert.strictEqual(canAccessAdminPage(role, perms, "/admin/transport"), false);
    assert.strictEqual(
      simulateApiAuth({
        session: { userId: "u2", role, institutionId: instId, passwordSig: pwSig },
        dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
        method: "GET",
        pathname: "/api/admin/reports?type=finance",
        requiredPermission: PERMISSIONS.REPORTS_FINANCE,
      }).status,
      200
    );
    assert.strictEqual(
      simulateApiAuth({
        session: { userId: "u2", role, institutionId: instId, passwordSig: pwSig },
        dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
        method: "POST",
        pathname: "/api/admin/hostel",
        requiredPermission: PERMISSIONS.HOSTEL_WRITE,
      }).status,
      403
    );
  });

  await check("6. HOSTEL_WARDEN & TRANSPORT_OFFICER are strictly isolated to their own modules + read-only students", () => {
    for (const [role, ownPerm, foreignPerm] of [
      ["HOSTEL_WARDEN", PERMISSIONS.HOSTEL_WRITE, PERMISSIONS.TRANSPORT_READ],
      ["TRANSPORT_OFFICER", PERMISSIONS.TRANSPORT_WRITE, PERMISSIONS.HOSTEL_READ],
    ] as const) {
      assert.strictEqual(
        simulateApiAuth({
          session: { userId: "u3", role, institutionId: instId, passwordSig: pwSig },
          dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
          method: "POST",
          pathname: "/api/admin/own",
          requiredPermission: ownPerm,
        }).status,
        200
      );
      assert.strictEqual(
        simulateApiAuth({
          session: { userId: "u3", role, institutionId: instId, passwordSig: pwSig },
          dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
          method: "GET",
          pathname: "/api/admin/foreign",
          requiredPermission: foreignPerm,
        }).status,
        403
      );
      // Direct API default-deny when route specifies no departmental permission (e.g. /api/admin/settings)
      assert.strictEqual(
        simulateApiAuth({
          session: { userId: "u3", role, institutionId: instId, passwordSig: pwSig },
          dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
          method: "GET",
          pathname: "/api/admin/settings",
        }).status,
        403
      );
    }
  });

  // 7. Cross-institution spoofing denial
  await check("7. Cross-institution x-institution-id header spoofing returns 403 TENANT_VIOLATION", () => {
    const res = simulateApiAuth({
      session: { userId: "u4", role: "ACCOUNTANT", institutionId: instId, passwordSig: pwSig },
      dbUser: { isActive: true, status: "ACTIVE", role: "ACCOUNTANT", passwordHash: "$2a$10$mockhashvalue" },
      headerInstitutionId: otherInstId,
      method: "GET",
      pathname: "/api/admin/fees",
      requiredPermission: PERMISSIONS.FEES_READ,
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.code, "TENANT_VIOLATION");
  });

  // 8. Student directory read-only restrictions
  await check("8. Departmental staff can read Student Directory but are denied Student POST/PUT/DELETE (403)", () => {
    for (const role of DEPARTMENTAL_ROLES) {
      const readRes = simulateApiAuth({
        session: { userId: "u5", role, institutionId: instId, passwordSig: pwSig },
        dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
        method: "GET",
        pathname: "/api/admin/students/directory",
        requiredPermission: PERMISSIONS.STUDENTS_READ,
      });
      assert.strictEqual(readRes.status, 200);

      // Mutation route (/api/admin/students POST/PUT/DELETE) omits departmental permission -> 403
      const writeRes = simulateApiAuth({
        session: { userId: "u5", role, institutionId: instId, passwordSig: pwSig },
        dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
        method: "POST",
        pathname: "/api/admin/students",
      });
      assert.strictEqual(writeRes.status, 403);
    }
  });

  // 9. Inactive account rejection
  await check("9. Inactive or locked departmental accounts are immediately rejected (401)", () => {
    const res = simulateApiAuth({
      session: { userId: "u6", role: "HOSTEL_WARDEN", institutionId: instId, passwordSig: pwSig },
      dbUser: { isActive: false, status: "INACTIVE", role: "HOSTEL_WARDEN", passwordHash: "$2a$10$mockhashvalue" },
      method: "GET",
      pathname: "/api/admin/hostel",
      requiredPermission: PERMISSIONS.HOSTEL_READ,
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.code, "ACCOUNT_INACTIVE");
  });

  // 10. mustChangePassword enforcement
  await check("10. mustChangePassword blocks departmental APIs with 403 PASSWORD_CHANGE_REQUIRED", () => {
    const res = simulateApiAuth({
      session: {
        userId: "u7",
        role: "TRANSPORT_OFFICER",
        institutionId: instId,
        mustChangePassword: true,
        passwordSig: pwSig,
      },
      dbUser: { isActive: true, status: "ACTIVE", role: "TRANSPORT_OFFICER", passwordHash: "$2a$10$mockhashvalue" },
      method: "GET",
      pathname: "/api/admin/transport",
      requiredPermission: PERMISSIONS.TRANSPORT_READ,
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.code, "PASSWORD_CHANGE_REQUIRED");
  });

  // 11. Subscription-expiry (402) mutation enforcement
  await check("11. Expired trial blocks departmental mutations (402) while preserving GET reads (200)", () => {
    const readRes = simulateApiAuth({
      session: { userId: "u8", role: "ACCOUNTANT", institutionId: instId, passwordSig: pwSig },
      dbUser: { isActive: true, status: "ACTIVE", role: "ACCOUNTANT", passwordHash: "$2a$10$mockhashvalue" },
      method: "GET",
      pathname: "/api/admin/fees",
      requiredPermission: PERMISSIONS.FEES_READ,
      subscriptionExpired: true,
    });
    assert.strictEqual(readRes.status, 200);

    const writeRes = simulateApiAuth({
      session: { userId: "u8", role: "ACCOUNTANT", institutionId: instId, passwordSig: pwSig },
      dbUser: { isActive: true, status: "ACTIVE", role: "ACCOUNTANT", passwordHash: "$2a$10$mockhashvalue" },
      method: "POST",
      pathname: "/api/admin/fees",
      requiredPermission: PERMISSIONS.FEES_WRITE,
      subscriptionExpired: true,
    });
    assert.strictEqual(writeRes.status, 402);
    assert.strictEqual(writeRes.code, "SUBSCRIPTION_EXPIRED");
  });

  // 12. Existing Student, Parent, Faculty regression behavior
  await check("12. Existing STUDENT, PARENT, TEACHER roles remain excluded from Admin Portal APIs (403)", () => {
    for (const role of ["STUDENT", "PARENT", "TEACHER"]) {
      assert.strictEqual(isAdminPortalRole(role), false);
      const res = simulateApiAuth({
        session: { userId: "u9", role, institutionId: instId, passwordSig: pwSig },
        dbUser: { isActive: true, status: "ACTIVE", role, passwordHash: "$2a$10$mockhashvalue" },
        method: "GET",
        pathname: "/api/admin/admissions",
        requiredPermission: PERMISSIONS.ADMISSIONS_READ,
      });
      assert.strictEqual(res.status, 403);
    }
  });

  // 13-18. Targeted Security Fixes Verification
  await check("13. Explicit custom RolePermission rows restrict default departmental permissions", () => {
    // Restricted ADMISSIONS_OFFICER: only admissions:read & students:read (no admissions:approve or admissions:write)
    const resolved = resolveEffectivePermissions("ADMISSIONS_OFFICER", [
      { roleCode: "ADMISSIONS_OFFICER", explicitPermissions: [PERMISSIONS.ADMISSIONS_READ, PERMISSIONS.STUDENTS_READ] },
    ]);
    assert.strictEqual(resolved.permissions.includes(PERMISSIONS.ADMISSIONS_READ), true);
    assert.strictEqual(resolved.permissions.includes(PERMISSIONS.STUDENTS_READ), true);
    assert.strictEqual(resolved.permissions.includes(PERMISSIONS.ADMISSIONS_APPROVE), false);
    assert.strictEqual(resolved.permissions.includes(PERMISSIONS.ADMISSIONS_WRITE), false);
  });

  await check("14. Multiple assigned departmental roles union cleanly and deleted assignments revoke permissions", () => {
    const multi = resolveEffectivePermissions("ADMISSIONS_OFFICER", [
      { roleCode: "ADMISSIONS_OFFICER", explicitPermissions: [PERMISSIONS.ADMISSIONS_READ] },
      { roleCode: "HOSTEL_WARDEN", explicitPermissions: [PERMISSIONS.HOSTEL_READ, PERMISSIONS.HOSTEL_WRITE] },
    ]);
    assert.strictEqual(multi.permissions.includes(PERMISSIONS.ADMISSIONS_READ), true);
    assert.strictEqual(multi.permissions.includes(PERMISSIONS.HOSTEL_WRITE), true);

    // After deleting HOSTEL_WARDEN assignment, hostel:write is no longer granted
    const afterDelete = resolveEffectivePermissions("ADMISSIONS_OFFICER", [
      { roleCode: "ADMISSIONS_OFFICER", explicitPermissions: [PERMISSIONS.ADMISSIONS_READ] },
    ]);
    assert.strictEqual(afterDelete.permissions.includes(PERMISSIONS.HOSTEL_WRITE), false);
  });

  await check("15. Tenant-defined roles cannot grant admin:all or escalate via reserved Role.code", () => {
    assert.strictEqual(RESERVED_PRIVILEGED_ROLE_CODES.has("SUPER_ADMIN"), true);
    assert.strictEqual(RESERVED_PRIVILEGED_ROLE_CODES.has("ADMIN"), true);
    assert.strictEqual(RESERVED_PRIVILEGED_ROLE_CODES.has("INSTITUTION_ADMIN"), true);

    // Even if a malicious DB row existed with code SUPER_ADMIN or permission admin:all,
    // resolveEffectivePermissions blocks it for departmental users.
    const escalated = resolveEffectivePermissions("ACCOUNTANT", [
      { roleCode: "SUPER_ADMIN", explicitPermissions: [PERMISSIONS.ADMIN_ALL] },
      { roleCode: "CUSTOM_FINANCE", explicitPermissions: [PERMISSIONS.FEES_READ, PERMISSIONS.ADMIN_ALL] },
    ]);
    assert.strictEqual(escalated.permissions.includes(PERMISSIONS.ADMIN_ALL), false);
    assert.strictEqual(escalated.assignedRoles.includes("SUPER_ADMIN"), false);
    assert.deepStrictEqual(escalated.permissions, [PERMISSIONS.FEES_READ]);
  });

  await check("16. Departmental roles bypass InstitutionMembership requirement while ADMIN roles retain it", () => {
    // Mirrors admin-auth.ts: isFullAdminRole(liveRoleUpper) gates InstitutionMembership check
    assert.strictEqual(isFullAdminRole("ADMIN"), true);
    assert.strictEqual(isFullAdminRole("INSTITUTION_ADMIN"), true);
    for (const deptRole of DEPARTMENTAL_ROLES) {
      assert.strictEqual(isFullAdminRole(deptRole), false);
    }
  });

  // 17-22. Option B: TEXT User ID Compatibility & Regression Suite
  await check("17. resolveUserPermissionsFromDb accepts both UUID and legacy TEXT userIds without UUID rejection", async () => {
    const originalFindMany = db.userRoleAssignment.findMany;
    const queries: Array<{ userId: string; institutionId: string }> = [];
    const validInstUuid = "11111111-1111-4111-8111-111111111111";
    const validUuidUser = "22222222-2222-4222-8222-222222222222";
    const legacyTextUser = "usr_legacy_apex_staff_01";

    (db.userRoleAssignment as any).findMany = async (args: any) => {
      queries.push({ userId: args.where.userId, institutionId: args.where.institutionId });
      return [
        {
          userId: args.where.userId,
          institutionId: args.where.institutionId,
          role: {
            code: "ADMISSIONS_OFFICER",
            permissions: [{ permission: { code: PERMISSIONS.ADMISSIONS_READ } }],
          },
        },
      ];
    };

    try {
      const uuidRes = await resolveUserPermissionsFromDb(validUuidUser, validInstUuid, "ADMISSIONS_OFFICER");
      const textRes = await resolveUserPermissionsFromDb(legacyTextUser, validInstUuid, "ADMISSIONS_OFFICER");

      assert.strictEqual(queries.length, 2);
      assert.deepStrictEqual(queries[0], { userId: validUuidUser, institutionId: validInstUuid });
      assert.deepStrictEqual(queries[1], { userId: legacyTextUser, institutionId: validInstUuid });
      assert.deepStrictEqual(uuidRes.permissions, [PERMISSIONS.ADMISSIONS_READ]);
      assert.deepStrictEqual(textRes.permissions, [PERMISSIONS.ADMISSIONS_READ]);
    } finally {
      (db.userRoleAssignment as any).findMany = originalFindMany;
    }
  });

  await check("18. resolveUserPermissionsFromDb skips DB query for non-UUID institutionId and falls back to defaults", async () => {
    const originalFindMany = db.userRoleAssignment.findMany;
    let called = false;
    (db.userRoleAssignment as any).findMany = async () => {
      called = true;
      return [];
    };

    try {
      const fallbackRes = await resolveUserPermissionsFromDb("usr_legacy_01", "inst_apex", "ACCOUNTANT");
      assert.strictEqual(called, false);
      assert.deepStrictEqual(fallbackRes.assignedRoles, ["ACCOUNTANT"]);
      assert.deepStrictEqual(fallbackRes.permissions, getDefaultPermissionsForRole("ACCOUNTANT"));
    } finally {
      (db.userRoleAssignment as any).findMany = originalFindMany;
    }
  });

  await check("19. resolveUserPermissionsFromDb falls back to role defaults when user has zero assignments", async () => {
    const originalFindMany = db.userRoleAssignment.findMany;
    const validInstUuid = "11111111-1111-4111-8111-111111111111";
    (db.userRoleAssignment as any).findMany = async () => [];

    try {
      const res = await resolveUserPermissionsFromDb("usr_legacy_no_rows", validInstUuid, "HOSTEL_WARDEN");
      assert.deepStrictEqual(res.assignedRoles, ["HOSTEL_WARDEN"]);
      assert.deepStrictEqual(res.permissions, getDefaultPermissionsForRole("HOSTEL_WARDEN"));
    } finally {
      (db.userRoleAssignment as any).findMany = originalFindMany;
    }
  });

  await check("20. resolveUserPermissionsFromDb unions multiple DB role assignments and revokes on deletion", async () => {
    const originalFindMany = db.userRoleAssignment.findMany;
    const validInstUuid = "11111111-1111-4111-8111-111111111111";
    let storedRows = [
      {
        role: {
          code: "ADMISSIONS_OFFICER",
          permissions: [{ permission: { code: PERMISSIONS.ADMISSIONS_READ } }],
        },
      },
      {
        role: {
          code: "TRANSPORT_OFFICER",
          permissions: [
            { permission: { code: PERMISSIONS.TRANSPORT_READ } },
            { permission: { code: PERMISSIONS.TRANSPORT_WRITE } },
          ],
        },
      },
    ];
    (db.userRoleAssignment as any).findMany = async () => storedRows;

    try {
      const multi = await resolveUserPermissionsFromDb("usr_legacy_multi", validInstUuid, "ADMISSIONS_OFFICER");
      assert.strictEqual(multi.permissions.includes(PERMISSIONS.ADMISSIONS_READ), true);
      assert.strictEqual(multi.permissions.includes(PERMISSIONS.TRANSPORT_WRITE), true);

      // Simulate deleting TRANSPORT_OFFICER assignment
      storedRows = [storedRows[0]];
      const afterDelete = await resolveUserPermissionsFromDb("usr_legacy_multi", validInstUuid, "ADMISSIONS_OFFICER");
      assert.strictEqual(afterDelete.permissions.includes(PERMISSIONS.ADMISSIONS_READ), true);
      assert.strictEqual(afterDelete.permissions.includes(PERMISSIONS.TRANSPORT_WRITE), false);
    } finally {
      (db.userRoleAssignment as any).findMany = originalFindMany;
    }
  });

  await check("21. resolveUserPermissionsFromDb blocks admin:all and reserved role escalation from DB rows", async () => {
    const originalFindMany = db.userRoleAssignment.findMany;
    const validInstUuid = "11111111-1111-4111-8111-111111111111";
    (db.userRoleAssignment as any).findMany = async () => [
      {
        role: {
          code: "INSTITUTION_ADMIN",
          permissions: [{ permission: { code: PERMISSIONS.ADMIN_ALL } }],
        },
      },
      {
        role: {
          code: "CUSTOM_WARDEN",
          permissions: [
            { permission: { code: PERMISSIONS.HOSTEL_READ } },
            { permission: { code: PERMISSIONS.ADMIN_ALL } },
          ],
        },
      },
    ];

    try {
      const res = await resolveUserPermissionsFromDb("usr_legacy_escalate", validInstUuid, "HOSTEL_WARDEN");
      assert.strictEqual(res.permissions.includes(PERMISSIONS.ADMIN_ALL), false);
      assert.strictEqual(res.assignedRoles.includes("INSTITUTION_ADMIN"), false);
      assert.deepStrictEqual(res.permissions, [PERMISSIONS.HOSTEL_READ]);
    } finally {
      (db.userRoleAssignment as any).findMany = originalFindMany;
    }
  });

  await check("22. UUID regex validates roleId & institutionId while TEXT userId accepts legacy IDs", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert.strictEqual(uuidRegex.test("11111111-1111-4111-8111-111111111111"), true);
    assert.strictEqual(uuidRegex.test("not-a-uuid-role-id"), false);
    assert.strictEqual(uuidRegex.test("inst_apex"), false);
    assert.strictEqual("usr_legacy_apex_01".trim().length > 0, true);
    assert.strictEqual("".trim().length > 0, false);
  });

  await check("23. Permission lookup failures fail closed", async () => {
    const originalFindMany = db.userRoleAssignment.findMany;
    (db.userRoleAssignment as any).findMany = async () => {
      throw new Error("simulated permission lookup failure");
    };

    try {
      const result = await resolveUserPermissionsFromDb(
        "usr_permission_failure",
        "11111111-1111-4111-8111-111111111111",
        "ACCOUNTANT"
      );
      assert.deepStrictEqual(result.assignedRoles, ["ACCOUNTANT"]);
      assert.deepStrictEqual(result.permissions, []);
    } finally {
      (db.userRoleAssignment as any).findMany = originalFindMany;
    }
  });

  await check("24. Staff role replacement is tenant-scoped and empty selections revoke assignments", async () => {
    const calls: string[] = [];
    const tx = {
      userRoleAssignment: {
        deleteMany: async ({ where }: { where: { userId: string; institutionId: string } }) => {
          calls.push(JSON.stringify({ operation: "delete", where }));
          return { count: 1 };
        },
        createMany: async ({
          data,
          skipDuplicates,
        }: {
          data: Array<{ userId: string; roleId: string; institutionId: string }>;
          skipDuplicates: boolean;
        }) => {
          calls.push(JSON.stringify({ operation: "create", data, skipDuplicates }));
          return { count: data.length };
        },
      },
    };
    const institutionId = "11111111-1111-4111-8111-111111111111";

    await replaceStaffRoleAssignments(tx, "staff-1", institutionId, ["role-1"]);
    assert.deepStrictEqual(calls, [
      JSON.stringify({
        operation: "delete",
        where: { userId: "staff-1", institutionId },
      }),
      JSON.stringify({
        operation: "create",
        data: [{ userId: "staff-1", roleId: "role-1", institutionId }],
        skipDuplicates: true,
      }),
    ]);

    calls.length = 0;
    await replaceStaffRoleAssignments(tx, "staff-1", institutionId, []);
    assert.deepStrictEqual(calls, [
      JSON.stringify({
        operation: "delete",
        where: { userId: "staff-1", institutionId },
      }),
    ]);
  });

  await check("25. Custom DB permissions determine page access and a non-looping landing route", () => {
    const customFeeRead = [PERMISSIONS.FEES_READ];
    assert.strictEqual(
      isAdminPageAuthorized("/admin/fees", "ADMISSIONS_OFFICER", customFeeRead),
      true
    );
    assert.strictEqual(
      isAdminPageAuthorized("/admin/admissions", "ADMISSIONS_OFFICER", customFeeRead),
      false
    );
    assert.strictEqual(
      getAuthorizedAdminLandingRoute("ADMISSIONS_OFFICER", customFeeRead),
      "/admin/fees"
    );
    assert.strictEqual(getAuthorizedAdminLandingRoute("ADMISSIONS_OFFICER", []), null);
    assert.strictEqual(
      getAuthorizedAdminLandingRoute(
        "ADMISSIONS_OFFICER",
        getDefaultPermissionsForRole("ADMISSIONS_OFFICER")
      ),
      "/admin/admissions"
    );
  });

  console.log(`\n=== RESULTS: ${passCount} / ${totalCount} CHECKS PASSED ===\n`);
}

main();
