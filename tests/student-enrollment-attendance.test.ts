import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "crypto";
import { createStudent } from "../lib/services/institution-admin.service";
import db from "../lib/db";

async function runStudentEnrollmentAttendanceTests() {
  console.log("=== RUNNING STUDENT ENROLLMENT & ATTENDANCE INTEGRITY TESTS ===");

  const institution = await db.institution.findFirst({
    where: { isActive: true },
  });

  if (!institution) {
    console.log("No active institution found.");
    return;
  }

  const rollNumber = `ROLL-${Date.now().toString().slice(-6)}`;
  const testEmail = `student.enrolled.${Date.now()}@sst-test.edu`;
  const testName = "Test Enrolled Student";

  let createdStudentId: string | null = null;
  let createdUserId: string | null = null;
  let createdEnrollmentId: string | null = null;
  let createdAttendanceId: string | null = null;
  let createdSubjectId: string | null = null;

  try {
    // 1. Create a student via createStudent
    const res = await createStudent(institution.id, {
      fullName: testName,
      email: testEmail,
      rollNumber,
      phone: "+91 98888 22222",
    });

    assert.ok(res.id, "Student ID must be returned");
    assert.ok(res.user, "User record must be returned");
    assert.ok(res.enrollment, "Active Enrollment record must be created and returned");

    createdStudentId = res.id;
    createdUserId = res.user.id;
    createdEnrollmentId = res.enrollment.id;

    console.log("PASS 1: createStudent successfully provisioned Student, User, and active Enrollment");

    // 2. Verify Enrollment integrity in database
    const dbEnrollment = await db.enrollment.findUnique({
      where: { id: createdEnrollmentId! },
    });

    assert.ok(dbEnrollment, "Enrollment record must exist in DB");
    assert.equal(dbEnrollment.studentId, createdStudentId, "Enrollment must link to created student");
    assert.equal(dbEnrollment.institutionId, institution.id, "Enrollment must link to correct institution");
    assert.equal(dbEnrollment.status, "ACTIVE", "Enrollment status must be ACTIVE");

    console.log("PASS 2: Verified active Enrollment record in database with correct relations");

    // 3. Find or create a subject for recording attendance
    let subjects: any = await db.$queryRawUnsafe(`
      SELECT id FROM subjects WHERE "institutionId" = $1 LIMIT 1
    `, institution.id);
    let subjectId = subjects[0]?.id;
    if (!subjectId) {
      subjectId = crypto.randomUUID();
      await db.$queryRawUnsafe(`
        INSERT INTO subjects (id, "institutionId", "courseId", code, name, semester, credits, "isElective", "createdAt", type, status)
        VALUES ($1, $2, $3, $4, $5, 1, 3, false, NOW(), 'CORE_THEORY', 'ACTIVE')
      `, subjectId, institution.id, dbEnrollment.courseId, `SUB-${Date.now().toString().slice(-4)}`, "Test Subject For Attendance");
      createdSubjectId = subjectId;
    }

    // 4. Record attendance using the enrollmentId - MUST SUCCEED without Foreign Key violation
    createdAttendanceId = crypto.randomUUID();
    const attendanceRecord = await db.attendanceRecord.create({
      data: {
        id: createdAttendanceId,
        institutionId: institution.id,
        studentId: createdStudentId!,
        enrollmentId: createdEnrollmentId!,
        subjectId: subjectId,
        date: new Date(),
        status: "PRESENT",
        remarks: "Automated Phase 1 verification check",
        recordedAt: new Date(),
      },
    });

    assert.ok(attendanceRecord, "Attendance record must be saved in DB");
    assert.equal(attendanceRecord.enrollmentId, createdEnrollmentId, "Attendance record must link to enrollment");

    console.log("PASS 3: Successfully recorded AttendanceRecord referencing newly created student's Enrollment without foreign key errors!");

  } finally {
    // Cleanup in reverse dependency order
    if (createdAttendanceId) {
      await db.attendanceRecord.deleteMany({ where: { id: createdAttendanceId } });
    }
    if (createdEnrollmentId) {
      await db.enrollment.deleteMany({ where: { id: createdEnrollmentId } });
    }
    if (createdSubjectId) {
      await db.subject.deleteMany({ where: { id: createdSubjectId } });
    }
    if (createdStudentId) {
      await db.$executeRawUnsafe(`DELETE FROM students WHERE id = $1`, createdStudentId);
    }
    if (createdUserId) {
      await db.user.deleteMany({ where: { id: createdUserId } });
    }
    console.log("Cleaned up test records.");
  }

  console.log("=== ALL STUDENT ENROLLMENT & ATTENDANCE INTEGRITY TESTS PASSED ===");
}

runStudentEnrollmentAttendanceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
  });
