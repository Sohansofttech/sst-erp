import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import db from "@/lib/db";
import { sendPasswordResetNotification, getAppBaseUrl } from "@/lib/services/email.service";

const JWT_SECRET = process.env.JWT_SECRET || "erp-secret-super-secure-key-32-chars-long!";
const key = new TextEncoder().encode(JWT_SECRET);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid email address is required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await db.user.findFirst({
      where: { email: cleanEmail, isActive: true },
      select: { id: true, email: true, fullName: true, institutionId: true },
    });

    let resetToken: string | null = null;
    if (user) {
      // Create time-limited (24h) single-purpose reset token
      resetToken = await new SignJWT({
        userId: user.id,
        email: user.email,
        institutionId: user.institutionId,
        purpose: "pwd_reset",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(key);

      // Log security event (Never log secret tokens in prod)
      try {
        await db.auditLog.create({
          data: {
            institutionId: user.institutionId || "",
            actorUserId: user.id,
            action: "PASSWORD_RESET_REQUESTED",
            entityType: "User",
            entityId: user.id,
          },
        });
      } catch {
        // Non-critical audit
      }

      // Dispatch branded password reset email via Option C engine
      try {
        const inst = user.institutionId
          ? await db.institution.findUnique({
              where: { id: user.institutionId },
              select: { name: true },
            })
          : null;

        const appUrl = getAppBaseUrl();
        const resetUrl = `${appUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;

        await sendPasswordResetNotification(
          { email: user.email, name: user.fullName || undefined },
          {
            name: user.fullName || "User",
            resetUrl,
            institutionName: inst?.name || "SST-ERP Campus",
            expiresIn: "24 hours",
            institutionId: user.institutionId || undefined,
          }
        );
      } catch (mailErr: any) {
        console.warn("[ForgotPassword] Email dispatch warning:", mailErr.message);
      }
    }

    // Generic response to prevent account enumeration
    const responsePayload: any = {
      success: true,
      message: "If an active account exists for this email address, verification instructions have been dispatched.",
    };

    // For local dev / verification convenience when SMTP is not configured
    if (process.env.NODE_ENV !== "production" && resetToken) {
      responsePayload.devToken = resetToken;
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}

