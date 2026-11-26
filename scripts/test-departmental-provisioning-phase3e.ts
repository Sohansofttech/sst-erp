/**
 * SST-ERP Phase 3E: Departmental Staff Provisioning, Transaction & Audit Regression Suite
 *
 * Uses in-memory db mocks & signed JWT NextRequests (zero live Supabase writes).
 */

import assert from "assert";
import { NextRequest } from "next/server";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
  process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests-only-32-chars";
}
import db from "../lib/db";
import { signToken, computePasswordSignature, AUTH_COOKIE_NAME } from "../lib/auth/jwt";
import { getRolePortalLoginUrl } from "../lib/services/email.service";
import { createStaff } from "../lib/services/institution-admin.service";
import { POST as staffPost, PUT as staffPut, DELETE as staffDelete, PATCH as staffPatch } from "../app/api/admin/staff/route";
import { POST as rolesPost, PUT as rolesPut, DELETE as rolesDelete } from "../app/api/admin/roles/route";
import { POST as setupPasswordPost } from "../app/api/auth/setup-password/route";
import { GET as authMeGet } from "../app/api/auth/me/route";
import { signPasswordSetupToken, verifyToken } from "../lib/auth/jwt";
import { DEPARTMENTAL_ROLES, getRoleLandingRoute, isAdminPortalRole, PERMISSIONS } from "../lib/security/rbac";

let passCount = 0;
let totalCount = 0;

async function check(name: string, fn: () => Promise<void> | void) {
  totalCount++;
  try {
    await fn();
    passCount++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`      ${err?.message || err}`);
    process.exitCode = 1;
  }
}

const INST_A = "11111111-1111-4111-8111-111111111111";
const ROLE_UUID_1 = "22222222-2222-4222-8222-222222222222";
const ROLE_UUID_OTHER = "33333333-3333-4333-8333-333333333333";
const PERM_UUID_1 = "44444444-4444-4444-8444-444444444444";
const PERM_UUID_ADMIN = "55555555-5555-4555-8555-555555555555";
const ADMIN_USER_ID = "66666666-6666-4666-8666-666666666666";
const DEPT_USER_ID = "usr_dept_legacy_01";
const PW_HASH = "$2a$10$mockhashvalue";

