import "dotenv/config";
import assert from "node:assert/strict";
import { createStaff, getStaff } from "../lib/services/institution-admin.service";
import db from "../lib/db";

async function runStaffTeacherSyncTests() {
  console.log("=== RUNNING STAFF & TEACHER SYNCHRONIZATION TESTS ===");

  // Find an active institution
  const institution = await db.institution.findFirst({
    where: { isActive: true },
  });

  if (!institution) {
    console.log("No active institution found in DB.");
    return;
  }

  const testEmail = `sync.test.${Date.now()}@sst-test.edu`;
  const testName = "Dr. Test Sync Faculty";
  const testPhone = "+91 99999 11111";

  let createdUserId: string | null = null;
  let createdTeacherId: string | undefined = undefined;
  let createdStaffId: string | null = null;

  try {
    const res = await createStaff(institution.id, {
      fullName: testName,
      email: testEmail,
      role: "TEACHER",
      phone: testPhone,
      designation: "Associate Professor",
      employeeId: `TCH-${Date.now().toString().slice(-4)}`,
    });

    assert.ok(res.user, "User record must be returned");
    assert.ok(res.teacher, "Teacher record must be returned");
    assert.ok(res.staff, "Staff record must be returned");

    createdUserId = res.user.id;
    createdTeacherId = res.teacher.id;
    createdStaffId = res.staff.id;

    console.log("PASS 1: createStaff successfully provisioned User, Teacher, and Staff atomically");

    // Verify DB integrity for Teacher
    const dbTeacher = await db.teacher.findUnique({
      where: { id: createdTeacherId },
    });

    assert.ok(dbTeacher, "Teacher record must exist in DB");
    assert.equal(dbTeacher.userId, createdUserId, "Teacher userId must match User id");
    assert.equal(dbTeacher.institutionId, institution.id, "Teacher institutionId must match");
    assert.equal(dbTeacher.employeeId, res.staff.staffEmployeeId, "Employee ID must be synced");
    assert.equal(dbTeacher.designation, res.staff.designation, "Designation must be synced");
    assert.equal(dbTeacher.department, res.staff.department, "Department must be synced");

    console.log("PASS 2: Verified relational integrity between Teacher, Staff, and User");

    // Verify getStaff includes both
    const staffList = await getStaff(institution.id);
    const found = staffList.find((s) => s.id === createdUserId);
    assert.ok(found, "User must appear in getStaff result");
    assert.ok(found.teacherProfile, "teacherProfile must be populated in getStaff");
    assert.ok(found.staff, "staff must be populated in getStaff");
    assert.equal(found.teacherProfile.id, createdTeacherId, "teacherProfile ID must match");
    assert.equal(found.staff.id, createdStaffId, "staff ID must match");
    assert.equal(found.staff.staffEmployeeId, dbTeacher.employeeId, "staffEmployeeId must match Teacher employeeId");

    console.log("PASS 3: getStaff returns consistent synchronized Teacher and Staff records");

  } finally {
    // Cleanup test records
    if (createdTeacherId) {
      await db.teacher.deleteMany({ where: { id: createdTeacherId } });
    }
    if (createdUserId) {
      await db.user.deleteMany({ where: { id: createdUserId } });
    }
    console.log("Cleaned up test records.");
  }

  console.log("=== ALL STAFF & TEACHER SYNC TESTS PASSED ===");
}

runStaffTeacherSyncTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
  });
