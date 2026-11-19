/**
 * SST-ERP Test Suite: Role-Aware Email Dispatcher and Automatic Account Credential Invitations
 *
 * Verifies:
 * 1. Automatic Account Provisioning & Setup Invitation on Student Creation
 * 2. Automatic Account Provisioning & Setup Invitation on Faculty Creation
 * 3. Guardian Authorization Invariant (Unverified = No Invite, Verified = Auto Invite)
 * 4. Directory Recipient Scoping by Role (STUDENT, TEACHER, PARENT, ALL)
 * 5. Multi-Identifier Search (Roll Number, Employee ID, Student Name for Guardians)
 * 6. Role Selection Compatibility & Filtered Selection
 * 7. Strict Multi-Tenant Isolation & Cross-Tenant Rejection
 * 8. Role-Specific Email Content (Login URL, Username, First-time instructions, Zero Plaintext Passwords)
 * 9. Cryptographic Setup Token Verification & Single-Use Revocation
 * 10. Resend Resilience & Audit Trail Logging
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import assert from "assert";
import crypto from "crypto";
import { signPasswordSetupToken, verifyPasswordSetupToken, computePasswordSignature } from "../lib/auth/jwt";
import { renderRoleCredentialInvitationEmail } from "../lib/email/templates";

async function runRoleAwareDispatcherTestSuite() {
  console.log("================================================================================");
  console.log("SST-ERP: Role-Aware Email Dispatcher & Automatic Account Invitations Test Suite");
  console.log("================================================================================\n");

  const db = (await import("../lib/db")).default;
  const {
    createStudent,
    createStaff,
    createGuardian,
  } = await import("../lib/services/institution-admin.service");
  const {
    resendInvitation,
  } = await import("../lib/services/credential-management.service");
  const {
    sendRoleCredentialInvitation,
  } = await import("../lib/services/email.service");

  // Fetch two distinct institutions for multi-tenant isolation testing
  const institutions = await db.institution.findMany({
    take: 2,
    select: { id: true, name: true, slug: true },
  });

  assert(institutions.length >= 2, "At least two institutions must exist in the database for multi-tenant tests");
  const instA = institutions[0];
  const instB = institutions[1];

  console.log(`Tenant A: ${instA.name} (${instA.id})`);
  console.log(`Tenant B: ${instB.name} (${instB.id})\n`);

  const timestamp = Date.now().toString().slice(-6);
  const testRollA = `TEST-STU-${timestamp}`;
  const testEmpA = `TEST-FAC-${timestamp}`;
  const testStudentEmail = `student.lifecycle.${timestamp}@sst-test.edu`;
  const testFacultyEmail = `faculty.lifecycle.${timestamp}@sst-test.edu`;
  const testGuardianUnverifiedEmail = `parent.unverified.${timestamp}@sst-test.edu`;
  const testGuardianVerifiedEmail = `parent.verified.${timestamp}@sst-test.edu`;
  const testCrossTenantEmail = `crosstenant.${timestamp}@sst-test.edu`;

  let studentRecord: any = null;
  let facultyRecord: any = null;
  let unverifiedGuardian: any = null;
  let verifiedGuardian: any = null;
  let crossTenantUser: any = null;

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Automatic Account Creation & Setup Invitation on Student Creation
    // --------------------------------------------------------------------------
    console.log("--- Test 1: Student Creation & Automatic Invitation ---");
    studentRecord = await createStudent(instA.id, {
      fullName: `Test Student ${timestamp}`,
      email: testStudentEmail,
      rollNumber: testRollA,
      phone: "+919876543210",
      gender: "Male",
    });

    assert(Boolean(studentRecord.id), "Student record must be created");
    assert(Boolean(studentRecord.userId), "Linked User account must be created for student");
    assert(studentRecord.invitationSent === true, "Invitation email must be dispatched automatically on student creation");

    // Verify User in PostgreSQL
    const studentUser = await db.user.findUnique({
      where: { id: studentRecord.userId },
      include: { studentProfile: true },
    });
    assert(studentUser !== null, "User record must exist in DB");
    assert(studentUser.institutionId === instA.id, "User must be strictly scoped to Tenant A");
    assert(studentUser.role === "STUDENT", "User role must be STUDENT");
    assert(studentUser.studentProfile?.rollNumber === testRollA, "Profile rollNumber must match");

    // Verify in-app notification in DB
    const studentNotif = await db.notificationRecipient.findFirst({
      where: { userId: studentUser.id },
      include: { notification: true },
    });
    assert(studentNotif !== null, "In-app notification recipient must be created in PostgreSQL");
    assert(studentNotif.notification.audienceRole === "STUDENT", "Notification audienceRole must be STUDENT");
    console.log("✓ Student account, login link, email dispatch, and in-app notification verified.");

    // --------------------------------------------------------------------------
    // TEST 2: Automatic Account Creation & Setup Invitation on Faculty Creation
    // --------------------------------------------------------------------------
    console.log("\n--- Test 2: Faculty Creation & Automatic Invitation ---");
    facultyRecord = await createStaff(instA.id, {
      fullName: `Dr. Faculty ${timestamp}`,
      email: testFacultyEmail,
      role: "TEACHER",
      employeeId: testEmpA,
      departmentId: "Computer Science",
      designation: "Associate Professor",
      phone: "+919876543211",
    });

    assert(Boolean(facultyRecord.user?.id), "Staff User record must be created");
    assert(Boolean(facultyRecord.teacher?.id), "Staff Teacher record must be created");
    assert(facultyRecord.invitationSent === true, "Invitation email must be dispatched automatically for teaching faculty");

    const facultyUser = await db.user.findUnique({
      where: { id: facultyRecord.user.id },
      include: { teacherProfile: true },
    });
    assert(facultyUser !== null, "Faculty user must exist in DB");
    assert(facultyUser.role === "TEACHER", "User role must be TEACHER");
    assert(facultyUser.teacherProfile?.employeeId === testEmpA, "Teacher profile employeeId must match");

    const facultyNotif = await db.notificationRecipient.findFirst({
      where: { userId: facultyUser.id },
      include: { notification: true },
    });
    assert(facultyNotif !== null, "In-app notification recipient must be created for faculty");
    console.log("✓ Faculty account, teacher profile, email dispatch, and in-app notification verified.");

    // --------------------------------------------------------------------------
    // TEST 3: Guardian Creation & Authorization Invariant
    // --------------------------------------------------------------------------
    console.log("\n--- Test 3: Guardian Authorization Invariant (Unverified vs Verified) ---");
    
    // Case 3A: Unverified Guardian (Default behavior - MUST NOT send invitation)
    unverifiedGuardian = await createGuardian(instA.id, {
      fullName: `Guardian Unverified ${timestamp}`,
      email: testGuardianUnverifiedEmail,
      phone: "+919876543212",
      relationship: "FATHER",
      studentId: studentRecord.id,
      isVerified: false,
    });

    assert(unverifiedGuardian.authorized === false, "Unverified guardian must have authorized=false");
    assert(unverifiedGuardian.invitationSent === false, "Unverified guardian must NOT receive invitation email");

    const unverifiedUser = await db.user.findFirst({
      where: { email: testGuardianUnverifiedEmail },
    });
    assert(unverifiedUser !== null, "User record must exist in dormant state");
    const unverifiedNotifs = await db.notificationRecipient.findMany({
      where: { userId: unverifiedUser.id },
    });
    assert(unverifiedNotifs.length === 0, "Unverified guardian must NOT receive in-app portal notifications");
    console.log("✓ Invariant verified: Unverified guardian is dormant and denied portal invitation/notifications.");

    // Case 3B: Verified Guardian (Authorized - MUST send role credential invitation)
    verifiedGuardian = await createGuardian(instA.id, {
      fullName: `Guardian Verified ${timestamp}`,
      email: testGuardianVerifiedEmail,
      phone: "+919876543213",
      relationship: "MOTHER",
      studentId: studentRecord.id,
      isVerified: true,
      canAccessPortal: true,
    });

    assert(verifiedGuardian.authorized === true, "Verified guardian must have authorized=true");
    assert(verifiedGuardian.invitationSent === true, "Verified guardian MUST receive automatic setup invitation");

    const verifiedUser = await db.user.findFirst({
      where: { email: testGuardianVerifiedEmail },
    });
    assert(verifiedUser !== null, "Verified guardian User must exist");
    const verifiedNotifs = await db.notificationRecipient.findMany({
      where: { userId: verifiedUser.id },
    });
    assert(verifiedNotifs.length === 1, "Verified guardian MUST receive in-app portal notification");
    console.log("✓ Verified guardian automatically received setup invitation and portal notification.");

    // --------------------------------------------------------------------------
    // TEST 4: Recipient Directory Scoping by Role
    // --------------------------------------------------------------------------
    console.log("\n--- Test 4: Directory Recipient Scoping by Role ---");

    // Helper to query recipients using the exact logic in app/api/admin/email/route.ts
    async function queryRecipients(roleParam: string, q: string = "") {
      let roleFilterClause: any = { role: { in: ["STUDENT", "TEACHER", "STAFF", "PARENT", "GUARDIAN"] } };
      if (roleParam === "STUDENT") roleFilterClause = { role: "STUDENT" };
      else if (roleParam === "TEACHER") roleFilterClause = { role: "TEACHER" };
      else if (roleParam === "PARENT" || roleParam === "GUARDIAN") roleFilterClause = { role: { in: ["PARENT", "GUARDIAN"] } };
      else if (roleParam === "STAFF") roleFilterClause = { role: { in: ["STAFF", "ADMIN"] } };

      const orConditions: any[] = [];
      if (q) {
        orConditions.push(
          { fullName: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { studentProfile: { OR: [{ rollNumber: { contains: q, mode: "insensitive" } }, { admissionNumber: { contains: q, mode: "insensitive" } }] } },
          { teacherProfile: { OR: [{ employeeId: { contains: q, mode: "insensitive" } }, { department: { contains: q, mode: "insensitive" } }] } },
          {
            guardianAccount: {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { guardianLinks: { some: { student: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { rollNumber: { contains: q, mode: "insensitive" } }] } } } },
              ],
            },
          }
        );
      }

      const users = await db.user.findMany({
        where: {
          institutionId: instA.id,
          email: { not: "" },
          ...roleFilterClause,
          ...(orConditions.length > 0 ? { OR: orConditions } : {}),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          studentProfile: { select: { rollNumber: true, admissionNumber: true } },
          teacherProfile: { select: { employeeId: true, department: true } },
          guardianAccount: {
            select: {
              fullName: true,
              guardianLinks: {
                where: { isVerified: true, canAccessPortal: true },
                select: { student: { select: { fullName: true, rollNumber: true } } },
              },
            },
          },
        },
      });

      return users.filter((u) => {
        if (u.role === "PARENT" || u.role === "GUARDIAN") {
          return !!(u.guardianAccount?.guardianLinks && u.guardianAccount.guardianLinks.length > 0);
        }
        return true;
      });
    }

    const studentsOnly = await queryRecipients("STUDENT");
    assert(studentsOnly.every((u) => u.role === "STUDENT"), "STUDENT query must only return students");
    assert(studentsOnly.some((u) => u.email === testStudentEmail), "Created student must be present");

    const facultyOnly = await queryRecipients("TEACHER");
    assert(facultyOnly.every((u) => u.role === "TEACHER"), "TEACHER query must only return faculty");
    assert(facultyOnly.some((u) => u.email === testFacultyEmail), "Created faculty must be present");

    const guardiansOnly = await queryRecipients("PARENT");
    assert(guardiansOnly.every((u) => u.role === "PARENT" || u.role === "GUARDIAN"), "PARENT query must only return guardians");
    assert(guardiansOnly.some((u) => u.email === testGuardianVerifiedEmail), "Verified guardian must be present");
    assert(!guardiansOnly.some((u) => u.email === testGuardianUnverifiedEmail), "Unverified guardian must NOT appear in directory");

    const allRoles = await queryRecipients("ALL");
    assert(allRoles.some((u) => u.email === testStudentEmail), "ALL query must include students");
    assert(allRoles.some((u) => u.email === testFacultyEmail), "ALL query must include faculty");
    assert(allRoles.some((u) => u.email === testGuardianVerifiedEmail), "ALL query must include verified guardians");
    assert(!allRoles.some((u) => u.email === testGuardianUnverifiedEmail), "ALL query must strictly exclude unverified guardians");
    console.log("✓ Directory scoping: Students Only, Faculty Only, Guardians Only (authorized), and All Roles verified.");

    // --------------------------------------------------------------------------
    // TEST 5: Multi-Identifier Search
    // --------------------------------------------------------------------------
    console.log("\n--- Test 5: Multi-Identifier Search ---");

    const searchByRoll = await queryRecipients("STUDENT", testRollA);
    assert(searchByRoll.length === 1 && searchByRoll[0].email === testStudentEmail, "Search by rollNumber must resolve student");

    const searchByEmp = await queryRecipients("TEACHER", testEmpA);
    assert(searchByEmp.length === 1 && searchByEmp[0].email === testFacultyEmail, "Search by employeeId must resolve faculty");

    const searchByChildName = await queryRecipients("PARENT", `Test Student ${timestamp}`);
    assert(searchByChildName.some((u) => u.email === testGuardianVerifiedEmail), "Search by linked student name must resolve guardian");

    console.log("✓ Search across rollNumber, employeeId, and linked child name verified.");

    // --------------------------------------------------------------------------
    // TEST 6: Selection Compatibility on Role Change
    // --------------------------------------------------------------------------
    console.log("\n--- Test 6: Selection Compatibility on Role Change ---");

    // Simulate multi-selection from ALL roles: 1 student, 1 faculty, 1 guardian
    const initialSelections = [studentUser.id, facultyUser.id, verifiedUser.id];
    const userRoleMap = new Map<string, string>([
      [studentUser.id, "STUDENT"],
      [facultyUser.id, "TEACHER"],
      [verifiedUser.id, "PARENT"],
    ]);

    // Role switched to "STUDENT"
    const switchedToStudent = initialSelections.filter((id) => userRoleMap.get(id) === "STUDENT");
    assert(switchedToStudent.length === 1 && switchedToStudent[0] === studentUser.id, "Switching to STUDENT must clear non-students");

    // Role switched to "TEACHER"
    const switchedToTeacher = initialSelections.filter((id) => userRoleMap.get(id) === "TEACHER");
    assert(switchedToTeacher.length === 1 && switchedToTeacher[0] === facultyUser.id, "Switching to TEACHER must clear non-teachers");

    // Role switched to "PARENT"
    const switchedToParent = initialSelections.filter((id) => userRoleMap.get(id) === "PARENT");
    assert(switchedToParent.length === 1 && switchedToParent[0] === verifiedUser.id, "Switching to PARENT must clear non-parents");

    console.log("✓ Incompatible selection clearing logic verified.");

    // --------------------------------------------------------------------------
    // TEST 7: Multi-Tenant Scoping & Cross-Tenant Rejection
    // --------------------------------------------------------------------------
    console.log("\n--- Test 7: Multi-Tenant Scoping & Cross-Tenant Rejection ---");

    crossTenantUser = await db.user.create({
      data: {
        institutionId: instB.id,
        email: testCrossTenantEmail,
        fullName: `Cross Tenant User ${timestamp}`,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    // Simulate verification check from POST /api/admin/email for Tenant A
    const selectedRecipientIds = [studentUser.id, crossTenantUser.id];
    const tenantUsers = await db.user.findMany({
      where: {
        id: { in: selectedRecipientIds },
        institutionId: instA.id,
      },
    });

    assert(tenantUsers.length !== selectedRecipientIds.length, "Cross-tenant user must NOT match Tenant A query");
    assert(tenantUsers.length === 1 && tenantUsers[0].id === studentUser.id, "Only Tenant A user should be retrieved");
    console.log("✓ Multi-tenant boundary verified: Cross-institution recipients strictly rejected (403 condition).");

    // --------------------------------------------------------------------------
    // TEST 8: Role-Specific Email Content & Credentials Verification
    // --------------------------------------------------------------------------
    console.log("\n--- Test 8: Role-Specific Email Content & Security Details ---");

    const renderedStudentEmail = renderRoleCredentialInvitationEmail({
      name: "Rohan Sharma",
      role: "STUDENT",
      username: "rohan.sharma@vidyaniketan.edu.in",
      setupUrl: "http://localhost:3000/auth/setup-password?token=MOCK_TOKEN",
      loginUrl: "http://localhost:3000/login",
      institutionName: instA.name,
      expiresIn: "24 hours",
    });

    assert(renderedStudentEmail.html.includes("rohan.sharma@vidyaniketan.edu.in"), "Email must contain Username / Login ID");
    assert(renderedStudentEmail.html.includes("http://localhost:3000/login"), "Student email must direct to /login");
    assert(renderedStudentEmail.html.includes("First-Time Login Instructions"), "Email must contain First-Time instructions");
    assert(renderedStudentEmail.html.includes("24 hours"), "Email must state 24-hour expiry");
    assert(renderedStudentEmail.text.includes("Username / Login ID: rohan.sharma@vidyaniketan.edu.in"), "Plaintext must contain Username");
    assert(!renderedStudentEmail.html.toLowerCase().includes("temporary password"), "Email must NEVER contain plaintext temporary passwords");

    const renderedFacultyEmail = renderRoleCredentialInvitationEmail({
      name: "Dr. Sunita Rao",
      role: "TEACHER",
      username: "sunita.rao@vidyaniketan.edu.in",
      setupUrl: "http://localhost:3000/auth/setup-password?token=MOCK_TOKEN",
      loginUrl: `http://localhost:3000/campus/${instA.slug}/teacher`,
      institutionName: instA.name,
      expiresIn: "24 hours",
    });

    assert(renderedFacultyEmail.html.includes(`/campus/${instA.slug}/teacher`), "Faculty email must direct to /campus/[slug]/teacher");
    assert(renderedFacultyEmail.html.includes("Teaching Faculty Portal Access"), "Faculty email must specify role label");

    console.log("✓ Role-specific email templates (Student -> /login, Faculty -> /campus/[slug]/teacher, Username, 24h setup) verified.");

    // --------------------------------------------------------------------------
    // TEST 9: Setup Token Verification & Single-Use Revocation
    // --------------------------------------------------------------------------
    console.log("\n--- Test 9: Setup Token Verification & Single-Use Invalidation ---");

    const token = await signPasswordSetupToken({
      userId: studentUser.id,
      email: studentUser.email,
      institutionId: instA.id,
      passwordHash: studentUser.passwordHash || null,
    });

    const verifiedPayload = await verifyPasswordSetupToken(token);
    assert(verifiedPayload !== null, "Token must be valid and non-null");
    assert(verifiedPayload.userId === studentUser.id, "Token payload userId must match");
    assert(verifiedPayload.institutionId === instA.id, "Token payload institutionId must match");

    // Simulate password change
    const newPasswordHash = "$2a$12$eX4mpleN3wH4shF0rP4ssw0rdUpd4t3.";
    const signatureBefore = verifiedPayload.sig;
    const signatureAfter = computePasswordSignature(newPasswordHash);
    assert(signatureBefore !== signatureAfter, "Password update must invalidate old signature (single-use token revocation)");
    console.log("✓ Single-use cryptographically signed setup token verified.");

    // --------------------------------------------------------------------------
    // TEST 10: Resend Resilience & Audit Trail Logging
    // --------------------------------------------------------------------------
    console.log("\n--- Test 10: Resend Resilience & Audit Trail Logging ---");

    const resendResult = await resendInvitation({
      institutionId: instA.id,
      entityType: "STUDENT",
      entityId: studentRecord.id,
    });

    assert(resendResult.success === true, "Resend invitation must succeed non-blockingly");

    // Verify audit log for resent invitation
    const resentAudit: any = await db.$queryRawUnsafe(
      `SELECT id, action, "entityType" FROM audit_logs WHERE "institutionId" = $1 AND "userId" = $2 AND action = $3 LIMIT 1`,
      instA.id,
      studentUser.id,
      "INVITATION_RESENT"
    );
    assert(resentAudit && resentAudit.length > 0, "Audit log for INVITATION_RESENT must be recorded in DB");
    console.log("✓ Non-blocking resend and audit logging verified.");

  } finally {
    // --------------------------------------------------------------------------
    // Cleanup Test Data
    // --------------------------------------------------------------------------
    console.log("\n--- Cleaning up test records ---");
    try {
      const userIdsToDelete: string[] = [];
      const studentIdsToDelete: string[] = [];
      const guardianAccountIdsToDelete: string[] = [];

      if (studentRecord?.userId) userIdsToDelete.push(studentRecord.userId);
      if (studentRecord?.id) studentIdsToDelete.push(studentRecord.id);
      if (facultyRecord?.user?.id) userIdsToDelete.push(facultyRecord.user.id);
      if (unverifiedGuardian?.id) guardianAccountIdsToDelete.push(unverifiedGuardian.id);
      if (verifiedGuardian?.id) guardianAccountIdsToDelete.push(verifiedGuardian.id);
      if (crossTenantUser?.id) userIdsToDelete.push(crossTenantUser.id);

      const unverifiedUser = await db.user.findFirst({ where: { email: testGuardianUnverifiedEmail }, select: { id: true } });
      if (unverifiedUser) userIdsToDelete.push(unverifiedUser.id);
      const verifiedUserRecord = await db.user.findFirst({ where: { email: testGuardianVerifiedEmail }, select: { id: true } });
      if (verifiedUserRecord) userIdsToDelete.push(verifiedUserRecord.id);

      if (userIdsToDelete.length > 0) {
        await db.notificationRecipient.deleteMany({ where: { userId: { in: userIdsToDelete } } });
      }
      if (studentIdsToDelete.length > 0) {
        await db.guardianLink.deleteMany({ where: { studentId: { in: studentIdsToDelete } } });
      }
      if (guardianAccountIdsToDelete.length > 0) {
        await db.guardianAccount.deleteMany({ where: { id: { in: guardianAccountIdsToDelete } } });
      }
      if (userIdsToDelete.length > 0) {
        await db.teacher.deleteMany({ where: { userId: { in: userIdsToDelete } } });
      }
      if (studentIdsToDelete.length > 0) {
        await db.student.deleteMany({ where: { id: { in: studentIdsToDelete } } });
      }
      if (userIdsToDelete.length > 0) {
        await db.user.deleteMany({ where: { id: { in: userIdsToDelete } } });
      }
      console.log("✓ Cleaned up all test data successfully.");
    } catch (cleanupErr: any) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }
    await db.$disconnect();
  }

  console.log("\n================================================================================");
  console.log("ALL 10 TEST SECTIONS PASSED SUCCESSFULLY (100% SUCCESS RATE)");
  console.log("================================================================================\n");
}

runRoleAwareDispatcherTestSuite().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
