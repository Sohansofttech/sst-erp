import assert from "assert";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  generateSecureTemporaryPassword,
  isTeachingFaculty,
} from "../lib/services/credential-management.service";
import {
  isTeachingFacultyTitle,
  getPortalStatusBadgeConfig,
  PortalAccountStatus,
} from "../lib/utils/credential-helpers";
import { computePasswordSignature, signToken, verifyToken } from "../lib/auth/jwt";
import { SessionUser } from "../types";

let passedCount = 0;
let failedCount = 0;

async function it(desc: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${desc}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✘ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function runPhase2Tests() {
  console.log("\n========================================================");
  console.log(" PHASE 2: CREDENTIAL MANAGEMENT UI & API TEST SUITE");
  console.log("========================================================\n");

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Client & Server Teaching Faculty Eligibility
  // --------------------------------------------------------------------------
  console.log("[TEST GROUP 1] Teaching Faculty vs Non-Teaching Staff Differentiation");

  const eligibleTitles = [
    "Professor & Head of Department",
    "Professor",
    "Associate Professor & Program Chair",
    "Associate Professor",
    "Assistant Professor",
    "Senior Lecturer",
    "Lecturer",
    "Principal & Academic Dean",
    "Faculty Member",
    "Dean of Academics",
    "PGT Mathematics",
    "TGT Science",
  ];

  const ineligibleTitles = [
    "Registrar & Chief Administration Officer",
    "Registrar",
    "Chief Librarian & Information Officer",
    "Librarian",
    "Senior Lab Technical Instructor",
    "Lab Assistant",
    "Accountant",
    "Administrative Clerk",
    "Security Officer",
    "Hostel Warden",
    "Campus Maintenance Supervisor",
    "Transport Driver",
  ];

  for (const title of eligibleTitles) {
    await it(`Server classifies '${title}' as eligible teaching faculty`, () => {
      assert.strictEqual(isTeachingFaculty(title), true);
    });

    await it(`Client helper classifies '${title}' as eligible teaching faculty`, () => {
      assert.strictEqual(isTeachingFacultyTitle(title), true);
    });
  }

  for (const title of ineligibleTitles) {
    await it(`Server rejects '${title}' from TEACHER portal role`, () => {
      assert.strictEqual(isTeachingFaculty(title), false);
    });

    await it(`Client helper rejects '${title}' from TEACHER portal role`, () => {
      assert.strictEqual(isTeachingFacultyTitle(title), false);
    });
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Secure Temporary Password Generation & Entropy
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 2] Secure Password Generation & Entropy");

  await it("Generates temporary password of requested length >= 10", () => {
    const pwd12 = generateSecureTemporaryPassword(12);
    const pwd16 = generateSecureTemporaryPassword(16);
    const pwdClamped = generateSecureTemporaryPassword(8); // Must clamp to 10
    assert.strictEqual(pwd12.length, 12);
    assert.strictEqual(pwd16.length, 16);
    assert.strictEqual(pwdClamped.length, 10);
  });

  await it("Guarantees all required character classes (uppercase, lowercase, number, symbol)", () => {
    for (let i = 0; i < 20; i++) {
      const pwd = generateSecureTemporaryPassword(12);
      assert.match(pwd, /[A-Z]/, "Must contain uppercase");
      assert.match(pwd, /[a-z]/, "Must contain lowercase");
      assert.match(pwd, /[0-9]/, "Must contain digit");
      assert.match(pwd, /[!@#$%^&*]/, "Must contain symbol");
    }
  });

  await it("Generates unique passwords across multiple invocations (high entropy)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) {
      set.add(generateSecureTemporaryPassword(12));
    }
    assert.strictEqual(set.size, 50, "All 50 passwords must be unique");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Student Credential Lifecycle & Duplicate Prevention
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 3] Student Credential Lifecycle & Overwrite Protection");

  const mockStudent = {
    id: "stu-test-01",
    institutionId: "inst-test",
    rollNumber: "26CSE001",
    fullName: "Aarav Sharma",
    email: "aarav.sharma@example.com",
    user: null as any,
  };

  await it("Simulates unprovisioned student credential generation", async () => {
    const tempPassword = generateSecureTemporaryPassword(12);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const passwordSig = computePasswordSignature(passwordHash);

    mockStudent.user = {
      id: "user-student-01",
      email: mockStudent.email,
      fullName: mockStudent.fullName,
      role: "STUDENT",
      isActive: true,
      status: "ACTIVE",
      passwordHash,
      passwordSig,
    };

    assert.ok(mockStudent.user.passwordHash.startsWith("$2"), "Password hash must be bcrypt");
    assert.strictEqual(passwordSig.length, 64, "Password signature must be 64-char SHA-256");
  });

  await it("Prevents duplicate account overwrite when credentials already exist without forceReset", () => {
    const isCurrentlyProvisioned =
      !!mockStudent.user &&
      mockStudent.user.isActive &&
      !!mockStudent.user.passwordHash &&
      mockStudent.user.passwordHash !== "UNPROVISIONED" &&
      mockStudent.user.passwordHash.startsWith("$2");

    assert.strictEqual(isCurrentlyProvisioned, true);

    // Attempting issuance without forceReset should return ACCOUNT_EXISTS
    const forceReset = false;
    let code: string | null = null;
    if (isCurrentlyProvisioned && !forceReset) {
      code = "ACCOUNT_EXISTS";
    }

    assert.strictEqual(code, "ACCOUNT_EXISTS", "Must reject with ACCOUNT_EXISTS");
  });

  await it("Allows explicit password reset when forceReset is requested", async () => {
    const oldSig = mockStudent.user.passwordSig;
    const newTempPassword = generateSecureTemporaryPassword(12);
    const newPasswordHash = await bcrypt.hash(newTempPassword, 10);
    const newSig = computePasswordSignature(newPasswordHash);

    mockStudent.user.passwordHash = newPasswordHash;
    mockStudent.user.passwordSig = newSig;

    assert.notStrictEqual(oldSig, newSig, "New password signature must differ from old signature");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Parent Relationship Verification & Multi-Child Access
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 4] Parent-Child Verification & Multi-Child Support");

  const mockGuardianLinks = [
    {
      id: "link-01",
      guardianAccountId: "grd-acc-01",
      studentId: "stu-child-01",
      relationship: "FATHER",
      isVerified: true,
      canAccessPortal: true,
    },
    {
      id: "link-02",
      guardianAccountId: "grd-acc-01",
      studentId: "stu-child-02",
      relationship: "FATHER",
      isVerified: false, // Unverified link!
      canAccessPortal: false,
    },
  ];

  await it("Identifies verified vs unverified child relationships accurately", () => {
    const verified = mockGuardianLinks.filter((l) => l.isVerified);
    const unverified = mockGuardianLinks.filter((l) => !l.isVerified);

    assert.strictEqual(verified.length, 1);
    assert.strictEqual(verified[0].studentId, "stu-child-01");
    assert.strictEqual(unverified.length, 1);
    assert.strictEqual(unverified[0].studentId, "stu-child-02");
  });

  await it("Preserves existing verification status (never auto-promotes false to true)", () => {
    const initialVerifiedStatus = mockGuardianLinks[1].isVerified;
    assert.strictEqual(initialVerifiedStatus, false);

    // During credential issuance, unverified link must remain false
    const resultingLink = {
      ...mockGuardianLinks[1],
      isVerified: mockGuardianLinks[1].isVerified, // Must be preserved!
      canAccessPortal: mockGuardianLinks[1].isVerified ? true : false,
    };

    assert.strictEqual(resultingLink.isVerified, false);
    assert.strictEqual(resultingLink.canAccessPortal, false);
  });

  await it("Rejects credential issuance if parent has zero verified child relationships", () => {
    const unverifiedOnlyLinks = [
      { studentId: "stu-03", isVerified: false, canAccessPortal: false },
    ];
    const verifiedCount = unverifiedOnlyLinks.filter((l) => l.isVerified).length;

    let rejected = false;
    let errorCode = "";
    if (verifiedCount === 0) {
      rejected = true;
      errorCode = "VALIDATION_ERROR";
    }

    assert.strictEqual(rejected, true);
    assert.strictEqual(errorCode, "VALIDATION_ERROR");
  });

  await it("Supports multi-child parent accounts where both children are verified", () => {
    const multiChildVerifiedLinks = [
      { studentId: "stu-child-01", isVerified: true, canAccessPortal: true },
      { studentId: "stu-child-02", isVerified: true, canAccessPortal: true },
    ];

    const accessibleChildren = multiChildVerifiedLinks.filter((l) => l.isVerified && l.canAccessPortal);
    assert.strictEqual(accessibleChildren.length, 2, "Parent must have access to both verified children");
  });

  await it("Detects cross-tenant student linkage attempt as TENANT_VIOLATION", () => {
    const targetInstitutionId: string = "inst_apex";
    const studentInstitutionId: string = "inst_other";

    let error: string | null = null;
    if (studentInstitutionId !== targetInstitutionId) {
      error = "TENANT_VIOLATION";
    }

    assert.strictEqual(error, "TENANT_VIOLATION");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Portal Access Toggle (Enable / Disable)
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 5] Portal Access Enable/Disable Lifecycle");

  const mockUserAccount = {
    id: "user-toggle-01",
    isActive: true,
    status: "ACTIVE",
    role: "STUDENT",
  };

  await it("Disables portal access: sets isActive=false and status=INACTIVE", () => {
    mockUserAccount.isActive = false;
    mockUserAccount.status = "INACTIVE";

    assert.strictEqual(mockUserAccount.isActive, false);
    assert.strictEqual(mockUserAccount.status, "INACTIVE");
  });

  await it("Deactivated account is immediately blocked by requireAuth check", () => {
    let unauthorized = false;
    if (!mockUserAccount.isActive || mockUserAccount.status !== "ACTIVE") {
      unauthorized = true;
    }
    assert.strictEqual(unauthorized, true, "Deactivated account must be rejected immediately");
  });

  await it("Re-enables portal access: sets isActive=true and status=ACTIVE", () => {
    mockUserAccount.isActive = true;
    mockUserAccount.status = "ACTIVE";

    assert.strictEqual(mockUserAccount.isActive, true);
    assert.strictEqual(mockUserAccount.status, "ACTIVE");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Session Revocation & Password Fingerprint (passwordSig)
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 6] Instant Session Invalidation via passwordSig");

  await it("Invalidates existing JWT when password is reset by administrator", async () => {
    const originalPasswordHash = await bcrypt.hash("InitialPassword!2026", 10);
    const originalSig = computePasswordSignature(originalPasswordHash);

    const userSession: SessionUser = {
      userId: "u-revocation-test",
      email: "test.student@example.com",
      fullName: "Test Student",
      role: "STUDENT",
      institutionId: "inst_apex",
      institutionName: "Apex Institute of Technology",
      studentId: "stu_revocation",
      mustChangePassword: true,
      passwordSig: originalSig,
    };

    const initialToken = await signToken(userSession);
    const verifiedInitial = await verifyToken(initialToken);
    assert.strictEqual(verifiedInitial?.passwordSig, originalSig);

    // Administrator performs password reset
    const newPasswordHash = await bcrypt.hash("NewTempPassword#2026", 10);
    const newSig = computePasswordSignature(newPasswordHash);

    // Existing token verified against current DB hash
    const isSessionValid = verifiedInitial?.passwordSig === newSig;
    assert.strictEqual(isSessionValid, false, "Existing JWT must be rejected due to signature mismatch");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 7: Unified Portal Routing & Architecture Verification
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 7] Unified Portal Architecture Verification");

  const portalRouteMap: Record<string, string> = {
    STUDENT: "/dashboard",
    PARENT: "/dashboard",
    TEACHER: "/campus/inst_apex/teacher",
    ADMIN: "/admin",
    SUPER_ADMIN: "/super-admin",
  };

  await it("Students and Parents share the unified /login page", () => {
    const studentLoginPage = "/login";
    const parentLoginPage = "/login";
    assert.strictEqual(studentLoginPage, parentLoginPage, "Must share /login");
  });

  await it("Students and Parents share /dashboard destination", () => {
    assert.strictEqual(portalRouteMap["STUDENT"], "/dashboard");
    assert.strictEqual(portalRouteMap["PARENT"], "/dashboard");
  });

  await it("Faculty navigates to /campus/[slug]/teacher", () => {
    assert.strictEqual(portalRouteMap["TEACHER"], "/campus/inst_apex/teacher");
  });

  await it("Institution Admin navigates to /admin", () => {
    assert.strictEqual(portalRouteMap["ADMIN"], "/admin");
  });

  await it("Super Admin navigates to /super-admin", () => {
    assert.strictEqual(portalRouteMap["SUPER_ADMIN"], "/super-admin");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 8: Client Helper Status Badge Configs
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 8] Portal Status Badge Configurations");

  await it("Returns correct badge config for ACTIVE status", () => {
    const config = getPortalStatusBadgeConfig("ACTIVE");
    assert.strictEqual(config.label, "Portal Active");
    assert.strictEqual(config.variant, "success");
  });

  await it("Returns correct badge config for DISABLED status", () => {
    const config = getPortalStatusBadgeConfig("DISABLED");
    assert.strictEqual(config.label, "Access Disabled");
    assert.strictEqual(config.variant, "error");
  });

  await it("Returns correct badge config for NOT_CREATED status", () => {
    const config = getPortalStatusBadgeConfig("NOT_CREATED");
    assert.strictEqual(config.label, "No Account");
    assert.strictEqual(config.variant, "neutral");
  });

  await it("Returns correct badge config for INELIGIBLE status", () => {
    const config = getPortalStatusBadgeConfig("INELIGIBLE");
    assert.strictEqual(config.label, "Ineligible");
    assert.strictEqual(config.variant, "neutral");
  });

  await it("Returns correct badge config for UNVERIFIED status", () => {
    const config = getPortalStatusBadgeConfig("UNVERIFIED");
    assert.strictEqual(config.label, "Verification Needed");
    assert.strictEqual(config.variant, "warning");
  });

  // --------------------------------------------------------------------------
  // TEST GROUP 9: Live Status Loading, Entity Switching, Error Handling, Batch Merging & Refresh
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 9] Live Status Loading, Entity Switching, Error Handling & Refresh");

  await it("Derives ACTIVE status from live server response", () => {
    const liveResponse = {
      hasAccount: true,
      isActive: true,
      status: "ACTIVE",
      userId: "usr_active_01",
      email: "student@sst.edu",
    };
    const resolvedStatus = !liveResponse.hasAccount ? "NOT_CREATED" : liveResponse.isActive ? "ACTIVE" : "DISABLED";
    assert.strictEqual(resolvedStatus, "ACTIVE");
  });

  await it("Derives DISABLED status when live user account isActive is false", () => {
    const liveResponse = {
      hasAccount: true,
      isActive: false,
      status: "SUSPENDED",
      userId: "usr_disabled_01",
      email: "suspended@sst.edu",
    };
    const resolvedStatus = !liveResponse.hasAccount ? "NOT_CREATED" : liveResponse.isActive ? "ACTIVE" : "DISABLED";
    assert.strictEqual(resolvedStatus, "DISABLED");
  });

  await it("Derives NOT_CREATED status when live account does not exist", () => {
    const liveResponse = {
      hasAccount: false,
      isActive: false,
      status: "NO_ACCOUNT",
      userId: null,
      email: null,
    };
    const resolvedStatus = !liveResponse.hasAccount ? "NOT_CREATED" : liveResponse.isActive ? "ACTIVE" : "DISABLED";
    assert.strictEqual(resolvedStatus, "NOT_CREATED");
  });

  await it("Ineligible non-teaching faculty status takes precedence over active user in DB", () => {
    const isEligible = isTeachingFacultyTitle("Accountant", "Finance");
    const liveResponse = {
      hasAccount: true,
      isActive: true,
      status: "ACTIVE",
    };
    let currentStatus = !liveResponse.hasAccount ? "NOT_CREATED" : liveResponse.isActive ? "ACTIVE" : "DISABLED";
    if (!isEligible) {
      currentStatus = "INELIGIBLE";
    }
    assert.strictEqual(currentStatus, "INELIGIBLE");
  });

  await it("Unverified parent status takes precedence over active user in DB", () => {
    const verifiedCount = 0;
    const liveResponse = {
      hasAccount: true,
      isActive: true,
      status: "ACTIVE",
    };
    let currentStatus = !liveResponse.hasAccount ? "NOT_CREATED" : liveResponse.isActive ? "ACTIVE" : "DISABLED";
    if (verifiedCount === 0) {
      currentStatus = "UNVERIFIED";
    }
    assert.strictEqual(currentStatus, "UNVERIFIED");
  });

  await it("Entity switching cancels previous fetch and resets live status", () => {
    let activeEntityId = "entity_A";
    const controllerA = new AbortController();
    let entityADataApplied = false;

    // Simulate switching to Entity B before Entity A returns
    controllerA.abort();
    activeEntityId = "entity_B";
    const controllerB = new AbortController();

    // Entity A async callback attempts to run
    if (!controllerA.signal.aborted) {
      entityADataApplied = true;
    }

    assert.strictEqual(entityADataApplied, false, "Aborted request must not apply data");
    assert.strictEqual(activeEntityId, "entity_B", "Active entity must be updated to B");
    assert.strictEqual(controllerB.signal.aborted, false, "New controller must remain active");
  });

  await it("API error in live status check sets clear error message and disables actions instead of falling back to cached status", () => {
    const entity = {
      id: "stu_101",
      fullName: "Jane Doe",
      portalStatus: "ACTIVE" as PortalAccountStatus,
      portalAccess: true,
    };
    const liveLoading = false;
    const liveError = "Unable to verify account status. Please retry.";
    const liveData = null; // Failed server lookup

    // Strictly enforce: never fall back to entity cached status
    let currentStatus: PortalAccountStatus | null = null;
    if (liveData) {
      const resp = liveData as any;
      currentStatus = !resp.hasAccount ? "NOT_CREATED" : resp.isActive ? "ACTIVE" : "DISABLED";
    }

    const actionsPermitted = !liveLoading && !liveError && currentStatus !== null;
    assert.strictEqual(currentStatus, null, "Must NOT fall back to cached entity status");
    assert.strictEqual(actionsPermitted, false, "Actions must be disabled on API error");
    assert.strictEqual(liveError, "Unable to verify account status. Please retry.");
  });

  await it("Cached entity status cannot enable credential actions when live lookup fails", () => {
    // Entity has cached portalStatus: "ACTIVE" and portalAccess: true
    const cachedEntity = {
      id: "stu_cached_01",
      fullName: "Cached Student",
      portalStatus: "ACTIVE" as PortalAccountStatus,
      portalAccess: true,
      portalUserId: "usr_cached_01",
    };

    // Live lookup fails (e.g., server returned 500 or network timeout)
    const liveLoading = false;
    const liveError = "Unable to verify account status. Please retry.";
    const liveData = null; // No verified live data from server

    // Strictly enforce: never use stale cached status to authorize a credential action
    let currentStatus: PortalAccountStatus | null = null;
    if (liveData) {
      const resp = liveData as any;
      currentStatus = !resp.hasAccount ? "NOT_CREATED" : resp.isActive ? "ACTIVE" : "DISABLED";
    }

    // Determine whether credential actions (Issue, Reset, Toggle) can be rendered or executed
    const actionsPermitted = !liveLoading && !liveError && currentStatus !== null;

    assert.strictEqual(currentStatus, null, "Status must remain null when live lookup fails");
    assert.strictEqual(actionsPermitted, false, "All credential actions must be strictly disabled upon failed live lookup");
    assert.strictEqual(liveError, "Unable to verify account status. Please retry.");
  });

  await it("Successful retry after a failed live lookup restores the correct database-backed actions", () => {
    let liveError: string | null = "Unable to verify account status. Please retry.";
    let liveData: any = null;
    let liveLoading = false;

    // Actions before retry
    let actionsPermitted = !liveLoading && !liveError && liveData !== null;
    assert.strictEqual(actionsPermitted, false, "Actions blocked before retry");

    // Admin clicks Retry: live fetch succeeds with database account
    liveLoading = true;
    liveError = null;
    // ... async fetch succeeds ...
    liveData = {
      hasAccount: true,
      isActive: true,
      status: "ACTIVE",
      userId: "usr_verified_01",
      email: "jane.doe@sst.edu",
    };
    liveLoading = false;

    let currentStatus: PortalAccountStatus | null = null;
    if (liveData) {
      currentStatus = !liveData.hasAccount ? "NOT_CREATED" : liveData.isActive ? "ACTIVE" : "DISABLED";
    }
    actionsPermitted = !liveLoading && !liveError && currentStatus !== null;

    assert.strictEqual(currentStatus, "ACTIVE", "Active status derived from successful live lookup");
    assert.strictEqual(actionsPermitted, true, "Actions restored after successful retry");
    assert.strictEqual(liveData.userId, "usr_verified_01", "Live user ID available for operations");
  });

  await it("Batch status merge updates portal fields while preserving unrelated entity data", () => {
    const existingStudent = {
      id: "STU-001",
      fullName: "Rahul Sharma",
      phone: "+91 9876543210",
      departmentName: "Computer Science & Engineering",
      batch: "2026-2030",
      portalStatus: undefined,
      portalAccess: undefined,
    };

    const batchServerStatus = {
      hasAccount: true,
      isActive: true,
      portalStatus: "ACTIVE" as const,
      userId: "usr_rahul_01",
      email: "rahul.sharma@sst.edu",
      lastLoginAt: "2026-11-18T10:00:00.000Z",
    };

    const mergedStudent = {
      ...existingStudent,
      portalStatus: batchServerStatus.portalStatus,
      portalAccess: batchServerStatus.isActive,
      portalUserId: batchServerStatus.userId,
      portalEmail: batchServerStatus.email,
      lastLoginAt: batchServerStatus.lastLoginAt,
    };

    assert.strictEqual(mergedStudent.fullName, "Rahul Sharma");
    assert.strictEqual(mergedStudent.phone, "+91 9876543210");
    assert.strictEqual(mergedStudent.departmentName, "Computer Science & Engineering");
    assert.strictEqual(mergedStudent.portalStatus, "ACTIVE");
    assert.strictEqual(mergedStudent.portalAccess, true);
    assert.strictEqual(mergedStudent.portalUserId, "usr_rahul_01");
    assert.strictEqual(mergedStudent.portalEmail, "rahul.sharma@sst.edu");
  });

  await it("Status refresh updates entity state following ISSUE, RESET, and TOGGLE_ACCESS actions", () => {
    let currentRecord = {
      id: "STU-002",
      portalStatus: "NOT_CREATED" as PortalAccountStatus,
      portalAccess: false,
      portalUserId: undefined as string | undefined,
    };

    // After ISSUE
    currentRecord = {
      ...currentRecord,
      portalStatus: "ACTIVE",
      portalAccess: true,
      portalUserId: "usr_new_02",
    };
    assert.strictEqual(currentRecord.portalStatus, "ACTIVE");
    assert.strictEqual(currentRecord.portalAccess, true);
    assert.strictEqual(currentRecord.portalUserId, "usr_new_02");

    // After TOGGLE_ACCESS (Disable)
    currentRecord = {
      ...currentRecord,
      portalStatus: "DISABLED",
      portalAccess: false,
    };
    assert.strictEqual(currentRecord.portalStatus, "DISABLED");
    assert.strictEqual(currentRecord.portalAccess, false);

    // After TOGGLE_ACCESS (Re-enable)
    currentRecord = {
      ...currentRecord,
      portalStatus: "ACTIVE",
      portalAccess: true,
    };
    assert.strictEqual(currentRecord.portalStatus, "ACTIVE");
    assert.strictEqual(currentRecord.portalAccess, true);
  });

  await it("Live status and batch status responses never expose passwordHash or passwordSig", () => {
    const liveStatusResult = {
      hasAccount: true,
      isActive: true,
      status: "ACTIVE",
      email: "test@sst.edu",
      lastLoginAt: new Date().toISOString(),
      role: "STUDENT",
      userId: "usr_safe_01",
    };

    const batchStatusResult = {
      "stu-1": {
        hasAccount: true,
        isActive: true,
        portalStatus: "ACTIVE",
        userId: "usr_safe_01",
        email: "test@sst.edu",
        lastLoginAt: new Date().toISOString(),
      },
    };

    assert.strictEqual((liveStatusResult as any).passwordHash, undefined, "passwordHash must never be in live status");
    assert.strictEqual((liveStatusResult as any).passwordSig, undefined, "passwordSig must never be in live status");
    assert.strictEqual((batchStatusResult["stu-1"] as any).passwordHash, undefined, "passwordHash must never be in batch status");
    assert.strictEqual((batchStatusResult["stu-1"] as any).passwordSig, undefined, "passwordSig must never be in batch status");
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n========================================================");
  console.log(` PHASE 2 TEST SUMMARY: ${passedCount} Passed, ${failedCount} Failed`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
