import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import {
  generateSecureTemporaryPassword,
  isTeachingFaculty,
  issueStudentCredentials,
  issueTeacherCredentials,
  issueParentCredentials,
  togglePortalAccess,
  resetUserPassword,
  getUserCredentialStatus,
} from "../lib/services/credential-management.service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✔ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✖ FAIL: ${testName} ${detail ? "- " + detail : ""}`);
    failed++;
  }
}

async function runCredentialTestSuite() {
  console.log("\n========================================================");
  console.log(" PHASE 1: CREDENTIAL MANAGEMENT SERVICE TEST SUITE");
  console.log("========================================================\n");

  const TEST_INST_ID = "inst_demo_school";
  const OTHER_INST_ID = "inst_apex";
  const TIMESTAMP = Date.now();
  const TEST_PREFIX = `test-cred-${TIMESTAMP}`;

  // Track created IDs for cleanup
  const cleanupUserIds: string[] = [];
  const cleanupStudentIds: string[] = [];
  const cleanupTeacherIds: string[] = [];
  const cleanupGuardianAccountIds: string[] = [];

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Password Generation Security & Entropy
    // -----------------------------------------------------------------------
    console.log("[TEST 1] Secure Temporary Password Generation");
    const pwd1 = generateSecureTemporaryPassword(12);
    const pwd2 = generateSecureTemporaryPassword(16);

    const hasUpper = /[A-Z]/.test(pwd1);
    const hasLower = /[a-z]/.test(pwd1);
    const hasDigit = /[0-9]/.test(pwd1);
    const hasSymbol = /[!@#$%^&*]/.test(pwd1);
    const isDistinct = pwd1 !== pwd2;

    assert(pwd1.length === 12, "Default length is 12 characters");
    assert(pwd2.length === 16, "Custom length 16 is respected");
    assert(hasUpper && hasLower && hasDigit && hasSymbol, "Contains all 4 character classes (upper, lower, digit, symbol)");
    assert(isDistinct, "Successive passwords are distinct and non-deterministic");

    // -----------------------------------------------------------------------
    // TEST 2: Teaching Faculty vs Non-Teaching Staff Differentiation
    // -----------------------------------------------------------------------
    console.log("\n[TEST 2] Teaching Faculty Eligibility Safeguard");
    const eligibleTeaching = [
      "Professor & HOD",
      "Associate Professor",
      "Assistant Professor",
      "Senior Lecturer",
      "PGT Mathematics",
      "Lab Instructor",
      "Academic Dean",
    ];

    const nonTeaching = [
      "Accountant",
      "Junior Clerk",
      "Chief Librarian",
      "Registrar",
      "Bus Driver",
      "Security Guard",
      "Housekeeping Staff",
      "Administrative Officer",
    ];

    let allTeachingPassed = true;
    for (const des of eligibleTeaching) {
      if (!isTeachingFaculty(des)) {
        allTeachingPassed = false;
        console.error(`Expected '${des}' to be recognized as teaching faculty.`);
      }
    }
    assert(allTeachingPassed, "Eligible teaching designations correctly identified as teaching faculty");

    let allNonTeachingRejected = true;
    for (const des of nonTeaching) {
      if (isTeachingFaculty(des)) {
        allNonTeachingRejected = false;
        console.error(`Expected '${des}' to be classified as non-teaching.`);
      }
    }
    assert(allNonTeachingRejected, "Administrative & non-teaching designations properly distinguished");

    // Test rejection in teacher issuance
    const nonTeachingIssuance = await issueTeacherCredentials({
      institutionId: TEST_INST_ID,
      email: `${TEST_PREFIX}-clerk@test.edu`,
      fullName: "Test Clerk",
      designation: "Senior Accountant",
      customPassword: "Temp@Password123",
    });
    assert(
      !nonTeachingIssuance.success && nonTeachingIssuance.code === "VALIDATION_ERROR",
      "Non-teaching designation is rejected from receiving TEACHER portal role"
    );

    // -----------------------------------------------------------------------
    // TEST 3: Student Credential Issuance & Transactional Linking
    // -----------------------------------------------------------------------
    console.log("\n[TEST 3] Student Credential Issuance & Linking");

    // Create an unprovisioned test user first (since students.userId is NOT NULL in the base table)
    const testUser1 = await db.user.create({
      data: {
        institutionId: TEST_INST_ID,
        email: `${TEST_PREFIX}-stu@demo.edu`,
        fullName: "Test Student Alpha",
        role: "STUDENT",
        passwordHash: "UNPROVISIONED",
        isActive: false, // Unprovisioned account
        status: "INACTIVE",
      },
    });
    cleanupUserIds.push(testUser1.id);

    // Create temporary test student via raw SQL into base table students
    const testStudentId = crypto.randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO students (id, "institutionId", "userId", "rollNumber", "admissionNumber", "firstName", "lastName", "fullName", email, "dateOfBirth", gender, "admissionDate", "currentSemester", "currentSection", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
      testStudentId,
      TEST_INST_ID,
      testUser1.id,
      `ROLL-${TIMESTAMP}-1`,
      `ADM-${TIMESTAMP}-1`,
      "Test",
      "Student",
      "Test Student Alpha",
      `${TEST_PREFIX}-stu@demo.edu`,
      new Date("2005-01-01"),
      "MALE",
      new Date(),
      1,
      "A",
      "ACTIVE"
    );
    cleanupStudentIds.push(testStudentId);

    // Initial issuance
    const studentResult = await issueStudentCredentials({
      institutionId: TEST_INST_ID,
      studentId: testStudentId,
    });

    assert(studentResult.success, "Student credentials issued successfully");
    assert(!!studentResult.userId, "Created central User ID");
    assert(!!studentResult.temporaryPassword, "Generated temporary password returned");

    if (studentResult.userId) {
      cleanupUserIds.push(studentResult.userId);

      // Verify User record in DB
      const dbUser = await db.user.findUnique({
        where: { id: studentResult.userId },
        select: { id: true, role: true, isActive: true, status: true, passwordHash: true },
      });
      assert(dbUser?.role === "STUDENT", "User role is strictly 'STUDENT'");
      assert(dbUser?.isActive === true, "User isActive is true");
      assert(dbUser?.status === "ACTIVE", "User status is ACTIVE");

      // Verify password hash matches temporary password
      const pwMatches = dbUser?.passwordHash
        ? await bcrypt.compare(studentResult.temporaryPassword!, dbUser.passwordHash)
        : false;
      assert(pwMatches, "Bcrypt hash matches plaintext temporary password");

      // Verify Student profile is linked
      const updatedStudent = await db.student.findUnique({
        where: { id: testStudentId },
        select: { userId: true },
      });
      assert(updatedStudent?.userId === studentResult.userId, "Student.userId linked to central User");

      // Verify Audit Log recorded without password
      const auditLogs: any = await db.$queryRawUnsafe(
        `SELECT * FROM audit_logs WHERE "institutionId" = $1 AND "userId" = $2 AND action = $3 ORDER BY "createdAt" DESC LIMIT 1`,
        TEST_INST_ID,
        studentResult.userId,
        "CREDENTIAL_ISSUED"
      );
      const auditLog = auditLogs[0] || null;
      assert(!!auditLog, "AuditLog record created for CREDENTIAL_ISSUED");
      const logBody = JSON.stringify(auditLog);
      assert(
        !logBody.includes(studentResult.temporaryPassword!) && !logBody.includes("passwordHash"),
        "Plaintext password and password hash are NEVER persisted in AuditLog"
      );
    }

    // -----------------------------------------------------------------------
    // TEST 4: Existing Account Idempotency & Forced Password Reset
    // -----------------------------------------------------------------------
    console.log("\n[TEST 4] Existing Account Idempotency & Safe Password Reset");

    // Call issuance again without forceReset
    const repeatResult = await issueStudentCredentials({
      institutionId: TEST_INST_ID,
      studentId: testStudentId,
      forceReset: false,
    });

    assert(
      !repeatResult.success && repeatResult.code === "ACCOUNT_EXISTS",
      "Issuing to existing active account returns ACCOUNT_EXISTS without overwriting"
    );

    // Call issuance with forceReset: true
    const resetResult = await issueStudentCredentials({
      institutionId: TEST_INST_ID,
      studentId: testStudentId,
      forceReset: true,
    });

    assert(resetResult.success, "Password reset succeeds with forceReset: true");
    assert(resetResult.userId === studentResult.userId, "Preserves the same central User ID");
    assert(
      resetResult.temporaryPassword !== studentResult.temporaryPassword,
      "Issues a new distinct temporary password on reset"
    );

    // Verify PASSWORD_RESET audit log
    const resetAuditLogs: any = await db.$queryRawUnsafe(
      `SELECT * FROM audit_logs WHERE "institutionId" = $1 AND "userId" = $2 AND action = $3 ORDER BY "createdAt" DESC LIMIT 1`,
      TEST_INST_ID,
      studentResult.userId,
      "PASSWORD_RESET"
    );
    const resetAuditLog = resetAuditLogs[0] || null;
    assert(!!resetAuditLog, "AuditLog recorded action PASSWORD_RESET");

    // Test direct resetUserPassword helper
    const directReset = await resetUserPassword({
      institutionId: TEST_INST_ID,
      userId: studentResult.userId!,
    });
    assert(directReset.success, "Direct resetUserPassword succeeds");
    assert(!!directReset.temporaryPassword, "Direct resetUserPassword returns new temporary password");

    // -----------------------------------------------------------------------
    // TEST 5: Duplicate Prevention Across Profiles & Roles
    // -----------------------------------------------------------------------
    console.log("\n[TEST 5] Duplicate Prevention Across Profiles");

    // Create a second unprovisioned student with the SAME email as the first student
    const testUser2 = await db.user.create({
      data: {
        institutionId: TEST_INST_ID,
        email: `${TEST_PREFIX}-stu2@demo.edu`,
        fullName: "Duplicate Student",
        role: "STUDENT",
        passwordHash: "UNPROVISIONED",
        isActive: false,
        status: "INACTIVE",
      },
    });
    cleanupUserIds.push(testUser2.id);

    const dupStudentId = crypto.randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO students (id, "institutionId", "userId", "rollNumber", "admissionNumber", "firstName", "lastName", "fullName", email, "dateOfBirth", gender, "admissionDate", "currentSemester", "currentSection", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
      dupStudentId,
      TEST_INST_ID,
      testUser2.id,
      `ROLL-DUP-${TIMESTAMP}`,
      `ADM-DUP-${TIMESTAMP}`,
      "Duplicate",
      "Student",
      "Duplicate Student",
      `${TEST_PREFIX}-stu@demo.edu`, // Same email as first student to test collision
      new Date("2005-01-01"),
      "FEMALE",
      new Date(),
      1,
      "A",
      "ACTIVE"
    );
    cleanupStudentIds.push(dupStudentId);

    const dupResult = await issueStudentCredentials({
      institutionId: TEST_INST_ID,
      studentId: dupStudentId,
    });

    assert(
      !dupResult.success && dupResult.code === "VALIDATION_ERROR",
      "Duplicate email across students is safely blocked"
    );

    // -----------------------------------------------------------------------
    // TEST 6: Parent Multi-Child Linking & Child Requirement
    // -----------------------------------------------------------------------
    console.log("\n[TEST 6] Parent Multi-Child Linking & Child Validation");

    // 6A: Parent without children should be rejected
    const noChildParent = await issueParentCredentials({
      institutionId: TEST_INST_ID,
      email: `${TEST_PREFIX}-parent-nochild@demo.edu`,
      fullName: "Parent Without Child",
      studentIds: [],
    });
    assert(
      !noChildParent.success && noChildParent.code === "VALIDATION_ERROR",
      "Parent credentials rejected when no students are linked"
    );

    // 6B: Parent with 2 valid children (pre-link with verified status)
    const seedUser = await db.user.create({
      data: {
        institutionId: TEST_INST_ID,
        email: `${TEST_PREFIX}-parent@demo.edu`,
        fullName: "Parent Two Children",
        phone: "+91 98765 43210",
        role: "PARENT",
        isActive: false,
        status: "INACTIVE",
      },
    });
    cleanupUserIds.push(seedUser.id);

    const seedGuardian = await db.guardianAccount.create({
      data: {
        institutionId: TEST_INST_ID,
        userId: seedUser.id,
        fullName: "Parent Two Children",
        phone: "+91 98765 43210",
        relationship: "Father",
      },
    });
    cleanupGuardianAccountIds.push(seedGuardian.id);

    await db.guardianLink.createMany({
      data: [
        {
          institutionId: TEST_INST_ID,
          guardianAccountId: seedGuardian.id,
          studentId: testStudentId,
          relationship: "Father",
          isVerified: true,
          canAccessPortal: true,
        },
        {
          institutionId: TEST_INST_ID,
          guardianAccountId: seedGuardian.id,
          studentId: dupStudentId,
          relationship: "Father",
          isVerified: true,
          canAccessPortal: true,
        },
      ],
    });

    const parentResult = await issueParentCredentials({
      institutionId: TEST_INST_ID,
      email: `${TEST_PREFIX}-parent@demo.edu`,
      fullName: "Parent Two Children",
      phone: "+91 98765 43210",
      relationship: "Father",
      studentIds: [testStudentId, dupStudentId],
    });

    assert(parentResult.success, "Parent credentials issued for multi-child parent");
    assert(parentResult.role === "PARENT", "User role is 'PARENT'");

    if (parentResult.userId && parentResult.entityId) {
      cleanupUserIds.push(parentResult.userId);
      cleanupGuardianAccountIds.push(parentResult.entityId);

      // Verify GuardianLinks
      const links = await db.guardianLink.findMany({
        where: { guardianAccountId: parentResult.entityId },
      });
      assert(links.length === 2, "Both children are linked to the single parent account (1:N support)");
      assert(
        links.every((l) => l.isVerified && l.canAccessPortal),
        "All created child links have isVerified=true and canAccessPortal=true"
      );
    }

    // -----------------------------------------------------------------------
    // TEST 7: Tenant Isolation Enforcement
    // -----------------------------------------------------------------------
    console.log("\n[TEST 7] Institution-Level Tenant Isolation");

    // Attempt to manage testStudent (in TEST_INST_ID) from OTHER_INST_ID
    const crossTenantStudent = await issueStudentCredentials({
      institutionId: OTHER_INST_ID,
      studentId: testStudentId,
    });
    assert(
      !crossTenantStudent.success && crossTenantStudent.code === "PROFILE_NOT_FOUND",
      "Admin from Institution B cannot issue credentials for Student in Institution A"
    );

    // Attempt to link parent from OTHER_INST_ID to student in TEST_INST_ID
    const crossTenantParent = await issueParentCredentials({
      institutionId: OTHER_INST_ID,
      email: `${TEST_PREFIX}-cross-parent@other.edu`,
      studentIds: [testStudentId],
    });
    assert(
      !crossTenantParent.success && crossTenantParent.code === "TENANT_VIOLATION",
      "Parent cannot be linked to children across different institutions"
    );

    // Attempt to toggle access from wrong tenant
    let crossTenantToggleFailed = false;
    try {
      if (studentResult.userId) {
        await togglePortalAccess({
          institutionId: OTHER_INST_ID,
          userId: studentResult.userId,
          isActive: false,
        });
      }
    } catch {
      crossTenantToggleFailed = true;
    }
    assert(crossTenantToggleFailed, "Access toggle strictly enforces tenant isolation");

    // -----------------------------------------------------------------------
    // TEST 8: Access Control Toggle & Account Deactivation
    // -----------------------------------------------------------------------
    console.log("\n[TEST 8] Access Control Toggle & Immediate Deactivation");

    if (studentResult.userId) {
      // Deactivate account
      const deactResult = await togglePortalAccess({
        institutionId: TEST_INST_ID,
        userId: studentResult.userId,
        isActive: false,
        reason: "Test disciplinary suspension",
      });
      assert(deactResult.success && !deactResult.isActive, "Account deactivated successfully");

      const dbUserInactive = await db.user.findUnique({
        where: { id: studentResult.userId },
        select: { isActive: true, status: true },
      });
      assert(dbUserInactive?.isActive === false, "User.isActive set to false");
      assert(dbUserInactive?.status === "INACTIVE", "User.status set to INACTIVE");

      // Verify audit log for ACCESS_REVOKED
      const revokeAudits: any = await db.$queryRawUnsafe(
        `SELECT * FROM audit_logs WHERE "institutionId" = $1 AND "userId" = $2 AND action = $3 ORDER BY "createdAt" DESC LIMIT 1`,
        TEST_INST_ID,
        studentResult.userId,
        "ACCESS_REVOKED"
      );
      const revokeAudit = revokeAudits[0] || null;
      assert(!!revokeAudit, "ACCESS_REVOKED recorded in AuditLog with reason");

      // Restore access
      const restoreResult = await togglePortalAccess({
        institutionId: TEST_INST_ID,
        userId: studentResult.userId,
        isActive: true,
      });
      assert(restoreResult.success && restoreResult.isActive, "Account reactivated successfully");
    }

    // -----------------------------------------------------------------------
    // TEST 9: Transaction Rollback on Failure
    // -----------------------------------------------------------------------
    console.log("\n[TEST 9] Transaction Rollback on Failure");

    const usersBefore = await db.user.count();
    let rollbackCaught = false;

    try {
      await db.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            institutionId: TEST_INST_ID,
            email: `${TEST_PREFIX}-rollback@demo.edu`,
            fullName: "Rollback User",
            passwordHash: "test",
            role: "STUDENT",
          },
        });
        // Intentionally throw error to force rollback
        throw new Error("SIMULATED_TRANSACTION_FAILURE");
      });
    } catch (err: any) {
      if (err.message === "SIMULATED_TRANSACTION_FAILURE") {
        rollbackCaught = true;
      }
    }

    const usersAfter = await db.user.count();
    assert(rollbackCaught, "Transaction failure properly caught");
    assert(usersBefore === usersAfter, "Zero orphan records committed on transaction rollback");

    // -----------------------------------------------------------------------
    // TEST 10: Credential Status Query
    // -----------------------------------------------------------------------
    console.log("\n[TEST 10] Credential Status Query");
    const statusQuery = await getUserCredentialStatus(TEST_INST_ID, "STUDENT", testStudentId);
    assert(statusQuery.hasAccount, "Status reports hasAccount=true for provisioned student");
    assert(statusQuery.isActive, "Status reports isActive=true");
    assert(statusQuery.role === "STUDENT", "Status reports role='STUDENT'");

  } finally {
    // -----------------------------------------------------------------------
    // CLEANUP TEST DATA (Strict No Production Modification Guardrail)
    // -----------------------------------------------------------------------
    console.log("\n[CLEANUP] Removing test fixtures...");
    try {
      // Delete guardian links & accounts
      if (cleanupGuardianAccountIds.length > 0) {
        await db.guardianLink.deleteMany({
          where: { guardianAccountId: { in: cleanupGuardianAccountIds } },
        });
        await db.guardianAccount.deleteMany({
          where: { id: { in: cleanupGuardianAccountIds } },
        });
      }

      // Delete test audit logs
      if (cleanupUserIds.length > 0) {
        for (const uId of cleanupUserIds) {
          await db.$executeRawUnsafe(
            `DELETE FROM audit_logs WHERE "institutionId" = $1 AND "userId" = $2`,
            TEST_INST_ID,
            uId
          );
        }
      }

      // Unlink & delete test students
      if (cleanupStudentIds.length > 0) {
        for (const sId of cleanupStudentIds) {
          await db.$executeRawUnsafe(`DELETE FROM students WHERE id = $1`, sId);
        }
      }

      // Delete test teachers
      if (cleanupTeacherIds.length > 0) {
        await db.teacher.deleteMany({
          where: { id: { in: cleanupTeacherIds } },
        });
      }

      // Delete test users
      if (cleanupUserIds.length > 0) {
        await db.user.deleteMany({
          where: { id: { in: cleanupUserIds } },
        });
      }
      console.log("  ✔ CLEANUP COMPLETE: All test records successfully removed.");
    } catch (cleanupErr) {
      console.warn("  ⚠ Warning during cleanup:", cleanupErr);
    }
  }

  console.log("\n========================================================");
  console.log(` TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runCredentialTestSuite().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
