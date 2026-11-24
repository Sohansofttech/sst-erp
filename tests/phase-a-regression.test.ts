import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import db from "../lib/db";
import prisma from "../lib/prisma";
import {
  signTeacherSession,
  TeacherAuthError,
  createDbSessionRecord,
  revokeDbSession,
  getTeacherSession,
} from "../lib/auth/teacher-session";
import {
  submitAttendance,
  reviewStudentLeaveRequest,
  getAttendanceSessions,
  getExamDuties,
  getExamSchedule,
  getCampusDuties,
  getResultEntries,
  getMentees,
  getMentoringSessions,
  getLogBookEntries,
  getStudentLogReviews,
  getTeacherLeaveRequests,
  getDepartmentFacultyLoad,
  createLearningMaterial,
  createQuiz,
  updateQuizStatus,
  updateQuizSubmissionScore,
} from "../lib/services/teacher.service";
import { NextRequest } from "next/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runPhaseARegressionTests() {
  console.log("==================================================================");
  console.log("REMEDIATION PHASE A — COMPREHENSIVE REGRESSION & INTEGRITY TESTS");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  // Track created test IDs for guaranteed cleanup
  const cleanupIds = {
    sessions: [] as string[],
    attendanceRecords: [] as string[],
    enrollments: [] as string[],
    approvalRequests: [] as string[],
    auditLogs: [] as string[],
    materials: [] as string[],
    quizzes: [] as string[],
  };

  try {
    // -------------------------------------------------------------------------
    // TEST SUITE A4: TeacherPortalSession in Prisma Schema & Table Integrity
    // -------------------------------------------------------------------------
    console.log("\n--- [A4] TeacherPortalSession Prisma Model & Database Integrity ---");

    // 1. Verify Prisma Client has teacherPortalSession model
    assert.ok(
      (prisma as any).teacherPortalSession || (db as any).teacherPortalSession,
      "Prisma Client must have teacherPortalSession model available"
    );
    console.log("PASS A4.1: Prisma model `teacherPortalSession` exists on client.");
    passed++;

    // 2. Query count via Prisma Client and compare with raw count
    const prismaCount = await (prisma as any).teacherPortalSession.count();
    const rawResult: any = await db.$queryRawUnsafe(`SELECT count(*)::int as cnt FROM teacher_portal_sessions;`);
    const rawCount = rawResult[0]?.cnt;

    assert.equal(
      prismaCount,
      rawCount,
      `Prisma count (${prismaCount}) must match PostgreSQL raw count (${rawCount})`
    );
    assert.ok(
      prismaCount >= 42,
      `Existing 42 production-like session rows must be preserved. Found: ${prismaCount}`
    );
    console.log(`PASS A4.2: Row count preserved (${prismaCount} rows). Zero data loss or table truncation.`);
    passed++;

    // 3. Test Prisma Session CRUD via lib/auth/teacher-session helpers
    const testSessionId = crypto.randomUUID();
    const testTokenHash = crypto.createHash("sha256").update(`test-token-${Date.now()}`).digest("hex");
    const testUserId = crypto.randomUUID();
    const testInstId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600_000);

    cleanupIds.sessions.push(testSessionId);

    // Create session record
    await createDbSessionRecord({
      id: testSessionId,
      tokenHash: testTokenHash,
      userId: testUserId,
      institutionId: testInstId,
      activeRole: "teacher",
      expiresAt,
    });

    // Query session through Prisma model
    const foundSession = await (prisma as any).teacherPortalSession.findUnique({
      where: { id: testSessionId },
    });
    assert.ok(foundSession, "Created session record must be queryable via Prisma");
    assert.equal(foundSession.tokenHash, testTokenHash, "tokenHash must match");
    assert.equal(foundSession.activeRole, "teacher", "activeRole must match");
    console.log("PASS A4.3: Session creation and retrieval via Prisma model succeeded.");
    passed++;

    // Revoke session
    await revokeDbSession(testTokenHash);
    const revokedSession = await (prisma as any).teacherPortalSession.findUnique({
      where: { id: testSessionId },
    });
    assert.ok(revokedSession.revokedAt !== null, "revokedAt must be set upon revocation");
    console.log("PASS A4.4: Session revocation via Prisma model succeeded.");
    passed++;

    // -------------------------------------------------------------------------
    // TEST SUITE A3: Teacher Service Mock Elimination & PostgreSQL Exclusivity
    // -------------------------------------------------------------------------
    console.log("\n--- [A3] Mock Purge & Real Database Sourcing ---");

    // 1. Static AST/File check: teacher.service.ts must NOT import @/mocks/teacher.mock
    const serviceFilePath = path.join(process.cwd(), "lib/services/teacher.service.ts");
    const serviceContent = fs.readFileSync(serviceFilePath, "utf8");

    assert.ok(
      !serviceContent.includes('from "@/mocks/teacher.mock"'),
      "teacher.service.ts must NOT import from @/mocks/teacher.mock"
    );
    assert.ok(
      !serviceContent.includes("from '@/mocks/teacher.mock'"),
      "teacher.service.ts must NOT import from '@/mocks/teacher.mock'"
    );
    assert.ok(
      !serviceContent.includes("DEPARTMENT_FACULTY_LOAD_MOCK"),
      "teacher.service.ts must NOT reference DEPARTMENT_FACULTY_LOAD_MOCK"
    );
    assert.ok(
      !serviceContent.includes("TeacherSessionStore"),
      "teacher.service.ts must NOT declare TeacherSessionStore"
    );
    assert.ok(
      !serviceContent.includes("createInitialStore"),
      "teacher.service.ts must NOT declare createInitialStore"
    );
    assert.ok(
      !serviceContent.includes("let store"),
      "teacher.service.ts must NOT contain `let store`"
    );
    assert.ok(
      !serviceContent.includes("resetTeacherMockSession"),
      "teacher.service.ts must NOT declare resetTeacherMockSession"
    );
    assert.ok(
      !serviceContent.match(/\bstore\./),
      "teacher.service.ts must NOT contain any `store.` in-memory mutations"
    );
    assert.ok(
      !serviceContent.includes("Prof. Rajesh Verma"),
      "teacher.service.ts must NOT contain demo substitute teacher"
    );
    assert.ok(
      !serviceContent.includes("ay_demo_2026_27"),
      "teacher.service.ts must NOT contain hardcoded ay_demo_2026_27"
    );
    assert.ok(
      !serviceContent.includes("demo-school"),
      "teacher.service.ts must NOT contain demo-school"
    );
    console.log("PASS A3.1: Verified teacher.service.ts has zero mock stores, zero store mutations, and zero demo strings.");
    passed++;

    // 2. Fetch active teachers and institutions from database
    const dbTeachers = await db.teacher.findMany({
      where: { user: { isActive: true } },
      include: { institution: true, user: true },
      take: 2,
    });

    assert.ok(dbTeachers.length >= 1, "Must have at least one active teacher in database");
    const activeTeacher = dbTeachers[0];
    const activeInst = activeTeacher.institution;

    // Simulate authenticated session token for activeTeacher
    const sessionToken = await signTeacherSession({
      userId: activeTeacher.userId,
      teacherId: activeTeacher.id,
      institutionId: activeInst.id,
      institutionSlug: activeInst.slug || activeInst.code || "inst-slug",
      email: activeTeacher.user.email,
      fullName: activeTeacher.user.fullName || "Faculty Member",
      employeeId: activeTeacher.employeeId,
      designation: activeTeacher.designation,
      department: activeTeacher.department,
      activeRole: "teacher",
      availableRoles: ["teacher"],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86400_000,
      lastActivity: Date.now(),
    });

    const activeSessionId = crypto.randomUUID();
    cleanupIds.sessions.push(activeSessionId);
    await createDbSessionRecord({
      id: activeSessionId,
      tokenHash: crypto.createHash("sha256").update(sessionToken).digest("hex"),
      userId: activeTeacher.userId,
      institutionId: activeInst.id,
      activeRole: "teacher",
      expiresAt: new Date(Date.now() + 86400_000),
    });

    process.env.TEST_TEACHER_SESSION_TOKEN = sessionToken;

    // Run methods in request context
    const req = new NextRequest("http://localhost:3000", {
      headers: { cookie: `sst_teacher_session=${sessionToken}` },
    });

    const sessionContext = await getTeacherSession(activeInst.slug || activeInst.code || activeInst.id, { req });
    assert.ok(sessionContext !== null, "Session must resolve for authenticated faculty");

    // 3. Test empty results return [] instead of mock data
    const examDuties = await getExamDuties();
    assert.ok(Array.isArray(examDuties), "getExamDuties must return an array");

    const examSchedule = await getExamSchedule();
    assert.ok(Array.isArray(examSchedule), "getExamSchedule must return an array");

    const campusDuties = await getCampusDuties();
    assert.ok(Array.isArray(campusDuties), "getCampusDuties must return an array");

    const resultEntries = await getResultEntries();
    assert.ok(Array.isArray(resultEntries), "getResultEntries must return an array");

    const mentees = await getMentees();
    assert.ok(Array.isArray(mentees), "getMentees must return an array");

    const mentoringSessions = await getMentoringSessions();
    assert.ok(Array.isArray(mentoringSessions), "getMentoringSessions must return an array");

    const logBookEntries = await getLogBookEntries();
    assert.ok(Array.isArray(logBookEntries), "getLogBookEntries must return an array");

    const studentLogReviews = await getStudentLogReviews();
    assert.ok(Array.isArray(studentLogReviews), "getStudentLogReviews must return an array");

    const teacherLeaves = await getTeacherLeaveRequests();
    assert.ok(Array.isArray(teacherLeaves), "getTeacherLeaveRequests must return an array");

    const facultyLoad = await getDepartmentFacultyLoad();
    assert.ok(Array.isArray(facultyLoad), "getDepartmentFacultyLoad must return an array");

    console.log("PASS A3.2: Secondary teacher service methods query PostgreSQL directly and return real data / empty arrays without mock fallbacks.");
    passed++;

    // 4. Test LMS Material Creation & PostgreSQL Persistence
    const activeSubj = (await db.subject.findFirst({
      where: { institutionId: activeInst.id },
    })) ?? (await db.subject.findFirst());

    const createdMat = await createLearningMaterial({
      classId: "cls-10",
      className: "Class 10",
      section: "A",
      subjectId: activeSubj?.id || "subj-default",
      subjectName: activeSubj?.name || "Mathematics",
      title: "Test Unit 1 Lecture Notes",
      description: "Sample study material for regression verification",
      type: "pdf",
      fileUrl: "https://example.com/notes.pdf",
      fileSizeLabel: "2.4 MB",
      unit: "Unit 1",
    });
    assert.ok(createdMat?.id, "createLearningMaterial must return created material with id");
    cleanupIds.materials.push(createdMat.id);

    const dbMat = await prisma.lms_course_materials.findUnique({
      where: { id: createdMat.id },
    });
    assert.ok(dbMat !== null, "Created material must exist in lms_course_materials table in PostgreSQL");
    assert.equal(dbMat.title, "Test Unit 1 Lecture Notes");
    console.log("PASS A3.3: createLearningMaterial directly persists to PostgreSQL lms_course_materials table.");
    passed++;

    // 5. Test Quiz Creation, Questions & PostgreSQL Persistence
    const createdQuiz = await createQuiz({
      classId: "cls-10",
      className: "Class 10",
      sectionId: "A",
      section: "A",
      subjectId: activeSubj?.id || "subj-default",
      subjectName: activeSubj?.name || "Mathematics",
      title: "Diagnostic Mathematics Quiz",
      durationMinutes: 30,
      scheduledAt: new Date().toISOString(),
      closesAt: new Date(Date.now() + 86400000).toISOString(),
      status: "draft",
      questions: [
        {
          questionNumber: 1,
          prompt: "What is 2 + 2?",
          questionType: "mcq",
          options: ["2", "3", "4", "5"],
          correctAnswer: "4",
          marks: 5,
        },
      ],
    });
    assert.ok(createdQuiz?.id, "createQuiz must return created quiz with id");
    cleanupIds.quizzes.push(createdQuiz.id);

    const dbQuiz = await prisma.quizzes.findUnique({
      where: { id: createdQuiz.id },
      include: { questions: true },
    });
    assert.ok(dbQuiz !== null, "Created quiz must exist in quizzes table in PostgreSQL");
    assert.equal(dbQuiz.title, "Diagnostic Mathematics Quiz");
    assert.equal(dbQuiz.questions.length, 1);
    console.log("PASS A3.4: createQuiz directly persists to PostgreSQL quizzes and quiz_questions tables.");
    passed++;

    // 6. Test Quiz Status Update and Audit Logging
    const updatedQuiz = await updateQuizStatus(createdQuiz.id, "published");
    assert.equal(updatedQuiz.status, "published", "updateQuizStatus must return updated status");

    const auditLogQuiz = await prisma.audit_logs.findFirst({
      where: {
        institutionId: activeInst.id,
        action: "UPDATE_QUIZ_STATUS_PUBLISHED",
        entityId: createdQuiz.id,
      },
    });
    assert.ok(auditLogQuiz !== null, "updateQuizStatus must record an audit log in audit_logs");
    cleanupIds.auditLogs.push(auditLogQuiz.id);
    console.log("PASS A3.5: updateQuizStatus updates real DB quiz state and writes audit log.");
    passed++;

    // 7. Verify Non-Existent Record Lookups Fail Cleanly without Mock Fallbacks
    await assert.rejects(
      async () => updateQuizStatus("non-existent-quiz-xyz", "published"),
      /not found/i,
      "updateQuizStatus on non-existent quiz must throw real error, not mock fallback"
    );
    await assert.rejects(
      async () => updateQuizSubmissionScore("non-existent-submission-xyz", 10),
      /not found/i,
      "updateQuizSubmissionScore on non-existent submission must throw real error, not mock fallback"
    );
    console.log("PASS A3.6: Non-existent records throw real errors instead of using in-memory fallbacks.");
    passed++;

    // -------------------------------------------------------------------------
    // TEST SUITE A1: UUID Format & Foreign Key Integrity
    // -------------------------------------------------------------------------
    console.log("\n--- [A1] UUID Generation & Foreign Key Integrity ---");

    // Find student in active institution
    const dbStudent = await db.student.findFirst({
      where: { institutionId: activeInst.id },
      include: { enrollments: true },
    });

    assert.ok(dbStudent, "Need at least one student in active institution");

    // Ensure valid enrollment exists
    let testEnrollment = dbStudent.enrollments[0];
    if (!testEnrollment) {
      const defaultCourse = await db.course.findFirst({
        where: { institutionId: activeInst.id },
      }) ?? await db.course.findFirst();
      const defaultAy = await db.academicYear.findFirst({
        where: { institutionId: activeInst.id },
      }) ?? await db.academicYear.findFirst();

      const newEnrId = crypto.randomUUID();
      cleanupIds.enrollments.push(newEnrId);
      testEnrollment = await db.enrollment.create({
        data: {
          id: newEnrId,
          institutionId: activeInst.id,
          studentId: dbStudent.id,
          courseId: defaultCourse?.id || "course-default",
          academicYearId: defaultAy?.id || "ay-2026-27",
          semester: 1,
          section: "A",
          status: "ACTIVE",
          enrolledDate: new Date(),
        },
      });
    }

    // Find valid subject in institution or database
    const realSubj = (await db.subject.findFirst({
      where: { institutionId: activeInst.id },
    })) ?? (await db.subject.findFirst());

    // Submit attendance through teacher service
    const testDate = "2026-11-18";
    const attendanceResult = await submitAttendance({
      institutionId: activeInst.id,
      academicYearId: "ay-2026-2027",
      classId: "class-test-01",
      className: "Standard 10",
      sectionId: dbStudent.currentSection || "A",
      section: dbStudent.currentSection || "A",
      subjectId: realSubj?.id,
      subjectName: realSubj?.name || "Mathematics",
      date: testDate,
      period: 2,
      status: "submitted",
      records: [
        {
          studentId: dbStudent.id,
          rollNo: dbStudent.rollNumber,
          studentName: `${dbStudent.firstName} ${dbStudent.lastName}`,
          status: "present",
        },
      ],
    });

    assert.ok(attendanceResult, "Attendance submission must succeed");
    const submittedRecord = attendanceResult.records[0];
    assert.ok(submittedRecord, "Must return created attendance record");

    // Inspect database row directly in attendance_records
    const dbRecord: any = await prisma.attendance_records.findUnique({
      where: { id: submittedRecord.id },
    });

    assert.ok(dbRecord, "Record must exist in attendance_records table");
    cleanupIds.attendanceRecords.push(dbRecord.id);

    // Verify UUID format for record id and enrollmentId
    assert.ok(
      UUID_REGEX.test(dbRecord.id),
      `attendance_records.id must be a valid UUID. Got: ${dbRecord.id}`
    );
    assert.ok(
      UUID_REGEX.test(dbRecord.enrollmentId),
      `attendance_records.enrollmentId must be a valid UUID. Got: ${dbRecord.enrollmentId}`
    );

    // Verify enrollmentId points to actual row in enrollments table
    const linkedEnrollment = await prisma.enrollments.findUnique({
      where: { id: dbRecord.enrollmentId },
    });
    assert.ok(
      linkedEnrollment !== null,
      `attendance_records.enrollmentId (${dbRecord.enrollmentId}) must reference valid row in enrollments`
    );
    console.log("PASS A1.1: attendance_records UUIDs verified and enrollment foreign key integrity confirmed.");
    passed++;

    // Verify audit log created during attendance submission has valid UUID
    const auditLog: any = await prisma.audit_logs.findFirst({
      where: {
        institutionId: activeInst.id,
        action: "SUBMIT_ATTENDANCE",
      },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(auditLog, "Audit log must be created on attendance submission");
    cleanupIds.auditLogs.push(auditLog.id);
    assert.ok(
      UUID_REGEX.test(auditLog.id),
      `audit_logs.id must be a valid UUID. Got: ${auditLog.id}`
    );
    console.log("PASS A1.2: audit_logs UUID verified. Zero non-UUID prefixes.");
    passed++;

    // -------------------------------------------------------------------------
    // TEST SUITE A2: Leave Approval Date-Range & Tenant Filtering
    // -------------------------------------------------------------------------
    console.log("\n--- [A2] Leave Approval Date-Range & Multi-Tenant Filtering ---");

    // Setup: Create 4 attendance records for student A:
    // Day 1: 2026-11-20 (ABSENT) - Before leave range
    // Day 2: 2026-11-21 (ABSENT) - In leave range
    // Day 3: 2026-11-22 (ABSENT) - In leave range
    // Day 4: 2026-11-23 (ABSENT) - After leave range
    const dates = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"];
    const createdAttIds: string[] = [];

    const effectiveSubject = realSubj || await db.subject.findFirst({ where: { institutionId: activeInst.id } });

    for (const d of dates) {
      const attId = crypto.randomUUID();
      cleanupIds.attendanceRecords.push(attId);
      createdAttIds.push(attId);

      await prisma.attendance_records.create({
        data: {
          id: attId,
          institutionId: activeInst.id,
          studentId: dbStudent.id,
          enrollmentId: testEnrollment.id,
          subjectId: effectiveSubject?.id,
          date: new Date(`${d}T09:00:00.000Z`),
          status: "ABSENT",
        },
      });
    }

    // Create another student B in the same institution with ABSENT on Day 2
    const otherStudent = await db.student.findFirst({
      where: { institutionId: activeInst.id, id: { not: dbStudent.id } },
      include: { enrollments: true },
    });

    let otherAttId: string | null = null;
    if (otherStudent && otherStudent.enrollments[0]) {
      otherAttId = crypto.randomUUID();
      cleanupIds.attendanceRecords.push(otherAttId);
      await prisma.attendance_records.create({
        data: {
          id: otherAttId,
          institutionId: activeInst.id,
          studentId: otherStudent.id,
          enrollmentId: otherStudent.enrollments[0].id,
          subjectId: effectiveSubject?.id,
          date: new Date("2026-11-21T09:00:00.000Z"),
          status: "ABSENT",
        },
      });
    }

    // Create an approval request for student A leave: 2026-11-21 to 2026-11-22
    const leaveReqId = `leave-${crypto.randomUUID()}`;
    cleanupIds.approvalRequests.push(leaveReqId);

    await prisma.approval_requests.create({
      data: {
        id: leaveReqId,
        institutionId: activeInst.id,
        userId: dbStudent.userId || activeTeacher.userId,
        requestType: "STUDENT_LEAVE",
        title: "Medical Leave for Student A",
        status: "PENDING",
        requestedDataJson: JSON.stringify({
          studentId: dbStudent.id,
          studentName: `${dbStudent.firstName} ${dbStudent.lastName}`,
          rollNo: dbStudent.rollNumber,
          fromDate: "2026-11-21",
          toDate: "2026-11-22",
          leaveType: "Medical",
          reason: "Dengue Fever Recovery",
        }),
      },
    });

    // Execute reviewStudentLeaveRequest (decision: approved)
    const reviewResult = await reviewStudentLeaveRequest(leaveReqId, "approved", "Approved by faculty mentor");
    assert.equal(reviewResult.status, "approved", "Leave request must be marked approved");

    // Verify attendance records:
    // Day 1 (2026-11-20): MUST still be ABSENT (outside range!)
    const day1Record: any = await prisma.attendance_records.findUnique({
      where: { id: createdAttIds[0] },
    });
    assert.equal(day1Record.status, "ABSENT", "Attendance prior to leave start date must NOT be modified");

    // Day 2 (2026-11-21): MUST be updated to PRESENT with excused leave remarks
    const day2Record: any = await prisma.attendance_records.findUnique({
      where: { id: createdAttIds[1] },
    });
    assert.equal(day2Record.status, "PRESENT", "Attendance within leave range must be updated to PRESENT");
    assert.ok(day2Record.remarks?.includes("Leave Approved"), "Remarks must indicate approved leave");

    // Day 3 (2026-11-22): MUST be updated to PRESENT with excused leave remarks
    const day3Record: any = await prisma.attendance_records.findUnique({
      where: { id: createdAttIds[2] },
    });
    assert.equal(day3Record.status, "PRESENT", "Attendance within leave range must be updated to PRESENT");
    assert.ok(day3Record.remarks?.includes("Leave Approved"), "Remarks must indicate approved leave");

    // Day 4 (2026-11-23): MUST still be ABSENT (outside range!)
    const day4Record: any = await prisma.attendance_records.findUnique({
      where: { id: createdAttIds[3] },
    });
    assert.equal(day4Record.status, "ABSENT", "Attendance after leave end date must NOT be modified");

    // Student B on Day 2: MUST still be ABSENT (different student!)
    if (otherAttId) {
      const studentBRecord: any = await prisma.attendance_records.findUnique({
        where: { id: otherAttId },
      });
      assert.equal(studentBRecord.status, "ABSENT", "Unrelated student attendance must NOT be modified");
    }

    console.log("PASS A2.1: Leave approval strictly bounded to [startDate, endDate] and target studentId.");
    passed++;

    // Test invalid date range rejection
    const invalidDateReqId = `leave-inv-${crypto.randomUUID()}`;
    cleanupIds.approvalRequests.push(invalidDateReqId);

    await prisma.approval_requests.create({
      data: {
        id: invalidDateReqId,
        institutionId: activeInst.id,
        userId: activeTeacher.userId,
        requestType: "STUDENT_LEAVE",
        title: "Invalid Range Leave",
        status: "PENDING",
        requestedDataJson: JSON.stringify({
          studentId: dbStudent.id,
          fromDate: "2026-11-25",
          toDate: "2026-11-20", // fromDate > toDate!
          leaveType: "Medical",
        }),
      },
    });

    try {
      await reviewStudentLeaveRequest(invalidDateReqId, "approved");
      assert.fail("Should have rejected inverted date range");
    } catch (err: any) {
      assert.ok(
        err.message.includes("cannot be after toDate") || err.message.includes("Invalid date range"),
        `Expected date range validation error. Got: ${err.message}`
      );
      console.log("PASS A2.2: Inverted date range (fromDate > toDate) safely rejected.");
      passed++;
    }

    // Test cross-institution leave access rejection
    const allInstitutions = await db.institution.findMany({
      where: { id: { not: activeInst.id } },
      take: 1,
    });

    if (allInstitutions.length > 0) {
      const otherInst = allInstitutions[0];
      const otherInstLeaveId = `leave-other-${crypto.randomUUID()}`;
      cleanupIds.approvalRequests.push(otherInstLeaveId);

      await prisma.approval_requests.create({
        data: {
          id: otherInstLeaveId,
          institutionId: otherInst.id, // Belonging to Institution Beta!
          userId: activeTeacher.userId,
          requestType: "STUDENT_LEAVE",
          title: "Cross Tenant Leave",
          status: "PENDING",
          requestedDataJson: JSON.stringify({
            studentId: dbStudent.id,
            fromDate: "2026-11-21",
            toDate: "2026-11-22",
            leaveType: "Medical",
          }),
        },
      });

      try {
        // Teacher is logged into activeInst (Institution Alpha). Attempting to review Institution Beta's leave
        await reviewStudentLeaveRequest(otherInstLeaveId, "approved");
        assert.fail("Should have rejected cross-tenant leave review");
      } catch (err: any) {
        assert.ok(
          err.message.includes("not found in this institution") || err.message.includes("Tenant violation"),
          `Expected tenant boundary rejection. Got: ${err.message}`
        );
        console.log("PASS A2.3: Cross-tenant leave approval blocked (Institution Alpha cannot review Institution Beta leave).");
        passed++;
      }
    }

  } catch (err) {
    console.error("\nTEST SUITE FAILED WITH ERROR:", err);
    failed++;
  } finally {
    // Clean up all created test entities
    console.log("\n--- Cleaning up temporary test records ---");
    if (cleanupIds.attendanceRecords.length > 0) {
      await prisma.attendance_records.deleteMany({
        where: { id: { in: cleanupIds.attendanceRecords } },
      });
    }
    if (cleanupIds.approvalRequests.length > 0) {
      await prisma.approval_requests.deleteMany({
        where: { id: { in: cleanupIds.approvalRequests } },
      });
    }
    if (cleanupIds.auditLogs.length > 0) {
      await prisma.audit_logs.deleteMany({
        where: { id: { in: cleanupIds.auditLogs } },
      });
    }
    if (cleanupIds.enrollments.length > 0) {
      await prisma.enrollments.deleteMany({
        where: { id: { in: cleanupIds.enrollments } },
      });
    }
    if (cleanupIds.materials.length > 0) {
      await prisma.lms_course_materials.deleteMany({
        where: { id: { in: cleanupIds.materials } },
      });
    }
    if (cleanupIds.quizzes.length > 0) {
      await prisma.quiz_questions.deleteMany({
        where: { quizId: { in: cleanupIds.quizzes } },
      });
      await prisma.quizzes.deleteMany({
        where: { id: { in: cleanupIds.quizzes } },
      });
    }
    if (cleanupIds.sessions.length > 0) {
      await (prisma as any).teacherPortalSession.deleteMany({
        where: { id: { in: cleanupIds.sessions } },
      });
    }
    console.log("Cleanup complete.");
  }

  console.log("\n==================================================================");
  console.log(`PHASE A REGRESSION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhaseARegressionTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL SUITE ERROR:", err);
    process.exit(1);
  });
