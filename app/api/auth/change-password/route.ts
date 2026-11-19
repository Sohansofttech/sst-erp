import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/db";
import { requireAuth } from "@/lib/auth/session";
import { signToken, AUTH_COOKIE_NAME, computePasswordSignature } from "@/lib/auth/jwt";
import { SessionUser } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const body = await req.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: "Current password and new password are required." },
        { status: 400 }
      );
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "New password and confirmation do not match." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: "New password must be different from your current temporary password." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true, email: true, institutionId: true },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { success: false, error: "User account not found or has no credentials set." },
        { status: 404 }
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const updatedSig = computePasswordSignature(newHash);
    const now = new Date();

    await db.user.update({
      where: { id: session.userId },
      data: {
        passwordHash: newHash,
        lastLoginAt: now,
      },
    });

    // Record PASSWORD_CHANGED in audit_logs to permanently clear temporary-password state
    try {
      const auditId = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO audit_logs (id, "institutionId", "userId", "actorUserId", action, "entityType", "entityId", "newValuesJson", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        auditId,
        user.institutionId || session.institutionId,
        user.id,
        user.id,
        "PASSWORD_CHANGED",
        "USER_CREDENTIALS",
        user.id,
        JSON.stringify({ status: "SUCCESS" })
      );
    } catch (auditErr) {
      console.warn("Failed to record PASSWORD_CHANGED audit log:", auditErr);
    }

    // Issue refreshed session token with mustChangePassword = false and updated passwordSig
    // (This immediately invalidates all previous sessions while allowing the new session to work)
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
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error: any) {
    if (error.name === "UnauthorizedError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to change password." },
      { status: 500 }
    );
  }
}
