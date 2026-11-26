/**
 * SST-ERP Phase 3: PII Minimization & Explicit RBAC Verification Suite
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
import { DEPARTMENTAL_ROLES } from "../lib/security/rbac";
import { getFeeInvoices, getIssuedCertificates } from "../lib/services/institution-admin.service";
import { GET as attendanceGet, POST as attendancePost } from "../app/api/admin/attendance/route";
import {
  GET as certificatesGet,
  POST as certificatesPost,
  PUT as certificatesPut,
} from "../app/api/admin/certificates/route";

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
const DEPT_USER_ID = "usr_dept_legacy_01";
const PW_HASH = "$2a$10$mockhashvalue";

async function makeReq(url: string, method: string, role: string, userId: string, body?: any) {
  const token = await signToken({
    userId,
    email: `${role.toLowerCase()}@inst.edu`,
    fullName: "Test User",
    role: role as any,
    institutionId: INST_A,
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
  console.log("\n=== SST-ERP Phase 3: PII Minimization & Explicit RBAC Suite ===\n");

  const orig = {
    feeFindMany: db.feeInvoice.findMany,
    certFindMany: db.issuedCertificate.findMany,
    certFindFirst: db.issuedCertificate.findFirst,
    certCreate: db.issuedCertificate.create,
    certUpdateMany: db.issuedCertificate.updateMany,
    certCount: db.issuedCertificate.count,
    tmplFindFirst: db.certificateTemplate.findFirst,
    tmplFindMany: db.certificateTemplate.findMany,
    attFindMany: db.attendanceRecord.findMany,
    attFindFirst: db.attendanceRecord.findFirst,
    attUpdate: db.attendanceRecord.update,
    auditCreate: db.auditLog.create,
    userFindUnique: db.user.findUnique,
    uraFindMany: db.userRoleAssignment.findMany,
    instFindUnique: db.institution.findUnique,
    subFindFirst: db.institutionSubscription.findFirst,
    platformUserFindMany: db.platformUser.findMany,
    instMembershipFindFirst: db.institutionMembership.findFirst,
    queryRaw: db.$queryRaw,
  };

  let actorRole = "INSTITUTION_ADMIN";

  function installAuthMocks() {
    (db.platformUser as any).findMany = async () => [{ id: "plat_admin_1" }];
    (db.institutionMembership as any).findFirst = async () => ({ id: "m1" });
    (db.institution as any).findUnique = async () => ({
      id: INST_A,
      name: "Test Inst",
      slug: "test-inst",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: new Date(Date.now() + 86400000),
      isActive: true,
      status: "ACTIVE",
    });
    (db.institutionSubscription as any).findFirst = async () => ({
      id: "sub_1",
      institutionId: INST_A,
      status: "ACTIVE",
      isTrial: false,
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 86400000),
      plan: { name: "Pro", code: "PRO", priceMonthly: 1000, currency: "INR" },
    });
    (db.user as any).findUnique = async ({ where }: any) => {
      if (where?.id === ADMIN_USER_ID) {
        return {
          id: ADMIN_USER_ID,
          isActive: true,
          status: "ACTIVE",
          passwordHash: PW_HASH,
          institutionId: INST_A,
          role: "INSTITUTION_ADMIN",
        };
      }
      if (where?.id === DEPT_USER_ID) {
        return {
          id: DEPT_USER_ID,
          isActive: true,
          status: "ACTIVE",
          passwordHash: PW_HASH,
          institutionId: INST_A,
          role: actorRole,
        };
      }
      return null;
    };
    (db.userRoleAssignment as any).findMany = async () => [];
    (db as any).$queryRaw = async (strings: TemplateStringsArray) => {
      if (strings.join(" ").includes("InstitutionMembership")) {
        return [{ id: "m1", status: "ACTIVE" }];
      }
      return [];
    };
  }

  try {
    await check("1. getFeeInvoices restricts student select and excludes sensitive PII while preserving items/payments", async () => {
      let capturedArgs: any = null;
      (db.feeInvoice as any).findMany = async (args: any) => {
        capturedArgs = args;
        return [
          {
            id: "inv-1",
            invoiceNumber: "INV-2026-00001",
            totalAmount: 50000,
            paidAmount: 25000,
            outstandingAmount: 25000,
            status: "PARTIAL",
            dueDate: new Date("2026-12-01"),
            student: {
              id: "stu-1",
              fullName: "Aarav Sharma",
              rollNumber: "CS2026001",
              admissionNumber: "ADM-001",
            },
            items: [{ id: "item-1", description: "Tuition", amount: 50000 }],
            payments: [{ id: "pay-1", amount: 25000, receipt: { id: "rec-1", receiptNumber: "RCPT-1" } }],
          },
        ];
      };

      const invoices = await getFeeInvoices(INST_A);
      assert.strictEqual(capturedArgs.include.student === true, false, "Must not use student: true");
      assert.deepStrictEqual(capturedArgs.include.student.select, {
        id: true,
        fullName: true,
        rollNumber: true,
        admissionNumber: true,
      });
      assert.strictEqual(capturedArgs.include.items, true);
      assert.deepStrictEqual(capturedArgs.include.payments, { include: { receipt: true } });

      const s = invoices[0].student as any;
      assert.strictEqual(s.fullName, "Aarav Sharma");
      assert.strictEqual(s.email, undefined);
      assert.strictEqual(s.phone, undefined);
      assert.strictEqual(s.dob, undefined);
      assert.strictEqual(s.addressLine, undefined);
      assert.strictEqual(s.guardianEmail, undefined);
      assert.strictEqual(s.guardianPhone, undefined);
    });

    await check("2. getIssuedCertificates returns UI-required student fields and excludes sensitive PII", async () => {
      let capturedArgs: any = null;
      (db.issuedCertificate as any).findMany = async (args: any) => {
        capturedArgs = args;
        return [
          {
            id: "cert-1",
            studentId: "stu-1",
            certificateNumber: "CERT-2026-00001",
            student: {
              id: "stu-1",
              firstName: "Aarav",
              lastName: "Sharma",
              fullName: "Aarav Sharma",
              rollNumber: "CS2026001",
              currentCourse: { name: "B.Tech CSE" },
            },
            template: { id: "tmpl-1", name: "Bonafide" },
          },
        ];
      };

      const issued = await getIssuedCertificates(INST_A);
      assert.strictEqual(capturedArgs.include.student === true, false, "Must not use student: true");
      assert.deepStrictEqual(capturedArgs.include.student.select, {
        id: true,
        firstName: true,
        lastName: true,
        fullName: true,
        rollNumber: true,
        currentCourse: { select: { name: true } },
      });
      const s = issued[0].student as any;
      assert.strictEqual(s.firstName, "Aarav");
      assert.strictEqual(s.currentCourse.name, "B.Tech CSE");
      assert.strictEqual(s.email, undefined);
      assert.strictEqual(s.phone, undefined);
      assert.strictEqual(s.dob, undefined);
      assert.strictEqual(s.addressLine, undefined);
      assert.strictEqual(s.guardianPhone, undefined);
    });

    await check("3. POST /api/admin/certificates omits student relation from query/response and preserves contract", async () => {
      installAuthMocks();
      let capturedCreateArgs: any = null;
      (db.certificateTemplate as any).findFirst = async () => ({ id: "tmpl-1", name: "Bonafide" });
      (db.issuedCertificate as any).count = async () => 0;
      (db.issuedCertificate as any).create = async (args: any) => {
        capturedCreateArgs = args;
        return {
          id: "cert-new",
          ...args.data,
          template: { id: "tmpl-1", name: "Bonafide" },
        };
      };

      const req = await makeReq("http://localhost/api/admin/certificates", "POST", "INSTITUTION_ADMIN", ADMIN_USER_ID, {
        studentId: "stu-1",
        certificateType: "BONAFIDE",
        title: "Bonafide Certificate",
      });
      const res = await certificatesPost(req);
      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.match(json.message, /issued successfully/i);
      assert.strictEqual(capturedCreateArgs.include.student, undefined, "Must not include student relation in POST create");
      assert.strictEqual(json.data.student, undefined, "POST response must not expose Student PII");
    });

    await check("4. GET /api/admin/certificates?query= narrows student select while preserving verification output", async () => {
      installAuthMocks();
      let capturedFindFirst: any = null;
      (db.issuedCertificate as any).findFirst = async (args: any) => {
        capturedFindFirst = args;
        return {
          id: "cert-1",
          certificateNumber: "CERT-2026-00001",
          verificationCode: "VER-1",
          certificateType: "BONAFIDE",
          title: "Bonafide",
          studentId: "stu-1",
          issuedAt: new Date("2026-11-26T00:00:00Z"),
          status: "ACTIVE",
          student: { firstName: "Aarav", lastName: "Sharma", rollNumber: "CS2026001" },
          template: { id: "tmpl-1", name: "Bonafide" },
        };
      };

      const req = await makeReq(
        "http://localhost/api/admin/certificates?query=CERT-2026-00001",
        "GET",
        "INSTITUTION_ADMIN",
        ADMIN_USER_ID
      );
      const res = await certificatesGet(req);
      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(capturedFindFirst.include.student.select, {
        firstName: true,
        lastName: true,
        rollNumber: true,
      });
      assert.strictEqual(json.data.certificate.studentName, "Aarav Sharma");
      assert.strictEqual(json.data.certificate.studentRoll, "CS2026001");
    });

    await check("5. Departmental roles receive 403 on all attendance and certificate handlers; Institution Admin retains access", async () => {
      installAuthMocks();
      (db.attendanceRecord as any).findMany = async () => [];
      (db.attendanceRecord as any).findFirst = async () => ({
        id: "att-1",
        studentId: "stu-1",
        status: "ABSENT",
        remarks: "",
        student: { fullName: "Aarav Sharma", firstName: "Aarav" },
      });
      (db.attendanceRecord as any).update = async () => ({ id: "att-1", status: "PRESENT" });
      (db.auditLog as any).create = async () => ({});
      (db.certificateTemplate as any).findMany = async () => [];
      (db.issuedCertificate as any).findMany = async () => [];
      (db.issuedCertificate as any).updateMany = async () => ({ count: 1 });

      for (const role of DEPARTMENTAL_ROLES) {
        actorRole = role;
        assert.strictEqual(
          (await attendanceGet(await makeReq("http://localhost/api/admin/attendance", "GET", role, DEPT_USER_ID))).status,
          403
        );
        assert.strictEqual(
          (
            await attendancePost(
              await makeReq("http://localhost/api/admin/attendance", "POST", role, DEPT_USER_ID, {
                recordId: "att-1",
                status: "PRESENT",
              })
            )
          ).status,
          403
        );
        assert.strictEqual(
          (await certificatesGet(await makeReq("http://localhost/api/admin/certificates", "GET", role, DEPT_USER_ID))).status,
          403
        );
        assert.strictEqual(
          (
            await certificatesPost(
              await makeReq("http://localhost/api/admin/certificates", "POST", role, DEPT_USER_ID, {
                studentId: "stu-1",
              })
            )
          ).status,
          403
        );
        assert.strictEqual(
          (
            await certificatesPut(
              await makeReq("http://localhost/api/admin/certificates", "PUT", role, DEPT_USER_ID, {
                id: "cert-1",
                status: "REVOKED",
              })
            )
          ).status,
          403
        );
      }

      // Institution Admin succeeds on all handlers
      let attFindFirstArgs: any = null;
      (db.attendanceRecord as any).findFirst = async (args: any) => {
        attFindFirstArgs = args;
        return {
          id: "att-1",
          studentId: "stu-1",
          status: "ABSENT",
          remarks: "",
          student: { fullName: "Aarav Sharma", firstName: "Aarav" },
        };
      };

      assert.strictEqual(
        (await attendanceGet(await makeReq("http://localhost/api/admin/attendance", "GET", "INSTITUTION_ADMIN", ADMIN_USER_ID))).status,
        200
      );
      assert.strictEqual(
        (
          await attendancePost(
            await makeReq("http://localhost/api/admin/attendance", "POST", "INSTITUTION_ADMIN", ADMIN_USER_ID, {
              recordId: "att-1",
              status: "PRESENT",
              reason: "Medical note",
            })
          )
        ).status,
        200
      );
      assert.deepStrictEqual(attFindFirstArgs.include.student.select, {
        fullName: true,
        firstName: true,
      });

      assert.strictEqual(
        (await certificatesGet(await makeReq("http://localhost/api/admin/certificates", "GET", "INSTITUTION_ADMIN", ADMIN_USER_ID))).status,
        200
      );
      assert.strictEqual(
        (
          await certificatesPut(
            await makeReq("http://localhost/api/admin/certificates", "PUT", "INSTITUTION_ADMIN", ADMIN_USER_ID, {
              id: "cert-1",
              status: "REVOKED",
            })
          )
        ).status,
        200
      );
    });
  } finally {
    (db.feeInvoice as any).findMany = orig.feeFindMany;
    (db.issuedCertificate as any).findMany = orig.certFindMany;
    (db.issuedCertificate as any).findFirst = orig.certFindFirst;
    (db.issuedCertificate as any).create = orig.certCreate;
    (db.issuedCertificate as any).updateMany = orig.certUpdateMany;
    (db.issuedCertificate as any).count = orig.certCount;
    (db.certificateTemplate as any).findFirst = orig.tmplFindFirst;
    (db.certificateTemplate as any).findMany = orig.tmplFindMany;
    (db.attendanceRecord as any).findMany = orig.attFindMany;
    (db.attendanceRecord as any).findFirst = orig.attFindFirst;
    (db.attendanceRecord as any).update = orig.attUpdate;
    (db.auditLog as any).create = orig.auditCreate;
    (db.user as any).findUnique = orig.userFindUnique;
    (db.userRoleAssignment as any).findMany = orig.uraFindMany;
    (db.institution as any).findUnique = orig.instFindUnique;
    (db.institutionSubscription as any).findFirst = orig.subFindFirst;
    (db.platformUser as any).findMany = orig.platformUserFindMany;
    (db.institutionMembership as any).findFirst = orig.instMembershipFindFirst;
    (db as any).$queryRaw = orig.queryRaw;
  }

  console.log(`\n=== RESULTS: ${passCount} / ${totalCount} CHECKS PASSED ===\n`);
}

main();
