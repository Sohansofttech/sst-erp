import "dotenv/config";
import crypto from "crypto";
import db from "../lib/db";
import {
  getIAAssessments,
  createIAAssessment,
  saveIAAssessmentMarks,
  createExamination,
  createExamSlot,
  updateExaminationStatus,
  publishResultBatch,
  saveExamResults,
  getAdminAssignments,
  createStudent,
} from "../lib/services/institution-admin.service";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPhase2IntegrationTests() {
  console.log("\n========================================================");
  console.log("SST-ERP PHASE 2 ACADEMIC MODULES INTEGRATION TEST SUITE");
  console.log("========================================================\n");

  const runId = Date.now().toString().slice(-6);

  // 1. Setup Test Institutions and Academic Context
  console.log("Setup: Resolving Test Tenants...");
  let instAlpha = await db.institution.findFirst({
    where: { code: "ALPHA-ACAD" },
  });
  if (!instAlpha) {
    instAlpha = await db.institution.create({
      data: {
        id: crypto.randomUUID(),
        name: "Alpha Academic Institute",
        code: `ALPHA-${runId}`,
        slug: `alpha-${runId}`,
      },
    });
  }

  let instBeta = await db.institution.findFirst({
    where: { code: "BETA-ACAD" },
  });
  if (!instBeta) {
    instBeta = await db.institution.create({
      data: {
        id: crypto.randomUUID(),
        name: "Beta Polytechnic University",
        code: `BETA-${runId}`,
        slug: `beta-${runId}`,
      },
    });
  }

  const ayAlphaId = crypto.randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO academic_years ("id", "institutionId", "name", "startDate", "endDate", "status")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    ayAlphaId,
    instAlpha.id,
    "2026-2027 Academic Year",
    new Date("2026-06-01"),
    new Date("2027-05-31"),
    "ACTIVE"
  );
  const ayAlpha = { id: ayAlphaId };

  const ayBetaId = crypto.randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO academic_years ("id", "institutionId", "name", "startDate", "endDate", "status")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    ayBetaId,
    instBeta.id,
    "2026-2027 Academic Year",
    new Date("2026-06-01"),
    new Date("2027-05-31"),
    "ACTIVE"
  );

  // Ensure Course and Subjects via raw SQL (avoids enum casting)
  let courseAlpha = await db.course.findFirst({ where: { institutionId: instAlpha.id } });
  if (!courseAlpha) {
    const cid = crypto.randomUUID();
    await db.$executeRawUnsafe(`
      INSERT INTO courses (id, "institutionId", code, name, department, "totalSemesters", "createdAt", status)
      VALUES ($1, $2, $3, 'Computer Science', 'Computer Science', 8, NOW(), 'ACTIVE')
      ON CONFLICT (id) DO NOTHING
    `, cid, instAlpha.id, `CSE-${runId}`);
    courseAlpha = { id: cid } as any;
  }

  let subAlpha = await db.subject.findFirst({ where: { institutionId: instAlpha.id } });
  if (!subAlpha) {
    const sid = crypto.randomUUID();
    await db.$executeRawUnsafe(`
      INSERT INTO subjects (id, "institutionId", "courseId", code, name, semester, credits, "createdAt")
      VALUES ($1, $2, $3, $4, 'Data Structures', 3, 4, NOW())
      ON CONFLICT (id) DO NOTHING
    `, sid, instAlpha.id, courseAlpha!.id, `CS201-${runId}`);
    subAlpha = { id: sid, code: `CS201-${runId}`, name: 'Data Structures' } as any;
  }

  let subBeta = await db.subject.findFirst({ where: { institutionId: instBeta.id } });
  if (!subBeta) {
    const sid = crypto.randomUUID();
    await db.$executeRawUnsafe(`
      INSERT INTO subjects (id, "institutionId", "courseId", code, name, semester, credits, "createdAt")
      VALUES ($1, $2, $3, $4, 'Digital Electronics', 3, 4, NOW())
      ON CONFLICT (id) DO NOTHING
    `, sid, instBeta.id, courseAlpha!.id, `EE201-${runId}`);
    subBeta = { id: sid, code: `EE201-${runId}`, name: 'Digital Electronics' } as any;
  }

  // Ensure Students via createStudent service (atomically sets up User, Student, and Enrollment)
  let studentAlpha = await db.student.findFirst({ where: { institutionId: instAlpha.id } });
  if (!studentAlpha) {
    const res = await createStudent(instAlpha.id, {
      firstName: "Aditi",
      lastName: "Rao",
      email: `aditi.rao.${runId}@test.edu`,
      rollNumber: `A26-${runId}`,
      courseId: courseAlpha!.id,
      semester: 3,
      section: "A",
    });
    studentAlpha = await db.student.findUnique({ where: { id: res.id } });
  }

  let studentBeta = await db.student.findFirst({ where: { institutionId: instBeta.id } });
  if (!studentBeta) {
    const res = await createStudent(instBeta.id, {
      firstName: "Bharath",
      lastName: "Kumar",
      email: `bharath.k.${runId}@test.edu`,
      rollNumber: `B26-${runId}`,
      courseId: courseAlpha!.id,
      semester: 3,
      section: "A",
    });
    studentBeta = await db.student.findUnique({ where: { id: res.id } });
  }

  if (!courseAlpha || !subAlpha || !subBeta || !studentAlpha || !studentBeta) {
    throw new Error("Failed to initialize test entities.");
  }

  const course = courseAlpha;
  const sub = subAlpha;
  const sAlpha = studentAlpha;
  const sBeta = studentBeta;

  console.log(`Initialized Test Context for Alpha (${instAlpha.id}) and Beta (${instBeta.id}).\n`);

  // =========================================================================
  // TEST SECTION 1: INTERNAL ASSESSMENTS (IA)
  // =========================================================================
  console.log("--- 1. Testing Internal Assessments (IA) Module ---");
  {
    // 1.1 Admin creates IA Assessment for Alpha
    const iaName = `Continuous Internal Assessment 1 - ${runId}`;
    const createdIA = await createIAAssessment(instAlpha.id, {
      name: iaName,
      courseId: course.id,
      subjectId: sub.id,
      academicYearId: ayAlpha.id,
      maxMarks: 50,
      weightagePercentage: 20,
      assessmentDate: new Date("2026-11-15"),
    });

    assert(Boolean(createdIA), "Admin created IA assessment configuration successfully");
    assert(createdIA.institutionId === instAlpha.id, "IA assessment is strictly scoped to Alpha institution");

    // 1.2 Verify assessment_records were persisted to PostgreSQL
    const savedRecords = await db.assessmentRecord.findMany({
      where: {
        institutionId: instAlpha.id,
        assessmentName: iaName,
      },
    });
    assert(savedRecords.length > 0, `Database has ${savedRecords.length} assessment_records initialized in PostgreSQL`);
    assert(savedRecords[0].maxMarks === 50, "assessment_records have correct maxMarks (50)");

    // 1.3 Verify approval_requests entry was created
    const iaApproval = await db.approvalRequest.findFirst({
      where: {
        institutionId: instAlpha.id,
        requestType: "INTERNAL_ASSESSMENT",
        title: { contains: iaName },
      },
    });
    assert(Boolean(iaApproval), "Approval request record created in approval_requests for IA workflow");

    // 1.4 Admin / Teacher enters IA marks with max marks validation
    let threwMaxMarksError = false;
    try {
      await saveIAAssessmentMarks(instAlpha.id, {
        assessmentName: iaName,
        subjectId: sub.id,
        maxMarks: 50,
        marks: [
          { studentId: sAlpha.id, marksObtained: 55 }, // Invalid: 55 > 50
        ],
      });
    } catch {
      threwMaxMarksError = true;
    }
    assert(threwMaxMarksError, "Validation correctly rejects marks exceeding maxMarks (55 > 50)");

    // Enter valid marks
    const marksResult = await saveIAAssessmentMarks(instAlpha.id, {
      assessmentName: iaName,
      subjectId: sub.id,
      maxMarks: 50,
      marks: [
        { studentId: sAlpha.id, marksObtained: 44, remarks: "Excellent performance" },
      ],
    });
    assert(marksResult.success && marksResult.count === 1, "Valid IA marks successfully saved");

    // Verify marks in database
    const updatedRecord = await db.assessmentRecord.findFirst({
      where: {
        institutionId: instAlpha.id,
        studentId: sAlpha.id,
        assessmentName: iaName,
      },
    });
    assert(updatedRecord?.marksObtained === 44, "assessment_record reflects updated marks (44/50)");
    assert(updatedRecord?.remarks === "Excellent performance", "assessment_record reflects updated remarks");

    // 1.5 Admin IA Overview aggregates live stats
    const alphaAssessments = await getIAAssessments(instAlpha.id);
    const targetIA = alphaAssessments.find((a: any) => a.name === iaName);
    assert(Boolean(targetIA), "getIAAssessments successfully aggregates assessment from database");
    assert(Boolean(targetIA && targetIA.studentsAssessed >= 1), "IA shows completion statistics with students assessed");

    // 1.6 Student Isolation: Beta student should see 0 records from Alpha
    const betaStudentRecords = await db.assessmentRecord.findMany({
      where: {
        institutionId: instBeta.id,
        studentId: sBeta.id,
      },
    });
    assert(!betaStudentRecords.some((r) => r.assessmentName === iaName), "Tenant Isolation: Beta student has 0 IA records from Alpha");
  }

  // =========================================================================
  // TEST SECTION 2: EXAMINATIONS & SCHEDULING CONFLICTS
  // =========================================================================
  console.log("\n--- 2. Testing Examinations & Scheduling Module ---");
  {
    // 2.1 Admin creates Exam Schedule
    const examTitle = `Mid-Semester Examinations 2026 - ${runId}`;
    const examSchedule = await createExamination(instAlpha.id, {
      name: examTitle,
      academicYearId: ayAlpha.id,
      semester: 3,
      type: "MIDTERM",
      startDate: new Date("2026-11-20"),
      endDate: new Date("2026-11-30"),
    });

    assert(Boolean(examSchedule?.id), "Admin created examination schedule in exam_schedules");
    assert(examSchedule.semester === 3, "Exam schedule semester is correctly set to 3");
    assert(examSchedule.status === "SCHEDULED" || examSchedule.status === "DRAFT", "Exam schedule created in draft/scheduled status");

    // 2.2 Schedule Exam Slot 1
    const slot1 = await createExamSlot(instAlpha.id, {
      examScheduleId: examSchedule.id,
      subjectCode: sub.code || "CS201",
      subjectName: sub.name,
      examDate: "2026-11-22",
      startTime: "10:00",
      endTime: "13:00",
      roomNumber: "Exam Hall 101",
    });
    assert(Boolean(slot1?.id), "Exam slot 1 scheduled successfully in Exam Hall 101");

    // 2.3 Prevent Timetable Conflict: Same Room Overlapping Time
    let threwRoomConflict = false;
    try {
      await createExamSlot(instAlpha.id, {
        examScheduleId: examSchedule.id,
        subjectCode: "MATH-301",
        subjectName: "Engineering Mathematics III",
        examDate: "2026-11-22",
        startTime: "11:00", // Overlaps 10:00 - 13:00!
        endTime: "14:00",
        roomNumber: "Exam Hall 101", // Same room!
      });
    } catch (err: any) {
      if (err.message.includes("Room \"Exam Hall 101\" is already booked")) {
        threwRoomConflict = true;
      }
    }
    assert(threwRoomConflict, "Conflict Engine successfully prevented double-booking Room 'Exam Hall 101'");

    // 2.4 Prevent Subject Conflict: Same Subject Scheduled Twice at Same Time
    let threwSubjectConflict = false;
    try {
      await createExamSlot(instAlpha.id, {
        examScheduleId: examSchedule.id,
        subjectCode: sub.code || "CS201", // Same subject!
        subjectName: sub.name,
        examDate: "2026-11-22",
        startTime: "10:30",
        endTime: "12:30",
        roomNumber: "Exam Hall 202", // Different room, but same subject!
      });
    } catch (err: any) {
      if (err.message.includes("is already scheduled")) {
        threwSubjectConflict = true;
      }
    }
    assert(threwSubjectConflict, "Conflict Engine successfully prevented duplicate slot for same subject");

    // 2.5 Admin Publishes Examination Schedule
    const publishedExam = await updateExaminationStatus(instAlpha.id, examSchedule.id, "PUBLISHED");
    assert(publishedExam?.isPublished === true, "Admin successfully published examination schedule");

    // Verify student sees published schedule
    const studentSchedules = await db.examSchedule.findMany({
      where: {
        institutionId: instAlpha.id,
        semester: 3,
        isPublished: true,
      },
      include: { slots: true },
    });
    assert(studentSchedules.some((s) => s.id === examSchedule.id), "Student query returns published exam schedule with slots");
  }

  // =========================================================================
  // TEST SECTION 3: RESULTS AND MARKS WORKFLOW
  // =========================================================================
  console.log("\n--- 3. Testing Results and Marks Workflow Module ---");
  {
    // Create an un-published exam schedule for results testing
    const resultExamTitle = `Semester End Results Test - ${runId}`;
    const resultSchedule = await createExamination(instAlpha.id, {
      name: resultExamTitle,
      academicYearId: ayAlpha.id,
      semester: 3,
      type: "FINAL",
      startDate: new Date("2026-12-01"),
      endDate: new Date("2026-12-10"),
    });

    // 3.1 Validate max marks and save marks
    let threwResultMaxMarksError = false;
    try {
      await saveExamResults(instAlpha.id, {
        examScheduleId: resultSchedule.id,
        subjectId: sub.id,
        results: [
          { studentId: sAlpha.id, internalMarks: 60, externalMarks: 50, maxMarks: 100 }, // 110 > 100!
        ],
      });
    } catch {
      threwResultMaxMarksError = true;
    }
    assert(threwResultMaxMarksError, "Result marks entry correctly rejects scores exceeding max marks (110 > 100)");

    // Save valid results
    const saveRes = await saveExamResults(instAlpha.id, {
      examScheduleId: resultSchedule.id,
      subjectId: sub.id,
      results: [
        { studentId: sAlpha.id, internalMarks: 25, externalMarks: 60, maxMarks: 100, credits: 4 }, // Total 85 (A Grade)
      ],
    });
    assert(saveRes.success && saveRes.count === 1, "Exam results successfully saved to PostgreSQL exam_results");

    // 3.2 Verify Student cannot see results before publication
    const studentUnpublishedResults = await db.examResult.findMany({
      where: {
        studentId: sAlpha.id,
        institutionId: instAlpha.id,
        examSchedule: { isPublished: true },
      },
    });
    assert(
      !studentUnpublishedResults.some((r) => r.examScheduleId === resultSchedule.id),
      "Security: Student CANNOT see exam results prior to official publication"
    );

    // 3.3 Admin Reviews & Publishes Result Batch
    const publishedBatch = await publishResultBatch(instAlpha.id, resultSchedule.id);
    assert(publishedBatch.isPublished === true, "Admin published result batch in exam_schedules");

    // 3.4 Verify Student can now see published results with computed Grade & GradePoint
    const studentPublishedResults = await db.examResult.findMany({
      where: {
        studentId: sAlpha.id,
        institutionId: instAlpha.id,
        examSchedule: { isPublished: true },
      },
      include: { examSchedule: true, subject: true },
    });
    const studentResult = studentPublishedResults.find((r) => r.examScheduleId === resultSchedule.id);
    assert(Boolean(studentResult), "Student CAN see result after publication");
    assert(studentResult?.totalMarks === 85, "Result total marks are accurately computed (85/100)");
    assert(studentResult?.grade === "A", "Result grade accurately resolved (A for 85%)");
    assert(studentResult?.gradePoint === 9, "Result grade point accurately resolved (9 for A grade)");
    assert(studentResult?.isPassed === true, "Result isPassed flag is true");

    // 3.5 Prevent post-publication modification without unpublishing
    let threwPostPubError = false;
    try {
      await saveExamResults(instAlpha.id, {
        examScheduleId: resultSchedule.id,
        subjectId: sub.id,
        results: [
          { studentId: sAlpha.id, internalMarks: 30, externalMarks: 60, maxMarks: 100 },
        ],
      });
    } catch (e: any) {
      if (e.message.includes("already been published")) {
        threwPostPubError = true;
      }
    }
    assert(threwPostPubError, "Security: System blocks modifications to published results without administrative moderation");
  }

  // =========================================================================
  // TEST SECTION 4: ASSIGNMENTS AND SUBMISSIONS
  // =========================================================================
  console.log("\n--- 4. Testing Assignments & Submissions Module ---");
  {
    // 4.1 Teacher / Admin creates Assignment
    const asgId = crypto.randomUUID();
    const asg = await db.assignment.create({
      data: {
        id: asgId,
        institutionId: instAlpha.id,
        subjectId: sub.id,
        title: `Binary Search Tree Implementation - ${runId}`,
        description: "Implement AVL rotation and traversal in C++.",
        dueDate: new Date(Date.now() + 86400000 * 5),
        totalPoints: 50,
        createdAt: new Date(),
      },
    });
    assert(Boolean(asg?.id), "Assignment created in PostgreSQL assignments table");

    // 4.2 Student Submits Assignment
    const subId = crypto.randomUUID();
    const submission = await db.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: asgId,
          studentId: sAlpha.id,
        },
      },
      update: {
        textContent: "Github Repo: https://github.com/aditi/avl-tree",
        submittedAt: new Date(),
        status: "SUBMITTED",
      },
      create: {
        id: subId,
        institutionId: instAlpha.id,
        assignmentId: asgId,
        studentId: sAlpha.id,
        textContent: "Github Repo: https://github.com/aditi/avl-tree",
        submittedAt: new Date(),
        status: "SUBMITTED",
      },
    });
    assert(submission.status === "SUBMITTED", "Student assignment submission successfully recorded");

    // 4.3 Teacher Grades Submission
    const gradedSub = await db.assignmentSubmission.update({
      where: { id: submission.id },
      data: {
        score: 48,
        feedback: "Clean AVL balancing logic and exhaustive unit tests.",
        status: "GRADED",
      },
    });
    assert(gradedSub.status === "GRADED", "Teacher graded submission status updated to GRADED");
    assert(gradedSub.score === 48, "Graded score accurately recorded (48/50)");
    assert(Boolean(gradedSub.feedback), "Teacher feedback accurately saved");

    // 4.4 Admin Oversight View
    const adminAssignments = await getAdminAssignments(instAlpha.id);
    const targetAdminAsg = adminAssignments.find((a: any) => a.id === asgId);
    assert(Boolean(targetAdminAsg), "Admin oversight retrieves live assignment from PostgreSQL");
    assert(Boolean(targetAdminAsg && targetAdminAsg.submittedCount >= 1), "Admin view shows submittedCount >= 1");
    assert(Boolean(targetAdminAsg && targetAdminAsg.gradedCount >= 1), "Admin view shows gradedCount >= 1");

    // 4.5 Tenant Isolation: Beta admin cannot see Alpha assignments
    const betaAssignments = await getAdminAssignments(instBeta.id);
    assert(!betaAssignments.some((a: any) => a.id === asgId), "Tenant Isolation: Beta admin sees 0 assignments from Alpha");
  }

  // =========================================================================
  // TEST SUMMARY
  // =========================================================================
  console.log("\n========================================================");
  console.log(`PHASE 2 INTEGRATION TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPhase2IntegrationTests()
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
