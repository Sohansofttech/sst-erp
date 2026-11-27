import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import db from "@/lib/db";
import {
  signToken,
  AUTH_COOKIE_NAME,
  computePasswordSignature,
} from "@/lib/auth/jwt";
import {
  verifyMfaChallengeToken,
  verifyAdminMfaLogin,
  MFA_CHALLENGE_COOKIE,
} from "@/lib/security/totp-mfa";
import {
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "@/lib/security/login-rate-limiter";
import { getClientIp } from "@/lib/security/client-ip";
import { SessionUser } from "@/types";

export async function POST(req: NextRequest) {
  await connection();
  try {
    const clientIp = getClientIp(req);

    const challengeCookie = req.cookies.get(MFA_CHALLENGE_COOKIE)?.value;
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = challengeCookie || bearerToken;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "MFA challenge token missing. Please sign in again." },
        { status: 401 }
      );
    }

    const challenge = await verifyMfaChallengeToken(token);
    if (!challenge) {
      return NextResponse.json(
        { success: false, error: "MFA challenge expired or invalid. Please sign in again." },
        { status: 401 }
      );
    }

    // Rate limiting check
    const rateLimit = await checkLoginRateLimit({ ip: clientIp, identifier: challenge.email });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many failed attempts. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 900) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { totpCode, backupCode } = body;

    const mfaResult = await verifyAdminMfaLogin(challenge.userId, { totpCode, backupCode });
    if (!mfaResult.success) {
      await recordFailedLogin({ ip: clientIp, identifier: challenge.email });
      return NextResponse.json(
        { success: false, error: mfaResult.error || "Authentication code verification failed." },
        { status: 401 }
      );
    }

    // Successful MFA -> reset failure count
    await recordSuccessfulLogin({ identifier: challenge.email });

    // Fetch user and generate full session
    const user = await db.user.findUnique({
      where: { id: challenge.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        platformRole: true,
        passwordHash: true,
        institutionId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User account not found." },
        { status: 404 }
      );
    }

    const userRole = (user.role || (user.platformRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "")).toUpperCase();
    const passwordSig = computePasswordSignature(user.passwordHash || "");

    const sessionUser: SessionUser = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName || "Super Admin",
      name: user.fullName || "Super Admin",
      role: (userRole as any) || "SUPER_ADMIN",
      institutionId: user.institutionId || "",
      institutionName: "SST-ERP Platform",
      permissions: ["*"],
      assignedRoles: ["SUPER_ADMIN"],
      passwordSig,
    };

    const sessionToken = await signToken(sessionUser);

    const res = NextResponse.json({
      success: true,
      message: "Two-factor authentication verified successfully.",
      redirectTo: "/super-admin",
    });

    // Set production session cookie
    res.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    // Clear challenge cookie
    res.cookies.delete(MFA_CHALLENGE_COOKIE);

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to complete MFA verification." },
      { status: 500 }
    );
  }
}
