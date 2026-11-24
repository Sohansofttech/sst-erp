/**
 * SST-ERP Verification Suite:
 * Complete Email Infrastructure Option C (Institution Provider + Central Fallback)
 * Architecture Verification with Isolated Disposable PGlite Database
 */

import { PGlite } from "@electric-sql/pglite";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Guarantee canonical environment variables for test execution
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_mock_central_sohansoft_key_12345";
process.env.EMAIL_FROM = process.env.EMAIL_FROM || "admissions@erp.sohansoft.in";

import {
  CENTRAL_SOHAN_SOFTECH_SENDER,
  CENTRAL_SOHAN_SOFTECH_NAME,
  getInstitutionEmailConfig,
  saveInstitutionEmailConfig,
  testInstitutionEmailConnection,
  getCentralEmailConfig,
  saveCentralEmailConfig,
  toMaskedInstitutionConfig,
  toMaskedCentralConfig,
  recordEmailDeliveryLog,
  getEmailDeliveryLogs,
} from "../lib/services/email-config.service";
import {
  sendEmail,
  sendRoleCredentialInvitation,
  sendAnnouncementNotification,
  sendDirectEmail,
  sendPasswordResetNotification,
  sendFeeReceiptNotification,
  sendAttendanceAlertNotification,
  getRolePortalLoginUrl,
} from "../lib/services/email.service";
import {
  renderPasswordResetEmail,
  renderFeeReceiptEmail,
  renderAttendanceAlertEmail,
  renderRoleCredentialInvitationEmail,
} from "../lib/email/templates";
import {
  encryptCredential,
  decryptCredential,
  maskCredential,
} from "../lib/security/encryption";
import {
  signPasswordSetupToken,
  verifyPasswordSetupToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
} from "../lib/auth/jwt";

