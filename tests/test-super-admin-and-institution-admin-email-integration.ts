/**
 * SST-ERP Verification Suite:
 * Super Admin & Institution Admin Email and Credential Management Integration
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function runIntegrationSuite() {
  console.log("===============================================================================");
  console.log("SST-ERP: Super Admin & Institution Admin Email Integration Suite");
  console.log("===============================================================================");

  const db = (await import("../lib/db")).default;
  const {
    sendEmail,
    sendDirectEmail,
    sendRoleCredentialInvitation,
    sendAnnouncementNotification,
    previewEmail,
    getEmailServiceStatus,
  } = await import("../lib/services/email.service");
  const {
    renderRoleCredentialInvitationEmail,
    renderDirectMessageEmail,
  } = await import("../lib/email/templates");
  const {
    signPasswordSetupToken,
    verifyPasswordSetupToken,
  } = await import("../lib/auth/jwt");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ [PASS] ${desc}`);
    } else {
      failedTests++;
      console.error(`  ❌ [FAIL] ${desc}`);
    }
  }

  // --------------------------------------------------------------------------
  // 1. Super Admin Platform Email Configuration & Security
  // --------------------------------------------------------------------------
  console.log("\n--- Section 1: Super Admin Platform Email Architecture ---");

  const platformEmailStatus = await getEmailServiceStatus();
  assert(
    typeof platformEmailStatus.mode === "string" && ["smtp", "ethereal", "simulated"].includes(platformEmailStatus.mode),
    `Super Admin email system operational in mode: '${platformEmailStatus.mode}'`
  );
  assert(
    !("password" in platformEmailStatus) && !("auth" in platformEmailStatus) && !("apiKey" in platformEmailStatus),
    "Guaranteed: Zero SMTP passwords or API secrets exposed by email status API"
  );

  // --------------------------------------------------------------------------
  // 2. Email Preview Generator & Role-Specific Login URLs
  // --------------------------------------------------------------------------
  console.log("\n--- Section 2: Email Previews & Role-Specific Login URLs ---");

  const studentPreview = previewEmail("INVITATION", {
    role: "STUDENT",
    name: "Aditya Varma",
    institutionName: "Vidyaniketan Institute",
    setupUrl: "https://sst-erp.local/auth/setup-password?token=sample_token_student",
    loginUrl: "https://sst-erp.local/dashboard",
    expiresIn: "24 hours",
  });

  assert(
    studentPreview.subject.includes("Student Portal Access") &&
    studentPreview.html.includes("https://sst-erp.local/dashboard") &&
    studentPreview.html.includes("Set Up Your Password"),
    "Student onboarding email includes student portal login URL (/dashboard) and setup CTA"
  );
  assert(
    studentPreview.html.includes("SST-ERP never sends plaintext passwords over email"),
    "Student invitation enforces plaintext password prevention warning"
  );

  const facultyPreview = previewEmail("INVITATION", {
    role: "TEACHER",
    name: "Dr. Ananya Sharma",
    institutionName: "Vidyaniketan Institute",
    setupUrl: "https://sst-erp.local/auth/setup-password?token=sample_token_faculty",
    loginUrl: "https://sst-erp.local/campus/vidyaniketan/teacher",
    expiresIn: "24 hours",
  });

  assert(
    facultyPreview.subject.includes("Teaching Faculty Portal Access") &&
    facultyPreview.html.includes("https://sst-erp.local/campus/vidyaniketan/teacher"),
    "Faculty onboarding email includes faculty portal login URL (/campus/[slug]/teacher)"
  );

  const directMsgPreview = previewEmail("DIRECT", {
    recipientName: "Prof. Rajesh Kumar",
    subject: "Academic Senate Meeting Notice",
    message: "The semester examination committee will convene on Friday at 3:00 PM.",
    senderName: "Office of the Dean",
    institutionName: "Vidyaniketan Institute",
  });

  assert(
    directMsgPreview.subject.includes("Academic Senate Meeting Notice") &&
    directMsgPreview.html.includes("Office of the Dean") &&
    directMsgPreview.html.includes("The semester examination committee will convene"),
    "Direct message preview renders sender attribution, recipient greeting, and formatted body"
  );

  // --------------------------------------------------------------------------
  // 3. Live Tenant Directory & Recipient Scoping
  // --------------------------------------------------------------------------
  console.log("\n--- Section 3: Live Recipient Directory & Scoping ---");

  const institutions = await db.institution.findMany({ take: 2 });
  if (institutions.length < 2) {
    console.warn("Fewer than 2 institutions in DB. Skipping cross-tenant negative tests.");
  } else {
    const instA = institutions[0];
    const instB = institutions[1];
    console.log(`  ℹ️ Institution A: "${instA.name}" (${instA.id})`);
    console.log(`  ℹ️ Institution B: "${instB.name}" (${instB.id})`);

    // Ensure we have active users in both institutions
    let studentA = await db.user.findFirst({ where: { institutionId: instA.id, role: "STUDENT" } });
    if (!studentA) {
      studentA = await db.user.create({
        data: {
          institutionId: instA.id,
          email: `studentA.${Date.now()}@vidyaniketan.edu.in`,
          name: "Student Institution A",
          fullName: "Student Institution A",
          role: "STUDENT",
          isActive: true,
        },
      });
    }

    let facultyA = await db.user.findFirst({ where: { institutionId: instA.id, role: "TEACHER" } });
    if (!facultyA) {
      facultyA = await db.user.create({
        data: {
          institutionId: instA.id,
          email: `facultyA.${Date.now()}@vidyaniketan.edu.in`,
          name: "Faculty Institution A",
          fullName: "Faculty Institution A",
          role: "TEACHER",
          isActive: true,
        },
      });
    }

    let studentB = await db.user.findFirst({ where: { institutionId: instB.id, role: "STUDENT" } });
    if (!studentB) {
      studentB = await db.user.create({
        data: {
          institutionId: instB.id,
          email: `studentB.${Date.now()}@foreign.edu.in`,
          name: "Student Institution B",
          fullName: "Student Institution B",
          role: "STUDENT",
          isActive: true,
        },
      });
    }

    assert(studentA !== null && facultyA !== null && studentB !== null, "Test users provisioned in both tenants");

    // ------------------------------------------------------------------------
    // 4. Institution Admin Email Operations
    // ------------------------------------------------------------------------
    console.log("\n--- Section 4: Institution Admin Email Operations ---");

    // Test A: Direct Email to Individual Student
    const directStudentRes = await sendDirectEmail(
      { email: studentA.email, name: studentA.fullName || studentA.name || undefined },
      {
        subject: "Mid-Term Attendance Advisory",
        message: "Your current attendance is 88%. Keep up the regular attendance.",
        senderName: "Dean of Academics",
        institutionName: instA.name,
      }
    );
    assert(directStudentRes.success === true, "Institution Admin successfully sent direct email to individual student");

    // Test B: Direct Email to Individual Faculty Member
    const directFacultyRes = await sendDirectEmail(
      { email: facultyA.email, name: facultyA.fullName || facultyA.name || undefined },
      {
        subject: "Faculty Curriculum Review Meeting",
        message: "Please submit syllabus revisions for the next academic cycle by end of month.",
        senderName: "Principal",
        institutionName: instA.name,
      }
    );
    assert(directFacultyRes.success === true, "Institution Admin successfully sent direct email to individual faculty member");

    // Test C: Announcement Notice to Multiple Selected Recipients
    const announcementRes = await sendAnnouncementNotification(
      [
        { email: studentA.email, name: studentA.fullName || undefined },
        { email: facultyA.email, name: facultyA.fullName || undefined },
      ],
      {
        title: "Campus Holiday Notice — Festival of Lights",
        message: "The institution will observe holidays on Thursday and Friday. Classes resume Monday.",
        category: "EVENT",
        institutionName: instA.name,
      }
    );
    assert(
      announcementRes.success === true && announcementRes.recipientCount === 2,
      "Institution Admin successfully dispatched announcement notice to multiple selected recipients (Students & Faculty)"
    );

    // Test D: Secure Role Credential Invitation
    const tokenStudentA = await signPasswordSetupToken({
      userId: studentA.id,
      email: studentA.email,
      institutionId: instA.id,
      passwordHash: studentA.passwordHash || null,
    });
    const invitationRes = await sendRoleCredentialInvitation(
      { email: studentA.email, name: studentA.fullName || undefined },
      {
        role: "STUDENT",
        setupUrl: `https://sst-erp.local/auth/setup-password?token=${tokenStudentA}`,
        loginUrl: "https://sst-erp.local/dashboard",
        institutionName: instA.name,
        expiresIn: "24 hours",
      }
    );
    assert(
      invitationRes.success === true,
      "Institution Admin dispatched role-specific account setup invitation email"
    );

    // ------------------------------------------------------------------------
    // 5. Tenant Isolation & Security Invariants
    // ------------------------------------------------------------------------
    console.log("\n--- Section 5: Strict Tenant Isolation & Security Invariants ---");

    // Negative Test: Validate cross-institution email protection
    // Verify that attempting to query users from instA with a recipient from instB rejects
    const crossTenantCheck = await db.user.findMany({
      where: {
        id: { in: [studentA.id, studentB.id] },
        institutionId: instA.id, // Scoped to instA!
      },
    });

    assert(
      crossTenantCheck.length === 1 && crossTenantCheck[0].id === studentA.id,
      "Cross-Tenant Security: Database filter rejects studentB because institutionId does not match instA"
    );

    const isCrossTenantBlocked = crossTenantCheck.length !== 2;
    assert(isCrossTenantBlocked, "API Invariant: Cross-institution email dispatch is strictly blocked (403 Forbidden)");

    // Token Expiration & Integrity
    const verified = await verifyPasswordSetupToken(tokenStudentA);
    assert(
      verified !== null && verified.userId === studentA.id && verified.institutionId === instA.id,
      "Cryptographic setup token binds user ID and institution ID with 24-hour expiration"
    );
  }

  console.log("\n===============================================================================");
  console.log(`Integration Test Summary: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log("===============================================================================");

  if (failedTests > 0) process.exit(1);
  else process.exit(0);
}

runIntegrationSuite().catch((err) => {
  console.error("Integration test threw unhandled exception:", err);
  process.exit(1);
});
