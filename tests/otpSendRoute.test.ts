import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { POST } from "../app/api/auth/otp/send/route";
import { POST as verifyOtpPost } from "../app/api/auth/otp/verify/route";
import { db } from "../lib/db";

const originalFetch = globalThis.fetch;
const originalOtpTokenDescriptor = Object.getOwnPropertyDescriptor(db, "otpToken");
const originalPendingRegistrationDescriptor = Object.getOwnPropertyDescriptor(db, "pendingRegistration");
const originalQueryDescriptor = Object.getOwnPropertyDescriptor(db, "$queryRaw");
const originalEnvironment = {
  apiKey: process.env.FAST2SMS_API_KEY,
  otpId: process.env.FAST2SMS_OTP_ID,
  otpExpiry: process.env.FAST2SMS_OTP_EXPIRY,
  otpLength: process.env.FAST2SMS_OTP_LENGTH,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [
    ["FAST2SMS_API_KEY", originalEnvironment.apiKey],
    ["FAST2SMS_OTP_ID", originalEnvironment.otpId],
    ["FAST2SMS_OTP_EXPIRY", originalEnvironment.otpExpiry],
    ["FAST2SMS_OTP_LENGTH", originalEnvironment.otpLength],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  if (originalOtpTokenDescriptor) {
    Object.defineProperty(db, "otpToken", originalOtpTokenDescriptor);
  } else {
    delete (db as unknown as Record<string, unknown>).otpToken;
  }
  if (originalPendingRegistrationDescriptor) {
    Object.defineProperty(db, "pendingRegistration", originalPendingRegistrationDescriptor);
  } else {
    delete (db as unknown as Record<string, unknown>).pendingRegistration;
  }
  if (originalQueryDescriptor) {
    Object.defineProperty(db, "$queryRaw", originalQueryDescriptor);
  } else {
    delete (db as unknown as Record<string, unknown>).$queryRaw;
  }
});

test("send requests OTPs for an unregistered mobile in all four portals", async () => {
  process.env.FAST2SMS_API_KEY = "test-api-key";
  process.env.FAST2SMS_OTP_ID = "test-template";
  process.env.FAST2SMS_OTP_EXPIRY = "5";
  process.env.FAST2SMS_OTP_LENGTH = "6";

  let rateLimitQueryCount = 0;
  const providerRequests: Array<{
    mobile: string;
    otp: string;
    otp_id: string;
    otp_expiry: number;
    otp_length: number;
    authorization: string;
  }> = [];
  const storedRows = new Map<string, { id: string; tokenHash: string }>();
  Object.defineProperty(db, "$queryRaw", {
    configurable: true,
    writable: true,
    value: async (strings: TemplateStringsArray) => {
      assert.match(strings.join(" "), /INSERT INTO "OtpRateLimit"/);
      rateLimitQueryCount += 1;
      return [{ mobile: "9876543210" }];
    },
  });
  Object.defineProperty(db, "otpToken", {
    configurable: true,
    writable: true,
    value: {
      async deleteMany() {
        return { count: 0 };
      },
      async upsert(args: { create: { mobile: string; id: string; tokenHash: string } }) {
        storedRows.set(args.create.mobile, {
          id: args.create.id,
          tokenHash: args.create.tokenHash,
        });
        return args.create;
      },
    },
  });
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      mobile: string;
      otp: string;
      otp_id: string;
      otp_expiry: number;
      otp_length: number;
    };
    providerRequests.push({
      ...body,
      authorization: new Headers(init?.headers).get("authorization") || "",
    });
    return new Response(JSON.stringify({
      return: true,
      status_code: 200,
      request_id: "provider-reference",
      message: "OTP sent successfully",
    }), { status: 200 });
  }) as typeof fetch;

  for (const [index, role] of ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"].entries()) {
    const mobile = `987654321${index}`;
    const response = await POST(new Request("http://localhost/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile, role }),
    }));
    const body = await response.json() as { success: boolean; challengeId?: string; otp?: string };

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.challengeId);
    assert.equal(body.otp, undefined);
    assert.equal(providerRequests[index].mobile, mobile);
    assert.equal(providerRequests[index].otp_id, "test-template");
    assert.equal(providerRequests[index].otp_expiry, 5);
    assert.equal(providerRequests[index].otp_length, 6);
    assert.equal(providerRequests[index].authorization, "test-api-key");
    assert.equal(
      await bcrypt.compare(providerRequests[index].otp, storedRows.get(mobile)?.tokenHash || ""),
      true
    );
  }

  assert.equal(providerRequests.length, 4);
  assert.equal(rateLimitQueryCount, 4);
});

