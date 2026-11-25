import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  validatePasswordStrength,
  checkPwnedPassword,
  hashPassword,
} from "@/lib/auth/password-security";
import { computePasswordSignature, verifyPasswordResetToken } from "@/lib/auth/jwt";

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

    const payload = await verifyPasswordResetToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Password reset token is invalid or has expired. Please request a new link." },
        { status: 401 }
      );
    }

    // 2. Fetch user to validate personal context
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        institutionId: true,
        passwordHash: true,
        isActive: true,
        status: true,
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.status !== "ACTIVE" ||
      user.email.trim().toLowerCase() !== payload.email.trim().toLowerCase() ||
      (user.institutionId || undefined) !== payload.institutionId ||
      computePasswordSignature(user.passwordHash || "") !== payload.sig
    ) {
      return NextResponse.json(
        { success: false, error: "Password reset token is invalid or has expired. Please request a new link." },
        { status: 401 }
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
    const updated = await db.user.updateMany({
      where: {
        id: user.id,
        passwordHash: user.passwordHash,
        isActive: true,
        status: "ACTIVE",
      },
      data: {
        passwordHash: newHash,
      },
    });
    if (updated.count !== 1) {
      return NextResponse.json(
        { success: false, error: "Password reset token is invalid or has expired. Please request a new link." },
        { status: 401 }
      );
    }

    // 7. Audit log (Never log password!)
    try {
      await db.auditLog.create({
        data: {
          institutionId: user.institutionId || "",
          actorUserId: user.id,
          action: "PASSWORD_RESET_SUCCESS",
          entityType: "User",
          entityId: user.id,
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

