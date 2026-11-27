import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  verifyMfaChallengeToken,
  setupAdminMfa,
  getAdminMfaRecord,
  MFA_CHALLENGE_COOKIE,
} from "@/lib/security/totp-mfa";

export async function GET(req: NextRequest) {
  await connection();
  try {
    let userId: string | null = null;
    let email: string | null = null;
    let isChallengeToken = false;

    // 1. Try intermediate challenge cookie
    const challengeCookie = req.cookies.get(MFA_CHALLENGE_COOKIE)?.value;
    if (challengeCookie) {
      const challenge = await verifyMfaChallengeToken(challengeCookie);
      if (challenge) {
        userId = challenge.userId;
        email = challenge.email;
        isChallengeToken = true;
      }
    }

    // 2. Fallback to active session
    if (!userId) {
      const session = await getSession();
      if (session && session.role === "SUPER_ADMIN") {
        userId = session.userId;
        email = session.email;
      }
    }

    if (!userId || !email) {
      return NextResponse.json(
        { success: false, error: "Authentication required to setup MFA." },
        { status: 401 }
      );
    }

    // Strict Security Guard: Intermediate challenge tokens must NEVER disarm or re-setup an enrolled MFA account
    const existing = await getAdminMfaRecord(userId);
    if (existing && existing.isEnrolled) {
      if (isChallengeToken) {
        return NextResponse.json(
          {
            success: false,
            error: "MFA is already enrolled for this account. Intermediate challenge cannot replace an active MFA configuration.",
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "MFA is already enrolled for this account. Re-enrollment requires prior authorization and cannot overwrite an active configuration.",
        },
        { status: 400 }
      );
    }

    const mfaData = await setupAdminMfa(userId, email);

    return NextResponse.json({
      success: true,
      data: {
        otpauthUri: mfaData.otpauthUri,
        secretBase32: mfaData.secretBase32,
        backupCodes: mfaData.backupCodes,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to initiate MFA setup." },
      { status: 500 }
    );
  }
}
