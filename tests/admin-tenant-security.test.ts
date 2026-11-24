import "dotenv/config";
import { NextRequest } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "../lib/security/admin-auth";
import { signToken, AUTH_COOKIE_NAME, computePasswordSignature } from "../lib/auth/jwt";
import { SessionUser } from "../types";
import db from "../lib/db";

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

async function runAdminSecurityTests() {
  console.log("\n========================================================");
  console.log(" TASK 1: ADMIN AUTHENTICATION & TENANT SECURITY TESTS");
  console.log("========================================================\n");

  const dummyPwHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  const dummySig = computePasswordSignature(dummyPwHash);

  // 1. Missing Authentication
  console.log("[TEST 1] Missing Authentication Session");
  {
    const req = new NextRequest("http://localhost:3000/api/admin/dashboard");
    let caughtError: any = null;
    try {
      await resolveAdminContext(req);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null, "Missing auth throws error");
    const res = handleAdminApiError(caughtError);
    assert(res.status === 401, "Missing auth returns HTTP 401 status", `Got ${res.status}`);
  }

  // 2. Invalid Token
  console.log("\n[TEST 2] Invalid Authentication Token");
  {
    const req = new NextRequest("http://localhost:3000/api/admin/dashboard", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=invalid_garbage_jwt_token_12345;`,
      },
    });
    let caughtError: any = null;
    try {
      await resolveAdminContext(req);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null, "Invalid token throws error");
    const res = handleAdminApiError(caughtError);
    assert(res.status === 401, "Invalid token returns HTTP 401", `Got ${res.status}`);
  }

  // 3. Expired / Malformed Token Signature
  console.log("\n[TEST 3] Missing or Invalid Security Signature");
  {
    const legacySession: SessionUser = {
      userId: "user_test_admin_legacy",
      email: "admin@institution-a.edu",
      fullName: "Admin User",
      role: "ADMIN",
      institutionId: "inst_test_a",
      institutionName: "Institution A",
      // passwordSig is omitted
    };
    const token = await signToken(legacySession);
    const req = new NextRequest("http://localhost:3000/api/admin/dashboard", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token};`,
      },
    });

    let caughtError: any = null;
    try {
      await resolveAdminContext(req);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null, "Token without password signature throws error");
    const res = handleAdminApiError(caughtError);
    assert(res.status === 401, "Token without signature returns HTTP 401", `Got ${res.status}`);
  }

  // 4. Non-Admin Role Access (e.g. STUDENT attempting Admin API)
  console.log("\n[TEST 4] Wrong Role Attempting Admin Access (Student / Teacher)");
  {
    const studentSession: SessionUser = {
      userId: "student_user_1",
      email: "student@institution-a.edu",
      fullName: "Student One",
      role: "STUDENT",
      institutionId: "inst_test_a",
      institutionName: "Institution A",
      passwordSig: dummySig,
    };
    const token = await signToken(studentSession);
    const req = new NextRequest("http://localhost:3000/api/admin/dashboard", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token};`,
      },
    });

    let caughtError: any = null;
    try {
      await resolveAdminContext(req);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null, "Student token on Admin API throws error");
    const res = handleAdminApiError(caughtError);
    assert(res.status === 403, "Student token on Admin API returns HTTP 403", `Got ${res.status}`);
  }

  // 5. Institution Header Spoofing (Admin A supplies x-institution-id: Institution B)
  console.log("\n[TEST 5] Institution Header Spoofing Detection");
  {
    const adminSession: SessionUser = {
      userId: "admin_user_a",
      email: "admin@institution-a.edu",
      fullName: "Admin A",
      role: "ADMIN",
      institutionId: "inst_test_a",
      institutionName: "Institution A",
      passwordSig: dummySig,
    };
    const token = await signToken(adminSession);
    const req = new NextRequest("http://localhost:3000/api/admin/students", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token};`,
        "x-institution-id": "inst_test_b", // Cross-tenant spoof attempt
      },
    });

    let caughtError: any = null;
    try {
      await resolveAdminContext(req);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null, "Spoofed x-institution-id throws error");
    const res = handleAdminApiError(caughtError);
    assert(res.status === 403, "Header spoof returns HTTP 403 Forbidden", `Got ${res.status}`);
    assert(
      caughtError.message.includes("Tenant violation") || caughtError.message.includes("Cross-institution"),
      "Error message specifies cross-institution violation"
    );
  }

  // 6. Valid Admin Access within Authorized Institution
  console.log("\n[TEST 6] Valid Admin Session within Bound Institution");
  {
    const realAdmin = await db.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true, email: true, fullName: true, institutionId: true, passwordHash: true },
    });

    if (realAdmin && realAdmin.institutionId) {
      const realSig = computePasswordSignature(realAdmin.passwordHash || "");
      const adminSession: SessionUser = {
        userId: realAdmin.id,
        email: realAdmin.email,
        fullName: realAdmin.fullName || "Admin",
        role: "ADMIN",
        institutionId: realAdmin.institutionId,
        institutionName: "Real Admin Institution",
        passwordSig: realSig,
      };
      const token = await signToken(adminSession);
      const req = new NextRequest("http://localhost:3000/api/admin/dashboard", {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${token};`,
        },
      });

      const ctx = await resolveAdminContext(req);
      assert(ctx.institutionId === realAdmin.institutionId, "Resolves correct bound institutionId", `Got ${ctx.institutionId}`);
      assert(ctx.userRole === "ADMIN", "Resolves userRole as ADMIN");
      assert(ctx.isDevFallback === false, "isDevFallback is strictly false");
    } else {
      console.log("  ⚠ SKIP: No active DB admin found for live context test");
    }
  }

  // 7. Valid Super Admin Cross-Institution Context Switching
  console.log("\n[TEST 7] Valid Super Admin Authorized Cross-Institution Operation");
  {
    const realSuperAdmin = await db.user.findFirst({
      where: {
        role: "SUPER_ADMIN",
        isActive: true,
      },
      select: { id: true, email: true, fullName: true, institutionId: true, passwordHash: true },
    });

    const superAdminId = realSuperAdmin?.id || "superadmin_user_1";
    const superAdminEmail = realSuperAdmin?.email || "superadmin@sohansofttech.com";
    const superAdminPwHash = realSuperAdmin?.passwordHash || dummyPwHash;
    const superAdminSig = computePasswordSignature(superAdminPwHash);

    const superAdminSession: SessionUser = {
      userId: superAdminId,
      email: superAdminEmail,
      fullName: realSuperAdmin?.fullName || "Super Administrator",
      role: "SUPER_ADMIN",
      institutionId: realSuperAdmin?.institutionId || "platform_global",
      institutionName: "Global Platform",
      passwordSig: superAdminSig,
    };
    const token = await signToken(superAdminSession);

    // Super Admin operating on Institution B via header
    const req = new NextRequest("http://localhost:3000/api/admin/courses", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token};`,
        "x-institution-id": "inst_target_institution_b",
      },
    });

    const ctx = await resolveAdminContext(req);
    assert(
      ctx.institutionId === "inst_target_institution_b",
      "Super Admin successfully accesses requested institution",
      `Got ${ctx.institutionId}`
    );
    assert(ctx.userRole === "SUPER_ADMIN", "Resolves userRole as SUPER_ADMIN");
  }

  console.log("\n========================================================");
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) process.exit(1);
}

runAdminSecurityTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
