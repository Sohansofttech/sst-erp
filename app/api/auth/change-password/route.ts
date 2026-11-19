import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { requireAuth } from "@/lib/auth/session";
import { signToken, AUTH_COOKIE_NAME, computePasswordSignature } from "@/lib/auth/jwt";
import { SessionUser } from "@/types";
import {
  validatePasswordStrength,
  checkPwnedPassword,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password-security";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { currentPassword, newPassword, confirmPassword } = body;

    // 1. Basic presence validation
    if (!currentPassword) {
      return NextResponse.json(
        { success: false, error: "Current password is required." },
        { status: 400 }
      );
    }

    if (!newPassword) {
      return NextResponse.json(
        { success: false, error: "New password is required." },
        { status: 400 }
      );
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "New password and confirmation do not match." },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: "New password must be different from current password." },
        { status: 400 }
      );
    }

    // 2. Fetch user's current password hash from database
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, fullName: true, passwordHash: true, institutionId: true },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { success: false, error: "User account not found or has no password set." },
        { status: 404 }
      );
    }

    // 3. Verify current password
    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { success: false, error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    // 4. Validate new password strength
    const strengthResult = validatePasswordStrength(newPassword, {
      email: user.email,
      fullName: user.fullName || session.fullName,
    });

    if (!strengthResult.valid) {
      return NextResponse.json(
        {
          success: false,
          error: strengthResult.errors[0] || "Password does not meet complexity requirements.",
          details: strengthResult.errors,
        },
        { status: 400 }
      );
    }

    // 5. Privacy-preserving compromised password check (k-Anonymity)
    const pwnedResult = await checkPwnedPassword(newPassword);
    if (pwnedResult.compromised) {
      return NextResponse.json(
        {
          success: false,
          error: "This password has been exposed in public data breaches. Please choose a more secure, unique password.",
        },
        { status: 400 }
      );
    }

    // 6. Hash new password with bcrypt
    const newHash = await hashPassword(newPassword);
    const updatedSig = computePasswordSignature(newHash);
    const now = new Date();

    // 7. Update database
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        lastLoginAt: now,
      },
    });

    // 8. Log audit trail safely
    try {
      const auditId = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO audit_logs (id, "institutionId", "userId", "actorUserId", action, "entityType", "entityId", "newValuesJson", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        auditId,
        user.institutionId || session.institutionId || "",
        user.id,
        user.id,
        "PASSWORD_CHANGED",
        "USER_CREDENTIALS",
        user.id,
        JSON.stringify({ status: "SUCCESS" })
      );
    } catch {
      // Non-critical audit log
    }

    // 9. Re-issue updated session token with mustChangePassword cleared and updated signature
    const updatedSession: SessionUser = {
      ...session,
      mustChangePassword: false,
      passwordSig: updatedSig,
    };
    const newToken = await signToken(updatedSession);

    const response = NextResponse.json({
      success: true,
      message: "Password changed successfully. Your account is now secured.",
      data: {
        mustChangePassword: false,
      },
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: newToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    response.cookies.set({
      name: "sst_session",
      value: newToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error: any) {
    if (error.name === "UnauthorizedError") {
      return NextResponse.json(
        { success: false, error: "Authentication required to change password." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update password. Please try again." },
      { status: 500 }
    );
  }
}
