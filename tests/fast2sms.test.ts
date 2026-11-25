import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Fast2SmsError, generateOtp, sendOtp } from "../lib/auth/fast2sms";
import { normalizeIndianMobile } from "../lib/auth/mobile";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  apiKey: process.env.FAST2SMS_API_KEY,
  otpId: process.env.FAST2SMS_OTP_ID,
  otpExpiry: process.env.FAST2SMS_OTP_EXPIRY,
  otpLength: process.env.FAST2SMS_OTP_LENGTH,
};

beforeEach(() => {
  process.env.FAST2SMS_API_KEY = "test-api-key";
  process.env.FAST2SMS_OTP_ID = "test-template";
  process.env.FAST2SMS_OTP_EXPIRY = "5";
  process.env.FAST2SMS_OTP_LENGTH = "6";
});

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
});

test("send uses the documented own-OTP contract and raw authorization key", async () => {
  let requestUrl = "";
  let requestMethod = "";
  let requestAuthorization = "";
  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestMethod = init?.method || "";
    requestAuthorization = new Headers(init?.headers).get("authorization") || "";
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ return: true, request_id: "provider-reference" }), { status: 200 });
  }) as typeof fetch;

  const response = await sendOtp("9876543210", "012345");

  assert.equal(requestUrl, "https://www.fast2sms.com/dev/otp/send");
  assert.equal(requestMethod, "POST");
  assert.equal(requestAuthorization, "test-api-key");
  assert.deepEqual(requestBody, {
    mobile: "9876543210",
    otp_id: "test-template",
    otp_expiry: 5,
    otp_length: 6,
    otp: "012345",
  });
  assert.equal(response.request_id, "provider-reference");
});

test("OTP generation preserves the configured numeric length", () => {
  assert.match(generateOtp(6), /^\d{6}$/);
  assert.match(generateOtp(10), /^\d{10}$/);
});

test("Indian mobile normalization accepts local and +91 formats only", () => {
  assert.equal(normalizeIndianMobile("9876543210"), "9876543210");
  assert.equal(normalizeIndianMobile("+91 98765-43210"), "9876543210");
  assert.equal(normalizeIndianMobile("919876543210"), "9876543210");
  assert.equal(normalizeIndianMobile("abc9876543210"), null);
  assert.equal(normalizeIndianMobile("1234567890"), null);
});

test("send reports invalid authorization without exposing the API key", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ return: false, message: "Invalid authorization key" }), { status: 200 })
  ) as typeof fetch;

  await assert.rejects(sendOtp("9876543210", "012345"), (error: unknown) => {
    assert.ok(error instanceof Fast2SmsError);
    assert.equal(error.code, "INVALID_AUTHORIZATION");
    assert.match(error.message, /active Fast2SMS API key/);
    assert.doesNotMatch(error.message, /test-api-key/);
    return true;
  });
});

test("send identifies an invalid Smart OTP template", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ return: false, message: "Invalid OTP ID" }), { status: 200 })
  ) as typeof fetch;

  await assert.rejects(sendOtp("9876543210", "012345"), (error: unknown) => {
    assert.ok(error instanceof Fast2SmsError);
    assert.equal(error.code, "INVALID_OTP_ID");
    assert.match(error.message, /FAST2SMS_OTP_ID/);
    return true;
  });
});

test("send rejects OTP expiry and length outside the provider limits", async () => {
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ return: true }), { status: 200 });
  }) as typeof fetch;

  process.env.FAST2SMS_OTP_EXPIRY = "10081";
  await assert.rejects(sendOtp("9876543210", "012345"), (error: unknown) => {
    assert.ok(error instanceof Fast2SmsError);
    assert.equal(error.code, "REQUEST_FAILED");
    return true;
  });

  process.env.FAST2SMS_OTP_EXPIRY = "5";
  process.env.FAST2SMS_OTP_LENGTH = "3";
  await assert.rejects(sendOtp("9876543210", "012345"), (error: unknown) => {
    assert.ok(error instanceof Fast2SmsError);
    assert.equal(error.code, "REQUEST_FAILED");
    return true;
  });
  assert.equal(fetchCalled, false);
});

test("a failed provider response is rejected even when HTTP succeeds", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ return: false, message: "Invalid OTP ID" }), { status: 200 })
  ) as typeof fetch;

  await assert.rejects(sendOtp("9876543210", "012345"), (error: unknown) => {
    assert.ok(error instanceof Fast2SmsError);
    assert.equal(error.code, "INVALID_OTP_ID");
    return true;
  });
});

test("provider diagnostics never expose the authorization key or OTP", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        return: false,
        message: "Request failed for key test-api-key and OTP 012345",
      }),
      { status: 400 }
    )
  ) as typeof fetch;

  await assert.rejects(sendOtp("9876543210", "012345"), (error: unknown) => {
    assert.ok(error instanceof Fast2SmsError);
    assert.doesNotMatch(error.message, /test-api-key|012345/);
    assert.doesNotMatch(error.diagnostic || "", /test-api-key|012345/);
    return true;
  });
});
