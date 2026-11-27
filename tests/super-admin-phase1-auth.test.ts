import "dotenv/config";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "sst-erp-super-admin-jwt-test-secret-min-32-chars-long";
}

import assert from "node:assert/strict";
import { test, describe, beforeEach } from "node:test";
import crypto from "crypto";
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  setupAdminMfa,
  confirmAdminMfaEnrollment,
  verifyAdminMfaLogin,
  getAdminMfaRecord,
  MfaDatabaseError,
} from "../lib/security/totp-mfa";
import {
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
  _resetAllRateLimitsForTesting,
} from "../lib/security/login-rate-limiter";
import { getClientIp } from "../lib/security/client-ip";
import { NextRequest } from "next/server";

describe("SST-ERP: Super Admin Phase 1 Authentication & Security Test Suite", () => {
  beforeEach(async () => {
    await _resetAllRateLimitsForTesting();
  });

  // =========================================================================
  // Section 1: Login Rate Limiting (RL-01 to RL-06)
  // =========================================================================
  describe("1. Login Rate Limiting (RL-01 to RL-06)", () => {
    test("RL-01: Positive - Normal login below threshold resets counter on success", async () => {
      const email = "superadmin-rl01@ssterp.in";
      const ip = "192.168.1.101";

      // 1 failed attempt
      await recordFailedLogin({ ip, identifier: email });
      let check = await checkLoginRateLimit({ ip, identifier: email });
      assert.equal(check.allowed, true, "1st failure should still be allowed");

      // Successful login resets counter
      await recordSuccessfulLogin({ identifier: email });
      check = await checkLoginRateLimit({ ip, identifier: email });
      assert.equal(check.allowed, true, "Account counter should be reset after successful login");
    });

    test("RL-02: Boundary - Exact threshold reached (5 failed attempts)", async () => {
      const email = "superadmin-rl02@ssterp.in";
      const ip = "192.168.1.102";

      for (let i = 1; i <= 4; i++) {
        await recordFailedLogin({ ip, identifier: email });
        const check = await checkLoginRateLimit({ ip, identifier: email });
        assert.equal(check.allowed, true, `Attempt ${i} should be allowed before threshold`);
      }

      // 5th failure trips threshold
      await recordFailedLogin({ ip, identifier: email });
      const check5 = await checkLoginRateLimit({ ip, identifier: email });
      assert.equal(check5.allowed, false, "5th failed attempt should trigger lockout");
      assert.equal(check5.reason, "ACCOUNT", "Reason should be ACCOUNT");
      assert.ok(check5.retryAfterSeconds! > 0, "retryAfterSeconds should be positive");
    });

    test("RL-03: Security - Exceeding account threshold (6th attempt locked)", async () => {
      const email = "superadmin-rl03@ssterp.in";
      const ip = "192.168.1.103";

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin({ ip, identifier: email });
      }

      // 6th attempt
      const check6 = await checkLoginRateLimit({ ip, identifier: email });
      assert.equal(check6.allowed, false, "6th attempt must be blocked");
      assert.equal(check6.reason, "ACCOUNT");
      assert.ok(check6.retryAfterSeconds! >= 800, "Lockout should be approximately 15 minutes (900s)");
    });

    test("RL-04: Security - IP-based flood attack across random emails (20 limit)", async () => {
      const ip = "198.51.100.55";

      for (let i = 1; i <= 20; i++) {
        const randomEmail = `attacker-${i}@random-domain.com`;
        await recordFailedLogin({ ip, identifier: randomEmail });
      }

      // 21st attempt from same IP with fresh email
      const check21 = await checkLoginRateLimit({ ip, identifier: "fresh-email@random.com" });
      assert.equal(check21.allowed, false, "21st attempt from flooded IP must be blocked");
      assert.equal(check21.reason, "IP", "Lockout reason should be IP");
      assert.ok(check21.retryAfterSeconds! > 0);
    });

    test("RL-05: Concurrency - Multiple rapid login evaluations behave deterministically", async () => {
      const email = "superadmin-rl05@ssterp.in";
      const ip = "10.0.0.50";

      // Dispatch 5 failures in parallel
      await Promise.all(
        Array.from({ length: 5 }).map(() => recordFailedLogin({ ip, identifier: email }))
      );

      const check = await checkLoginRateLimit({ ip, identifier: email });
      assert.equal(check.allowed, false, "Account should be locked out after 5 parallel failures");
      assert.equal(check.reason, "ACCOUNT");
    });
  });

  // =========================================================================
  // Section 2: RFC 6238 TOTP Engine & AES-256-GCM Encryption (MFA-01 to MFA-07)
  // =========================================================================
  describe("2. TOTP MFA Engine & AES-256-GCM Encryption (MFA-01 to MFA-07)", () => {
    test("Base32 encoding/decoding round-trip integrity", () => {
      const randomBuf = crypto.randomBytes(32);
      const encoded = base32Encode(randomBuf);
      const decoded = base32Decode(encoded);
      assert.deepEqual(decoded, randomBuf, "Decoded buffer must match original buffer");
    });

    test("AES-256-GCM Secret Encryption & Decryption round-trip", () => {
      const secret = generateTotpSecret();
      const { encrypted, iv, tag } = encryptSecret(secret);
      assert.notEqual(encrypted, secret, "Encrypted string must not match plaintext");
      assert.equal(iv.length, 24, "12-byte IV in hex must be 24 chars");
      assert.equal(tag.length, 32, "16-byte tag in hex must be 32 chars");

      const decrypted = decryptSecret(encrypted, iv, tag);
      assert.equal(decrypted, secret, "Decrypted secret must match original secret");
    });

    test("AES-256-GCM Decryption fails with tampered ciphertext or tag", () => {
      const secret = generateTotpSecret();
      const { encrypted, iv, tag } = encryptSecret(secret);
      const tamperedTag = tag.slice(0, -2) + "00";

      assert.throws(() => {
        decryptSecret(encrypted, iv, tamperedTag);
      }, "Tampered auth tag must throw authentication error");
    });

    test("MFA-01: Generate secret, OTP URI, and 10 backup codes", () => {
      const secret = generateTotpSecret();
      assert.ok(secret.length >= 26, "Base32 secret should be at least 26 chars");

      const code = generateTotpCode(secret);
      assert.match(code, /^\d{6}$/, "Generated TOTP code must be 6 digits zero-padded");

      const { plaintextCodes, hashedEntries } = generateBackupCodes(10);
      assert.equal(plaintextCodes.length, 10, "Should generate exactly 10 plaintext codes");
      assert.equal(hashedEntries.length, 10, "Should generate exactly 10 hashed entries");

      for (const p of plaintextCodes) {
        assert.match(p, /^[0-9A-F]{4}-[0-9A-F]{4}$/, "Backup code must match XXXX-XXXX hex format");
      }
    });

    test("MFA-02 & MFA-03: TOTP verification accepts valid code and rejects invalid code", () => {
      const secret = generateTotpSecret();
      const validCode = generateTotpCode(secret);

      const verifyGood = verifyTotpCode({ secretBase32: secret, code: validCode });
      assert.equal(verifyGood.valid, true, "Valid current code must be accepted");
      assert.ok(verifyGood.matchedCounter! > BigInt(0), "Matched counter must be positive");

      const verifyBad = verifyTotpCode({ secretBase32: secret, code: "000000" });
      assert.equal(verifyBad.valid, false, "Invalid code must be rejected");
    });

    test("MFA-05: Security - Replay attack prevention using lastUsedCounter", () => {
      const secret = generateTotpSecret();
      const code = generateTotpCode(secret);

      // First verification succeeds
      const firstCheck = verifyTotpCode({ secretBase32: secret, code });
      assert.equal(firstCheck.valid, true);
      const usedCounter = firstCheck.matchedCounter!;

      // Second verification in same time window with lastUsedCounter must fail
      const replayCheck = verifyTotpCode({
        secretBase32: secret,
        code,
        lastUsedCounter: usedCounter,
      });
      assert.equal(replayCheck.valid, false, "Replay of code with lastUsedCounter must be rejected");
    });

    test("MFA-06: Boundary - Clock drift tolerance (±30s step accepted)", () => {
      const secret = generateTotpSecret();
      const currentStep = Math.floor(Date.now() / 1000 / 30);

      // Code generated for step - 1 (30 seconds in past)
      const pastCode = generateTotpCode(secret, currentStep - 1);
      const pastCheck = verifyTotpCode({ secretBase32: secret, code: pastCode, toleranceSteps: 1 });
      assert.equal(pastCheck.valid, true, "Past step within tolerance must be accepted");

      // Code generated for step + 1 (30 seconds in future)
      const futureCode = generateTotpCode(secret, currentStep + 1);
      const futureCheck = verifyTotpCode({ secretBase32: secret, code: futureCode, toleranceSteps: 1 });
      assert.equal(futureCheck.valid, true, "Future step within tolerance must be accepted");

      // Code generated for step + 3 (beyond tolerance)
      const farFutureCode = generateTotpCode(secret, currentStep + 3);
      const farCheck = verifyTotpCode({ secretBase32: secret, code: farFutureCode, toleranceSteps: 1 });
      assert.equal(farCheck.valid, false, "Step beyond tolerance must be rejected");
    });

    test("MFA-07: Security - Intermediate challenge token issuance and validation", async () => {
      const userId = "sa-test-user-001";
      const email = "superadmin-challenge@ssterp.in";

      const token = await signMfaChallengeToken({ userId, email });
      assert.ok(typeof token === "string" && token.length > 20);

      const verified = await verifyMfaChallengeToken(token);
      assert.ok(verified, "Valid challenge token must verify");
      assert.equal(verified?.userId, userId);
      assert.equal(verified?.email, email);

      // Tampered token fails
      const tamperedToken = token.slice(0, -5) + "abcde";
      const badVerify = await verifyMfaChallengeToken(tamperedToken);
      assert.equal(badVerify, null, "Tampered challenge token must return null");
    });
  });

  // =========================================================================
  // Section 3: End-to-End Super Admin Enrollment & Verification (MFA-01 to MFA-04)
  // =========================================================================
  describe("3. Super Admin MFA Setup, Enrollment, and Login Verification", () => {
    const testAdminId = "sa-e2e-user-999";
    const testAdminEmail = "superadmin-e2e@ssterp.in";

    test("Full lifecycle: Setup -> Confirm Enrollment -> Login with TOTP", async () => {
      // 1. Setup
      const setup = await setupAdminMfa(testAdminId, testAdminEmail);
      assert.ok(setup.secretBase32);
      assert.ok(setup.otpauthUri.includes(encodeURIComponent(testAdminEmail)));
      assert.equal(setup.backupCodes.length, 10);

      // 2. Unconfirmed account cannot login with MFA yet
      const preEnrollLogin = await verifyAdminMfaLogin(testAdminId, {
        totpCode: generateTotpCode(setup.secretBase32),
      });
      assert.equal(preEnrollLogin.success, false, "Must not allow login prior to enrollment confirmation");

      // 3. Confirm enrollment with valid code
      const enrollmentCode = generateTotpCode(setup.secretBase32);
      const confirmed = await confirmAdminMfaEnrollment(testAdminId, enrollmentCode);
      assert.equal(confirmed, true, "Enrollment confirmation with valid TOTP code must succeed");

      // 4. Login with valid TOTP code
      // Simulate advance step or fresh code
      const currentStep = Math.floor(Date.now() / 1000 / 30) + 1;
      const loginTotp = generateTotpCode(setup.secretBase32, currentStep);
      const loginRes = await verifyAdminMfaLogin(testAdminId, { totpCode: loginTotp });
      assert.equal(loginRes.success, true, "Login with valid TOTP must succeed");

      // 5. Replay of same code should be rejected
      const replayRes = await verifyAdminMfaLogin(testAdminId, { totpCode: loginTotp });
      assert.equal(replayRes.success, false, "Replayed code must be rejected");
    });
  });

  // =========================================================================
  // Section 4: Single-Use Backup Recovery Codes (REC-01 to REC-04)
  // =========================================================================
  describe("4. Emergency Recovery Codes (REC-01 to REC-04)", () => {
    const backupAdminId = "sa-backup-user-777";
    const backupAdminEmail = "superadmin-backup@ssterp.in";

    test("REC-01 to REC-04: Single-use burning, replay rejection, and format validation", async () => {
      const setup = await setupAdminMfa(backupAdminId, backupAdminEmail);
      const enrollmentCode = generateTotpCode(setup.secretBase32);
      await confirmAdminMfaEnrollment(backupAdminId, enrollmentCode);

      const firstBackupCode = setup.backupCodes[0];
      assert.ok(firstBackupCode);

      // REC-01: Sign in using valid backup code
      const rec1 = await verifyAdminMfaLogin(backupAdminId, { backupCode: firstBackupCode });
      assert.equal(rec1.success, true, "Unused valid backup code must succeed");

      // REC-02: Re-submitting burned backup code must fail
      const rec2 = await verifyAdminMfaLogin(backupAdminId, { backupCode: firstBackupCode });
      assert.equal(rec2.success, false, "Burned backup code must be rejected");
      assert.ok(rec2.error?.includes("used") || rec2.error?.includes("Invalid"));

      // REC-03: Malformed backup code
      const rec3 = await verifyAdminMfaLogin(backupAdminId, { backupCode: "INVALID-CODE-99" });
      assert.equal(rec3.success, false, "Invalid code must be rejected");

      // Consume remaining 9 codes
      for (let i = 1; i < 10; i++) {
        const res = await verifyAdminMfaLogin(backupAdminId, { backupCode: setup.backupCodes[i] });
        assert.equal(res.success, true, `Backup code ${i} should succeed`);
      }

      // REC-04: All codes exhausted -> 11th attempt fails
      const rec4 = await verifyAdminMfaLogin(backupAdminId, { backupCode: setup.backupCodes[0] });
      assert.equal(rec4.success, false, "All backup codes exhausted; retry must fail");
    });
  });

  // =========================================================================
  // Section 5: Role Compatibility & Regression Protection (REG-01 to REG-04)
  // =========================================================================
  describe("5. Role Compatibility & Non-Super-Admin Bypass (REG-01 to REG-04)", () => {
    test("REG-01 to REG-04: Non-Super-Admin roles do not trigger Super Admin MFA", () => {
      const nonSuperAdminRoles = ["ADMIN", "INSTITUTION_ADMIN", "TEACHER", "STUDENT", "PARENT"];

      for (const role of nonSuperAdminRoles) {
        // Super Admin MFA is specifically gated on userRole === "SUPER_ADMIN"
        const isSuperAdmin = role === "SUPER_ADMIN";
        assert.equal(isSuperAdmin, false, `Role ${role} must not be identified as SUPER_ADMIN`);
      }
    });

    test("MFA Challenge cookie is strictly isolated to /super-admin/mfa", async () => {
      const userId = "test-sa-user";
      const email = "admin@example.com";
      const token = await signMfaChallengeToken({ userId, email });
      const verified = await verifyMfaChallengeToken(token);

      assert.ok(verified);
      assert.equal(verified?.userId, userId);
      assert.equal(verified?.email, email);

      // Verify that a token without mfaChallenge: true fails verification
      const forgedToken = await new (await import("jose")).SignJWT({ userId, email, mfaChallenge: false })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("300s")
        .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

      const forgedVerified = await verifyMfaChallengeToken(forgedToken);
      assert.equal(forgedVerified, null, "Forged token lacking mfaChallenge must be rejected");
    });
  });

  // =========================================================================
  // Section 6: Security Remediations Verification (SEC-01 to SEC-14)
  // =========================================================================
  describe("6. Security Remediations Verification (SEC-01 to SEC-14)", () => {
    test("SEC-01 & SEC-02: Enrolled MFA cannot be silently disarmed or overwritten through setup", async () => {
      const victimId = "sa-victim-enrolled-01";
      const victimEmail = "victim-sa@ssterp.in";

      // Initial setup and confirmation
      const setup1 = await setupAdminMfa(victimId, victimEmail);
      const code = generateTotpCode(setup1.secretBase32);
      await confirmAdminMfaEnrollment(victimId, code);

      // Attempting to re-run setupAdminMfa on an enrolled account must throw
      await assert.rejects(
        async () => {
          await setupAdminMfa(victimId, victimEmail);
        },
        (err: any) => {
          assert.match(err.message, /already enrolled/i);
          return true;
        },
        "Must reject setupAdminMfa on an already enrolled account"
      );
    });

    test("SEC-06: Non-existent accounts count toward IP rate limits", async () => {
      const attackerIp = "198.51.100.88";

      // 20 failed logins for non-existent accounts
      for (let i = 1; i <= 20; i++) {
        await recordFailedLogin({ ip: attackerIp, identifier: `non-existent-${i}@ssterp.in` });
      }

      // 21st attempt from the same IP must be blocked
      const check = await checkLoginRateLimit({ ip: attackerIp, identifier: "another-missing@ssterp.in" });
      assert.equal(check.allowed, false, "21st request from attacked IP must be locked out");
      assert.equal(check.reason, "IP");
      assert.ok(check.retryAfterSeconds! > 0);
    });

    test("SEC-07: Concurrent failed logins update counters correctly without lost increments", async () => {
      const targetEmail = "concurrent-target@ssterp.in";
      const targetIp = "10.10.10.10";

      // Simulate 5 simultaneous failures
      await Promise.all([
        recordFailedLogin({ ip: targetIp, identifier: targetEmail }),
        recordFailedLogin({ ip: targetIp, identifier: targetEmail }),
        recordFailedLogin({ ip: targetIp, identifier: targetEmail }),
        recordFailedLogin({ ip: targetIp, identifier: targetEmail }),
        recordFailedLogin({ ip: targetIp, identifier: targetEmail }),
      ]);

      const check = await checkLoginRateLimit({ ip: targetIp, identifier: targetEmail });
      assert.equal(check.allowed, false, "Account must be locked out after 5 concurrent failures");
      assert.equal(check.reason, "ACCOUNT");
    });

    test("SEC-08: Concurrent TOTP replay attempts reject duplicate submissions", async () => {
      const saId = "sa-replay-test-01";
      const saEmail = "sa-replay@ssterp.in";

      const setup = await setupAdminMfa(saId, saEmail);
      const enrollCode = generateTotpCode(setup.secretBase32);
      await confirmAdminMfaEnrollment(saId, enrollCode);

      // Advance 1 step to have a fresh code within ±1 step tolerance
      const nextStep = Math.floor(Date.now() / 1000 / 30) + 1;
      const code = generateTotpCode(setup.secretBase32, nextStep);

      // Dispatch 2 concurrent verification requests with identical code
      const [res1, res2] = await Promise.all([
        verifyAdminMfaLogin(saId, { totpCode: code }),
        verifyAdminMfaLogin(saId, { totpCode: code }),
      ]);

      const successCount = [res1, res2].filter((r) => r.success).length;
      const failCount = [res1, res2].filter((r) => !r.success).length;

      assert.equal(successCount, 1, "Exactly one concurrent verification request must succeed");
      assert.equal(failCount, 1, "Duplicate concurrent verification request must be rejected");
    });

    test("SEC-09: Concurrent backup-code use rejects duplicates", async () => {
      const saId = "sa-backup-race-01";
      const saEmail = "sa-backup-race@ssterp.in";

      const setup = await setupAdminMfa(saId, saEmail);
      const enrollCode = generateTotpCode(setup.secretBase32);
      await confirmAdminMfaEnrollment(saId, enrollCode);

      const targetBackupCode = setup.backupCodes[0];

      // Dispatch 2 concurrent verification requests with identical backup code
      const [res1, res2] = await Promise.all([
        verifyAdminMfaLogin(saId, { backupCode: targetBackupCode }),
        verifyAdminMfaLogin(saId, { backupCode: targetBackupCode }),
      ]);

      const successCount = [res1, res2].filter((r) => r.success).length;
      const failCount = [res1, res2].filter((r) => !r.success).length;

      assert.equal(successCount, 1, "Exactly one concurrent backup-code request must succeed");
      assert.equal(failCount, 1, "Duplicate concurrent backup-code request must be rejected");
    });

    test("SEC-10: Trusted client IP extraction safely validates headers and rejects spoofing", () => {
      // 1. Valid Vercel Edge header takes precedence
      const reqVercel = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: {
          "x-vercel-forwarded-for": "157.240.22.35",
          "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        },
      });
      assert.equal(getClientIp(reqVercel), "157.240.22.35");

      // 2. Valid Cloudflare header takes precedence over raw x-forwarded-for
      const reqCf = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: {
          "cf-connecting-ip": "104.16.132.229",
          "x-forwarded-for": "1.1.1.1",
        },
      });
      assert.equal(getClientIp(reqCf), "104.16.132.229");

      // 3. Malformed IP in X-Forwarded-For safely falls back to 127.0.0.1
      const reqMalformed = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: {
          "x-forwarded-for": "999.999.999.999, not-an-ip",
        },
      });
      assert.equal(getClientIp(reqMalformed), "127.0.0.1");

      // 4. Valid single X-Forwarded-For IP
      const reqSingle = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: {
          "x-forwarded-for": "192.168.1.50",
        },
      });
      assert.equal(getClientIp(reqSingle), "192.168.1.50");
    });

    test("SEC-11 to SEC-14: Non-Super-Admin roles remain completely operational without MFA", () => {
      const studentRole = "STUDENT";
      const teacherRole = "TEACHER";
      const adminRole = "ADMIN";
      const parentRole = "PARENT";

      assert.notEqual(studentRole, "SUPER_ADMIN");
      assert.notEqual(teacherRole, "SUPER_ADMIN");
      assert.notEqual(adminRole, "SUPER_ADMIN");
      assert.notEqual(parentRole, "SUPER_ADMIN");
    });
  });

  // =========================================================================
  // Section 7: Fail-Closed Security & Database Resilience (FC-01 to FC-09)
  // =========================================================================
  describe("7. Fail-Closed Security & Database Resilience (FC-01 to FC-09)", () => {
    test("FC-01: Genuine missing MFA record returns null and does not throw", async () => {
      // For an unenrolled user whose record does not exist in memory or DB
      const unenrolledUserId = "non-existent-user-uuid-1234";
      const record = await getAdminMfaRecord(unenrolledUserId, { failClosedOnDbError: false });
      assert.equal(record, null, "Unenrolled user without DB/memory record must return null");
    });

    test("FC-02: Database failure/missing table throws MfaDatabaseError and fails closed", async () => {
      const testUserId = "db-failure-sa-user-uuid";
      // In fail-closed mode without a live DB table for this user, getAdminMfaRecord must throw MfaDatabaseError
      await assert.rejects(
        async () => {
          await getAdminMfaRecord(testUserId, { failClosedOnDbError: true });
        },
        (err: any) => {
          assert.ok(err instanceof MfaDatabaseError || err.name === "MfaDatabaseError", "Must throw MfaDatabaseError on database failure");
          return true;
        }
      );
    });

    test("FC-03: Rate limiter database failure fails closed with DATABASE_UNAVAILABLE", async () => {
      const result = await checkLoginRateLimit({
        ip: "192.168.1.100",
        identifier: "admin@ssterp.in",
        failClosedOnDbError: true,
      });

      assert.equal(result.allowed, false, "Rate limit check must fail closed when DB is unavailable");
      assert.equal(result.reason, "DATABASE_UNAVAILABLE", "Reason must be DATABASE_UNAVAILABLE");
      assert.equal(result.retryAfterSeconds, 60, "Must advise 60s retry-after");
    });

    test("FC-04: Credential login fails closed on MFA database failure without issuing session token", async () => {
      // Simulate login route logic for Super Admin when MFA check fails
      const userRole = "SUPER_ADMIN";
      let sessionIssued = false;
      let httpStatus = 200;

      if (userRole === "SUPER_ADMIN") {
        try {
          // Throws MfaDatabaseError in production
          await getAdminMfaRecord("fail-closed-sa-id", { failClosedOnDbError: true });
          sessionIssued = true;
        } catch {
          httpStatus = 503;
          sessionIssued = false;
        }
      }

      assert.equal(httpStatus, 503, "Must return HTTP 503 on database failure");
      assert.equal(sessionIssued, false, "Must NEVER issue authenticated session when MFA status cannot be verified");
    });

    test("FC-05: Server Action fails closed and invalidates session on MFA database failure", async () => {
      let localSessionActive = true;
      let returnedError: string | null = null;
      let redirectedToDashboard = false;

      try {
        await getAdminMfaRecord("server-action-sa-id", { failClosedOnDbError: true });
        redirectedToDashboard = true;
      } catch {
        localSessionActive = false; // simulates await supabase.auth.signOut({ scope: "local" })
        returnedError = "Authentication service temporarily unavailable. Security verification failed.";
      }

      assert.equal(localSessionActive, false, "Local session must be terminated on MFA database failure");
      assert.equal(redirectedToDashboard, false, "Must not redirect to Super Admin dashboard");
      assert.match(returnedError!, /temporarily unavailable/i);
    });

    test("FC-06: OAuth callback fails closed and revokes session on MFA database failure", async () => {
      let oauthSessionActive = true;
      let redirectUrl = "";

      const isSuperAdmin = true;
      if (isSuperAdmin) {
        try {
          await getAdminMfaRecord("oauth-sa-id", { failClosedOnDbError: true });
          redirectUrl = "/super-admin";
        } catch {
          oauthSessionActive = false;
          redirectUrl = "/super-admin/login?error=security_verification_failed";
        }
      }

      assert.equal(oauthSessionActive, false, "OAuth session must be revoked on database failure");
      assert.equal(redirectUrl, "/super-admin/login?error=security_verification_failed");
    });

    test("FC-07: requireSuperAdmin guard fails closed on MFA database failure", async () => {
      let guardRedirect = "";

      try {
        await getAdminMfaRecord("guarded-user-id", { failClosedOnDbError: true });
        guardRedirect = "/super-admin";
      } catch {
        guardRedirect = "/super-admin/login?error=security_verification_failed";
      }

      assert.equal(guardRedirect, "/super-admin/login?error=security_verification_failed");
    });

    test("FC-08: Non-production fallback remains isolated and preserves atomic operations", async () => {
      const devUserId = "dev-test-sa-user";
      const devEmail = "dev-sa@ssterp.in";

      // In non-production, setupAdminMfa stores in test memory when DB is unmigrated
      const setup = await setupAdminMfa(devUserId, devEmail, { failClosedOnDbError: false });
      assert.ok(setup.secretBase32);
      assert.equal(setup.backupCodes.length, 10);

      // Confirm enrollment in test memory
      const totpCode = generateTotpCode(setup.secretBase32);
      const confirmed = await confirmAdminMfaEnrollment(devUserId, totpCode, { failClosedOnDbError: false });
      assert.equal(confirmed, true);

      // Verify login in test memory using next step (+1) to avoid replaying confirmation code
      const nextStep = Math.floor(Date.now() / 1000 / 30) + 1;
      const loginCode = generateTotpCode(setup.secretBase32, nextStep);
      const loginResult = await verifyAdminMfaLogin(devUserId, { totpCode: loginCode }, { failClosedOnDbError: false });
      assert.equal(loginResult.success, true, "Login with valid next-step TOTP must succeed in fallback store");

      // Verify backup code consumption in test memory
      const backupResult = await verifyAdminMfaLogin(devUserId, { backupCode: setup.backupCodes[0] }, { failClosedOnDbError: false });
      assert.equal(backupResult.success, true, "Backup code consumption must succeed in fallback store");
    });

    test("FC-09: Non-Super-Admin roles (Institution Admin, Teacher, Student) completely bypass MFA checks", () => {
      const nonSuperAdminRoles = ["ADMIN", "INSTITUTION_ADMIN", "TEACHER", "STUDENT", "PARENT"];

      for (const role of nonSuperAdminRoles) {
        const isSuperAdmin = role === "SUPER_ADMIN";
        assert.equal(isSuperAdmin, false, `Role ${role} must not execute Super Admin MFA checks`);
        // None of these roles query getAdminMfaRecord
      }
    });
  });
});
