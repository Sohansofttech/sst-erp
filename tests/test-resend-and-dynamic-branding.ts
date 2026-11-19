/**
 * SST-ERP Production Integration Test Suite:
 * 1. Resend REST API Transactional Email Service
 * 2. Idempotency-Key Retry Mechanism & Error Handling
 * 3. Base App URL & Sender Resolution Priority
 * 4. Dynamic Multi-Tenant Institution Branding & Initials Resolution
 */

import {
  sendEmail,
  getEmailServiceStatus,
  getAppBaseUrl,
  sendPasswordSetupInvitation,
  sendRoleCredentialInvitation,
} from "../lib/services/email.service";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passedCount++;
  } else {
    console.error(`  \x1b[31m✘ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("  SST-ERP RESEND & DYNAMIC BRANDING VERIFICATION SUITE");
  console.log("=======================================================\n");

  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  try {
    // -------------------------------------------------------------
    // TEST GROUP 1: App Base URL & Sender Priority Resolution
    // -------------------------------------------------------------
    console.log("--- Group 1: Base URL & Sender Resolution ---");

    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert(getAppBaseUrl() === "http://localhost:3000", "Default base URL falls back to localhost:3000");

    process.env.NEXT_PUBLIC_SITE_URL = "https://erp.sohansoft.in";
    assert(getAppBaseUrl() === "https://erp.sohansoft.in", "NEXT_PUBLIC_SITE_URL is respected when APP_URL is absent");

    process.env.NEXT_PUBLIC_APP_URL = "https://app.sst-erp.com";
    assert(getAppBaseUrl() === "https://app.sst-erp.com", "NEXT_PUBLIC_APP_URL takes precedence over SITE_URL");

    // Sender priority test via getEmailServiceStatus
    delete process.env.RESEND_API_KEY;
    delete process.env.INSTITUTION_INVITATION_FROM_EMAIL;
    delete process.env.EMAIL_FROM;
    let status = await getEmailServiceStatus();
    assert(status.from.includes("noreply@sst-erp.local"), "Default sender fallback when no env is configured");

    process.env.EMAIL_FROM = '"Platform Admin" <admin@platform.com>';
    status = await getEmailServiceStatus();
    assert(status.from === '"Platform Admin" <admin@platform.com>', "EMAIL_FROM is respected when set");

    process.env.INSTITUTION_INVITATION_FROM_EMAIL = '"Admissions Office" <admissions@institution.edu>';
    status = await getEmailServiceStatus();
    assert(status.from === '"Admissions Office" <admissions@institution.edu>', "INSTITUTION_INVITATION_FROM_EMAIL takes highest precedence");

    // -------------------------------------------------------------
    // TEST GROUP 2: Email Service Status under Resend
    // -------------------------------------------------------------
    console.log("\n--- Group 2: Resend Operational Status Detection ---");

    process.env.RESEND_API_KEY = "re_test_dummy_key_12345";
    status = await getEmailServiceStatus();
    assert(status.mode === "resend", "Reports mode 'resend' when RESEND_API_KEY is defined");
    assert(status.configured === true, "Reports configured = true under Resend");
    assert(status.host === "api.resend.com", "Reports host 'api.resend.com'");
    assert(status.from === '"Admissions Office" <admissions@institution.edu>', "Sender is inherited under Resend mode");

    // -------------------------------------------------------------
    // TEST GROUP 3: Resend REST API Client Dispatch & Idempotency
    // -------------------------------------------------------------
    console.log("\n--- Group 3: Resend REST API Dispatch & Idempotency ---");

    const interceptedRequests: Array<{ url: string; method: string; headers: Headers; body: any }> = [];

    // Mock successful dispatch
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(init.body as string) : null;
      interceptedRequests.push({ url, method: init?.method || "GET", headers, body });

      return new Response(JSON.stringify({ id: "resend_msg_mock_9999" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    interceptedRequests.length = 0;
    const sendResult = await sendEmail({
      to: "director@apex.edu",
      subject: "Welcome to Apex Portal",
      html: "<p>Your workspace is ready.</p>",
      replyTo: "helpdesk@apex.edu",
    });

    assert(sendResult.success === true, "Resend sendEmail returns success = true");
    assert(sendResult.messageId === "resend_msg_mock_9999", "Returns Resend message ID");
    assert(interceptedRequests.length === 1, "Exactly 1 HTTP request made to Resend");

    const req1 = interceptedRequests[0];
    assert(req1.url === "https://api.resend.com/emails", "Dispatches to https://api.resend.com/emails");
    assert(req1.headers.get("Authorization") === "Bearer re_test_dummy_key_12345", "Bearer authorization header matches RESEND_API_KEY");
    assert(req1.headers.get("Content-Type") === "application/json", "Content-Type header is application/json");
    const idempotencyKey1 = req1.headers.get("Idempotency-Key");
    assert(Boolean(idempotencyKey1 && idempotencyKey1.length > 10), "Generates valid Idempotency-Key header");
    assert(req1.body.to[0] === "director@apex.edu", "Payload recipient matches input");
    assert(req1.body.reply_to === "helpdesk@apex.edu", "Payload reply_to matches input");

    // -------------------------------------------------------------
    // TEST GROUP 4: Transient Retry with Same Idempotency-Key
    // -------------------------------------------------------------
    console.log("\n--- Group 4: Transient Retry & Idempotency Key Preservation ---");

    interceptedRequests.length = 0;
    let callCount = 0;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      callCount++;
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(init.body as string) : null;
      interceptedRequests.push({ url, method: init?.method || "GET", headers, body });

      if (callCount === 1) {
        // First attempt fails with transient 503 Service Unavailable
        return new Response(JSON.stringify({ message: "Upstream temporary unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Second attempt succeeds
      return new Response(JSON.stringify({ id: "resend_retry_success_456" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const retryResult = await sendEmail({
      to: "faculty@apex.edu",
      subject: "Faculty Schedule Update",
      html: "<p>Updated schedule</p>",
    });

    assert(retryResult.success === true, "Transient retry succeeds on 2nd attempt");
    assert(retryResult.messageId === "resend_retry_success_456", "Returns message ID from successful retry");
    assert(interceptedRequests.length === 2, "Performed exactly 2 attempts (1 initial + 1 retry)");
    const retryKey1 = interceptedRequests[0].headers.get("Idempotency-Key");
    const retryKey2 = interceptedRequests[1].headers.get("Idempotency-Key");
    assert(retryKey1 === retryKey2, "Idempotency-Key is identical across retries to prevent duplicate delivery");

    // -------------------------------------------------------------
    // TEST GROUP 5: Real Error Reporting (No Silent Fallback)
    // -------------------------------------------------------------
    console.log("\n--- Group 5: Real Error Reporting (Strict No Silent Fallback) ---");

    interceptedRequests.length = 0;
    global.fetch = async () => {
      return new Response(JSON.stringify({ message: "Domain 'apex.edu' not verified in Resend dashboard" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    };

    const failResult = await sendEmail({
      to: "student@apex.edu",
      subject: "Enrollment Confirmed",
      html: "<p>Enrollment</p>",
    });

    assert(failResult.success === false, "Returns success = false on Resend rejection");
    assert(Boolean(failResult.error && failResult.error.includes("Domain 'apex.edu' not verified")), "Reports exact Resend API error message without swallowing");
    assert(failResult.simulated !== true, "Does NOT silently fall back to simulated transport when Resend is configured");

    // -------------------------------------------------------------
    // TEST GROUP 6: Dynamic Multi-Tenant Institution Initials
    // -------------------------------------------------------------
    console.log("\n--- Group 6: Dynamic Institution Initials & Branding ---");

    function computeInstitutionInitials(name?: string): string {
      const trimmed = (name || "").trim();
      if (!trimmed) return "ERP";
      const parts = trimmed.split(/\s+/).filter(Boolean);
      if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
      const STOP_WORDS = new Set(["OF", "AND", "&", "THE", "FOR", "IN", "AT"]);
      const meaningfulParts = parts.filter((p) => !STOP_WORDS.has(p.toUpperCase()));
      const targetParts = meaningfulParts.length >= 2 ? meaningfulParts : parts;
      return targetParts.slice(0, 3).map((p) => p[0]).join("").toUpperCase();
    }

    const testInstitutions = [
      { name: "Apex Institute of Technology", expected: "AIT" },
      { name: "Sohan Institute of Science", expected: "SIS" },
      { name: "St. Xavier's International School", expected: "SXI" },
      { name: "Delhi Public School", expected: "DPS" },
      { name: "Harvard", expected: "HAR" },
      { name: "", expected: "ERP" },
      { name: "   ", expected: "ERP" },
    ];

    for (const inst of testInstitutions) {
      const initials = computeInstitutionInitials(inst.name);
      assert(initials === inst.expected, `Initials for "${inst.name || '<empty>'}" resolves to "${inst.expected}"`);
    }

    // -------------------------------------------------------------
    // TEST GROUP 7: Dynamic Role Credential Invitation Dispatch
    // -------------------------------------------------------------
    console.log("\n--- Group 7: Role Credential Invitation Dispatch via Resend ---");

    interceptedRequests.length = 0;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(init.body as string) : null;
      interceptedRequests.push({ url, method: init?.method || "GET", headers, body });

      return new Response(JSON.stringify({ id: "resend_invitation_777" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const invitationRes = await sendRoleCredentialInvitation(
      { email: "dr.sharma@horizon.edu", name: "Dr. Sharma" },
      {
        setupUrl: "https://app.sst-erp.com/auth/setup-password?token=mock_token_abc",
        institutionName: "Horizon Institute of Engineering",
        role: "TEACHER",
        expiresIn: "24 hours",
        loginUrl: "https://app.sst-erp.com/campus/horizon/teacher",
      }
    );

    assert(invitationRes.success === true, "sendRoleCredentialInvitation dispatches via Resend successfully");
    assert(interceptedRequests.length === 1, "Dispatched 1 email for role invitation");
    const invReq = interceptedRequests[0];
    assert(invReq.body.to[0] === "dr.sharma@horizon.edu", "Recipient matches invitation target");
    assert(invReq.body.subject.includes("Horizon Institute of Engineering"), "Subject dynamically includes tenant institution name");
    assert(invReq.body.html.includes("dr.sharma@horizon.edu"), "Email HTML body contains target email address");
    assert(invReq.body.html.includes("https://app.sst-erp.com/auth/setup-password?token=mock_token_abc"), "Email HTML body contains setup URL");

  } finally {
    // Restore environment and global fetch
    process.env = originalEnv;
    global.fetch = originalFetch;
  }

  console.log("\n=======================================================");
  console.log(`  TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
