import { randomInt } from "node:crypto";
import { normalizeIndianMobile } from "@/lib/auth/mobile";

export type Fast2SmsErrorCode =
  | "INVALID_AUTHORIZATION"
  | "INVALID_OTP_ID"
  | "RATE_LIMIT"
  | "REQUEST_FAILED";

export class Fast2SmsError extends Error {
  constructor(
    message: string,
    readonly code: Fast2SmsErrorCode,
    readonly status: number,
    readonly providerStatus?: number,
    readonly diagnostic?: string
  ) {
    super(message);
    this.name = "Fast2SmsError";
  }
}

export function validateIndianMobile(mobile: string): boolean {
  return normalizeIndianMobile(mobile) !== null;
}

function getApiKey() {
  const apiKey = process.env.FAST2SMS_API_KEY?.trim();
  if (!apiKey) {
    throw new Fast2SmsError(
      "Fast2SMS API key is not configured.",
      "INVALID_AUTHORIZATION",
      503
    );
  }
  return apiKey;
}

export type Fast2SmsOtpSettings = {
  otpId: string;
  otpExpiry: number;
  otpLength: number;
};

export function getFast2SmsOtpSettings(): Fast2SmsOtpSettings {
  const otpId = process.env.FAST2SMS_OTP_ID?.trim();
  const otpExpiry = Number(process.env.FAST2SMS_OTP_EXPIRY);
  const otpLength = Number(process.env.FAST2SMS_OTP_LENGTH);

  if (!otpId) {
    throw new Fast2SmsError(
      "Fast2SMS OTP template ID is not configured.",
      "INVALID_OTP_ID",
      503
    );
  }
  if (
    !Number.isInteger(otpExpiry) ||
    otpExpiry < 1 ||
    otpExpiry > 10080 ||
    !Number.isInteger(otpLength) ||
    otpLength < 4 ||
    otpLength > 10
  ) {
    throw new Fast2SmsError(
      "Fast2SMS OTP expiry must be 1-10080 minutes and OTP length must be 4-10 digits.",
      "REQUEST_FAILED",
      500
    );
  }

  return { otpId, otpExpiry, otpLength };
}

export function generateOtp(length: number): string {
  if (!Number.isInteger(length) || length < 4 || length > 10) {
    throw new Fast2SmsError("OTP length must be 4-10 digits.", "REQUEST_FAILED", 500);
  }
  return randomInt(0, 10 ** length).toString().padStart(length, "0");
}

function providerError(
  responseStatus: number,
  data: Record<string, unknown>,
  sensitiveValues: string[]
) {
  const rawMessage = [
    typeof data.message === "string" ? data.message : "",
    typeof data.error === "string" ? data.error : "",
    typeof data.detail === "string" ? data.detail : "",
  ].filter(Boolean).join(" ");
  const message = rawMessage.toLowerCase();
  const providerStatus =
    typeof data.status_code === "number" ? data.status_code : responseStatus;
  const diagnostic = sensitiveValues.reduce(
    (current, value) => value ? current.split(value).join("[redacted]") : current,
    rawMessage
  )
    .replace(/\b\d{4,10}\b/g, "[redacted]")
    .replace(/\b(?:api.?key|authorization)\s*[:=]\s*\S+/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]");

  if (
    providerStatus === 401 ||
    providerStatus === 403 ||
    /invalid authorization|invalid api.?key|unauthorized|authentication failed/.test(message)
  ) {
    return new Fast2SmsError(
      "Fast2SMS rejected the configured API key. Check that FAST2SMS_API_KEY is an active Fast2SMS API key.",
      "INVALID_AUTHORIZATION",
      502,
      providerStatus,
      diagnostic
    );
  }
  if (/otp.?id|template.?id/.test(message) && /invalid|not found|inactive|not active/.test(message)) {
    return new Fast2SmsError(
      "Fast2SMS rejected FAST2SMS_OTP_ID. Check that the Smart OTP template is active.",
      "INVALID_OTP_ID",
      502,
      providerStatus,
      diagnostic
    );
  }
  if (providerStatus === 429 || /rate.?limit|too many|limit exceeded/.test(message)) {
    return new Fast2SmsError("Too many OTP requests. Please wait before trying again.", "RATE_LIMIT", 429, providerStatus, diagnostic);
  }

  return new Fast2SmsError(
    "Fast2SMS could not send the OTP. Please try again.",
    "REQUEST_FAILED",
    responseStatus >= 400 ? 502 : 400,
    providerStatus,
    diagnostic
  );
}

async function requestFast2Sms(
  body: Record<string, string | number>
) {
  const apiKey = getApiKey();
  const otp = typeof body.otp === "string" ? body.otp : "";
  let response: Response;
  try {
    response = await fetch("https://www.fast2sms.com/dev/otp/send", {
      method: "POST",
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Fast2SmsError("Unable to reach Fast2SMS. Please try again.", "REQUEST_FAILED", 502);
  }

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    throw new Fast2SmsError(
      `Fast2SMS returned an unreadable response (HTTP ${response.status}).`,
      "REQUEST_FAILED",
      502,
      response.status,
      undefined
    );
  }

  if (!response.ok || data.return !== true) {
    throw providerError(response.status, data, [apiKey, otp]);
  }

  return data;
}

export async function sendOtp(mobile: string, otp: string) {
  const { otpId, otpExpiry, otpLength } = getFast2SmsOtpSettings();
  if (!/^\d+$/.test(otp) || otp.length !== otpLength) {
    throw new Fast2SmsError(
      `OTP must contain exactly ${otpLength} digits.`,
      "REQUEST_FAILED",
      400
    );
  }

  return requestFast2Sms({
    mobile,
    otp_id: otpId,
    otp_expiry: otpExpiry,
    otp_length: otpLength,
    otp,
  });
}
