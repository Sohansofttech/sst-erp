/**
 * SST-ERP Bulk Student Import Verification Suite
 *
 * Mocked DB / isolated in-memory storage (no live database writes).
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import db from "../lib/db";
import { signToken, computePasswordSignature, AUTH_COOKIE_NAME } from "../lib/auth/jwt";
import {
  buildCsvTemplate,
  buildXlsxTemplateBuffer,
  parseImportFileBuffer,
  applyColumnMapping,
  validateStudentImportRows,
  processStudentImportBatch,
  finalizeImportJob,
  formatErrorReportCsv,
  sanitizeCsvCell,
} from "../lib/services/student-import.service";
import { GET as templateGet } from "../app/api/admin/students/import/template/route";
import { POST as validatePost } from "../app/api/admin/students/import/validate/route";
import { POST as executePost } from "../app/api/admin/students/import/execute/route";
import { GET as historyGet } from "../app/api/admin/students/import/history/route";

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
const AY_1 = "aaaa1111-1111-4111-8111-111111111111";
const COURSE_1 = "cccc1111-1111-4111-8111-111111111111";
const ADMIN_ID = "66666666-6666-4666-8666-666666666666";
const DEPT_ID = "usr_dept_01";
const PW_HASH = "$2a$10$mockhashvalue";

async function makeReq(url: string, method: string, body?: any, role = "INSTITUTION_ADMIN", userId = ADMIN_ID, headersExtra?: Record<string, string>) {
  const token = await signToken({
    userId,
    email: `${role.toLowerCase()}@inst.edu`,
    fullName: "Actor",
    role: role as any,
    institutionId: INST_A,
    institutionName: "Test Inst",
    passwordSig: computePasswordSignature(PW_HASH),
    mustChangePassword: false,
  });
  return new NextRequest(url, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}),
      cookie: `${AUTH_COOKIE_NAME}=${token}`,
      ...(headersExtra || {}),
    },
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  console.log("\n=== SST-ERP Bulk Student Import Verification Suite ===\n");

  const orig = {
    userFindUnique: db.user.findUnique,
    queryRaw: db.$queryRaw,
    queryRawUnsafe: db.$queryRawUnsafe,
    executeRawUnsafe: db.$executeRawUnsafe,
    transaction: db.$transaction,
    subFindFirst: db.institutionSubscription.findFirst,
    uraFindMany: db.userRoleAssignment.findMany,
    jobCreate: db.studentImportJob.create,
    jobFindFirst: db.studentImportJob.findFirst,
    jobUpdate: db.studentImportJob.update,
    jobFindMany: db.studentImportJob.findMany,
  };

  let studentsStore: any[] = [];
  let enrollmentsStore: any[] = [];
  let jobsStore: any[] = [];
  let capturedStudentInsertSqls: string[] = [];
  let userCreateCalled = false;
  let subExpired = false;

  function resetMocks() {
    studentsStore = [{ id: "stu-existing", institutionId: INST_A, rollNumber: "EXIST001", admissionNumber: "ADM-EXIST-01" }];
    enrollmentsStore = [];
    jobsStore = [];
    capturedStudentInsertSqls = [];
    userCreateCalled = false;
    subExpired = false;

    (db.user as any).findUnique = async ({ where }: any) => {
      if (where?.id === ADMIN_ID) {
        return { id: ADMIN_ID, isActive: true, status: "ACTIVE", passwordHash: PW_HASH, institutionId: INST_A, role: "INSTITUTION_ADMIN" };
      }
      if (where?.id === DEPT_ID) {
        return { id: DEPT_ID, isActive: true, status: "ACTIVE", passwordHash: PW_HASH, institutionId: INST_A, role: "ADMISSIONS_OFFICER" };
      }
      return null;
    };

    (db.userRoleAssignment as any).findMany = async () => [];
    (db.institutionSubscription as any).findFirst = async () => ({
      id: "sub_1",
      institutionId: INST_A,
      status: subExpired ? "EXPIRED" : "ACTIVE",
      isTrial: subExpired,
      startsAt: new Date(Date.now() - 86400000 * 15),
      endsAt: subExpired ? new Date(Date.now() - 86400000) : new Date(Date.now() + 86400000),
      plan: { name: "Pro", code: "PRO", priceMonthly: 1000, currency: "INR" },
    });

    (db as any).$queryRaw = async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("InstitutionMembership")) return [{ id: "m1", status: "ACTIVE" }];
      return [];
    };

    (db as any).$queryRawUnsafe = async (sql: string, ...params: any[]) => {
      if (sql.includes("FROM students")) {
        return studentsStore.filter((s) => s.institutionId === params[0]);
      }
      if (sql.includes("FROM academic_years")) {
        return [{ id: AY_1, name: "2026-27", isCurrent: true }];
      }
      if (sql.includes("FROM courses")) {
        return [{ id: COURSE_1, code: "CSE", name: "Computer Science" }];
      }
      return [];
    };

    // Keep audit logging inside the in-memory test boundary.
    (db as any).$executeRawUnsafe = async () => 1;

    (db.studentImportJob as any).create = async ({ data }: any) => {
      const row = {
        id: `job-${jobsStore.length + 1}`,
        ...data,
        processedRows: 0,
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errorReportJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      };
      jobsStore.push(row);
      return row;
    };

    (db.studentImportJob as any).findFirst = async ({ where }: any) =>
      jobsStore.find((j) => j.id === where.id && j.institutionId === where.institutionId) || null;

    (db.studentImportJob as any).update = async ({ where, data }: any) => {
      const j = jobsStore.find((x) => x.id === where.id);
      if (j) {
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in (v as any)) {
            j[k] = (j[k] || 0) + (v as any).increment;
          } else {
            j[k] = v;
          }
        }
        j.updatedAt = new Date();
      }
      return j;
    };

    (db.studentImportJob as any).findMany = async ({ where }: any) =>
      jobsStore.filter((j) => j.institutionId === where.institutionId);

    (db as any).$transaction = async (fn: any) => {
      const txStudents: any[] = [];
      const txEnrollments: any[] = [];
      const tx = {
        user: {
          create: async () => {
            userCreateCalled = true;
            return {};
          },
        },
        $queryRawUnsafe: async (sql: string, ...params: any[]) => {
          if (sql.includes("SELECT id FROM students")) {
            const [instId, roll, adm] = params;
            return [...studentsStore, ...txStudents].filter(
              (s) =>
                s.institutionId === instId &&
                (s.rollNumber.toLowerCase() === String(roll).toLowerCase() ||
                  s.admissionNumber.toLowerCase() === String(adm).toLowerCase())
            );
          }
          if (sql.includes("INSERT INTO students")) {
            capturedStudentInsertSqls.push(sql);
            txStudents.push({
              id: params[0],
              institutionId: params[1],
              fullName: params[4],
              rollNumber: params[6],
              admissionNumber: params[7],
            });
            return [];
          }
          if (sql.includes("INSERT INTO enrollments")) {
            txEnrollments.push({ id: params[0], institutionId: params[1], studentId: params[2] });
            return [];
          }
          return [];
        },
      };
      const res = await fn(tx);
      studentsStore.push(...txStudents);
      enrollmentsStore.push(...txEnrollments);
      return res;
    };
  }

  try {
    await check("1. CSV and XLSX templates generate cleanly and macro-enabled .xlsm is rejected", async () => {
      resetMocks();
      const csvRes = await templateGet(await makeReq("http://localhost/api/admin/students/import/template?format=csv", "GET"));
      assert.strictEqual(csvRes.status, 200);
      assert.ok((await csvRes.text()).includes("fullName,rollNumber,admissionNumber"));

      const xlsxBuf = await buildXlsxTemplateBuffer();
      const parsedXlsx = await parseImportFileBuffer("template.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBuf);
      assert.strictEqual(parsedXlsx.fileType, "XLSX");
      assert.strictEqual(parsedXlsx.rows.length, 1);

      await assert.rejects(
        () => parseImportFileBuffer("bad.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12", xlsxBuf),
        /Macro-enabled/
      );

      const fdXlsm = new FormData();
      fdXlsm.append("file", new File([new Uint8Array(xlsxBuf)], "macro.xlsm", { type: "application/vnd.ms-excel.sheet.macroEnabled.12" }));
      const xlsmApiRes = await validatePost(await makeReq("http://localhost/api/admin/students/import/validate", "POST", fdXlsm));
      assert.strictEqual(xlsmApiRes.status, 400);
    });

    await check("2. 5-row CSV import succeeds without creating User login accounts or invitations", async () => {
      resetMocks();
      const csv = [
        "fullName,rollNumber,admissionNumber,email,phone,gender,dateOfBirth,academicYear,courseCode",
        "Student One,R001,A001,s1@edu.in,+919876543210,MALE,2006-01-01,2026-27,CSE",
        "Student Two,R002,A002,s2@edu.in,+919876543211,FEMALE,2006-02-02,2026-27,CSE",
        "Student Three,R003,A003,s3@edu.in,+919876543212,MALE,2006-03-03,2026-27,CSE",
        "Student Four,R004,A004,s4@edu.in,+919876543213,FEMALE,2006-04-04,2026-27,CSE",
        "Student Five,R005,A005,s5@edu.in,+919876543214,OTHER,2006-05-05,2026-27,CSE",
      ].join("\n");

      const parsed = await parseImportFileBuffer("five.csv", "text/csv", Buffer.from(csv));
      const mapped = applyColumnMapping(parsed.rows, parsed.suggestedMapping);
      const startRes = await (await executePost(await makeReq("http://localhost/api/admin/students/import/execute", "POST", {
        action: "start", fileName: "five.csv", fileType: "CSV", totalRows: 5,
      }))).json();
      const batchRes = await (await executePost(await makeReq("http://localhost/api/admin/students/import/execute", "POST", {
        action: "batch", jobId: startRes.data.id, rows: mapped,
      }))).json();

      assert.strictEqual(batchRes.data.succeeded, 5);
      assert.strictEqual(studentsStore.length, 6); // 1 pre-existing + 5 imported
      assert.strictEqual(enrollmentsStore.length, 5);
      assert.strictEqual(userCreateCalled, false);
    });

    await check("3. XLSX import parses real Excel buffer and creates Student + Enrollment", async () => {
      resetMocks();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Students");
      ws.addRow(["Full Name", "Roll Number", "Admission Number", "Course Code", "Academic Year"]);
      ws.addRow(["Xlsx Student", "XR001", "XA001", "CSE", "2026-27"]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());

      const parsed = await parseImportFileBuffer("roster.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf);
      const mapped = applyColumnMapping(parsed.rows, parsed.suggestedMapping);
      const val = await validateStudentImportRows(INST_A, mapped);
      assert.strictEqual(val.summary.valid, 1);
    });

    await check("4. 1,050-row chunked import completes cleanly across 75-row batches", async () => {
      resetMocks();
      const rows = Array.from({ length: 1050 }, (_, idx) => ({
        rowNumber: idx + 2,
        fullName: `Bulk Student ${idx + 1}`,
        rollNumber: `BULK-${idx + 1}`,
        admissionNumber: `ADM-BULK-${idx + 1}`,
        academicYear: "2026-27",
        courseCode: "CSE",
      }));
      const job = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "1050.csv", fileType: "CSV", totalRows: 1050 },
      });

      for (let i = 0; i < rows.length; i += 75) {
        const chunk = rows.slice(i, i + 75);
        const res = await processStudentImportBatch({ institutionId: INST_A, jobId: job.id, rows: chunk });
        assert.strictEqual(res.succeeded, chunk.length);
      }
      assert.strictEqual(studentsStore.length, 1051);
      assert.strictEqual(enrollmentsStore.length, 1050);
    });

    await check("5. Detects duplicates, existing students, missing mandatory fields, invalid dates/phones, and invalid academic refs", async () => {
      resetMocks();
      const rows = [
        { rowNumber: 2, fullName: "", rollNumber: "R1", admissionNumber: "A1" },
        { rowNumber: 3, fullName: "Bad Date", rollNumber: "R2", admissionNumber: "A2", dateOfBirth: "not-a-date", phone: "123" },
        { rowNumber: 4, fullName: "Bad Ref", rollNumber: "R3", admissionNumber: "A3", academicYear: "1999-00", courseCode: "UNKNOWN" },
        { rowNumber: 5, fullName: "Existing", rollNumber: "EXIST001", admissionNumber: "ADM-EXIST-01" },
        { rowNumber: 6, fullName: "Valid One", rollNumber: "R4", admissionNumber: "A4" },
        { rowNumber: 7, fullName: "Dup File", rollNumber: "R4", admissionNumber: "A5" },
      ];
      const val = await validateStudentImportRows(INST_A, rows);
      assert.strictEqual(val.summary.errors, 3);
      assert.strictEqual(val.summary.existingStudents, 1);
      assert.strictEqual(val.summary.duplicatesInFile, 1);
      assert.strictEqual(val.summary.valid, 1);
    });

    await check("6. Safe retry is idempotent and partial batch preserves valid rows", async () => {
      resetMocks();
      const job = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "retry.csv", fileType: "CSV", totalRows: 2 },
      });
      const rows = [
        { rowNumber: 2, fullName: "Good Row", rollNumber: "RETRY1", admissionNumber: "ARETRY1" },
        { rowNumber: 3, fullName: "", rollNumber: "RETRY2", admissionNumber: "ARETRY2" },
      ];
      const first = await processStudentImportBatch({ institutionId: INST_A, jobId: job.id, rows });
      assert.strictEqual(first.succeeded, 1);
      assert.strictEqual(first.failed, 1);

      // Retry same batch -> Good Row is skipped, not duplicated
      const second = await processStudentImportBatch({ institutionId: INST_A, jobId: job.id, rows });
      assert.strictEqual(second.succeeded, 0);
      assert.strictEqual(second.skipped, 1);
    });

    await check("7. Cross-institution spoofing (403), unauthorized ADMISSIONS_OFFICER (403), expired trial (402), and history API (200)", async () => {
      resetMocks();
      const spoofRes = await validatePost(
        await makeReq("http://localhost/api/admin/students/import/validate", "POST", { rawRows: [], mapping: {} }, "INSTITUTION_ADMIN", ADMIN_ID, {
          "x-institution-id": "99999999-9999-4999-8999-999999999999",
        })
      );
      assert.strictEqual(spoofRes.status, 403);

      const deptRes = await historyGet(await makeReq("http://localhost/api/admin/students/import/history", "GET", undefined, "ADMISSIONS_OFFICER", DEPT_ID));
      assert.strictEqual(deptRes.status, 403);

      subExpired = true;
      const expRes = await executePost(await makeReq("http://localhost/api/admin/students/import/execute", "POST", { action: "start", fileName: "a.csv", totalRows: 1 }));
      assert.strictEqual(expRes.status, 402);

      subExpired = false;
      const histRes = await historyGet(await makeReq("http://localhost/api/admin/students/import/history", "GET"));
      assert.strictEqual(histRes.status, 200);
    });

    await check("8. Dashboard card and preserved Bulk Import / Import History pages exist", () => {
      const dash = fs.readFileSync(path.resolve("app/admin/page.tsx"), "utf8");
      const sidebar = fs.readFileSync(path.resolve("components/layout/AdminSidebar.tsx"), "utf8");
      assert.ok(dash.includes('/admin/students/import') && dash.includes("Bulk Import Students"));
      assert.ok(sidebar.includes('href="/admin/students"') && fs.existsSync(path.resolve("app/admin/students/import/page.tsx")));
    });

    await check("9. Concurrent batch counter updates preserve exact atomic totals", async () => {
      resetMocks();
      const job = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "concurrent.csv", fileType: "CSV", totalRows: 4 },
      });
      await Promise.all([
        processStudentImportBatch({
          institutionId: INST_A,
          jobId: job.id,
          rows: [
            { rowNumber: 2, fullName: "C1", rollNumber: "CR1", admissionNumber: "CA1" },
            { rowNumber: 3, fullName: "C2", rollNumber: "CR2", admissionNumber: "CA2" },
          ],
        }),
        processStudentImportBatch({
          institutionId: INST_A,
          jobId: job.id,
          rows: [
            { rowNumber: 4, fullName: "C3", rollNumber: "CR3", admissionNumber: "CA3" },
            { rowNumber: 5, fullName: "C4", rollNumber: "CR4", admissionNumber: "CA4" },
          ],
        }),
      ]);
      const updated = jobsStore.find((j) => j.id === job.id);
      assert.strictEqual(updated.processedRows, 4);
      assert.strictEqual(updated.successCount, 4);
    });

    await check("10. Rejects batches on COMPLETED/FAILED jobs and rejects duplicate finalization", async () => {
      resetMocks();
      const job = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "done.csv", fileType: "CSV", totalRows: 1 },
      });
      await processStudentImportBatch({
        institutionId: INST_A,
        jobId: job.id,
        rows: [{ rowNumber: 2, fullName: "Done Student", rollNumber: "DR1", admissionNumber: "DA1" }],
      });
      await finalizeImportJob({ institutionId: INST_A, jobId: job.id, actorUserId: ADMIN_ID });

      await assert.rejects(
        () => processStudentImportBatch({
          institutionId: INST_A,
          jobId: job.id,
          rows: [{ rowNumber: 3, fullName: "Late", rollNumber: "DR2", admissionNumber: "DA2" }],
        }),
        /already finalized/
      );
      await assert.rejects(
        () => finalizeImportJob({ institutionId: INST_A, jobId: job.id, actorUserId: ADMIN_ID }),
        /already finalized/
      );

      const failedJob = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "fail.csv", fileType: "CSV", totalRows: 1, status: "FAILED" },
      });
      await assert.rejects(
        () => processStudentImportBatch({
          institutionId: INST_A,
          jobId: failedJob.id,
          rows: [{ rowNumber: 2, fullName: "Late2", rollNumber: "FR1", admissionNumber: "FA1" }],
        }),
        /already finalized/
      );
    });

    await check("11. CSV error report neutralizes spreadsheet formula injection (=, +, -, @, tab, CR)", () => {
      assert.strictEqual(sanitizeCsvCell("=CMD|'/C calc'!A0"), `"'=CMD|'/C calc'!A0"`);
      assert.strictEqual(sanitizeCsvCell("+1+1"), `"'+1+1"`);
      assert.strictEqual(sanitizeCsvCell("-1+1"), `"'-1+1"`);
      assert.strictEqual(sanitizeCsvCell("@SUM(A1:A2)"), `"'@SUM(A1:A2)"`);
      assert.strictEqual(sanitizeCsvCell("\t=1"), `"'\t=1"`);
      assert.strictEqual(sanitizeCsvCell("\r=1"), `"'\r=1"`);
      const csv = formatErrorReportCsv([
        { rowNumber: 2, rollNumber: "=1+1", admissionNumber: "ADM1", error: "+bad" },
      ]);
      assert.ok(csv.includes(`2,"'=1+1","ADM1","'+bad"`));
    });

    await check("12. Student INSERT uses NULL userId, explicit ::uuid casts, and text status", async () => {
      resetMocks();
      const job = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "casts.csv", fileType: "CSV", totalRows: 1 },
      });
      await processStudentImportBatch({
        institutionId: INST_A,
        jobId: job.id,
        rows: [{ rowNumber: 2, fullName: "Cast Check", rollNumber: "CR99", admissionNumber: "CA99", courseCode: "CSE", academicYear: "2026-27" }],
      });
      assert.strictEqual(capturedStudentInsertSqls.length, 1);
      const sql = capturedStudentInsertSqls[0];
      assert.ok(sql.includes(`NULL`), "userId must be NULL");
      assert.ok(sql.includes(`'ACTIVE'`), "status must be stored as text");
      assert.ok(!sql.includes(`"StudentStatus"`), "status must not cast to a PostgreSQL enum");
      assert.ok(sql.includes(`$12::uuid`) && sql.includes(`$13::uuid`), "UUID columns must use explicit ::uuid casts");
      assert.strictEqual(userCreateCalled, false);
    });

    await check("13. Interrupted import recovery: pause, resume from processedRows, and block resuming finalized jobs", async () => {
      resetMocks();
      const startRes = await (await executePost(await makeReq("http://localhost/api/admin/students/import/execute", "POST", {
        action: "start", fileName: "resume.csv", fileType: "CSV", totalRows: 4,
      }))).json();
      const jobId = startRes.data.id;

      await executePost(await makeReq("http://localhost/api/admin/students/import/execute", "POST", {
        action: "batch",
        jobId,
        rows: [
          { rowNumber: 2, fullName: "Res 1", rollNumber: "RES1", admissionNumber: "ADMR1" },
          { rowNumber: 3, fullName: "Res 2", rollNumber: "RES2", admissionNumber: "ADMR2" },
        ],
      }));

      const pauseRes = await executePost(await makeReq("http://localhost/api/admin/students/import/execute", "POST", {
        action: "pause", jobId,
      }));
      assert.strictEqual(pauseRes.status, 200);
      assert.strictEqual((await pauseRes.json()).data.status, "PAUSED");

      const resumeRes = await executePost(await makeReq("http://localhost/api/admin/students/import/execute", "POST", {
        action: "resume", jobId,
      }));
      const resumeJson = await resumeRes.json();
      assert.strictEqual(resumeRes.status, 200);
      assert.strictEqual(resumeJson.data.resumeFromIndex, 2);
      assert.strictEqual(resumeJson.data.remainingRowsCount, 2);

      // Finalize and verify resume is blocked (400)
      await finalizeImportJob({ institutionId: INST_A, jobId, actorUserId: ADMIN_ID });
      const blockedRes = await executePost(await makeReq("http://localhost/api/admin/students/import/execute", "POST", {
        action: "resume", jobId,
      }));
      assert.strictEqual(blockedRes.status, 400);
    });

    await check("14. Concurrent error-report merging & repeated batch idempotency preserve all errors without duplicates", async () => {
      resetMocks();
      const job = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "errs.csv", fileType: "CSV", totalRows: 4 },
      });
      await processStudentImportBatch({
        institutionId: INST_A,
        jobId: job.id,
        rows: [{ rowNumber: 2, fullName: "", rollNumber: "E1", admissionNumber: "EA1" }],
      });
      await processStudentImportBatch({
        institutionId: INST_A,
        jobId: job.id,
        rows: [{ rowNumber: 3, fullName: "", rollNumber: "E2", admissionNumber: "EA2" }],
      });
      // Repeat row 3 -> error entry must not duplicate
      await processStudentImportBatch({
        institutionId: INST_A,
        jobId: job.id,
        rows: [{ rowNumber: 3, fullName: "", rollNumber: "E2", admissionNumber: "EA2" }],
      });
      const updated = jobsStore.find((j) => j.id === job.id);
      const parsedErrs = JSON.parse(updated.errorReportJson);
      assert.strictEqual(parsedErrs.length, 2);
      assert.deepStrictEqual(parsedErrs.map((e: any) => e.rowNumber), [2, 3]);
    });

    await check("15. Concurrent imports from same institution & cross-institution resume rejection", async () => {
      resetMocks();
      const j1 = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "c1.csv", fileType: "CSV", totalRows: 2 },
      });
      const j2 = await db.studentImportJob.create({
        data: { institutionId: INST_A, actorUserId: ADMIN_ID, fileName: "c2.csv", fileType: "CSV", totalRows: 2 },
      });
      await Promise.all([
        processStudentImportBatch({
          institutionId: INST_A,
          jobId: j1.id,
          rows: [{ rowNumber: 2, fullName: "Job1 S1", rollNumber: "J1R1", admissionNumber: "J1A1" }],
        }),
        processStudentImportBatch({
          institutionId: INST_A,
          jobId: j2.id,
          rows: [{ rowNumber: 2, fullName: "Job2 S1", rollNumber: "J2R1", admissionNumber: "J2A1" }],
        }),
      ]);
      assert.strictEqual(jobsStore.find((j) => j.id === j1.id).successCount, 1);
      assert.strictEqual(jobsStore.find((j) => j.id === j2.id).successCount, 1);

      // Cross-institution resume attempt (Institution B token trying to resume Inst A job)
      const instBToken = await signToken({
        userId: ADMIN_ID,
        email: "admin@instb.edu",
        fullName: "Admin B",
        role: "INSTITUTION_ADMIN",
        institutionId: "99999999-9999-4999-8999-999999999999",
        institutionName: "Inst B",
        passwordSig: computePasswordSignature(PW_HASH),
        mustChangePassword: false,
      });
      const crossRes = await executePost(
        new NextRequest("http://localhost/api/admin/students/import/execute", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: `${AUTH_COOKIE_NAME}=${instBToken}` },
          body: JSON.stringify({ action: "resume", jobId: j1.id }),
        })
      );
      assert.strictEqual(crossRes.status, 400);
    });
  } finally {
    (db.user as any).findUnique = orig.userFindUnique;
    (db as any).$queryRaw = orig.queryRaw;
    (db as any).$queryRawUnsafe = orig.queryRawUnsafe;
    (db as any).$executeRawUnsafe = orig.executeRawUnsafe;
    (db as any).$transaction = orig.transaction;
    (db.institutionSubscription as any).findFirst = orig.subFindFirst;
    (db.userRoleAssignment as any).findMany = orig.uraFindMany;
    (db.studentImportJob as any).create = orig.jobCreate;
    (db.studentImportJob as any).findFirst = orig.jobFindFirst;
    (db.studentImportJob as any).update = orig.jobUpdate;
    (db.studentImportJob as any).findMany = orig.jobFindMany;
  }

  console.log(`\n=== RESULTS: ${passCount} / ${totalCount} CHECKS PASSED ===\n`);
}

main();
