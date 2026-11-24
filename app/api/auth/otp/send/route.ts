import { NextResponse } from "next/server";
import { isOtpPortalRole } from "@/lib/auth/otp-accounts";
import {
  Fast2SmsError,
  generateOtp,
  getFast2SmsOtpSettings,
  sendOtp,
} from "@/lib/auth/fast2sms";
import { normalizeIndianMobile } from "@/lib/auth/mobile";
import {
  createOtpChallenge,
  incrementRateLimit,
  OtpChallengeError,
} from "@/lib/auth/otpDb";

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
    }

    const { mobile, role } = body as {
      mobile?: unknown;
      role?: unknown;
    };
    if (typeof mobile !== "string" || !mobile.trim()) {
      return NextResponse.json({ success: false, error: "Mobile number required." }, { status: 400 });
    }
    if (!isOtpPortalRole(role)) {
      return NextResponse.json({ success: false, error: "Select a valid portal." }, { status: 400 });
    }

    const normalizedMobile = normalizeIndianMobile(mobile);
    if (!normalizedMobile) {
      return NextResponse.json({ success: false, error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const { otpExpiry, otpLength } = getFast2SmsOtpSettings();
    const otp = generateOtp(otpLength);
    await incrementRateLimit(normalizedMobile);
    await sendOtp(normalizedMobile, otp);
    const challengeId = await createOtpChallenge(normalizedMobile, otp, otpExpiry);

    return NextResponse.json({
      success: true,
      message: "OTP sent.",
      challengeId,
      otpLength,
      otpExpiry,
    });
  } catch (error) {
    if (error instanceof OtpChallengeError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.code === "RATE_LIMIT" ? 429 : 400 }
      );
    }
    if (error instanceof Fast2SmsError) {
      console.error("Fast2SMS OTP send failed", {
        code: error.code,
        providerStatus: error.providerStatus,
        diagnostic: error.diagnostic,
      });
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error("OTP send failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { success: false, error: "Unable to send OTP. Please try again." },
      { status: 500 }
    );
  }
}
