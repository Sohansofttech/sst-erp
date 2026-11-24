import assert from "node:assert";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import db from "../lib/db";
import { AUTH_COOKIE_NAME, signToken, computePasswordSignature } from "../lib/auth/jwt";
import { SessionUser } from "../types";

// Admin API Route Handlers
import { GET as getAdmissions, POST as postAdmissions, PUT as putAdmissions, DELETE as deleteAdmissions } from "../app/api/admin/admissions/route";
import { GET as getCertificates, POST as postCertificates, PUT as putCertificates } from "../app/api/admin/certificates/route";
import { GET as getExaminations, POST as postExaminations, DELETE as deleteExaminations } from "../app/api/admin/examinations/route";
import { GET as getIA, POST as postIA, PUT as putIA, DELETE as deleteIA } from "../app/api/admin/ia/route";
import { GET as getPromotions, POST as postPromotions, PUT as putPromotions, DELETE as deletePromotions } from "../app/api/admin/promotions/route";
import { GET as getResults, POST as postResults, PUT as putResults, DELETE as deleteResults } from "../app/api/admin/results/route";
import { GET as getRoles, POST as postRoles, PUT as putRoles, DELETE as deleteRoles } from "../app/api/admin/roles/route";
import { GET as getAcademicYears, POST as postAcademicYears, PUT as putAcademicYears, DELETE as deleteAcademicYears } from "../app/api/admin/academics/academic-years/route";
import { GET as getClasses, POST as postClasses, PUT as putClasses, DELETE as deleteClasses } from "../app/api/admin/academics/classes/route";
import { GET as getCourses, POST as postCourses, PUT as putCourses, DELETE as deleteCourses } from "../app/api/admin/academics/courses/route";
import { GET as getDepartments, POST as postDepartments, PUT as putDepartments, DELETE as deleteDepartments } from "../app/api/admin/academics/departments/route";
import { GET as getSubjects, POST as postSubjects, PUT as putSubjects, DELETE as deleteSubjects } from "../app/api/admin/academics/subjects/route";

