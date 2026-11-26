import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

import { POST as loginWithCredentials } from "@/app/api/auth/login/route";
import {
  findOtpLoginAccount,
  isOtpPortalRole,
  OtpAccountError,
} from "@/lib/auth/otp-accounts";
import { Fast2SmsError, getFast2SmsOtpSettings } from "@/lib/auth/fast2sms";
import { normalizeIndianMobile } from "@/lib/auth/mobile";
import {
  OtpChallengeError,
  verifyAndConsumeOtpChallenge,
} from "@/lib/auth/otpDb";
import { signOtpLoginProof } from "@/lib/auth/jwt";

export async function POST(req: Request) {
  let mobile: string | undefined;
  let challengeId: string | undefined;

  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
    }

    const {
      mobile: inputMobile,
      otp,
      role,
      challengeId: inputChallengeId,
      institutionCode,
    } = body as {
      mobile?: unknown;
      otp?: unknown;
      role?: unknown;
      challengeId?: unknown;
      institutionCode?: unknown;
    };

    if (typeof inputMobile !== "string" || typeof otp !== "string" || !otp) {
      return NextResponse.json({ success: false, error: "Mobile number and OTP are required." }, { status: 400 });
    }
    if (!isOtpPortalRole(role)) {
      return NextResponse.json({ success: false, error: "Select a valid portal." }, { status: 400 });
    }
    if (typeof inputChallengeId !== "string" || !inputChallengeId) {
      return NextResponse.json({ success: false, error: "OTP request is missing. Request a new code." }, { status: 400 });
    }

    mobile = normalizeIndianMobile(inputMobile) || undefined;
    challengeId = inputChallengeId;
    if (!mobile) {
      return NextResponse.json({ success: false, error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const { otpLength } = getFast2SmsOtpSettings();
    if (!new RegExp(`^\\d{${otpLength}}$`).test(otp)) {
      return NextResponse.json({ success: false, error: `Enter the ${otpLength}-digit OTP.` }, { status: 400 });
    }

    const selectedRole = role.toUpperCase() as Parameters<typeof findOtpLoginAccount>[1];
    await verifyAndConsumeOtpChallenge(mobile, challengeId, otp);

    const account = await findOtpLoginAccount(
      mobile,
      selectedRole,
      typeof institutionCode === "string" ? institutionCode : undefined
    );
    if (!account) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.pendingRegistration.upsert({
        where: { mobile },
        update: { expiresAt },
        create: { mobile, expiresAt },
      });
      return NextResponse.json({
        success: true,
        registrationPending: true,
        message: "Your number has been verified. Registration is pending; no portal access was granted.",
      });
    }
    const otpProof = await signOtpLoginProof({
      userId: account.id,
      email: account.email,
      mobile,
      role: selectedRole,
    });


    const loginRequest = new NextRequest(new URL("/api/auth/login", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginType: "OTP",
        otpProof,
        institutionCode: typeof institutionCode === "string" ? institutionCode : undefined,
      }),
    });

    return loginWithCredentials(loginRequest);
  } catch (error) {
    if (error instanceof OtpAccountError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof OtpChallengeError) {
      const status = error.code === "MAX_ATTEMPTS" || error.code === "RATE_LIMIT" ? 429 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    if (error instanceof Fast2SmsError) {
      console.error("Fast2SMS OTP verification failed", {
        code: error.code,
        providerStatus: error.providerStatus,
        diagnostic: error.diagnostic,
      });
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error("OTP verification failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { success: false, error: "Unable to verify OTP. Please try again." },
      { status: 500 }
    );
  }
}