async function makeReq(
  url: string,
  method: string,
  body: any,
  role: string,
  userId = ADMIN_USER_ID,
  institutionId = INST_A
) {
  const token = await signToken({
    userId,
    email: `${role.toLowerCase()}@inst.edu`,
    fullName: "Test Actor",
    role: role as any,
    institutionId,
    institutionName: "Test Inst",
    passwordSig: computePasswordSignature(PW_HASH),
    mustChangePassword: false,
  });
  return new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `${AUTH_COOKIE_NAME}=${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  console.log("\n=== SST-ERP Phase 3E: Provisioning, Atomicity & Audit Suite ===\n");

  const origDb = {
    userFindUnique: db.user.findUnique,
    userFindFirst: db.user.findFirst,
    roleFindMany: db.role.findMany,
    roleFindFirst: db.role.findFirst,
    permFindMany: db.permission.findMany,
    uraCount: db.userRoleAssignment.count,
    uraFindMany: db.userRoleAssignment.findMany,
    transaction: db.$transaction,
    queryRaw: db.$queryRaw,
    instFindUnique: db.institution.findUnique,
    subFindFirst: db.institutionSubscription.findFirst,
    platformUserFindMany: db.platformUser.findMany,
    instMembershipFindFirst: db.institutionMembership.findFirst,
  };

  let lastTxRolledBack = false;
  let auditEvents: any[] = [];
  let createdUraRows: any[] = [];
  let actorRoleInMock = "INSTITUTION_ADMIN";
  let actorIdInMock = ADMIN_USER_ID;

  function installMocks(opts?: { failUraWrite?: boolean; subExpired?: boolean }) {
    lastTxRolledBack = false;
    auditEvents = [];
    createdUraRows = [];

    (db.user as any).findUnique = async ({ where }: any) => {
      if (where?.id === ADMIN_USER_ID) {
        return {
          id: ADMIN_USER_ID,
          isActive: true,
          status: "ACTIVE",
          passwordHash: PW_HASH,
          institutionId: INST_A,
          role: actorRoleInMock,
        };
      }
      if (where?.id === DEPT_USER_ID) {
        return {
          id: DEPT_USER_ID,
          isActive: true,
          status: "ACTIVE",
          passwordHash: PW_HASH,
          institutionId: INST_A,
          role: "ADMISSIONS_OFFICER",
        };
      }
      return null;
    };

    (db.user as any).findFirst = async ({ where }: any) => {
      if (where?.id === DEPT_USER_ID && where?.institutionId === INST_A) {
        return { id: DEPT_USER_ID, institutionId: INST_A, role: "ADMISSIONS_OFFICER", teacherProfile: null };
      }
      return null;
    };

    (db as any).$queryRaw = async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("InstitutionMembership")) {
        return [{ id: "m1", status: "ACTIVE" }];
      }
      return [];
    };

    (db.institution as any).findUnique = async () => ({
      id: INST_A,
      name: "Test Inst",
      slug: "test-inst",
      subscriptionStatus: opts?.subExpired ? "EXPIRED" : "ACTIVE",
      trialEndsAt: opts?.subExpired ? new Date(Date.now() - 86400000) : new Date(Date.now() + 86400000),
      isActive: true,
      status: "ACTIVE",
    });

    (db.institutionSubscription as any).findFirst = async () => ({
      id: "sub_1",
      institutionId: INST_A,
      status: opts?.subExpired ? "EXPIRED" : "ACTIVE",
      isTrial: opts?.subExpired ? true : false,
      startsAt: new Date(Date.now() - 86400000 * 15),
      endsAt: opts?.subExpired ? new Date(Date.now() - 86400000) : new Date(Date.now() + 86400000),
      plan: { name: "Pro", code: "PRO", priceMonthly: 1000, currency: "INR" },
    });

    (db.platformUser as any).findMany = async () => [{ id: "plat_admin_1" }];
    (db.institutionMembership as any).findFirst = async () => ({ id: "m1" });

    (db.userRoleAssignment as any).findMany = async () => [];
    (db.userRoleAssignment as any).count = async () => 0;

    (db.role as any).findMany = async ({ where }: any) => {
      const ids: string[] = where?.id?.in || [];
      return ids
        .filter((id) => id === ROLE_UUID_1 && where?.institutionId === INST_A)
        .map((id) => ({ id, code: "ADMISSIONS_OFFICER" }));
    };

    (db.role as any).findFirst = async ({ where }: any) => {
      if (where?.id === ROLE_UUID_1 && where?.institutionId === INST_A) {
        return { id: ROLE_UUID_1, institutionId: INST_A, code: "ADMISSIONS_OFFICER", name: "Admissions Officer", isSystem: false };
      }
      return null;
    };

    (db.permission as any).findMany = async ({ where }: any) => {
      const ids: string[] = where?.id?.in || [];
      const out: any[] = [];
      if (ids.includes(PERM_UUID_1)) out.push({ id: PERM_UUID_1, code: PERMISSIONS.ADMISSIONS_READ });
      if (ids.includes(PERM_UUID_ADMIN)) out.push({ id: PERM_UUID_ADMIN, code: PERMISSIONS.ADMIN_ALL });
      return out;
    };

    (db as any).$transaction = async (fn: any) => {
      const txAudits: any[] = [];
      const txUra: any[] = [];
      const tx = {
        user: {
          findFirst: async () => null,
          findUnique: async () => ({ id: actorIdInMock }),
          create: async ({ data }: any) => ({ id: "usr_created_01", ...data, teacherProfile: null }),
          update: async ({ data }: any) => ({ id: "usr_created_01", ...data, teacherProfile: null }),
          updateMany: async ({ where }: any) => ({ count: where?.id === DEPT_USER_ID && where?.institutionId === INST_A ? 1 : 0 }),
        },
        teacher: { create: async () => ({ id: "t1" }) },
        userRoleAssignment: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async ({ data }: any) => {
            if (opts?.failUraWrite) {
              throw new Error("Simulated DB constraint failure in user_role_assignments");
            }
            txUra.push(...data);
            return { count: data.length };
          },
        },
        role: {
          create: async ({ data }: any) => ({ id: ROLE_UUID_1, ...data }),
          update: async ({ data }: any) => ({ id: ROLE_UUID_1, ...data }),
          delete: async () => ({ id: ROLE_UUID_1 }),
        },
        rolePermission: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async ({ data }: any) => ({ count: data.length }),
        },
        auditLog: {
          create: async ({ data }: any) => {
            txAudits.push(data);
            return data;
          },
        },
        $executeRawUnsafe: async (_sql: string, ...params: any[]) => {
          txAudits.push({
            id: params[0],
            institutionId: params[1],
            userId: params[2],
            actorUserId: params[3],
            action: params[4],
            entityType: params[5],
            entityId: params[6],
          });
          return 1;
        },
      };

      try {
        const res = await fn(tx);
        auditEvents.push(...txAudits);
        createdUraRows.push(...txUra);
        return res;
      } catch (e) {
        lastTxRolledBack = true;
        throw e;
      }
    };
  }

  try {
    await check("1. All four departmental invitation URLs route to /admin/login", () => {
      for (const role of DEPARTMENTAL_ROLES) {
        assert.strictEqual(getRolePortalLoginUrl(role, "test-inst", "https://erp.example.com"), "https://erp.example.com/admin/login");
      }
      assert.strictEqual(getRolePortalLoginUrl("TEACHER", "demo", "https://erp.example.com"), "https://erp.example.com/campus/demo/teacher");
      assert.strictEqual(getRolePortalLoginUrl("STUDENT", "demo", "https://erp.example.com"), "https://erp.example.com/student/dashboard");
      assert.strictEqual(getRolePortalLoginUrl("PARENT", "demo", "https://erp.example.com"), "https://erp.example.com/parent/dashboard");
    });

    await check("2. createStaff preserves departmental primary role, writes UserRoleAssignment & STAFF_CREATED audit atomically", async () => {
      installMocks();
      const origUserUpdate = db.user.update;
      (db.user as any).update = async () => ({});
      try {
        const created = await createStaff(INST_A, {
          fullName: "Admissions Staff",
          email: "adm.staff@inst.edu",
          role: "ADMISSIONS_OFFICER",
          roleIds: [ROLE_UUID_1],
          actorUserId: ADMIN_USER_ID,
        });
        assert.strictEqual((created as any).role, "ADMISSIONS_OFFICER");
        assert.strictEqual(createdUraRows.length, 1);
        assert.strictEqual(createdUraRows[0].roleId, ROLE_UUID_1);
        assert.strictEqual(auditEvents.some((a) => a.action === "STAFF_CREATED" && a.actorUserId === ADMIN_USER_ID), true);
      } finally {
        (db.user as any).update = origUserUpdate;
      }
    });

    await check("3. POST /api/admin/staff rolls back and surfaces error (no silent swallow) when UserRoleAssignment fails", async () => {
      installMocks({ failUraWrite: true });
      const req = await makeReq("http://localhost/api/admin/staff", "POST", {
        fullName: "Fail Case",
        email: "fail@inst.edu",
        role: "ADMISSIONS_OFFICER",
        roleIds: [ROLE_UUID_1],
      }, "INSTITUTION_ADMIN");
      const res = await staffPost(req);
      assert.strictEqual(res.status, 500);
      assert.strictEqual(lastTxRolledBack, true);
      assert.strictEqual(auditEvents.length, 0);
    });

    await check("4. PUT /api/admin/staff rolls back user & audit updates when UserRoleAssignment fails", async () => {
      installMocks({ failUraWrite: true });
      const req = await makeReq("http://localhost/api/admin/staff", "PUT", {
        id: DEPT_USER_ID,
        roleIds: [ROLE_UUID_1],
      }, "INSTITUTION_ADMIN");
      const res = await staffPut(req);
      assert.strictEqual(res.status, 500);
      assert.strictEqual(lastTxRolledBack, true);
      assert.strictEqual(auditEvents.length, 0);
    });

    await check("5. PUT /api/admin/staff succeeds for legacy TEXT userId and records STAFF_ROLES_UPDATED audit", async () => {
      installMocks();
      const req = await makeReq("http://localhost/api/admin/staff", "PUT", {
        id: DEPT_USER_ID,
        roleIds: [ROLE_UUID_1],
      }, "INSTITUTION_ADMIN");
      const res = await staffPut(req);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(createdUraRows[0].userId, DEPT_USER_ID);
      assert.strictEqual(auditEvents.some((a) => a.action === "STAFF_ROLES_UPDATED" && a.actorUserId === ADMIN_USER_ID), true);
    });

    await check("6. PUT /api/admin/roles rejects invalid permission UUIDs (400) and nonexistent permissions (400)", async () => {
      installMocks();
      const invalidReq = await makeReq("http://localhost/api/admin/roles", "PUT", {
        id: ROLE_UUID_1,
        permissionIds: ["not-a-uuid"],
      }, "INSTITUTION_ADMIN");
      assert.strictEqual((await rolesPut(invalidReq)).status, 400);

      const missingReq = await makeReq("http://localhost/api/admin/roles", "PUT", {
        id: ROLE_UUID_1,
        permissionIds: ["99999999-9999-4999-8999-999999999999"],
      }, "INSTITUTION_ADMIN");
      assert.strictEqual((await rolesPut(missingReq)).status, 400);
    });

    await check("7. PUT /api/admin/roles rejects admin:all (403) and POST blocks reserved role codes (403)", async () => {
      installMocks();
      const adminAllReq = await makeReq("http://localhost/api/admin/roles", "PUT", {
        id: ROLE_UUID_1,
        permissionIds: [PERM_UUID_ADMIN],
      }, "INSTITUTION_ADMIN");
      assert.strictEqual((await rolesPut(adminAllReq)).status, 403);

      const reservedReq = await makeReq("http://localhost/api/admin/roles", "POST", {
        name: "Super Admin",
        code: "SUPER_ADMIN",
      }, "INSTITUTION_ADMIN");
      assert.strictEqual((await rolesPost(reservedReq)).status, 403);
    });

    await check("8. POST / PUT / DELETE /api/admin/roles record ROLE_CREATED, ROLE_UPDATED, ROLE_DELETED audits", async () => {
      installMocks();
      const postReq = await makeReq("http://localhost/api/admin/roles", "POST", {
        name: "Custom Admissions",
        code: "CUSTOM_ADM",
      }, "INSTITUTION_ADMIN");
      assert.strictEqual((await rolesPost(postReq)).status, 200);

      const putReq = await makeReq("http://localhost/api/admin/roles", "PUT", {
        id: ROLE_UUID_1,
        permissionIds: [PERM_UUID_1],
      }, "INSTITUTION_ADMIN");
      assert.strictEqual((await rolesPut(putReq)).status, 200);

      const delReq = await makeReq(`http://localhost/api/admin/roles?id=${ROLE_UUID_1}`, "DELETE", undefined, "INSTITUTION_ADMIN");
      assert.strictEqual((await rolesDelete(delReq)).status, 200);

      assert.strictEqual(auditEvents.some((a) => a.action === "ROLE_CREATED"), true);
      assert.strictEqual(auditEvents.some((a) => a.action === "ROLE_UPDATED"), true);
      assert.strictEqual(auditEvents.some((a) => a.action === "ROLE_DELETED"), true);
    });

    await check("9. Departmental users are denied /api/admin/staff and /api/admin/roles (403)", async () => {
      installMocks();
      const sReq = await makeReq("http://localhost/api/admin/staff", "POST", {
        fullName: "X",
        email: "x@inst.edu",
        role: "ACCOUNTANT",
      }, "ADMISSIONS_OFFICER", DEPT_USER_ID);
      assert.strictEqual((await staffPost(sReq)).status, 403);

      const rReq = await makeReq("http://localhost/api/admin/roles", "POST", {
        name: "Custom",
      }, "ADMISSIONS_OFFICER", DEPT_USER_ID);
      assert.strictEqual((await rolesPost(rReq)).status, 403);
    });

    await check("10. Cross-institution role assignment is rejected (403)", async () => {
      installMocks();
      const req = await makeReq("http://localhost/api/admin/staff", "POST", {
        fullName: "Cross Tenant",
        email: "ct@inst.edu",
        role: "ADMISSIONS_OFFICER",
        roleIds: [ROLE_UUID_OTHER],
      }, "INSTITUTION_ADMIN");
      assert.strictEqual((await staffPost(req)).status, 403);
    });

    await check("11. Trial/subscription expiration returns 402 on staff mutation", async () => {
      installMocks({ subExpired: true });
      const req = await makeReq("http://localhost/api/admin/staff", "POST", {
        fullName: "Expired Trial",
        email: "exp@inst.edu",
        role: "ADMISSIONS_OFFICER",
      }, "INSTITUTION_ADMIN");
      assert.strictEqual((await staffPost(req)).status, 402);
    });

    await check("12. Departmental & Admin landing routes match role-based source of truth", () => {
      assert.strictEqual(getRoleLandingRoute("ADMISSIONS_OFFICER"), "/admin/admissions");
      assert.strictEqual(getRoleLandingRoute("ACCOUNTANT"), "/admin/fees");
      assert.strictEqual(getRoleLandingRoute("HOSTEL_WARDEN"), "/admin/hostel");
      assert.strictEqual(getRoleLandingRoute("TRANSPORT_OFFICER"), "/admin/transport");
      assert.strictEqual(getRoleLandingRoute("INSTITUTION_ADMIN"), "/admin");
      assert.strictEqual(getRoleLandingRoute("ADMIN"), "/admin");
      assert.strictEqual(getRoleLandingRoute("SUPER_ADMIN"), "/super-admin");
      for (const r of DEPARTMENTAL_ROLES) {
        assert.strictEqual(isAdminPortalRole(r), true);
      }
      assert.strictEqual(isAdminPortalRole("STUDENT"), false);
      assert.strictEqual(isAdminPortalRole("PARENT"), false);
      assert.strictEqual(isAdminPortalRole("TEACHER"), false);
    });

    await check("13. POST /api/auth/setup-password returns /admin/admissions & sets role + permissions in session cookie", async () => {
      installMocks();
      const origExecuteRawUnsafe = (db as any).$executeRawUnsafe;
      const origExecuteRaw = (db as any).$executeRaw;
      const origUserUpdate = db.user.update;
      const origRoleAssignmentFindMany = db.userRoleAssignment.findMany;
      const invitedMarker = "INVITED_TEST_MARKER";

      (db.user as any).findUnique = async ({ where }: any) => {
        if (where?.id === DEPT_USER_ID) {
          return {
            id: DEPT_USER_ID,
            email: "adm.pilot@inst.edu",
            fullName: "Pilot Officer",
            role: "ADMISSIONS_OFFICER",
            institutionId: INST_A,
            passwordHash: invitedMarker,
            isActive: false,
            status: "INACTIVE",
            institution: { id: INST_A, name: "Test Inst", slug: "test-inst" },
          };
        }
        return null;
      };
      (db.user as any).update = async () => ({});
      (db as any).$executeRaw = async () => 1;
      (db as any).$executeRawUnsafe = async () => 1;
      (db.userRoleAssignment as any).findMany = async () => [
        {
          role: {
            code: "ADMISSIONS_OFFICER",
            permissions: [
              { permission: { code: PERMISSIONS.ADMISSIONS_READ } },
              { permission: { code: PERMISSIONS.ADMISSIONS_WRITE } },
              { permission: { code: PERMISSIONS.ADMISSIONS_APPROVE } },
              { permission: { code: PERMISSIONS.STUDENTS_READ } },
            ],
          },
        },
      ];

      try {
        const setupToken = await signPasswordSetupToken({
          userId: DEPT_USER_ID,
          email: "adm.pilot@inst.edu",
          institutionId: INST_A,
          passwordHash: invitedMarker,
        });
        const req = new NextRequest("http://localhost/api/auth/setup-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: setupToken,
            newPassword: "Strong!Password2026#",
            confirmPassword: "Strong!Password2026#",
          }),
        });
        const res = await setupPasswordPost(req);
        const json = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(json.role, "ADMISSIONS_OFFICER");
        assert.strictEqual(json.redirectUrl, "/admin/admissions");

        const setCookie = res.headers.get("set-cookie") || "";
        const cookieMatch = setCookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
        assert.ok(cookieMatch?.[1], "Session cookie must be set");
        const verified = await verifyToken(cookieMatch[1]);
        assert.strictEqual(verified?.role, "ADMISSIONS_OFFICER");
        assert.deepStrictEqual(verified?.assignedRoles, ["ADMISSIONS_OFFICER"]);
        assert.strictEqual(verified?.permissions?.includes(PERMISSIONS.ADMIN_ALL), false);
      } finally {
        (db as any).$executeRawUnsafe = origExecuteRawUnsafe;
        (db as any).$executeRaw = origExecuteRaw;
        (db.user as any).update = origUserUpdate;
        (db.userRoleAssignment as any).findMany = origRoleAssignmentFindMany;
      }
    });

    await check("14. GET /api/auth/me retains ADMISSIONS_OFFICER role, landingRoute=/admin/admissions & scoped permissions", async () => {
      installMocks();
      (db.userRoleAssignment as any).findMany = async () => [
        {
          role: {
            code: "ADMISSIONS_OFFICER",
            permissions: [{ permission: { code: PERMISSIONS.ADMISSIONS_READ } }],
          },
        },
      ];
      const req = await makeReq(
        "http://localhost/api/auth/me",
        "GET",
        undefined,
        "ADMISSIONS_OFFICER",
        DEPT_USER_ID
      );
      const res = await authMeGet(req);
      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.data.session.role, "ADMISSIONS_OFFICER");
      assert.strictEqual(json.data.landingRoute, "/admin/admissions");
      assert.deepStrictEqual(json.data.session.permissions, [PERMISSIONS.ADMISSIONS_READ]);
    });

    await check("15. POST and PUT /api/admin/staff reject reserved roles (SUPER_ADMIN, ADMIN, INSTITUTION_ADMIN)", async () => {
      installMocks();
      for (const reservedRole of ["SUPER_ADMIN", "ADMIN", "INSTITUTION_ADMIN", "admin"]) {
        const postReq = await makeReq(
          "http://localhost/api/admin/staff",
          "POST",
          {
            fullName: "Reserved Attempt",
            email: "reserved@inst.edu",
            role: reservedRole,
          },
          "INSTITUTION_ADMIN"
        );
        assert.strictEqual((await staffPost(postReq)).status, 403, `POST should reject ${reservedRole}`);

        const putReq = await makeReq(
          "http://localhost/api/admin/staff",
          "PUT",
          {
            id: DEPT_USER_ID,
            role: reservedRole,
          },
          "INSTITUTION_ADMIN"
        );
        assert.strictEqual((await staffPut(putReq)).status, 403, `PUT should reject ${reservedRole}`);
      }
    });

    await check("16. PUT and DELETE /api/admin/staff reject modifying or archiving reserved admin accounts", async () => {
      installMocks();
      const origFindFirst = db.user.findFirst;
      try {
        for (const reservedRole of ["SUPER_ADMIN", "ADMIN", "INSTITUTION_ADMIN"]) {
          (db.user as any).findFirst = async ({ where }: any) => {
            if (where?.id === "reserved-target-1" && where?.institutionId === INST_A) {
              return { id: "reserved-target-1", institutionId: INST_A, role: reservedRole, teacherProfile: null };
            }
            return null;
          };

          const putReq = await makeReq(
            "http://localhost/api/admin/staff",
            "PUT",
            { id: "reserved-target-1", role: "STAFF", isActive: false },
            "INSTITUTION_ADMIN"
          );
          assert.strictEqual((await staffPut(putReq)).status, 403, `PUT should block ${reservedRole}`);

          const delReq = await makeReq(
            "http://localhost/api/admin/staff?id=reserved-target-1",
            "DELETE",
            undefined,
            "INSTITUTION_ADMIN"
          );
          assert.strictEqual((await staffDelete(delReq)).status, 403, `DELETE should block ${reservedRole}`);
        }
      } finally {
        (db.user as any).findFirst = origFindFirst;
      }
    });

    await check("17. PATCH /api/admin/staff denies departmental users (403) and permits authorized admin", async () => {
      installMocks();
      const deptPatchReq = await makeReq(
        "http://localhost/api/admin/staff",
        "PATCH",
        { id: DEPT_USER_ID, action: "RESTORE" },
        "ADMISSIONS_OFFICER",
        DEPT_USER_ID
      );
      assert.strictEqual((await staffPatch(deptPatchReq)).status, 403);

      const origPlatformFindUnique = db.platformSetting.findUnique;
      (db.platformSetting as any).findUnique = async () => null;
      try {
        const adminPatchReq = await makeReq(
          "http://localhost/api/admin/staff",
          "PATCH",
          { id: DEPT_USER_ID, action: "RESTORE" },
          "INSTITUTION_ADMIN"
        );
        assert.strictEqual((await staffPatch(adminPatchReq)).status, 200);
      } finally {
        (db.platformSetting as any).findUnique = origPlatformFindUnique;
      }
    });

    await check("18. POST /api/auth/setup-password rejects weak and breached passwords, accepts strong password", async () => {
      installMocks();
      const origExecuteRawUnsafe = (db as any).$executeRawUnsafe;
      const origExecuteRaw = (db as any).$executeRaw;
      const origUserUpdate = db.user.update;
      const origFetch = global.fetch;
      const invitedMarker = "INVITED_TEST_MARKER_SEC";

      (db.user as any).findUnique = async ({ where }: any) => {
        if (where?.id === DEPT_USER_ID) {
          return {
            id: DEPT_USER_ID,
            email: "adm.sec@inst.edu",
            fullName: "Security Officer",
            role: "ADMISSIONS_OFFICER",
            institutionId: INST_A,
            passwordHash: invitedMarker,
            isActive: false,
            status: "INACTIVE",
            institution: { id: INST_A, name: "Test Inst", slug: "test-inst" },
          };
        }
        return null;
      };
      (db.user as any).update = async () => ({});
      (db as any).$executeRaw = async () => 1;
      (db as any).$executeRawUnsafe = async () => 1;

      try {
        const setupToken = await signPasswordSetupToken({
          userId: DEPT_USER_ID,
          email: "adm.sec@inst.edu",
          institutionId: INST_A,
          passwordHash: invitedMarker,
        });

        // Weak password (fails complexity)
        const weakReq = new NextRequest("http://localhost/api/auth/setup-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: setupToken,
            newPassword: "weakpassword",
            confirmPassword: "weakpassword",
          }),
        });
        assert.strictEqual((await setupPasswordPost(weakReq)).status, 400);

        // Breached password (passes complexity, caught by checkPwnedPassword via HIBP range mock)
        const crypto = await import("crypto");
        const breachedPw = "Breached#Pass2026";
        const sha1 = crypto.createHash("sha1").update(breachedPw).digest("hex").toUpperCase();
        const suffix = sha1.substring(5);
        global.fetch = (async () =>
          new Response(`${suffix}:42\n`, { status: 200 })) as any;

        const pwnedReq = new NextRequest("http://localhost/api/auth/setup-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: setupToken,
            newPassword: breachedPw,
            confirmPassword: breachedPw,
          }),
        });
        assert.strictEqual((await setupPasswordPost(pwnedReq)).status, 400);

        // Valid strong non-breached password
        global.fetch = (async () => new Response("00000000000000000000000000000000000:0\n", { status: 200 })) as any;
        const validReq = new NextRequest("http://localhost/api/auth/setup-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: setupToken,
            newPassword: "Unique!StrongPass2026#",
            confirmPassword: "Unique!StrongPass2026#",
          }),
        });
        assert.strictEqual((await setupPasswordPost(validReq)).status, 200);
      } finally {
        global.fetch = origFetch;
        (db as any).$executeRawUnsafe = origExecuteRawUnsafe;
        (db as any).$executeRaw = origExecuteRaw;
        (db.user as any).update = origUserUpdate;
      }
    });
  } finally {
    (db.user as any).findUnique = origDb.userFindUnique;
    (db.user as any).findFirst = origDb.userFindFirst;
    (db.role as any).findMany = origDb.roleFindMany;
    (db.role as any).findFirst = origDb.roleFindFirst;
    (db.permission as any).findMany = origDb.permFindMany;
    (db.userRoleAssignment as any).count = origDb.uraCount;
    (db.userRoleAssignment as any).findMany = origDb.uraFindMany;
    (db as any).$transaction = origDb.transaction;
    (db as any).$queryRaw = origDb.queryRaw;
    (db.institution as any).findUnique = origDb.instFindUnique;
    (db.institutionSubscription as any).findFirst = origDb.subFindFirst;
    (db.platformUser as any).findMany = origDb.platformUserFindMany;
    (db.institutionMembership as any).findFirst = origDb.instMembershipFindFirst;
  }

  console.log(`\n=== RESULTS: ${passCount} / ${totalCount} CHECKS PASSED ===\n`);
}

main();
