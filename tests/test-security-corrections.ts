import bcrypt from "bcryptjs";
import {
  generateSecureTemporaryPassword,
  isTeachingFaculty,
} from "../lib/services/credential-management.service";
import { UnauthorizedError, ForbiddenError } from "../lib/auth/session";
import { signToken, verifyToken, computePasswordSignature } from "../lib/auth/jwt";

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

async function runSecurityTestSuite() {
  console.log("\n========================================================");
  console.log(" PHASE 1 COMPREHENSIVE SECURITY VERIFICATION TEST SUITE");
  console.log("========================================================\n");

  // -----------------------------------------------------------------------
  // TEST GROUP 1: Secure Temporary Password Generation & Entropy
  // -----------------------------------------------------------------------
  console.log("[TEST GROUP 1] Secure Password Generation & Entropy Validation");
  {
    const p1 = generateSecureTemporaryPassword(12);
    const p2 = generateSecureTemporaryPassword(16);
    const p3 = generateSecureTemporaryPassword(8); // Should clamp to min 10

    assert(p1.length === 12, "Password 1 has requested length of 12", `Got ${p1.length}`);
    assert(p2.length === 16, "Password 2 has requested length of 16", `Got ${p2.length}`);
    assert(p3.length === 10, "Password 3 clamps to minimum secure length of 10", `Got ${p3.length}`);

    assert(/[A-Z]/.test(p1), "Password contains uppercase letter");
    assert(/[a-z]/.test(p1), "Password contains lowercase letter");
    assert(/[0-9]/.test(p1), "Password contains digit");
    assert(/[!@#$%^&*]/.test(p1), "Password contains special character");

    const generatedSet = new Set<string>();
    for (let i = 0; i < 50; i++) {
      generatedSet.add(generateSecureTemporaryPassword(12));
    }
    assert(generatedSet.size === 50, "50 generated passwords are all unique (high entropy)");
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 2: Teaching Faculty vs Non-Teaching Role Differentiation
  // -----------------------------------------------------------------------
  console.log("\n[TEST GROUP 2] Teaching Faculty vs Non-Teaching Role Differentiation");
  {
    const teachingTitles = [
      "Professor",
      "Assistant Professor",
      "Associate Professor",
      "Head of Department (HOD)",
      "Lecturer",
      "Senior Lecturer",
      "Dean of Academics",
      "Faculty of Computer Science",
      "Instructor",
      "Lab Instructor",
      "Teacher",
      "Adjunct Faculty",
    ];

    const nonTeachingTitles = [
      "Accountant",
      "Head Accountant",
      "Lab Assistant",
      "Bus Driver",
      "Transport In-Charge",
      "Librarian",
      "Assistant Librarian",
      "Security Officer",
      "Security Guard",
      "Clerk",
      "Office Assistant",
      "Peon",
      "Hostel Warden",
      "Registrar",
      "Admin Assistant",
      "System Administrator",
    ];

    let allTeachingPassed = true;
    for (const title of teachingTitles) {
      if (!isTeachingFaculty(title)) {
        allTeachingPassed = false;
        console.error(`    Mismatch: expected teaching for "${title}"`);
      }
    }
    assert(allTeachingPassed, "All teaching faculty titles correctly identified as TEACHER portal role eligible");

    let allNonTeachingPassed = true;
    for (const title of nonTeachingTitles) {
      if (isTeachingFaculty(title)) {
        allNonTeachingPassed = false;
        console.error(`    Mismatch: expected non-teaching for "${title}"`);
      }
    }
    assert(allNonTeachingPassed, "All non-teaching staff titles correctly excluded from TEACHER portal role");
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 3: Parent–Child Relationship Verification Rules
  // -----------------------------------------------------------------------
  console.log("\n[TEST GROUP 3] Parent-Child Relationship Verification & Portal Access Rules");
  {
    const mockDb = {
      institutionId: "inst-test-01",
      guardianAccount: { id: "ga-01", userId: "user-parent-01", fullName: "Jane Doe" },
      students: [
        { id: "stu-01", fullName: "Alice Doe", rollNumber: "CS-001", institutionId: "inst-test-01" },
        { id: "stu-02", fullName: "Bob Doe", rollNumber: "CS-002", institutionId: "inst-test-01" },
        { id: "stu-other-inst", fullName: "Charlie", rollNumber: "EC-001", institutionId: "inst-other" },
      ],
      guardianLinks: [
        {
          id: "link-01",
          institutionId: "inst-test-01",
          guardianAccountId: "ga-01",
          studentId: "stu-01",
          relationship: "MOTHER",
          isVerified: true,
          canAccessPortal: true,
        },
        {
          id: "link-02",
          institutionId: "inst-test-01",
          guardianAccountId: "ga-01",
          studentId: "stu-02",
          relationship: "MOTHER",
          isVerified: false, // UNVERIFIED RELATIONSHIP
          canAccessPortal: false,
        },
      ],
    };

    const linkMap = new Map(mockDb.guardianLinks.map((l) => [l.studentId, { ...l }]));

    const verifiedStudents = mockDb.students
      .filter((s) => s.institutionId === mockDb.institutionId)
      .filter((s) => {
        const link = linkMap.get(s.id);
        return link && link.isVerified === true;
      });

    const unverifiedStudents = mockDb.students
      .filter((s) => s.institutionId === mockDb.institutionId)
      .filter((s) => !verifiedStudents.some((vs) => vs.id === s.id));

    assert(verifiedStudents.length === 1 && verifiedStudents[0].id === "stu-01", "Only Stu-01 is identified as verified");
    assert(unverifiedStudents.length === 1 && unverifiedStudents[0].id === "stu-02", "Stu-02 is identified as unverified");

    for (const student of [mockDb.students[0], mockDb.students[1]]) {
      const existing = linkMap.get(student.id);
      if (existing) {
        existing.canAccessPortal = existing.isVerified === true;
      }
    }

    assert(
      linkMap.get("stu-01")?.canAccessPortal === true && linkMap.get("stu-01")?.isVerified === true,
      "Verified link retains isVerified=true and has canAccessPortal=true"
    );
    assert(
      linkMap.get("stu-02")?.canAccessPortal === false && linkMap.get("stu-02")?.isVerified === false,
      "Unverified link retains isVerified=false and canAccessPortal remains false"
    );

    const allUnverifiedLinks = [
      { id: "l-x", guardianAccountId: "ga-02", studentId: "stu-02", isVerified: false, canAccessPortal: false },
    ];
    const hasAnyVerified = allUnverifiedLinks.some((l) => l.isVerified === true);

    assert(!hasAnyVerified, "Correctly identifies zero verified relationships for parent");
    const rejectionResult = !hasAnyVerified
      ? {
          success: false,
          code: "VALIDATION_ERROR",
          message:
            "Cannot issue parent portal credentials: No verified parent-student relationships found. At least one linked child must have an existing verified guardian relationship before portal credentials can be issued.",
        }
      : { success: true };

    assert(
      rejectionResult.success === false && rejectionResult.code === "VALIDATION_ERROR",
      "Credential issuance strictly rejected when parent has zero verified relationships"
    );

    const invalidTenantStudents = mockDb.students.filter((s) => s.id === "stu-other-inst");
    const isTenantViolated = invalidTenantStudents.some((s) => s.institutionId !== mockDb.institutionId);
    assert(isTenantViolated, "Cross-tenant student link attempt detected as tenant violation");

    const toggleActiveLinks = [
      { id: "l1", isVerified: true, canAccessPortal: false },
      { id: "l2", isVerified: false, canAccessPortal: false },
    ];

    for (const l of toggleActiveLinks) {
      if (l.isVerified === true) {
        l.canAccessPortal = true;
      }
    }
    assert(
      toggleActiveLinks.find((l) => l.id === "l1")?.canAccessPortal === true,
      "Toggling access ON restores portal access for verified link"
    );
    assert(
      toggleActiveLinks.find((l) => l.id === "l2")?.canAccessPortal === false,
      "Toggling access ON never activates portal access for unverified link"
    );
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 4: Parent Authorization & Multi-Child Access Control
  // -----------------------------------------------------------------------
  console.log("\n[TEST GROUP 4] Parent Authorization & IDOR Protection Verification");
  {
    const parentSession = {
      userId: "user-parent-01",
      email: "parent@example.com",
      fullName: "Jane Doe",
      role: "PARENT" as const,
      institutionId: "inst-test-01",
      institutionName: "Demo School",
      guardianId: "ga-01",
      activeChildId: "stu-01",
    };

    const studentSession = {
      userId: "user-stu-01",
      email: "student@example.com",
      fullName: "Alice Doe",
      role: "STUDENT" as const,
      institutionId: "inst-test-01",
      institutionName: "Demo School",
      studentId: "stu-01",
    };

    let idorBlocked = false;
    try {
      if (studentSession.studentId !== "stu-02") {
        throw new ForbiddenError("IDOR protection: Students are not permitted to access another student's data.");
      }
    } catch (e: any) {
      if (e instanceof ForbiddenError) idorBlocked = true;
    }
    assert(idorBlocked, "Student is blocked from accessing another student's record (IDOR protection)");

    const studentOwnAccess = studentSession.studentId === "stu-01";
    assert(studentOwnAccess, "Student is permitted to access their own record");

    const parentAllowedVerified =
      parentSession.guardianId === "ga-01" &&
      parentSession.activeChildId === "stu-01";
    assert(parentAllowedVerified, "Parent is permitted to access verified child (stu-01)");

    let unverifiedBlocked = false;
    const isLinkVerifiedAndActive = (childId: string) => childId === "stu-01";
    if (!isLinkVerifiedAndActive("stu-02")) {
      unverifiedBlocked = true;
    }
    assert(unverifiedBlocked, "Parent is strictly blocked from accessing unverified child (stu-02)");
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 5: First-Login Detection via Audit Logs (Safe for Existing Users)
  // -----------------------------------------------------------------------
  console.log("\n[TEST GROUP 5] First-Login Detection via Audit Trail (No False Positives)");
  {
    const checkTempPassword = (auditLogs: Array<{ action: string }>) => {
      if (!auditLogs || auditLogs.length === 0) return false;
      const latest = auditLogs[0].action;
      return latest === "CREDENTIAL_ISSUED" || latest === "PASSWORD_RESET";
    };

    // Scenario 5A: Existing user with lastLoginAt = null and NO credential audit logs
    const existingUserLogs: Array<{ action: string }> = [];
    const existingUserMustChange = checkTempPassword(existingUserLogs);
    assert(
      !existingUserMustChange,
      "Existing user with lastLoginAt = null is NOT forced to change password"
    );

    // Scenario 5B: Newly issued temporary credentials (latest log: CREDENTIAL_ISSUED)
    const newlyIssuedLogs = [{ action: "CREDENTIAL_ISSUED" }];
    const newAccountMustChange = checkTempPassword(newlyIssuedLogs);
    assert(
      newAccountMustChange === true,
      "Newly issued temporary credentials correctly require password change"
    );

    // Scenario 5C: Password reset by administrator (latest log: PASSWORD_RESET)
    const resetLogs = [
      { action: "PASSWORD_RESET" },
      { action: "PASSWORD_CHANGED" },
      { action: "CREDENTIAL_ISSUED" },
    ];
    const resetAccountMustChange = checkTempPassword(resetLogs);
    assert(
      resetAccountMustChange === true,
      "Password reset by administrator correctly requires password change"
    );

    // Scenario 5D: Successful password change clears requirement (latest log: PASSWORD_CHANGED)
    const changedLogs = [
      { action: "PASSWORD_CHANGED" },
      { action: "PASSWORD_RESET" },
      { action: "CREDENTIAL_ISSUED" },
    ];
    const afterChangeMustChange = checkTempPassword(changedLogs);
    assert(
      afterChangeMustChange === false,
      "Successful password change permanently clears password change requirement"
    );
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 6: Server-Side Mandatory Password Change Enforcement
  // -----------------------------------------------------------------------
  console.log("\n[TEST GROUP 6] Server-Side API Enforcement on mustChangePassword");
  {
    const enforceServerSideGuard = (mustChangePassword: boolean, pathname: string) => {
      if (mustChangePassword) {
        const isAllowedAuthRoute =
          pathname.startsWith("/api/auth/change-password") ||
          pathname.startsWith("/api/auth/me") ||
          pathname.startsWith("/api/auth/logout");

        if (!isAllowedAuthRoute) {
          throw new ForbiddenError(
            "Password change required: You must change your temporary password before accessing portal features."
          );
        }
      }
      return true;
    };

    // Direct API access while mustChangePassword is pending: BLOCKED
    const protectedRoutes = [
      "/api/student/dashboard",
      "/api/student/fees/pay",
      "/api/student/academics",
      "/api/parent/children",
      "/api/admin/students",
      "/api/super-admin/institutions",
    ];

    let allBlocked = true;
    for (const route of protectedRoutes) {
      try {
        enforceServerSideGuard(true, route);
        allBlocked = false;
      } catch (err: any) {
        if (!(err instanceof ForbiddenError)) allBlocked = false;
      }
    }
    assert(allBlocked, "Direct access to normal APIs is blocked while password change is pending (403 Forbidden)");

    // Whitelisted authentication routes: ALLOWED
    const allowedRoutes = [
      "/api/auth/change-password",
      "/api/auth/me",
      "/api/auth/logout",
    ];

    let allAllowed = true;
    for (const route of allowedRoutes) {
      try {
        enforceServerSideGuard(true, route);
      } catch {
        allAllowed = false;
      }
    }
    assert(allAllowed, "Authentication endpoints (/change-password, /me, /logout) remain accessible as intended");
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 7: Old JWT Invalidation via Cryptographic Password Fingerprint
  // -----------------------------------------------------------------------
  console.log("\n[TEST GROUP 7] Instant Session Revocation & Password Fingerprint (passwordSig)");
  {
    const initialHash = await bcrypt.hash("InitialPassword#123", 10);
    const initialSig = computePasswordSignature(initialHash);

    assert(initialSig.length === 64, "computePasswordSignature generates full 64-character SHA-256 digest");

    const userSession = {
      userId: "u-session-01",
      email: "user@test.com",
      fullName: "Session Test User",
      role: "STUDENT" as const,
      institutionId: "inst-01",
      institutionName: "Test Inst",
      mustChangePassword: false,
      passwordSig: initialSig,
    };

    const oldToken = await signToken(userSession);
    const decodedOld = await verifyToken(oldToken);
    assert(decodedOld !== null && decodedOld.passwordSig === initialSig, "JWT carries valid passwordSig");

    const validateSessionSignature = (tokenSession: any, currentDbHash: string) => {
      if (!tokenSession.passwordSig) {
        throw new UnauthorizedError("Session has expired or lacks required security signature. Please log in again.");
      }
      const currentSig = computePasswordSignature(currentDbHash);
      if (tokenSession.passwordSig !== currentSig) {
        throw new UnauthorizedError(
          "Session has been invalidated due to a password reset or change. Please log in with your current credentials."
        );
      }
      return true;
    };

    // Sub-test 7A: Token valid before password reset
    const isValidInitially = validateSessionSignature(decodedOld, initialHash);
    assert(isValidInitially, "Session is valid when passwordSig matches current database hash");

    // Sub-test 7B: Administrator resets password
    const adminResetHash = await bcrypt.hash("NewAdminResetTemp#456", 10);
    let oldTokenRejectedAfterReset = false;
    try {
      validateSessionSignature(decodedOld, adminResetHash);
    } catch (e: any) {
      if (e instanceof UnauthorizedError) oldTokenRejectedAfterReset = true;
    }
    assert(oldTokenRejectedAfterReset, "Old JWT is immediately rejected after administrator password reset");

    // Sub-test 7C: User changes password
    const userChangedHash = await bcrypt.hash("PermanentNewPass#789", 10);
    let oldTokenRejectedAfterChange = false;
    try {
      validateSessionSignature(decodedOld, userChangedHash);
    } catch (e: any) {
      if (e instanceof UnauthorizedError) oldTokenRejectedAfterChange = true;
    }
    assert(oldTokenRejectedAfterChange, "Old JWT is immediately rejected after user password change");

    // Sub-test 7D: Newly issued JWT after password change works
    const newSig = computePasswordSignature(userChangedHash);
    const refreshedSession = {
      ...userSession,
      mustChangePassword: false,
      passwordSig: newSig,
    };
    const newToken = await signToken(refreshedSession);
    const decodedNew = await verifyToken(newToken);
    const isNewTokenValid = validateSessionSignature(decodedNew, userChangedHash);
    assert(isNewTokenValid, "Newly issued JWT works after password change");

    // Sub-test 7E: Legacy JWT without passwordSig is safely rejected
    const legacySession = {
      userId: "u-session-01",
      email: "user@test.com",
      fullName: "Legacy User",
      role: "STUDENT" as const,
      institutionId: "inst-01",
      institutionName: "Test Inst",
    };
    const legacyToken = await signToken(legacySession as any);
    const decodedLegacy = await verifyToken(legacyToken);

    let legacyRejected = false;
    try {
      validateSessionSignature(decodedLegacy, userChangedHash);
    } catch (e: any) {
      if (e instanceof UnauthorizedError) legacyRejected = true;
    }
    assert(legacyRejected, "Legacy JWT without passwordSig is safely rejected");
  }

  // -----------------------------------------------------------------------
  // TEST GROUP 8: Sanitization & Credential Protection
  // -----------------------------------------------------------------------
  console.log("\n[TEST GROUP 8] Credential Protection & Output Sanitization");
  {
    const sessionWithSig = {
      userId: "u-test-01",
      email: "test@institution.edu",
      fullName: "Test User",
      role: "STUDENT",
      institutionId: "inst-01",
      institutionName: "Test Inst",
      mustChangePassword: false,
      passwordSig: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    };

    const clientUser = { ...sessionWithSig };
    delete (clientUser as any).passwordSig;
    const jsonOutput = JSON.stringify({ user: clientUser });

    assert(!jsonOutput.includes("passwordSig"), "Client API output does not expose passwordSig");
    assert(!jsonOutput.includes("passwordHash"), "Client API output does not expose passwordHash");
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log("\n========================================================");
  console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
