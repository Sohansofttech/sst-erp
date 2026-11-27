/**
 * SST-ERP Phase P0.2: Admin API Tenant-Isolation Regression Suite
 *
 * Uses in-memory db mocks & signed JWT NextRequests (zero live database writes).
 */

import assert from "assert";
import { NextRequest } from "next/server";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 32) {
  process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests-only-32-chars";
}
import db from "../lib/db";
import { signToken, computePasswordSignature, AUTH_COOKIE_NAME } from "../lib/auth/jwt";
import { PUT as promotionsPut } from "../app/api/admin/promotions/route";
import { POST as attendancePost } from "../app/api/admin/attendance/route";
import { DELETE as iaDelete } from "../app/api/admin/ia/route";
import { markStudentAttendance } from "../lib/services/institution-admin.service";
import { deleteDivisionMembership } from "../lib/services/division-membership.service";

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
const ADMIN_USER_ID = "66666666-6666-4666-8666-666666666666";
const STU_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STU_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PW_HASH = "$2a$10$mockhashvalue";

async function makeReq(url: string, method: string, body?: any) {
  const token = await signToken({
    userId: ADMIN_USER_ID,
    email: "admin@inst.edu",
    fullName: "Inst Admin",
    role: "INSTITUTION_ADMIN",
    institutionId: INST_A,
    institutionName: "Inst A",
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
  console.log("\n=== SST-ERP Phase P0.2: Admin API Tenant-Isolation Suite ===\n");

  const orig = {
    userFindUnique: db.user.findUnique,
    platformUserFindMany: db.platformUser.findMany,
    instMembershipFindFirst: db.institutionMembership.findFirst,
    uraFindMany: db.userRoleAssignment.findMany,
    instFindUnique: db.institution.findUnique,
    subFindFirst: db.institutionSubscription.findFirst,
    subFindMany: db.institutionSubscription.findMany,
    promoFindFirst: db.promotionBatch.findFirst,
    studentFindMany: db.student.findMany,
    transaction: db.$transaction,
    attFindFirst: db.attendanceRecord.findFirst,
    attUpdateMany: db.attendanceRecord.updateMany,
    auditCreate: db.auditLog.create,
    iaFindFirst: db.assessmentRecord.findFirst,
    iaDeleteMany: db.assessmentRecord.deleteMany,
    aprFindFirst: db.approvalRequest.findFirst,
    divMemFindFirst: db.divisionMembership.findFirst,
    divMemDeleteMany: db.divisionMembership.deleteMany,
  };

  (db.user as any).findUnique = async ({ where }: any) => {
    if (where?.id === ADMIN_USER_ID) {
      return {
        id: ADMIN_USER_ID,
        email: "admin@inst.edu",
        isActive: true,
        status: "ACTIVE",
        passwordHash: PW_HASH,
        institutionId: INST_A,
        role: "INSTITUTION_ADMIN",
      };
    }
    return null;
  };
  (db.platformUser as any).findMany = async () => [{ id: "plat_admin_1" }];
  (db.institutionMembership as any).findFirst = async () => ({ id: "m1" });
  (db.userRoleAssignment as any).findMany = async () => [];
  (db.institution as any).findUnique = async () => ({
    id: INST_A,
    name: "Inst A",
    slug: "inst-a",
    subscriptionStatus: "ACTIVE",
    trialEndsAt: new Date(Date.now() + 86400000),
    isActive: true,
    status: "ACTIVE",
  });
  const mockSub = {
    id: "sub_1",
    institutionId: INST_A,
    status: "ACTIVE",
    isTrial: false,
    startsAt: new Date(Date.now() - 86400000),
    endsAt: new Date(Date.now() + 86400000),
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 86400000),
    cancelledAt: null,
    events: [],
    plan: { name: "Pro", code: "PRO", price: 1000, priceMonthly: 1000, currency: "INR" },
  };
  (db.institutionSubscription as any).findFirst = async () => mockSub;
  (db.institutionSubscription as any).findMany = async () => [mockSub];

  try {
    await check("1. PUT /api/admin/promotions rejects mixed/cross-institution studentIds (403) and scopes same-institution execute", async () => {
      (db.promotionBatch as any).findFirst = async ({ where }: any) =>
        where?.id === "batch-1" && where?.institutionId === INST_A
          ? { id: "batch-1", institutionId: INST_A, batchNumber: "PB-1", targetAcademicYearId: "ay-2", targetCourseId: "c-2", sourceCourseId: "c-1" }
          : null;

      (db.student as any).findMany = async ({ where }: any) => {
        const requested: string[] = where?.id?.in || [];
        return requested.filter((id) => id === STU_A && where?.institutionId === INST_A).map((id) => ({ id }));
      };

      let txRan = false;
      let capturedEnrollUpdateWhere: any = null;
      let capturedBatchUpdateWhere: any = null;
      (db as any).$transaction = async (fn: any) => {
        txRan = true;
        return fn({
          enrollment: {
            findFirst: async ({ where }: any) =>
              where?.status === "ACTIVE" ? { id: "enr-1", semester: 1 } : null,
            updateMany: async ({ where }: any) => {
              capturedEnrollUpdateWhere = where;
              return { count: 1 };
            },
            create: async () => ({ id: "enr-2" }),
          },
          promotionBatch: {
            updateMany: async ({ where }: any) => {
              capturedBatchUpdateWhere = where;
              return { count: 1 };
            },
          },
        });
      };

      // Mixed same-institution + cross-institution studentIds -> 403 and transaction must NOT run
      const crossRes = await promotionsPut(
        await makeReq("http://localhost/api/admin/promotions", "PUT", {
          id: "batch-1",
          action: "EXECUTE",
          studentIds: [STU_A, STU_OTHER],
        })
      );
      assert.strictEqual(crossRes.status, 403);
      assert.strictEqual(txRan, false);

      // Same-institution studentIds -> 200 and mutations scoped with institutionId
      const okRes = await promotionsPut(
        await makeReq("http://localhost/api/admin/promotions", "PUT", {
          id: "batch-1",
          action: "EXECUTE",
          studentIds: [STU_A],
        })
      );
      assert.strictEqual(okRes.status, 200);
      assert.deepStrictEqual(capturedEnrollUpdateWhere, { id: "enr-1", institutionId: INST_A });
      assert.deepStrictEqual(capturedBatchUpdateWhere, { id: "batch-1", institutionId: INST_A });
    });

    await check("2. markStudentAttendance rejects cross-institution studentId before creating enrollment or attendance", async () => {
      (db.student as any).findMany = async ({ where }: any) => {
        const requested: string[] = where?.id?.in || [];
        return requested.filter((id) => id === STU_A && where?.institutionId === INST_A).map((id) => ({ id }));
      };
      let txCalled = false;
      (db as any).$transaction = async (fn: any) => {
        txCalled = true;
        return fn({});
      };

      await assert.rejects(
        () =>
          markStudentAttendance(INST_A, [
            { studentId: STU_OTHER, subjectId: "sub-1", date: new Date(), status: "PRESENT" },
          ]),
        /do not belong to this institution/i
      );
      assert.strictEqual(txCalled, false);
    });

    await check("3. POST /api/admin/attendance scopes updateMany by institutionId and returns 404 on 0 affected rows", async () => {
      let capturedWhere: any = null;
      (db.attendanceRecord as any).findFirst = async ({ where }: any) =>
        where?.id === "att-1" && where?.institutionId === INST_A
          ? { id: "att-1", studentId: STU_A, status: "ABSENT", remarks: "", student: { fullName: "Student A", firstName: "Student" } }
          : null;
      (db.attendanceRecord as any).updateMany = async ({ where }: any) => {
        capturedWhere = where;
        return { count: 0 };
      };
      (db.auditLog as any).create = async () => ({});

      const res = await attendancePost(
        await makeReq("http://localhost/api/admin/attendance", "POST", {
          recordId: "att-1",
          status: "PRESENT",
        })
      );
      assert.strictEqual(res.status, 404);
      assert.deepStrictEqual(capturedWhere, { id: "att-1", institutionId: INST_A });
    });

    await check("4. DELETE /api/admin/ia scopes assessmentRecord deletion by institutionId and returns 404 for foreign IDs", async () => {
      (db.assessmentRecord as any).findFirst = async () => null;
      (db.approvalRequest as any).findFirst = async () => null;
      const foreignRes = await iaDelete(await makeReq("http://localhost/api/admin/ia?id=foreign-ia-1", "DELETE"));
      assert.strictEqual(foreignRes.status, 404);

      let capturedDeleteWhere: any = null;
      (db.assessmentRecord as any).findFirst = async () => ({ id: "ia-1", assessmentName: "" });
      (db.assessmentRecord as any).deleteMany = async ({ where }: any) => {
        capturedDeleteWhere = where;
        return { count: 1 };
      };
      const okRes = await iaDelete(await makeReq("http://localhost/api/admin/ia?id=ia-1", "DELETE"));
      assert.strictEqual(okRes.status, 200);
      assert.deepStrictEqual(capturedDeleteWhere, { id: "ia-1", institutionId: INST_A });
    });

    await check("5. deleteDivisionMembership scopes deleteMany by institutionId and rejects when 0 rows deleted", async () => {
      (db.divisionMembership as any).findFirst = async () => ({ id: "dm-1", institutionId: INST_A });
      let capturedWhere: any = null;
      (db.divisionMembership as any).deleteMany = async ({ where }: any) => {
        capturedWhere = where;
        return { count: 0 };
      };

      await assert.rejects(
        () => deleteDivisionMembership(INST_A, "dm-1"),
        /not found in this institution/i
      );
      assert.deepStrictEqual(capturedWhere, { id: "dm-1", institutionId: INST_A });
    });
  } finally {
    (db.user as any).findUnique = orig.userFindUnique;
    (db.platformUser as any).findMany = orig.platformUserFindMany;
    (db.institutionMembership as any).findFirst = orig.instMembershipFindFirst;
    (db.userRoleAssignment as any).findMany = orig.uraFindMany;
    (db.institution as any).findUnique = orig.instFindUnique;
    (db.institutionSubscription as any).findFirst = orig.subFindFirst;
    (db.institutionSubscription as any).findMany = orig.subFindMany;
    (db.promotionBatch as any).findFirst = orig.promoFindFirst;
    (db.student as any).findMany = orig.studentFindMany;
    (db as any).$transaction = orig.transaction;
    (db.attendanceRecord as any).findFirst = orig.attFindFirst;
    (db.attendanceRecord as any).updateMany = orig.attUpdateMany;
    (db.auditLog as any).create = orig.auditCreate;
    (db.assessmentRecord as any).findFirst = orig.iaFindFirst;
    (db.assessmentRecord as any).deleteMany = orig.iaDeleteMany;
    (db.approvalRequest as any).findFirst = orig.aprFindFirst;
    (db.divisionMembership as any).findFirst = orig.divMemFindFirst;
    (db.divisionMembership as any).deleteMany = orig.divMemDeleteMany;
  }

  console.log(`\n=== RESULTS: ${passCount} / ${totalCount} CHECKS PASSED ===\n`);
}

main();
