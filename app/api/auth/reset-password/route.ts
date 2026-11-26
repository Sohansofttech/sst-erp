import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import db from "@/lib/db";
import {
  validatePasswordStrength,
  checkPwnedPassword,
  hashPassword,
} from "@/lib/auth/password-security";

const JWT_SECRET = process.env.JWT_SECRET || "erp-secret-super-secure-key-32-chars-long!";
const key = new TextEncoder().encode(JWT_SECRET);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, newPassword, confirmPassword } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Reset verification token is missing or expired." },
        { status: 400 }
      );
    }

    if (!newPassword) {
      return NextResponse.json(
        { success: false, error: "New password is required." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "Passwords do not match." },
        { status: 400 }
      );
    }

    // 1. Verify token signature and purpose
    let payload: any;
    try {
      const verified = await jwtVerify(token, key);
      payload = verified.payload;
    } catch {
      return NextResponse.json(
        { success: false, error: "Password reset token is invalid or has expired. Please request a new link." },
        { status: 401 }
      );
    }

    if (payload.purpose !== "pwd_reset" || !payload.userId) {
      return NextResponse.json(
        { success: false, error: "Invalid reset token." },
        { status: 401 }
      );
    }

    // 2. Fetch user to validate personal context
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, fullName: true, institutionId: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User account no longer exists." },
        { status: 404 }
      );
    }

    // 3. Validate strong password criteria
    const strengthResult = validatePasswordStrength(newPassword, {
      email: user.email,
      fullName: user.fullName || undefined,
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

    // 4. Privacy-preserving compromised password check
    const pwnedResult = await checkPwnedPassword(newPassword);
    if (pwnedResult.compromised) {
      return NextResponse.json(
        {
          success: false,
          error: "This password has been exposed in public data breaches. Please choose a more unique, secure password.",
        },
        { status: 400 }
      );
    }

    // 5. Hash new password with bcrypt
    const newHash = await hashPassword(newPassword);

    // 6. Update user
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
      },
    });

    // 7. Audit log (Never log password!)
    try {
      await db.auditLog.create({
        data: {
          institutionId: user.institutionId || "",
          userId: user.id,
          actorUserId: user.id,
          action: "PASSWORD_CHANGED",
          entityType: "User",
          entityId: user.id,
          newValuesJson: JSON.stringify({ status: "SUCCESS", source: "PASSWORD_RESET_LINK" }),
        },
      });
    } catch {
      // Non-critical audit
    }

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. You can now sign in with your new password.",
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reset password. Please try again." },
      { status: 500 }
    );
  }
}

