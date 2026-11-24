import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "crypto";
import { GET as getAttendance, POST as postAttendance } from "../app/api/admin/attendance/route";
import { signToken, AUTH_COOKIE_NAME, computePasswordSignature } from "../lib/auth/jwt";
import { SessionUser } from "../types";
import { NextRequest } from "next/server";
import db from "../lib/db";

async function runAdminAttendanceIntegrationTests() {
  console.log("=== RUNNING ADMIN ATTENDANCE API INTEGRATION TESTS ===");

  // 1. Unauthenticated request to GET /api/admin/attendance must return 401
  const unauthReq = new NextRequest("http://localhost:3000/api/admin/attendance");
  const unauthRes = await getAttendance(unauthReq);
  assert.equal(unauthRes.status, 401, "Unauthenticated GET /api/admin/attendance must return 401");
  console.log("PASS 1: Unauthenticated GET /api/admin/attendance returns 401");

  // 2. Resolve admin user and institution
  const adminUser = await db.user.findFirst({
    where: { role: "ADMIN", isActive: true, institutionId: { not: null } },
  });

  if (!adminUser || !adminUser.institutionId) {
    console.log("Skipping live session test: No active admin with institution found.");
    return;
  }

  const institutionId = adminUser.institutionId;
  const adminPwHash = adminUser.passwordHash || "$2a$12$eXampleHashedPasswordForAdminTestingPurposesOnly123";
  if (!adminUser.passwordHash) {
    await db.user.update({
      where: { id: adminUser.id },
      data: { passwordHash: adminPwHash },
    });
  }
  const realSig = computePasswordSignature(adminPwHash);

  // Create valid admin session token
  const adminSession: SessionUser = {
    userId: adminUser.id,
    email: adminUser.email,
    fullName: adminUser.fullName || "Admin User",
    role: "ADMIN",
    institutionId,
    institutionName: "Admin Institution",
    passwordSig: realSig,
  };
  const adminToken = await signToken(adminSession);

  const authHeaders = {
    cookie: `${AUTH_COOKIE_NAME}=${adminToken}`,
  };

  // 3. Authenticated request to GET /api/admin/attendance
  const authReq = new NextRequest("http://localhost:3000/api/admin/attendance", {
    headers: authHeaders,
  });
  const authRes = await getAttendance(authReq);
  assert.equal(authRes.status, 200, "Authenticated GET /api/admin/attendance must return 200");
  const authData = await authRes.json();
  assert.equal(authData.success, true, "Response success must be true");
  assert.equal(authData.institutionId, institutionId, "Data must be scoped to admin institution");
  assert.ok(Array.isArray(authData.data), "Data field must be an array of records");
  console.log(`PASS 2: Authenticated GET /api/admin/attendance returns 200 with ${authData.data.length} records`);

  // 4. Test attendance correction via POST /api/admin/attendance
  const { createStudent } = await import("../lib/services/institution-admin.service");
  const testStudentRes = await createStudent(institutionId, {
    fullName: "Admin Attendance Test Student",
    email: `att.test.${Date.now()}@sst-test.edu`,
    rollNumber: `AT-${Date.now().toString().slice(-6)}`,
  });

  const testStudentId = testStudentRes.id;
  const enrollmentId = testStudentRes.enrollment.id;

  // Find or create subject
  let subjects: any = await db.$queryRawUnsafe(`
    SELECT id FROM subjects WHERE "institutionId" = $1 LIMIT 1
  `, institutionId);
  let subjectId = subjects[0]?.id;
  if (!subjectId) {
    subjectId = crypto.randomUUID();
    await db.$queryRawUnsafe(`
      INSERT INTO subjects (id, "institutionId", "courseId", code, name, semester, credits, "isElective", "createdAt", type, status)
      VALUES ($1, $2, $3, $4, $5, 1, 3, false, NOW(), 'THEORY', 'ACTIVE')
    `, subjectId, institutionId, testStudentRes.enrollment.courseId, `SUB-${Date.now().toString().slice(-4)}`, "Attendance Subject");
  }

  const recordId = crypto.randomUUID();
  await db.attendanceRecord.create({
    data: {
      id: recordId,
      institutionId,
      studentId: testStudentId,
      enrollmentId,
      subjectId,
      date: new Date(),
      status: "ABSENT",
      remarks: "Initial test status",
      recordedAt: new Date(),
    },
  });

  try {
    // Correct the record via POST
    const correctionReq = new NextRequest("http://localhost:3000/api/admin/attendance", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recordId,
        status: "PRESENT",
        reason: "Doctor certificate approved by principal",
        remarks: "Doctor certificate approved",
      }),
    });

    const correctionRes = await postAttendance(correctionReq);
    assert.equal(correctionRes.status, 200, "POST /api/admin/attendance correction must return 200");
    const correctionData = await correctionRes.json();
    assert.equal(correctionData.success, true, "Correction success must be true");

    // Verify update in DB
    const updated = await db.attendanceRecord.findUnique({
      where: { id: recordId },
    });
    assert.equal(updated?.status, "PRESENT", "Database record status must be updated to PRESENT");
    assert.ok(updated?.remarks?.includes("Doctor certificate"), "Remarks must be updated");

    // Verify Audit Log entry
    const audit = await db.auditLog.findFirst({
      where: { institutionId, entityId: recordId, action: "ATTENDANCE_CORRECTED" },
    });
    assert.ok(audit, "Audit log entry must be recorded for attendance correction");
    console.log("PASS 3: Attendance correction persists to DB and creates audit log entry");

  } finally {
    await db.attendanceRecord.deleteMany({ where: { id: recordId } });
    await db.auditLog.deleteMany({ where: { entityId: recordId } });
    await db.enrollment.deleteMany({ where: { id: enrollmentId } });
    await db.$executeRawUnsafe(`DELETE FROM students WHERE id = $1`, testStudentId);
    if (testStudentRes.user?.id) {
      await db.user.deleteMany({ where: { id: testStudentRes.user.id } });
    }
  }

  console.log("=== ALL ADMIN ATTENDANCE INTEGRATION TESTS PASSED ===");
}

runAdminAttendanceIntegrationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
  });