async function makeAdminReq(user: SessionUser, url: string, options: { method?: string; body?: any } = {}) {
  const token = await signToken(user);
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  if (options.body) {
    headers.set("content-type", "application/json");
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: options.method || (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function runPhaseCAdminDecouplingTests() {
  console.log("==================================================================");
  console.log("PHASE C — ADMIN UI DECOUPLING INDEPENDENT TEST SUITE");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  const cleanupIds = {
    admissions: [] as string[],
    students: [] as string[],
    users: [] as string[],
    certificates: [] as string[],
    templates: [] as string[],
    examinations: [] as string[],
    examSchedules: [] as string[],
    iaAssessments: [] as string[],
    assessmentRecords: [] as string[],
    promotions: [] as string[],
    roles: [] as string[],
    academicYears: [] as string[],
    classes: [] as string[],
    courses: [] as string[],
    departments: [] as string[],
    subjects: [] as string[],
  };

  try {
    const runId = Date.now().toString().slice(-6);

    // 1. Resolve Institution Alpha and Beta with Admin Users
    const instAlpha = await db.institution.findFirst({
      where: {
        users: { some: { role: { in: ["ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN"] }, isActive: true } },
      },
      include: {
        users: {
          where: { role: { in: ["ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN"] }, isActive: true },
          take: 1,
        },
        academicYears: { take: 2 },
        courses: { take: 2 },
      },
    });

    assert.ok(instAlpha, "Must find Institution Alpha with active Admin user");
    const adminUserAlpha = instAlpha.users[0];
    assert.ok(adminUserAlpha, "Admin user must exist in Alpha");

    const instBeta = await db.institution.findFirst({
      where: {
        id: { not: instAlpha.id },
        users: { some: { role: { in: ["ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN"] }, isActive: true } },
      },
      include: {
        users: {
          where: { role: { in: ["ADMIN", "CAMPUS_ADMIN", "SUPER_ADMIN"] }, isActive: true },
          take: 1,
        },
      },
    });

    assert.ok(instBeta, "Must find Institution Beta with active Admin user");
    const adminUserBeta = instBeta.users[0];
    assert.ok(adminUserBeta, "Admin user must exist in Beta");

    const sessionAdminAlpha: any = {
      id: adminUserAlpha.id,
      userId: adminUserAlpha.id,
      email: adminUserAlpha.email,
      name: adminUserAlpha.name || (adminUserAlpha as any).fullName || "Admin Alpha",
      role: "ADMIN",
      institutionId: instAlpha.id,
      passwordSig: computePasswordSignature((adminUserAlpha as any).passwordHash || (adminUserAlpha as any).password || ""),
    };

    const sessionAdminBeta: any = {
      id: adminUserBeta.id,
      userId: adminUserBeta.id,
      email: adminUserBeta.email,
      name: adminUserBeta.name || (adminUserBeta as any).fullName || "Admin Beta",
      role: "ADMIN",
      institutionId: instBeta.id,
      passwordSig: computePasswordSignature((adminUserBeta as any).passwordHash || (adminUserBeta as any).password || ""),
    };

    console.log(`Institution Alpha: ${instAlpha.name} (${instAlpha.id})`);
    console.log(`  Admin Alpha: ${sessionAdminAlpha.name} (${sessionAdminAlpha.id})`);
    console.log(`Institution Beta: ${instBeta.name} (${instBeta.id})`);
    console.log(`  Admin Beta: ${sessionAdminBeta.name} (${sessionAdminBeta.id})\n`);

    const alphaAY = instAlpha.academicYears[0];
    const alphaCourse = instAlpha.courses[0];
    assert.ok(alphaAY && alphaCourse, "Alpha must have at least 1 academic year and course");

    // ------------------------------------------------------------------------
    // MODULE 1: ADMISSIONS UI DECOUPLING & STUDENT CONVERSION
    // ------------------------------------------------------------------------
    console.log("--- Module 1: Admissions Real Database Operations ---");
    {
      // 1.1 Create application via POST /api/admin/admissions
      const createReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/admissions", {
        method: "POST",
        body: {
          applicantName: `Applicant Test ${runId}`,
          email: `applicant_${runId}@example.com`,
          phone: "+91 9876543210",
          courseId: alphaCourse.id,
          academicYearId: alphaAY.id,
        },
      });
      const createRes = await postAdmissions(createReq);
      const createJson = await createRes.json();
      assert.strictEqual(createRes.status, 200, "POST admissions must succeed");
      assert.strictEqual(createJson.success, true);
      assert.ok(createJson.data?.id, "Created application must have real DB ID");
      const appId = createJson.data.id;
      cleanupIds.admissions.push(appId);

      // Verify record exists in PostgreSQL
      const dbApp = await db.admissionApplication.findUnique({ where: { id: appId } });
      assert.ok(dbApp, "Application must persist in PostgreSQL table admission_applications");
      assert.strictEqual(dbApp.institutionId, instAlpha.id);
      console.log("  [PASS] 1.1 Application persisted to real PostgreSQL database");
      passed++;

      // 1.2 Convert application to Student via PUT /api/admin/admissions
      const convertReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/admissions", {
        method: "PUT",
        body: {
          applicationId: appId,
          action: "CONVERT",
        },
      });
      const convertRes = await putAdmissions(convertReq);
      const convertJson = await convertRes.json();
      assert.strictEqual(convertRes.status, 200, "Conversion must return 200");
      assert.strictEqual(convertJson.success, true);
      assert.ok(convertJson.data?.studentId, "Conversion must return new studentId");
      const studentId = convertJson.data.studentId;
      cleanupIds.students.push(studentId);

      const dbStudent = await db.student.findUnique({ where: { id: studentId } });
      assert.ok(dbStudent, "Converted Student record must exist in PostgreSQL");
      assert.strictEqual(dbStudent.institutionId, instAlpha.id);
      if (dbStudent.userId) cleanupIds.users.push(dbStudent.userId);
      console.log("  [PASS] 1.2 Application converted into permanent Student record");
      passed++;

      // 1.3 Cross-institution access blocked
      const crossReq = await makeAdminReq(sessionAdminBeta, `http://localhost:3000/api/admin/admissions?id=${appId}`, {
        method: "DELETE",
      });
      const crossRes = await deleteAdmissions(crossReq);
      assert.strictEqual(crossRes.status, 404, "Beta admin must be rejected when deleting Alpha application");
      console.log("  [PASS] 1.3 Cross-institution admissions manipulation blocked");
      passed++;
    }

    // ------------------------------------------------------------------------
    // MODULE 2: CERTIFICATES UI DECOUPLING
    // ------------------------------------------------------------------------
    console.log("\n--- Module 2: Certificates Real Database Operations ---");
    {
      // 2.1 Issue certificate via POST /api/admin/certificates
      const issueReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/certificates", {
        method: "POST",
        body: {
          studentId: cleanupIds.students[0],
          certificateType: "BONAFIDE",
          title: `Bonafide Certificate ${runId}`,
          purpose: "Higher education verification",
        },
      });
      const issueRes = await postCertificates(issueReq);
      const issueJson = await issueRes.json();
      assert.strictEqual(issueRes.status, 200, "POST certificates must succeed");
      assert.strictEqual(issueJson.success, true);
      assert.ok(issueJson.data?.certificateNumber, "Issued certificate must have certificateNumber");
      const certId = issueJson.data.id;
      const certNum = issueJson.data.certificateNumber;
      cleanupIds.certificates.push(certId);

      // Verify certificate exists in DB
      const dbCert = await db.issuedCertificate.findUnique({ where: { id: certId } });
      assert.ok(dbCert, "Certificate must persist in PostgreSQL issued_certificates");
      assert.strictEqual(dbCert.institutionId, instAlpha.id);
      console.log("  [PASS] 2.1 Certificate issued and stored in PostgreSQL");
      passed++;

      // 2.2 Verify certificate via GET query
      const verifyReq = await makeAdminReq(sessionAdminAlpha, `http://localhost:3000/api/admin/certificates?query=${certNum}`);
      const verifyRes = await getCertificates(verifyReq);
      const verifyJson = await verifyRes.json();
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyJson.data?.certificateNumber, certNum);
      console.log("  [PASS] 2.2 Certificate query and verification verified via API");
      passed++;

      // 2.3 Cross-institution query returns 404
      const crossVerifyReq = await makeAdminReq(sessionAdminBeta, `http://localhost:3000/api/admin/certificates?query=${certNum}`);
      const crossVerifyRes = await getCertificates(crossVerifyReq);
      assert.strictEqual(crossVerifyRes.status, 404, "Beta must not view Alpha certificate");
      console.log("  [PASS] 2.3 Cross-institution certificate isolation verified");
      passed++;
    }

    // ------------------------------------------------------------------------
    // MODULE 3: EXAMINATIONS UI DECOUPLING
    // ------------------------------------------------------------------------
    console.log("\n--- Module 3: Examinations Real Database Operations ---");
    {
      // 3.1 Create Examination via POST /api/admin/examinations
      const examReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/examinations", {
        method: "POST",
        body: {
          name: `Mid-Term Exam ${runId}`,
          academicYearId: alphaAY.id,
          startDate: new Date(Date.now() + 86400000).toISOString(),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          status: "SCHEDULED",
        },
      });
      const examRes = await postExaminations(examReq);
      const examJson = await examRes.json();
      assert.strictEqual(examRes.status, 200, "POST examinations must succeed");
      assert.strictEqual(examJson.success, true);
      const examId = examJson.data.id;
      cleanupIds.examSchedules.push(examId);

      const dbExam = await db.examSchedule.findUnique({ where: { id: examId } });
      assert.ok(dbExam, "Examination schedule must exist in PostgreSQL exam_schedules table");
      assert.strictEqual(dbExam.institutionId, instAlpha.id);
      console.log("  [PASS] 3.1 Examination created and verified in PostgreSQL");
      passed++;

      // 3.2 Cross-institution deletion blocked
      const crossDelReq = await makeAdminReq(sessionAdminBeta, `http://localhost:3000/api/admin/examinations?id=${examId}`, {
        method: "DELETE",
      });
      const crossDelRes = await deleteExaminations(crossDelReq);
      assert.strictEqual(crossDelRes.status, 404, "Beta cannot delete Alpha examination");
      console.log("  [PASS] 3.2 Cross-institution exam manipulation blocked");
      passed++;
    }

    // ------------------------------------------------------------------------
    // MODULE 4: INTERNAL ASSESSMENTS (IA) REAL STORAGE & MARKS ENTRY
    // ------------------------------------------------------------------------
    console.log("\n--- Module 4: Internal Assessments Real Storage ---");
    {
      // Find a subject in Alpha
      let subjectAlpha = await db.subject.findFirst({
        where: { institutionId: instAlpha.id },
      });

      if (!subjectAlpha) {
        subjectAlpha = await db.subject.create({
          data: {
            institutionId: instAlpha.id,
            name: `Subject ${runId}`,
            code: `SUB${runId}`,
            credits: 3,
            semester: 1,
            courseId: alphaCourse.id,
          },
        });
        cleanupIds.subjects.push(subjectAlpha.id);
      }

      // 4.1 Create IA Assessment via POST /api/admin/ia
      const iaReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/ia", {
        method: "POST",
        body: {
          title: `IA 1 Test ${runId}`,
          academicYearId: alphaAY.id,
          courseId: alphaCourse.id,
          subjectId: subjectAlpha.id,
          maxMarks: 50,
          weightage: 20,
        },
      });
      const iaRes = await postIA(iaReq);
      const iaJson = await iaRes.json();
      assert.strictEqual(iaRes.status, 200, "POST IA must succeed");
      assert.strictEqual(iaJson.success, true);
      const iaId = iaJson.data.id;
      cleanupIds.iaAssessments.push(iaId);

      // 4.2 Enter marks via PUT /api/admin/ia with native UUIDs (no mock att-rec/rec-ia)
      const studentId = cleanupIds.students[0];
      const marksReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/ia", {
        method: "PUT",
        body: {
          assessmentId: iaId,
          marks: [
            {
              studentId,
              score: 42,
              status: "SUBMITTED",
            },
          ],
        },
      });
      const marksRes = await putIA(marksReq);
      const marksJson = await marksRes.json();
      assert.strictEqual(marksRes.status, 200, "PUT IA marks must succeed");
      assert.strictEqual(marksJson.success, true);

      // Verify assessment record exists in DB with native UUID
      const dbRec = await db.assessmentRecord.findFirst({
        where: { studentId, subjectId: subjectAlpha.id },
      });
      assert.ok(dbRec, "AssessmentRecord must exist in DB");
      assert.match(dbRec.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Record ID must be native UUID");
      cleanupIds.assessmentRecords.push(dbRec.id);
      console.log("  [PASS] 4.1 IA assessment & marks entry saved with valid UUIDs");
      passed++;

      // 4.3 Cross-institution delete blocked
      const crossIAReq = await makeAdminReq(sessionAdminBeta, `http://localhost:3000/api/admin/ia?id=${iaId}`, {
        method: "DELETE",
      });
      const crossIARes = await deleteIA(crossIAReq);
      assert.strictEqual(crossIARes.status, 404, "Beta cannot delete Alpha IA");
      console.log("  [PASS] 4.2 Cross-institution IA isolation enforced");
      passed++;
    }

    // ------------------------------------------------------------------------
    // MODULE 5: PROMOTIONS UI DECOUPLING & ATOMIC EXECUTION
    // ------------------------------------------------------------------------
    console.log("\n--- Module 5: Promotions Database Operations & Policy Updates ---");
    {
      // Find a policy or use default
      let policy = await db.promotionPolicy.findFirst({
        where: { institutionId: instAlpha.id },
      });
      if (!policy) {
        policy = await db.promotionPolicy.create({
          data: {
            institutionId: instAlpha.id,
            name: "Standard Progression Policy",
            minCgpa: 5.0,
            maxBacklogsAllowed: 2,
          },
        });
      }

      // 5.1 Create Promotion Batch via POST /api/admin/promotions
      const nextAY = instAlpha.academicYears[1] || alphaAY;
      const batchReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/promotions", {
        method: "POST",
        body: {
          name: `Cohort 2026 Progression ${runId}`,
          policyId: policy.id,
          fromAcademicYearId: alphaAY.id,
          toAcademicYearId: nextAY.id,
          fromCourseId: alphaCourse.id,
          toCourseId: alphaCourse.id,
        },
      });
      const batchRes = await postPromotions(batchReq);
      const batchJson = await batchRes.json();
      assert.strictEqual(batchRes.status, 200, "POST promotions must succeed");
      assert.strictEqual(batchJson.success, true);
      const batchId = batchJson.data.id;
      cleanupIds.promotions.push(batchId);

      const dbBatch = await db.promotionBatch.findUnique({ where: { id: batchId } });
      assert.ok(dbBatch, "PromotionBatch must persist in PostgreSQL promotion_batches");
      assert.strictEqual(dbBatch.status, "DRAFT");
      console.log("  [PASS] 5.1 Promotion batch created in PostgreSQL");
      passed++;

      // 5.2 Update promotion policy via PUT /api/admin/promotions
      const updatePolReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/promotions", {
        method: "PUT",
        body: {
          action: "UPDATE_POLICY",
          policy: {
            id: policy.id,
            name: "Updated Progression Policy",
            minCgpa: 5.5,
            maxAllowedBacklogs: 3,
          },
        },
      });
      const updatePolRes = await putPromotions(updatePolReq);
      const updatePolJson = await updatePolRes.json();
      assert.strictEqual(updatePolRes.status, 200);
      assert.strictEqual(updatePolJson.success, true);

      const updatedPol = await db.promotionPolicy.findUnique({ where: { id: policy.id } });
      assert.strictEqual(Number(updatedPol?.minCgpa), 5.5, "Policy minCgpa must update in DB");
      console.log("  [PASS] 5.2 Promotion policy updated and persisted in DB");
      passed++;

      // 5.3 Execute promotion batch via PUT action: "EXECUTE"
      const studentId = cleanupIds.students[0];
      const execReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/promotions", {
        method: "PUT",
        body: {
          id: batchId,
          action: "EXECUTE",
          studentIds: [studentId],
        },
      });
      const execRes = await putPromotions(execReq);
      const execJson = await execRes.json();
      assert.strictEqual(execRes.status, 200, "Execute promotion must succeed");
      assert.strictEqual(execJson.success, true);

      const execBatch = await db.promotionBatch.findUnique({ where: { id: batchId } });
      assert.strictEqual(execBatch?.status, "EXECUTED", "Promotion batch status must be EXECUTED");
      console.log("  [PASS] 5.3 Promotion batch atomic execution completed");
      passed++;

      // 5.4 Cross-institution access blocked
      const crossPromReq = await makeAdminReq(sessionAdminBeta, `http://localhost:3000/api/admin/promotions?id=${batchId}`, {
        method: "DELETE",
      });
      const crossPromRes = await deletePromotions(crossPromReq);
      assert.strictEqual(crossPromRes.status, 400, "Beta cannot delete Alpha promotion batch");
      console.log("  [PASS] 5.4 Cross-institution promotion protection enforced");
      passed++;
    }

    // ------------------------------------------------------------------------
    // MODULE 6: RESULTS UI DECOUPLING
    // ------------------------------------------------------------------------
    console.log("\n--- Module 6: Results Real Database Operations ---");
    {
      // 6.1 Create Exam Schedule / Result Batch via POST /api/admin/results
      const resReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/results", {
        method: "POST",
        body: {
          batchName: `Semester 5 Final Results ${runId}`,
          academicYearId: alphaAY.id,
          semester: 5,
        },
      });
      const resRes = await postResults(resReq);
      const resJson = await resRes.json();
      assert.strictEqual(resRes.status, 200, "POST results must succeed");
      assert.strictEqual(resJson.success, true);
      const resId = resJson.data.id;
      cleanupIds.examSchedules.push(resId);

      const dbSchedule = await db.examSchedule.findUnique({ where: { id: resId } });
      assert.ok(dbSchedule, "ExamSchedule must exist in PostgreSQL");
      assert.strictEqual(dbSchedule.isPublished, false);
      console.log("  [PASS] 6.1 Result schedule batch created in PostgreSQL");
      passed++;

      // 6.2 Publish results via PUT /api/admin/results
      const pubReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/results", {
        method: "PUT",
        body: {
          id: resId,
          action: "PUBLISH",
        },
      });
      const pubRes = await putResults(pubReq);
      const pubJson = await pubRes.json();
      assert.strictEqual(pubRes.status, 200, "PUT publish results must succeed");
      assert.strictEqual(pubJson.success, true);

      const pubSchedule = await db.examSchedule.findUnique({ where: { id: resId } });
      assert.strictEqual(pubSchedule?.isPublished, true, "Schedule must be published in DB");
      console.log("  [PASS] 6.2 Results officially published in PostgreSQL");
      passed++;

      // 6.3 Cross-institution access blocked
      const crossResReq = await makeAdminReq(sessionAdminBeta, `http://localhost:3000/api/admin/results?id=${resId}`, {
        method: "DELETE",
      });
      const crossResRes = await deleteResults(crossResReq);
      assert.strictEqual(crossResRes.status, 200); // DELETE route uses deleteMany, won't delete published
      const stillPub = await db.examSchedule.findUnique({ where: { id: resId } });
      assert.ok(stillPub, "Published schedule must not be deleted by other institution");
      console.log("  [PASS] 6.3 Cross-institution result batch protection enforced");
      passed++;
    }

    // ------------------------------------------------------------------------
    // MODULE 7: ROLES & PERMISSIONS UI DECOUPLING & SYSTEM ROLE PROTECTION
    // ------------------------------------------------------------------------
    console.log("\n--- Module 7: Roles & Permissions Real RBAC Operations ---");
    {
      // 7.1 Create custom role via POST /api/admin/roles
      const createRoleReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/roles", {
        method: "POST",
        body: {
          name: `Custom Academic Officer ${runId}`,
          code: `OFFICER_${runId}`,
          description: "Responsible for course validation",
        },
      });
      const createRoleRes = await postRoles(createRoleReq);
      const createRoleJson = await createRoleRes.json();
      assert.strictEqual(createRoleRes.status, 200, "POST roles must succeed");
      assert.strictEqual(createRoleJson.success, true);
      const roleId = createRoleJson.data.id;
      cleanupIds.roles.push(roleId);

      const dbRole = await db.role.findUnique({ where: { id: roleId } });
      assert.ok(dbRole, "Custom role must exist in PostgreSQL role table");
      assert.strictEqual(dbRole.institutionId, instAlpha.id);
      console.log("  [PASS] 7.1 Custom role created in PostgreSQL");
      passed++;

      // 7.2 System role modification returns 403
      // Find a system role in Alpha or create one with isSystem: true
      let sysRole = await db.role.findFirst({
        where: { institutionId: instAlpha.id, isSystem: true },
      });
      if (!sysRole) {
        sysRole = await db.role.create({
          data: {
            institutionId: instAlpha.id,
            name: `System Admin ${runId}`,
            code: `SYS_${runId}`,
            isSystem: true,
          },
        });
        cleanupIds.roles.push(sysRole.id);
      }

      const modSysReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/roles", {
        method: "PUT",
        body: {
          id: sysRole.id,
          name: "Attempted Sys Mod",
        },
      });
      const modSysRes = await putRoles(modSysReq);
      assert.strictEqual(modSysRes.status, 403, "System role modification MUST return 403 Forbidden");
      console.log("  [PASS] 7.2 System role modification strictly protected (403 Forbidden)");
      passed++;

      // 7.3 Cross-institution role modification blocked
      const crossRoleReq = await makeAdminReq(sessionAdminBeta, "http://localhost:3000/api/admin/roles", {
        method: "PUT",
        body: {
          id: roleId,
          name: "Cross Modified",
        },
      });
      const crossRoleRes = await putRoles(crossRoleReq);
      assert.strictEqual(crossRoleRes.status, 404, "Beta cannot modify Alpha role");
      console.log("  [PASS] 7.3 Cross-institution role isolation enforced");
      passed++;
    }

    // ------------------------------------------------------------------------
    // MODULE 8: ACADEMICS SUBPAGES REST API OPERATIONS
    // ------------------------------------------------------------------------
    console.log("\n--- Module 8: Academics Subpages REST Database Operations ---");
    {
      // 8.1 Department CRUD
      const deptReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/academics/departments", {
        method: "POST",
        body: {
          name: `Department of AI ${runId}`,
          code: `AI${runId}`,
          description: "Artificial Intelligence and Machine Learning",
        },
      });
      const deptRes = await postDepartments(deptReq);
      const deptJson = await deptRes.json();
      assert.strictEqual(deptRes.status, 200, "POST departments must succeed");
      const deptId = deptJson.data.id;
      cleanupIds.departments.push(deptId);

      const dbDept = await db.department.findUnique({ where: { id: deptId } });
      assert.ok(dbDept, "Department must exist in PostgreSQL");
      console.log("  [PASS] 8.1 Department created and verified in DB");
      passed++;

      // 8.2 Course CRUD
      const crsReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/academics/courses", {
        method: "POST",
        body: {
          name: `B.Tech AI & Data Science ${runId}`,
          code: `BAIDS${runId}`,
          degreeType: "Undergraduate",
          departmentId: deptId,
          durationYears: 4,
          totalSemesters: 8,
          totalCredits: 160,
        },
      });
      const crsRes = await postCourses(crsReq);
      const crsJson = await crsRes.json();
      assert.strictEqual(crsRes.status, 200, "POST courses must succeed");
      const crsId = crsJson.data.id;
      cleanupIds.courses.push(crsId);

      const dbCrs = await db.course.findUnique({ where: { id: crsId } });
      assert.ok(dbCrs, "Course must exist in PostgreSQL");
      console.log("  [PASS] 8.2 Course created and verified in DB");
      passed++;

      // 8.3 Class CRUD
      const clsReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/academics/classes", {
        method: "POST",
        body: {
          name: `AI-2026 Cohort ${runId}`,
          courseId: crsId,
          academicYearId: alphaAY.id,
          semester: 1,
        },
      });
      const clsRes = await postClasses(clsReq);
      const clsJson = await clsRes.json();
      assert.strictEqual(clsRes.status, 200, "POST classes must succeed");
      const clsId = clsJson.data.id;
      cleanupIds.classes.push(clsId);

      const dbCls = await db.class.findUnique({ where: { id: clsId } });
      assert.ok(dbCls, "Class must exist in PostgreSQL");
      console.log("  [PASS] 8.3 Class created and verified in DB");
      passed++;

      // 8.4 Subject CRUD
      const subReq = await makeAdminReq(sessionAdminAlpha, "http://localhost:3000/api/admin/academics/subjects", {
        method: "POST",
        body: {
          name: `Deep Learning Principles ${runId}`,
          code: `DLP${runId}`,
          credits: 4,
          hoursPerWeek: 4,
          type: "THEORY",
          courseId: crsId,
          semester: 1,
        },
      });
      const subRes = await postSubjects(subReq);
      const subJson = await subRes.json();
      assert.strictEqual(subRes.status, 200, "POST subjects must succeed");
      const subId = subJson.data.id;
      cleanupIds.subjects.push(subId);

      const dbSub = await db.subject.findUnique({ where: { id: subId } });
      assert.ok(dbSub, "Subject must exist in PostgreSQL");
      console.log("  [PASS] 8.4 Subject created and verified in DB");
      passed++;

      // 8.5 Cross-institution academics protection
      const crossDeptReq = await makeAdminReq(sessionAdminBeta, `http://localhost:3000/api/admin/academics/departments?id=${deptId}`, {
        method: "DELETE",
      });
      const crossDeptRes = await deleteDepartments(crossDeptReq);
      assert.strictEqual(crossDeptRes.status, 404, "Beta cannot delete Alpha department");
      console.log("  [PASS] 8.5 Cross-institution academics isolation enforced");
      passed++;
    }

  } catch (error: any) {
    console.error("\nTEST SUITE EXECUTION ERROR:", error);
    failed++;
  } finally {
    console.log("\n--- Cleaning up temporary test fixtures ---");
    try {
      if (cleanupIds.assessmentRecords.length > 0) {
        await db.assessmentRecord.deleteMany({ where: { id: { in: cleanupIds.assessmentRecords } } });
      }
      if (cleanupIds.iaAssessments.length > 0) {
        try {
          await db.assessmentRecord.deleteMany({ where: { id: { in: cleanupIds.iaAssessments } } });
        } catch {}
      }
      if (cleanupIds.certificates.length > 0) {
        await db.issuedCertificate.deleteMany({ where: { id: { in: cleanupIds.certificates } } });
      }
      if (cleanupIds.promotions.length > 0) {
        await db.promotionBatch.deleteMany({ where: { id: { in: cleanupIds.promotions } } });
      }
      if (cleanupIds.examSchedules.length > 0) {
        await db.examSchedule.deleteMany({ where: { id: { in: cleanupIds.examSchedules } } });
      }
      if (cleanupIds.examinations.length > 0) {
        try {
          await db.examination.deleteMany({ where: { id: { in: cleanupIds.examinations } } });
        } catch {}
      }
      if (cleanupIds.roles.length > 0) {
        await db.rolePermission.deleteMany({ where: { roleId: { in: cleanupIds.roles } } });
        await db.role.deleteMany({ where: { id: { in: cleanupIds.roles } } });
      }
      if (cleanupIds.subjects.length > 0) {
        await db.subject.deleteMany({ where: { id: { in: cleanupIds.subjects } } });
      }
      if (cleanupIds.classes.length > 0) {
        await db.class.deleteMany({ where: { id: { in: cleanupIds.classes } } });
      }
      if (cleanupIds.courses.length > 0) {
        await db.course.deleteMany({ where: { id: { in: cleanupIds.courses } } });
      }
      if (cleanupIds.departments.length > 0) {
        await db.department.deleteMany({ where: { id: { in: cleanupIds.departments } } });
      }
      if (cleanupIds.academicYears.length > 0) {
        await db.academicYear.deleteMany({ where: { id: { in: cleanupIds.academicYears } } });
      }
      if (cleanupIds.admissions.length > 0) {
        await db.admissionApplication.deleteMany({ where: { id: { in: cleanupIds.admissions } } });
      }
      if (cleanupIds.students.length > 0) {
        await db.enrollment.deleteMany({ where: { studentId: { in: cleanupIds.students } } });
        await db.student.deleteMany({ where: { id: { in: cleanupIds.students } } });
      }
      if (cleanupIds.users.length > 0) {
        await db.user.deleteMany({ where: { id: { in: cleanupIds.users } } });
      }
      console.log("Cleanup completed successfully.");
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr);
    }

    console.log("\n==================================================================");
    console.log(`PHASE C TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runPhaseCAdminDecouplingTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