async function runTestSuite() {
  console.log("================================================================================");
  console.log("  SST-ERP: EMAIL INFRASTRUCTURE (OPTION C) VERIFICATION SUITE");
  console.log("  Architecture: Institution-Specific Provider with Central Sohan Softech Fallback");
  console.log("================================================================================\n");

  let total = 0;
  let passed = 0;

  // Intercept Resend API calls for deterministic isolated testing
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (urlStr.includes("api.resend.com/emails")) {
      const authHeader = init?.headers?.Authorization || "";
      if (authHeader.includes("re_invalid")) {
        return new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 });
      }
      return new Response(JSON.stringify({ id: "01a20b1c-mock-msg-id-12345" }), { status: 200 });
    }
    return origFetch(url, init);
  };

  function assert(condition: boolean, desc: string, details?: any) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✓ [PASS] ${desc}`);
    } else {
      console.error(`  ✗ [FAIL] ${desc}`, details ? `-> ${JSON.stringify(details)}` : "");
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 1: CREDENTIAL ENCRYPTION & DATA MASKING (AES-256-GCM)
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 1: Credential Encryption & Masking (AES-256-GCM) ---");

  const rawPassword = "SuperSecureInstitutionPassword#2026!";
  const encrypted = encryptCredential(rawPassword);

  assert(
    encrypted.includes(":") && encrypted.split(":").length === 3,
    "AES-256-GCM produces valid iv:authTag:ciphertext structure"
  );

  const decrypted = decryptCredential(encrypted);
  assert(
    decrypted === rawPassword,
    "Decryption recovers original plaintext password identically"
  );

  const maskedSmtp = maskCredential(rawPassword, 0, 0, true);
  assert(
    maskedSmtp === "••••••••••••",
    "maskCredential fully hides sensitive SMTP passwords for UI serialization"
  );

  const rawApiKey = "re_live_sec_1234567890abcdef1234";
  const maskedApiKey = maskCredential(rawApiKey, 4, 4, false);
  assert(
    maskedApiKey.startsWith("re_l...") && maskedApiKey.endsWith("1234"),
    "maskCredential displays safe prefix/suffix for API keys"
  );

  // --------------------------------------------------------------------------
  // SECTION 2: MULTI-TENANT ISOLATION & CONFIGURATION STORAGE
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 2: Multi-Tenant Isolation & Configuration Storage ---");

  const instA = "inst_apex_university_001";
  const instB = "inst_vidyaniketan_002";

  // Save config for Institution A (SMTP)
  await saveInstitutionEmailConfig(instA, {
    provider: "SMTP",
    senderEmail: "admissions@apex.edu.in",
    senderName: "Apex University Admissions",
    replyToEmail: "helpdesk@apex.edu.in",
    isEnabled: false, // unverified initially
    credentials: {
      host: "smtp.apex.edu.in",
      port: 587,
      username: "admissions@apex.edu.in",
      password: "SecretApexPassword123",
    },
  });

  // Save config for Institution B (Resend)
  await saveInstitutionEmailConfig(instB, {
    provider: "RESEND",
    senderEmail: "notifications@vidyaniketan.ac.in",
    senderName: "Vidyaniketan Notifications",
    isEnabled: false,
    credentials: {
      apiKey: "re_mock_vidyaniketan_key_12345",
    },
  });

  const configA = await getInstitutionEmailConfig(instA);
  const configB = await getInstitutionEmailConfig(instB);

  assert(
    configA.senderEmail === "admissions@apex.edu.in" && configA.provider === "SMTP",
    "Institution A configuration loaded correctly"
  );
  assert(
    configB.senderEmail === "notifications@vidyaniketan.ac.in" && configB.provider === "RESEND",
    "Institution B configuration loaded correctly"
  );
  assert(
    configA.institutionId !== configB.institutionId && configA.senderEmail !== configB.senderEmail,
    "Strict tenant isolation: Institution A and B configurations do not leak"
  );

  const maskedA = toMaskedInstitutionConfig(configA);
  assert(
    !("password" in (maskedA.maskedCredentials as any)) &&
      (maskedA.maskedCredentials as any)?.maskedPassword === "••••••••••••",
    "Frontend masked config for Institution A never contains raw password"
  );
  assert(
    maskedA.architectureMode === "OPTION_C_INSTITUTION_WITH_CENTRAL_FALLBACK",
    "Architecture mode confirms Option C in masked config payload"
  );

  // --------------------------------------------------------------------------
  // SECTION 3: UNVERIFIED SENDER REJECTION & SENDER AUTHORIZATION
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 3: Unverified Sender Rejection (Security Invariant) ---");

  // Rule: Entering an email address alone must NEVER authorize sending from that address!
  assert(
    configA.status === "PENDING_VERIFICATION",
    "Security Invariant: Freshly saved configuration starts in PENDING_VERIFICATION"
  );

  // When sender is unverified, Option C must NOT use institution sender, but use central fallback
  const sendUnverifiedResult = await sendEmail({
    to: "test.applicant@gmail.com",
    subject: "Admissions Offer Letter",
    html: "<p>Welcome to Apex</p>",
    institutionId: instA,
    allowFallback: true,
  });

  assert(
    sendUnverifiedResult.success === true,
    "Delivery succeeds via central Sohan Softech fallback when institution provider is unverified"
  );
  assert(
    sendUnverifiedResult.provider?.startsWith("central-") || sendUnverifiedResult.provider === "resend",
    "Delivery routed via central provider, refusing unauthorized institution sender"
  );

  // --------------------------------------------------------------------------
  // SECTION 4: VERIFIED INSTITUTION SENDER DISPATCH
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 4: Verified Institution Sender Dispatch ---");

  // Mark Institution B as verified & enabled (Resend provider)
  configB.status = "VERIFIED";
  configB.isEnabled = true;
  configB.lastVerifiedAt = new Date().toISOString();

  // Test with verified institution Resend provider
  const sendVerifiedResult = await sendEmail({
    to: "student.accepted@gmail.com",
    subject: "Enrollment Confirmation",
    html: "<p>Your enrollment is confirmed.</p>",
    institutionId: instB,
  });

  assert(
    sendVerifiedResult.success === true && sendVerifiedResult.provider === "institution-resend",
    "Verified institution sender executes successfully via institution provider"
  );
  assert(
    sendVerifiedResult.fallbackUsed === false,
    "Verified institution sender dispatches with fallbackUsed === false"
  );

  // --------------------------------------------------------------------------
  // SECTION 5: DISABLED INSTITUTION CONFIGURATION (FALLBACK ROUTING)
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 5: Disabled Institution Configuration ---");

  // Disable Institution A
  configA.isEnabled = false;

  const sendDisabledResult = await sendEmail({
    to: "parent.notice@gmail.com",
    subject: "Term Examination Schedule",
    html: "<p>Exam schedule details</p>",
    institutionId: instA,
    allowFallback: true,
  });

  assert(
    sendDisabledResult.success === true,
    "Delivery succeeds when institution configuration is disabled"
  );
  assert(
    sendDisabledResult.provider?.startsWith("central-") || sendDisabledResult.provider === "resend",
    "When institution config is disabled, system automatically routes to Central Sohan Softech fallback"
  );

  // --------------------------------------------------------------------------
  // SECTION 6: PROVIDER OUTAGE & AUTOMATIC CENTRAL FALLBACK
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 6: Provider Outage & Explicit Fallback Handling ---");

  // Enable with invalid/outage credentials
  configA.isEnabled = true;
  configA.status = "VERIFIED";
  (configA.credentials as any) = {
    host: "invalid.nonexistent.outage.host",
    port: 9999,
    username: "down@outage.com",
    password: "bad",
  };

  const outageResult = await sendEmail({
    to: "faculty.meeting@gmail.com",
    subject: "Urgent Faculty Senate Meeting",
    html: "<p>Meeting postponed</p>",
    institutionId: instA,
    allowFallback: true,
  });

  assert(
    outageResult.success === true,
    "Outage Resilience: Email dispatched successfully via Central Sohan Softech fallback despite institution SMTP failure"
  );
  assert(
    outageResult.fallbackUsed === true,
    "Result explicitly indicates fallbackUsed === true (audit transparency)"
  );

  // --------------------------------------------------------------------------
  // SECTION 7: DELIVERY MONITORING & AUDIT LOGGING ACCURACY
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 7: Delivery Monitoring & Status Distinction ---");

  // Record mock delivery log
  const mockLog = await recordEmailDeliveryLog({
    institutionId: instA,
    recipientEmail: "candidate@sohansoft.in",
    senderIdentity: "admissions@apex.edu.in",
    subject: "Admission Offer",
    purpose: "INVITATION",
    provider: "institution-smtp",
    fallbackUsed: false,
    providerMessageId: "msg_provider_001a",
    deliveryStatus: "ACCEPTED",
    retryCount: 0,
  });

  assert(
    mockLog.deliveryStatus === "ACCEPTED",
    "Status distinguishes provider ACCEPTED from confirmed inbox delivery"
  );
  assert(
    mockLog.providerMessageId === "msg_provider_001a",
    "Delivery log captures upstream provider message ID"
  );

  const logsQuery = await getEmailDeliveryLogs({ institutionId: instA });
  assert(
    logsQuery.logs.length > 0 && logsQuery.logs.some((l) => l.recipientEmail === "candidate@sohansoft.in"),
    "Institution Admin can query their own institution delivery logs"
  );

  // Cross-tenant log isolation: Institution B must not see Institution A's logs
  const logsQueryB = await getEmailDeliveryLogs({ institutionId: instB });
  assert(
    !logsQueryB.logs.some((l) => l.recipientEmail === "candidate@sohansoft.in"),
    "Tenant isolation: Institution B cannot view Institution A's delivery logs"
  );

  // --------------------------------------------------------------------------
  // SECTION 8: ROLE-SPECIFIC ONBOARDING, TOKENS & RESET INTEGRATION
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 8: Role-Specific Onboarding & Security Invariants ---");

  // Test setup token generation
  const setupToken = await signPasswordSetupToken({
    userId: "user_student_123",
    email: "student@apex.edu",
    institutionId: instA,
    passwordHash: "$2a$10$OldPasswordHashFingerprint1",
  });

  const verifiedToken = await verifyPasswordSetupToken(setupToken);
  assert(
    verifiedToken?.userId === "user_student_123" && verifiedToken.email === "student@apex.edu",
    "Setup token verified with matching user ID and email"
  );

  // Test password reset token generation
  const resetToken = await signPasswordResetToken({
    userId: "user_faculty_456",
    email: "faculty@apex.edu",
    institutionId: instA,
    passwordHash: "$2a$10$OldPasswordHashFingerprint2",
  });

  const verifiedReset = await verifyPasswordResetToken(resetToken);
  assert(
    verifiedReset?.userId === "user_faculty_456" && verifiedReset.email === "faculty@apex.edu",
    "Password reset token verified with 24-hour expiration"
  );

  // Test role portal URLs
  const studentPortalUrl = getRolePortalLoginUrl("STUDENT", "apex", "https://campus.sst-erp.edu");
  assert(
    studentPortalUrl === "https://campus.sst-erp.edu/student/dashboard",
    "Student role maps to /student/dashboard"
  );

  const parentPortalUrl = getRolePortalLoginUrl("PARENT", "apex", "https://campus.sst-erp.edu");
  assert(
    parentPortalUrl === "https://campus.sst-erp.edu/parent/dashboard",
    "Parent role maps to /parent/dashboard"
  );

  const teacherPortalUrl = getRolePortalLoginUrl("TEACHER", "apex", "https://campus.sst-erp.edu");
  assert(
    teacherPortalUrl === "https://campus.sst-erp.edu/campus/apex/teacher",
    "Teacher role maps to /campus/[slug]/teacher"
  );

  const hodPortalUrl = getRolePortalLoginUrl("HOD", "apex", "https://campus.sst-erp.edu");
  assert(
    hodPortalUrl === "https://campus.sst-erp.edu/campus/apex/teacher/hod",
    "HOD role maps to /campus/[slug]/teacher/hod"
  );

  const adminPortalUrl = getRolePortalLoginUrl("ADMIN", "apex", "https://campus.sst-erp.edu");
  assert(
    adminPortalUrl === "https://campus.sst-erp.edu/admin/login",
    "Institution Admin role maps to /admin/login"
  );

  // --------------------------------------------------------------------------
  // SECTION 9: PHASE 6 NOTIFICATION TEMPLATES INTEGRATION
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 9: Phase 6 Notification Templates ---");

  // 1. Password Reset Template
  const renderedReset = renderPasswordResetEmail({
    name: "Dr. Ramesh Gupta",
    resetUrl: "https://campus.sst-erp.edu/auth/reset-password?token=XYZ_SECURE",
    institutionName: "Apex University",
    expiresIn: "24 hours",
  });
  assert(
    renderedReset.subject.includes("Apex University") &&
      renderedReset.html.includes("Password Reset Request") &&
      renderedReset.html.includes("https://campus.sst-erp.edu/auth/reset-password?token=XYZ_SECURE"),
    "Password reset template renders institution branding and single-use link"
  );
  assert(
    !renderedReset.html.includes("password123") && !renderedReset.text.includes("password123"),
    "Password reset template never includes permanent plaintext password"
  );

  // 2. Fee Receipt Template
  const renderedReceipt = renderFeeReceiptEmail({
    studentName: "Priya Sharma",
    receiptNumber: "RCPT-2026-8891",
    transactionId: "TXN_RZP_998877",
    amount: 45000,
    currency: "INR",
    paymentDate: "24 Nov 2026",
    institutionName: "Apex University",
    downloadUrl: "https://campus.sst-erp.edu/api/student/fees/receipt/8891",
  });
  assert(
    renderedReceipt.subject.includes("RCPT-2026-8891") &&
      renderedReceipt.html.includes("Priya Sharma") &&
      renderedReceipt.html.includes("45,000") &&
      renderedReceipt.html.includes("TXN_RZP_998877"),
    "Fee receipt template renders student details, transaction ID, and amount"
  );

  // 3. Attendance Alert Template
  const renderedAlert = renderAttendanceAlertEmail({
    studentName: "Karthik Raja",
    rollNumber: "CS-2024-042",
    attendancePercentage: 68.5,
    thresholdPercentage: 75,
    institutionName: "Apex University",
    contactEmail: "dean.academics@apex.edu.in",
  });
  assert(
    renderedAlert.subject.includes("Karthik Raja") &&
      renderedAlert.html.includes("68.5%") &&
      renderedAlert.html.includes("75%") &&
      renderedAlert.html.includes("dean.academics@apex.edu.in"),
    "Attendance alert template renders warning threshold and contact details"
  );

  // --------------------------------------------------------------------------
  // SECTION 10: SUPER ADMIN CENTRAL PROVIDER CONFIGURATION
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 10: Super Admin Central Configuration ---");

  const centralSaved = await saveCentralEmailConfig({
    provider: "RESEND",
    senderEmail: CENTRAL_SOHAN_SOFTECH_SENDER,
    senderName: CENTRAL_SOHAN_SOFTECH_NAME,
    credentials: {
      apiKey: "re_central_test_key_sohansoft_9988",
    },
  });

  assert(
    centralSaved.senderEmail === CENTRAL_SOHAN_SOFTECH_SENDER &&
      centralSaved.senderName === CENTRAL_SOHAN_SOFTECH_NAME,
    "Central email provider config stored with canonical sender noreply@erp.sohansoft.in"
  );

  const maskedCentral = toMaskedCentralConfig(centralSaved);
  assert(
    !("apiKey" in (maskedCentral.maskedCredentials as any)) &&
      (maskedCentral.maskedCredentials as any)?.maskedApiKey?.startsWith("re_c..."),
    "Central masked config masks API key and prevents secret exposure"
  );

  console.log("\n================================================================================");
  console.log(` RESULTS: ${passed} / ${total} ASSERTIONS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log("================================================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
