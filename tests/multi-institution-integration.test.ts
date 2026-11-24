import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "crypto";
import db from "../lib/db";
import { signToken, AUTH_COOKIE_NAME, computePasswordSignature } from "../lib/auth/jwt";
import { SessionUser } from "../types";
import { NextRequest } from "next/server";
import { GET as getAdminAttendance, POST as postAdminAttendance } from "../app/api/admin/attendance/route";
import { GET as getAdminTimetable, POST as postAdminTimetable, DELETE as deleteAdminTimetable } from "../app/api/admin/timetable/route";
import { createStaff, createStudent } from "../lib/services/institution-admin.service";
import { getAttendanceSessions, getSectionStudents } from "../lib/services/teacher.service";

async function runMultiInstitutionIntegrationTests() {
  console.log("===============================================================");
  console.log("=== MULTI-INSTITUTION & CROSS-TENANT INTEGRATION TEST SUITE ===");
  console.log("===============================================================\n");

  const runId = Date.now().toString().slice(-6);
  const instAId = `test-inst-a-${runId}`;
  const instBId = `test-inst-b-${runId}`;

  const cleanupIds = {
    institutions: [instAId, instBId],
    users: [] as string[],
    courses: [] as string[],
    subjects: [] as string[],
    teachers: [] as string[],
    students: [] as string[],
    enrollments: [] as string[],
    attendanceRecords: [] as string[],
    timetableSlots: [] as string[],
  };

  try {
    // ------------------------------------------------------------------------
    // 1. PROVISION TEST INSTITUTIONS
    // ------------------------------------------------------------------------
    console.log("STEP 1: Provisioning isolated Institution A and Institution B...");
    await db.$executeRawUnsafe(`
      INSERT INTO institutions (id, name, code, type, status, "createdAt", "updatedAt")
      VALUES
        ($1, 'Alpha Institute of Technology', $2, 'COLLEGE', 'ACTIVE', NOW(), NOW()),
        ($3, 'Beta University', $4, 'COLLEGE', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, instAId, `AIT-${runId}`, instBId, `BU-${runId}`);
    console.log(`✓ Created Institution A (${instAId}) and Institution B (${instBId})\n`);

    // ------------------------------------------------------------------------
    // 2. PROVISION ADMINS & SESSIONS
    // ------------------------------------------------------------------------
    console.log("STEP 2: Provisioning Tenant-Isolated Admins...");
    const adminAPwHash = "$2a$12$eXampleHashedPasswordForAdminTestingPurposesOnly123";
    const adminBPwHash = "$2a$12$eXampleHashedPasswordForAdminTestingPurposesOnly123";
    const adminAId = crypto.randomUUID();
    const adminBId = crypto.randomUUID();
    cleanupIds.users.push(adminAId, adminBId);

    await db.$executeRawUnsafe(`
      INSERT INTO users (id, email, "fullName", "passwordHash", role, "institutionId", "isActive", "createdAt", "updatedAt")
      VALUES
        ($1, $2, 'Admin A', $3, 'ADMIN', $4, true, NOW(), NOW()),
        ($5, $6, 'Admin B', $7, 'ADMIN', $8, true, NOW(), NOW())
    `, adminAId, `admin-a-${runId}@test.com`, adminAPwHash, instAId,
       adminBId, `admin-b-${runId}@test.com`, adminBPwHash, instBId);

    const tokenA = await signToken({
      userId: adminAId,
      email: `admin-a-${runId}@test.com`,
      fullName: "Admin A",
      role: "ADMIN",
      institutionId: instAId,
      institutionName: "Alpha Institute of Technology",
      passwordSig: computePasswordSignature(adminAPwHash),
    });

    const tokenB = await signToken({
      userId: adminBId,
      email: `admin-b-${runId}@test.com`,
      fullName: "Admin B",
      role: "ADMIN",
      institutionId: instBId,
      institutionName: "Beta University",
      passwordSig: computePasswordSignature(adminBPwHash),
    });

    const headersA = { cookie: `${AUTH_COOKIE_NAME}=${tokenA}` };
    const headersB = { cookie: `${AUTH_COOKIE_NAME}=${tokenB}` };

    console.log("✓ Admin sessions created for Tenant A and Tenant B\n");

    // ------------------------------------------------------------------------
    // 3. VERIFY ADMIN ANTI-SPOOFING & TENANT ISOLATION
    // ------------------------------------------------------------------------
    console.log("STEP 3: Testing Admin Tenant Anti-Spoofing...");
    // Admin A tries to spoof Tenant B via header
    const spoofReq = new NextRequest("http://localhost:3000/api/admin/attendance", {
      headers: {
        ...headersA,
        "x-institution-id": instBId,
      },
    });
    const spoofRes = await getAdminAttendance(spoofReq);
    assert.equal(spoofRes.status, 403, "Admin A spoofing Inst B header must be blocked with HTTP 403");
    console.log("✓ PASS: Admin header spoofing across tenants blocked (HTTP 403)\n");

    // ------------------------------------------------------------------------
    // 4. PROVISION ACADEMICS & SYNCHRONIZED STAFF IN TENANT A
    // ------------------------------------------------------------------------
    console.log("STEP 4: Provisioning Course, Subject, and Staff in Tenant A...");
    const courseAId = crypto.randomUUID();
    cleanupIds.courses.push(courseAId);
    await db.$executeRawUnsafe(`
      INSERT INTO courses (id, "institutionId", code, name, department, "totalSemesters", "createdAt", status)
      VALUES ($1, $2, $3, 'Computer Science', 'Engineering', 8, NOW(), 'ACTIVE')
    `, courseAId, instAId, `CS-${runId}`);

    const subjectAId = crypto.randomUUID();
    cleanupIds.subjects.push(subjectAId);
    await db.$executeRawUnsafe(`
      INSERT INTO subjects (id, "institutionId", "courseId", code, name, semester, credits, "isElective", "createdAt", type, status)
      VALUES ($1, $2, $3, $4, 'Database Systems', 1, 4, false, NOW(), 'CORE_THEORY', 'ACTIVE')
    `, subjectAId, instAId, courseAId, `CS101-${runId}`);

    const staffAEmail = `prof.sharma.${runId}@test.com`;
    const staffARes = await createStaff(instAId, {
      fullName: "Prof. Sharma",
      email: staffAEmail,
      department: "Engineering",
      designation: "Associate Professor",
      employeeId: `EMP-A-${runId}`,
    });

    assert.ok(staffARes.teacherProfile?.id, "Teacher profile must be generated");
    assert.equal(staffARes.institutionId, instAId, "Staff institutionId must match Tenant A");
    const teacherAId = staffARes.teacherProfile.id;
    cleanupIds.teachers.push(teacherAId);
    if (staffARes.user?.id) cleanupIds.users.push(staffARes.user.id);
    console.log(`✓ Synchronized Staff & Teacher created in Tenant A (Teacher ID: ${teacherAId})\n`);

    // ------------------------------------------------------------------------
    // 5. PROVISION STUDENT IN TENANT A & VERIFY AUTO-ENROLLMENT
    // ------------------------------------------------------------------------
    console.log("STEP 5: Provisioning Student in Tenant A & verifying auto-enrollment...");
    const studentAEmail = `student.rahul.${runId}@test.com`;
    const studentARes = await createStudent(instAId, {
      firstName: "Rahul",
      lastName: "Verma",
      email: studentAEmail,
      rollNumber: `ROLL-A-${runId}`,
      courseId: courseAId,
      department: "Engineering",
      semester: 1,
      section: "A",
    });

    assert.ok(studentARes.id, "Student ID must be returned");
    cleanupIds.students.push(studentARes.id);
    if (studentARes.userId) cleanupIds.users.push(studentARes.userId);

    // Verify enrollment created in database
    const enrollments: any = await db.$queryRawUnsafe(`
      SELECT id, "studentId", "courseId", "institutionId", status
      FROM enrollments
      WHERE "studentId" = $1 AND "institutionId" = $2
    `, studentARes.id, instAId);

    assert.equal(enrollments.length, 1, "Exactly one active Enrollment must exist for newly created student");
    assert.equal(enrollments[0].status, "ACTIVE", "Enrollment status must be ACTIVE");
    cleanupIds.enrollments.push(enrollments[0].id);
    console.log(`✓ Auto-enrollment verified in enrollments table (Enrollment ID: ${enrollments[0].id})\n`);

    // ------------------------------------------------------------------------
    // 6. RECORD ATTENDANCE IN TENANT A & VERIFY FOREIGN KEY INTEGRITY
    // ------------------------------------------------------------------------
    console.log("STEP 6: Recording Attendance for Student A in Tenant A...");
    const attRecordId = crypto.randomUUID();
    cleanupIds.attendanceRecords.push(attRecordId);
    await db.$executeRawUnsafe(`
      INSERT INTO attendance_records (
        id, "institutionId", "studentId", "subjectId", "enrollmentId", date, status, "recordedAt", remarks
      ) VALUES (
        $1, $2, $3, $4, $5, CURRENT_DATE, 'PRESENT', NOW(), 'Initial attendance scan'
      )
    `, attRecordId, instAId, studentARes.id, subjectAId, enrollments[0].id);

    // Admin A fetches attendance: must see this record
    const getAttReqA = new NextRequest("http://localhost:3000/api/admin/attendance", { headers: headersA });
    const getAttResA = await getAdminAttendance(getAttReqA);
    assert.equal(getAttResA.status, 200, "Admin A must get 200");
    const getAttDataA = await getAttResA.json();
    assert.equal(getAttDataA.institutionId, instAId, "Data must belong to Tenant A");
    const foundInA = getAttDataA.data.find((r: any) => r.id === attRecordId);
    assert.ok(foundInA, "Attendance record must be visible to Admin A");

    // Admin B fetches attendance: must NOT see Tenant A's record
    const getAttReqB = new NextRequest("http://localhost:3000/api/admin/attendance", { headers: headersB });
    const getAttResB = await getAdminAttendance(getAttReqB);
    assert.equal(getAttResB.status, 200, "Admin B must get 200");
    const getAttDataB = await getAttResB.json();
    assert.equal(getAttDataB.institutionId, instBId, "Data must belong to Tenant B");
    const foundInB = getAttDataB.data.find((r: any) => r.id === attRecordId);
    assert.equal(foundInB, undefined, "Tenant A's attendance record MUST NOT be visible to Admin B");
    console.log("✓ PASS: Attendance successfully recorded and isolated strictly within Tenant A\n");

    // ------------------------------------------------------------------------
    // 7. TEACHER CROSS-TENANT ISOLATION
    // ------------------------------------------------------------------------
    console.log("STEP 7: Verifying Teacher Portal Cross-Tenant Isolation...");
    // 7a. Unauthenticated calls must throw 401
    try {
      await getAttendanceSessions();
      assert.fail("Unauthenticated getAttendanceSessions should have thrown 401");
    } catch (err: any) {
      assert.equal(err.status || err.statusCode, 401, "Must throw 401 UNAUTHENTICATED");
      console.log("✓ PASS: Unauthenticated teacher session blocked (401 UNAUTHENTICATED)");
    }

    try {
      await getSectionStudents("A");
      assert.fail("Unauthenticated getSectionStudents should have thrown 401");
    } catch (err: any) {
      assert.equal(err.status || err.statusCode, 401, "Must throw 401 UNAUTHENTICATED");
      console.log("✓ PASS: Unauthenticated student roster lookup blocked (401 UNAUTHENTICATED)");
    }

    // 7b. Cross-tenant teacher session verification via getTeacherSession
    const { getTeacherSession, signTeacherSession } = await import("../lib/auth/teacher-session");
    const now = Date.now();
    const tokenTeacherA = await signTeacherSession({
      userId: staffARes.user.id,
      teacherId: teacherAId,
      institutionId: instAId,
      institutionSlug: `ait-${runId}`,
      email: staffAEmail,
      fullName: "Prof. Sharma",
      employeeId: `EMP-A-${runId}`,
      designation: "Associate Professor",
      department: "Engineering",
      activeRole: "teacher",
      availableRoles: ["teacher"],
      issuedAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      lastActivity: now,
    });

    const tokenHashA = crypto.createHash("sha256").update(tokenTeacherA).digest("hex");
    const sessionRecId = crypto.randomUUID();
    const teacherUserId = staffARes.user.id;

    // Activate teacher account for session test
    await db.$executeRawUnsafe(`UPDATE users SET "isActive" = true WHERE id = $1`, teacherUserId);

    await db.$executeRawUnsafe(`
      INSERT INTO teacher_portal_sessions (
        id, token_hash, user_id, institution_id, active_role, expires_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'teacher', $5, NOW(), NOW()
      )
    `, sessionRecId, tokenHashA, teacherUserId, instAId, new Date(now + 24 * 60 * 60 * 1000));

    try {
      const teacherReqA = new NextRequest("http://localhost:3000", {
        headers: { cookie: `sst_teacher_session=${tokenTeacherA}` },
      });

      // Resolving Inst A slug must succeed
      const sessA = await getTeacherSession(`AIT-${runId}`, { req: teacherReqA });
      assert.ok(sessA !== null, "Teacher session must resolve for matching institution slug");
      assert.equal(sessA.institution.id, instAId, "Session institutionId must match Tenant A");
      console.log("✓ PASS: Teacher session resolves correctly within Tenant A");

      // Resolving Inst B slug must return null (cross-tenant blocked)
      const sessB = await getTeacherSession(`BU-${runId}`, { req: teacherReqA });
      assert.equal(sessB, null, "Teacher from Tenant A cannot access Tenant B portal");
      console.log("✓ PASS: Teacher cross-tenant portal access strictly blocked (returns null)");

    } finally {
      await db.$executeRawUnsafe(`DELETE FROM teacher_portal_sessions WHERE id = $1`, sessionRecId);
    }

    // 7c. Direct student roster database isolation
    const studentsInA: any = await db.$queryRawUnsafe(`
      SELECT id, "institutionId" FROM students WHERE "institutionId" = $1
    `, instAId);
    assert.equal(studentsInA.length, 1, "Tenant A must contain exactly 1 student");
    assert.equal(studentsInA[0].id, studentARes.id);

    const studentsInB: any = await db.$queryRawUnsafe(`
      SELECT id, "institutionId" FROM students WHERE "institutionId" = $1
    `, instBId);
    assert.equal(studentsInB.length, 0, "Tenant B must contain 0 students from Tenant A");
    console.log("✓ PASS: Student roster strictly partitioned by institution boundary\n");

    // ------------------------------------------------------------------------
    // 8. TIMETABLE PROVISIONING, CONFLICT DETECTION & CROSS-TENANT ISOLATION
    // ------------------------------------------------------------------------
    console.log("STEP 8: Verifying Admin Timetable Provisioning & Cross-Tenant Isolation...");
    const postSlotReq = new NextRequest("http://localhost:3000/api/admin/timetable", {
      method: "POST",
      headers: { ...headersA, "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: subjectAId,
        teacherId: teacherAId,
        dayOfWeek: "TUESDAY",
        startTime: "11:00",
        endTime: "11:50",
        roomNumber: `Room-LAB-${runId}`,
        section: "A",
        courseId: courseAId,
        semester: 1,
      }),
    });

    const postSlotRes = await postAdminTimetable(postSlotReq);
    assert.equal(postSlotRes.status, 200, "POST /api/admin/timetable must return 200");
    const postSlotData = await postSlotRes.json();
    assert.equal(postSlotData.success, true, "Slot creation must succeed");
    const slotId = postSlotData.data.id;
    cleanupIds.timetableSlots.push(slotId);
    console.log(`✓ Timetable slot created in Tenant A (Slot ID: ${slotId})`);

    // Verify Admin B does not see this slot
    const getSlotsReqB = new NextRequest("http://localhost:3000/api/admin/timetable", { headers: headersB });
    const getSlotsResB = await getAdminTimetable(getSlotsReqB);
    assert.equal(getSlotsResB.status, 200, "Admin B GET /api/admin/timetable must return 200");
    const getSlotsDataB = await getSlotsResB.json();
    const foundSlotInB = getSlotsDataB.data.find((s: any) => s.id === slotId);
    assert.equal(foundSlotInB, undefined, "Slot of Tenant A MUST NOT appear in Tenant B timetable");
    console.log("✓ PASS: Timetable strictly isolated between Tenant A and Tenant B");

    // Verify conflict detection (409) for double-booking Room-LAB on Tuesday 11:00
    const conflictSlotReq = new NextRequest("http://localhost:3000/api/admin/timetable", {
      method: "POST",
      headers: { ...headersA, "content-type": "application/json" },
      body: JSON.stringify({
        subjectId: subjectAId,
        dayOfWeek: "TUESDAY",
        startTime: "11:00",
        endTime: "11:50",
        roomNumber: `Room-LAB-${runId}`,
        section: "B",
        courseId: courseAId,
        semester: 1,
      }),
    });
    const conflictSlotRes = await postAdminTimetable(conflictSlotReq);
    assert.equal(conflictSlotRes.status, 409, "Double booking same room must return HTTP 409 Conflict");
    console.log("✓ PASS: Scheduling conflict detection verified (HTTP 409)\n");

    // ------------------------------------------------------------------------
    // 9. CLEAN DELETION OF TIMETABLE SLOT
    // ------------------------------------------------------------------------
    console.log("STEP 9: Verifying Slot Deletion...");
    const deleteSlotReq = new NextRequest(`http://localhost:3000/api/admin/timetable?id=${encodeURIComponent(slotId)}`, {
      method: "DELETE",
      headers: headersA,
    });
    const deleteSlotRes = await deleteAdminTimetable(deleteSlotReq);
    assert.equal(deleteSlotRes.status, 200, "DELETE /api/admin/timetable must return 200");
    console.log("✓ PASS: Timetable slot cleanly removed via DELETE\n");

  } finally {
    console.log("CLEANUP: Cleaning up test artifacts...");
    try {
      for (const id of cleanupIds.timetableSlots) {
        await db.$executeRawUnsafe(`DELETE FROM timetable_slots WHERE id = $1`, id);
      }
      for (const id of cleanupIds.attendanceRecords) {
        await db.$executeRawUnsafe(`DELETE FROM attendance_records WHERE id = $1`, id);
      }
      for (const id of cleanupIds.enrollments) {
        await db.$executeRawUnsafe(`DELETE FROM enrollments WHERE id = $1`, id);
      }
      for (const id of cleanupIds.students) {
        await db.$executeRawUnsafe(`DELETE FROM students WHERE id = $1`, id);
      }
      for (const id of cleanupIds.teachers) {
        await db.$executeRawUnsafe(`DELETE FROM teachers WHERE id = $1`, id);
      }
      for (const id of cleanupIds.subjects) {
        await db.$executeRawUnsafe(`DELETE FROM subjects WHERE id = $1`, id);
      }
      for (const id of cleanupIds.courses) {
        await db.$executeRawUnsafe(`DELETE FROM courses WHERE id = $1`, id);
      }
      for (const id of cleanupIds.users) {
        await db.$executeRawUnsafe(`DELETE FROM users WHERE id = $1`, id);
      }
      for (const id of cleanupIds.institutions) {
        await db.$executeRawUnsafe(`DELETE FROM institutions WHERE id = $1`, id);
      }
      console.log("✓ Cleanup completed successfully.");
    } catch (cleanupErr: any) {
      console.warn("Notice during cleanup:", cleanupErr.message);
    }
    await db.$disconnect();
  }

  console.log("\n===============================================================");
  console.log("=== ALL MULTI-INSTITUTION INTEGRATION TESTS PASSED 100% ===");
  console.log("===============================================================");
}

runMultiInstitutionIntegrationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("MULTI-INSTITUTION TEST FAILED:", err);
    process.exit(1);
  });