test("a rejected provider send does not persist the generated OTP", async () => {
  process.env.FAST2SMS_API_KEY = "test-api-key";
  process.env.FAST2SMS_OTP_ID = "test-template";
  process.env.FAST2SMS_OTP_EXPIRY = "5";
  process.env.FAST2SMS_OTP_LENGTH = "6";

  Object.defineProperty(db, "$queryRaw", {
    configurable: true,
    writable: true,
    value: async () => [{ mobile: "9876543210" }],
  });
  let upsertCalls = 0;
  Object.defineProperty(db, "otpToken", {
    configurable: true,
    writable: true,
    value: {
      async deleteMany() {
        return { count: 0 };
      },
      async upsert() {
        upsertCalls += 1;
        return {};
      },
    },
  });
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ return: false, message: "Invalid authorization key" }), { status: 200 })
  ) as typeof fetch;

  const response = await POST(new Request("http://localhost/api/auth/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: "9876543210", role: "STUDENT" }),
  }));
  const body = await response.json() as { success: boolean; error?: string };

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.match(body.error || "", /rejected the configured API key/i);
  assert.equal(upsertCalls, 0);
});

test("a valid OTP creates a pending registration without granting portal access", async () => {
  process.env.FAST2SMS_API_KEY = "test-api-key";
  process.env.FAST2SMS_OTP_ID = "test-template";
  process.env.FAST2SMS_OTP_EXPIRY = "5";
  process.env.FAST2SMS_OTP_LENGTH = "6";
  const otp = "123456";
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const challenge = {
    id: "test-challenge",
    mobile: "9876543210",
    tokenHash: await bcrypt.hash(otp, 10),
    attempts: 0,
    expiresAt,
  };
  let consumed = false;
  let pendingRegistrationWrites = 0;
  Object.defineProperty(db, "otpToken", {
    configurable: true,
    writable: true,
    value: {
      async findUnique() {
        return consumed ? null : challenge;
      },
      async deleteMany() {
        consumed = true;
        return { count: 1 };
      },
      async updateMany() {
        return { count: 1 };
      },
    },
  });
  Object.defineProperty(db, "$queryRaw", {
    configurable: true,
    writable: true,
    value: async () => [],
  });
  Object.defineProperty(db, "pendingRegistration", {
    configurable: true,
    writable: true,
    value: {
      async upsert(args: { where: { mobile: string }; update: { expiresAt: Date }; create: { mobile: string; expiresAt: Date } }) {
        assert.equal(consumed, true);
        assert.equal(args.where.mobile, "9876543210");
        pendingRegistrationWrites += 1;
        return { id: "pending-registration" };
      },
    },
  });

  const response = await verifyOtpPost(new Request("http://localhost/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mobile: "9876543210",
      otp: "123456",
      role: "STUDENT",
      challengeId: "test-challenge",
    }),
  }));
  const body = await response.json() as { success?: boolean; registrationPending?: boolean; message?: string; data?: unknown };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.registrationPending, true);
  assert.match(body.message || "", /no portal access/i);
  assert.equal(body.data, undefined);
  assert.equal(pendingRegistrationWrites, 1);
  assert.equal(consumed, true);
});

test("an invalid OTP cannot create a pending registration", async () => {
  process.env.FAST2SMS_OTP_ID = "test-template";
  process.env.FAST2SMS_OTP_EXPIRY = "5";
  process.env.FAST2SMS_OTP_LENGTH = "6";
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const challenge = {
    id: "test-challenge",
    mobile: "9876543210",
    tokenHash: await bcrypt.hash("654321", 10),
    attempts: 0,
    expiresAt,
  };
  let pendingRegistrationWrites = 0;
  Object.defineProperty(db, "otpToken", {
    configurable: true,
    writable: true,
    value: {
      async findUnique() {
        return challenge;
      },
      async updateMany() {
        return { count: 1 };
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
  });
  Object.defineProperty(db, "pendingRegistration", {
    configurable: true,
    writable: true,
    value: {
      async upsert() {
        pendingRegistrationWrites += 1;
        return { id: "pending-registration" };
      },
    },
  });

  const response = await verifyOtpPost(new Request("http://localhost/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mobile: "9876543210",
      otp: "123456",
      role: "STUDENT",
      challengeId: "test-challenge",
    }),
  }));
  const body = await response.json() as { success?: boolean; error?: string };

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.error || "", /incorrect otp/i);
  assert.equal(pendingRegistrationWrites, 0);
});
