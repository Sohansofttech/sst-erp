import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "crypto";
import { GET as getTimetable, POST as postTimetable, DELETE as deleteTimetable } from "../app/api/admin/timetable/route";
import { signToken, AUTH_COOKIE_NAME, computePasswordSignature } from "../lib/auth/jwt";
import { SessionUser } from "../types";
import { NextRequest } from "next/server";
import db from "../lib/db";

async function runAdminTimetableIntegrationTests() {
  console.log("=== RUNNING ADMIN TIMETABLE API INTEGRATION TESTS ===");

  await db.$executeRawUnsafe(`UPDATE subjects SET type = 'CORE_THEORY' WHERE type = 'THEORY'`);

  // 1. Unauthenticated request to GET /api/admin/timetable must return 401
  const unauthReq = new NextRequest("http://localhost:3000/api/admin/timetable");
  const unauthRes = await getTimetable(unauthReq);
  assert.equal(unauthRes.status, 401, "Unauthenticated GET /api/admin/timetable must return 401");
  console.log("PASS 1: Unauthenticated GET /api/admin/timetable returns 401");

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

  // 3. Authenticated request to GET /api/admin/timetable
  const authReq = new NextRequest("http://localhost:3000/api/admin/timetable", {
    headers: authHeaders,
  });
  const authRes = await getTimetable(authReq);
  assert.equal(authRes.status, 200, "Authenticated GET /api/admin/timetable must return 200");
  const authData = await authRes.json();
  assert.equal(authData.success, true, "Response success must be true");
  assert.equal(authData.institutionId, institutionId, "Data must be scoped to admin institution");
  assert.ok(Array.isArray(authData.data), "Data field must be an array of timetable slots");
  console.log(`PASS 2: Authenticated GET /api/admin/timetable returns 200 with ${authData.data.length} slots`);

  // 4. Test slot creation and conflict detection via POST /api/admin/timetable
  // Find or create course, subject, and teacher in this institution
  let course = await db.course.findFirst({ where: { institutionId } });
  if (!course) {
    const courseId = crypto.randomUUID();
    await db.$queryRawUnsafe(`
      INSERT INTO courses (id, "institutionId", code, name, department, "totalSemesters", "createdAt", status)
      VALUES ($1, $2, $3, $4, $5, 8, NOW(), 'ACTIVE')
    `, courseId, institutionId, "CSE-TEST", "Computer Science", "Engineering");
    course = await db.course.findUnique({ where: { id: courseId } });
  }

  let subjects: any = await db.$queryRawUnsafe(`
    SELECT id FROM subjects WHERE "institutionId" = $1 LIMIT 1
  `, institutionId);
  let subjectId = subjects[0]?.id;
  if (!subjectId) {
    subjectId = crypto.randomUUID();
    await db.$queryRawUnsafe(`
      INSERT INTO subjects (id, "institutionId", "courseId", code, name, semester, credits, "isElective", "createdAt", type, status)
      VALUES ($1, $2, $3, $4, $5, 1, 3, false, NOW(), 'CORE_THEORY', 'ACTIVE')
    `, subjectId, institutionId, course!.id, `SUB-${Date.now().toString().slice(-4)}`, "Algorithms & Data Structures");
  }

  const teacher = await db.teacher.findFirst({ where: { institutionId } });

  let createdSlotId: string | null = null;
  try {
    const postReq = new NextRequest("http://localhost:3000/api/admin/timetable", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        subjectId,
        teacherId: teacher?.id || undefined,
        dayOfWeek: "MONDAY",
        startTime: "10:00",
        endTime: "10:50",
        roomNumber: "Room-404-Test",
        sectionId: "sec-test-a",
        section: "A",
        courseId: course!.id,
        semester: 1,
      }),
    });

    const postRes = await postTimetable(postReq);
    assert.equal(postRes.status, 200, "POST /api/admin/timetable must return 200");
    const postData = await postRes.json();
    assert.equal(postData.success, true, "Slot creation must succeed");
    assert.ok(postData.data?.id, "Slot ID must be returned");
    createdSlotId = postData.data.id;
    console.log("PASS 3: Timetable slot configured and persisted to database via POST /api/admin/timetable");

    // 5. Conflict Test: Try to schedule the same room or teacher on the exact same period
    const conflictReq = new NextRequest("http://localhost:3000/api/admin/timetable", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        subjectId,
        teacherId: teacher?.id || undefined,
        dayOfWeek: "MONDAY",
        startTime: "10:00",
        endTime: "10:50",
        roomNumber: "Room-404-Test", // Exact same room and period
        sectionId: "sec-test-b",
        section: "B",
        courseId: course!.id,
        semester: 1,
      }),
    });

    const conflictRes = await postTimetable(conflictReq);
    assert.equal(conflictRes.status, 409, "Conflicting timetable slot for same room/faculty must return 409");
    const conflictData = await conflictRes.json();
    assert.equal(conflictData.success, false, "Conflict response success must be false");
    assert.ok(conflictData.error?.includes("conflict"), "Error message must indicate conflict");
    console.log("PASS 4: Conflict detection prevented double-booking room/faculty on same period (HTTP 409)");

    // 6. Test Slot Deletion via DELETE /api/admin/timetable?id=...
    const deleteReq = new NextRequest(`http://localhost:3000/api/admin/timetable?id=${encodeURIComponent(createdSlotId!)}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    const deleteRes = await deleteTimetable(deleteReq);
    assert.equal(deleteRes.status, 200, "DELETE /api/admin/timetable must return 200");
    const deleteData = await deleteRes.json();
    assert.equal(deleteData.success, true, "Slot deletion success must be true");

    // Verify deletion in DB
    const checkDeleted = await db.timetableSlot.findUnique({
      where: { id: createdSlotId! },
    });
    assert.equal(checkDeleted, null, "Deleted slot must no longer exist in DB");
    createdSlotId = null; // Cleared
    console.log("PASS 5: Timetable slot removed from database via DELETE /api/admin/timetable");

  } finally {
    if (createdSlotId) {
      await db.timetableSlot.deleteMany({ where: { id: createdSlotId } });
    }
  }

  console.log("=== ALL ADMIN TIMETABLE INTEGRATION TESTS PASSED ===");
}

runAdminTimetableIntegrationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
  });
