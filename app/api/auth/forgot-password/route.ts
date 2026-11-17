import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import db from "@/lib/db";

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
      select: { id: true, email: true, fullName: true },
    });

    let resetToken: string | null = null;
    if (user) {
      // Create time-limited (15m) single-purpose reset token
      resetToken = await new SignJWT({
        userId: user.id,
        email: user.email,
        purpose: "pwd_reset",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(key);

      // Log security event (Never log secret tokens in prod)
      try {
        await db.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "PASSWORD_RESET_REQUESTED",
            entityType: "User",
            entityId: user.id,
          },
        });
      } catch {
        // Non-critical audit
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

