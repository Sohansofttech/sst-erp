import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { verifyMfaChallengeToken, confirmAdminMfaEnrollment, MFA_CHALLENGE_COOKIE } from "@/lib/security/totp-mfa";

export async function POST(req: NextRequest) {
  await connection();
  try {
    let userId: string | null = null;

    // 1. Check intermediate challenge cookie
    const challengeCookie = req.cookies.get(MFA_CHALLENGE_COOKIE)?.value;
    if (challengeCookie) {
      const challenge = await verifyMfaChallengeToken(challengeCookie);
      if (challenge) userId = challenge.userId;
    }

    // 2. Check active session
    if (!userId) {
      const session = await getSession();
      if (session && session.role === "SUPER_ADMIN") userId = session.userId;
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required to enroll MFA." },
        { status: 401 }
      );
    }

    const { totpCode } = await req.json();
    if (!totpCode || typeof totpCode !== "string") {
      return NextResponse.json(
        { success: false, error: "6-digit verification code is required." },
        { status: 400 }
      );
    }

    const confirmed = await confirmAdminMfaEnrollment(userId, totpCode);
    if (!confirmed) {
      return NextResponse.json(
        { success: false, error: "Invalid verification code. Please check your authenticator app and try again." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "MFA enrolled successfully. Your administrative account is now protected with two-factor authentication.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to confirm MFA enrollment." },
      { status: 500 }
    );
  }
}
