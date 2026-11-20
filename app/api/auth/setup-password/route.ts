import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/db";
import {
  verifyPasswordSetupToken,
  computePasswordSignature,
  signToken,
  AUTH_COOKIE_NAME,
} from "@/lib/auth/jwt";
import { SessionUser } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Setup token is required." },
        { status: 400 }
      );
    }

    const payload = await verifyPasswordSetupToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "This password setup link is invalid or has expired." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        fullName: true,
        passwordHash: true,
        institutionId: true,
        institution: {
          select: { name: true, slug: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User account not found." },
        { status: 404 }
      );
    }

    const currentSig = computePasswordSignature(user.passwordHash || "");
    if (payload.sig !== currentSig) {
      return NextResponse.json(
        { success: false, error: "This setup link has already been used. Please log in or request a new reset." },
        { status: 400 }
      );
    }

    let institutionSlug = (user.institution?.slug || "").trim().toLowerCase();
    let institutionName = user.institution?.name || "";

    if (!institutionSlug && user.institutionId) {
      try {
        const instRows: any = await db.$queryRaw`
          SELECT slug, name FROM institutions WHERE id = ${user.institutionId}
          UNION ALL
          SELECT slug, name FROM "Institution" WHERE id::text = ${user.institutionId}
          LIMIT 1
        `;
        if (instRows && instRows.length > 0) {
          institutionSlug = (instRows[0].slug || "").trim().toLowerCase();
          institutionName = instRows[0].name || "";
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      email: user.email,
      name: user.fullName || user.name || "Member",
      institutionName: institutionName || undefined,
      institutionSlug: institutionSlug || undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, newPassword, confirmPassword } = body;

    if (!token || !newPassword) {
      return NextResponse.json(
        { success: false, error: "Token and new password are required." },
        { status: 400 }
      );
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "Passwords do not match." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const payload = await verifyPasswordSetupToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "This password setup link is invalid or has expired." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        name: true,
        role: true,
        institutionId: true,
        passwordHash: true,
        institution: {
          select: {
            id: true,
            name: true,
            slug: true,
            code: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User account not found." },
        { status: 404 }
      );
    }

    const currentSig = computePasswordSignature(user.passwordHash || "");
    if (payload.sig !== currentSig) {
      return NextResponse.json(
        { success: false, error: "This setup link has already been used." },
        { status: 400 }
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const updatedSig = computePasswordSignature(newHash);
    const now = new Date();

    // Activate user upon successful password setup
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        lastLoginAt: now,
        isActive: true,
        status: "ACTIVE",
      },
    });

    // Synchronize membership activation across platform tables
    if (user.institutionId) {
      try {
        await db.$executeRaw`
          UPDATE "InstitutionMembership"
          SET status = 'ACTIVE'::"MembershipStatus", "updatedAt" = NOW()
          WHERE ("userId"::text = ${user.id} OR "userId" IN (SELECT id FROM "User" WHERE LOWER(email) = LOWER(${user.email})))
            AND "institutionId"::text = ${user.institutionId}
        `;
        await db.$executeRaw`
          UPDATE "User"
          SET status = 'ACTIVE'::"UserStatus", "updatedAt" = NOW()
          WHERE id::text = ${user.id} OR LOWER(email) = LOWER(${user.email})
        `;
      } catch (membershipErr) {
        // Platform table update is safe/non-blocking
      }
    }

    // Resolve authenticated user's institution slug from trusted database record
    let institutionSlug = (user.institution?.slug || "").trim().toLowerCase();
    let institutionName = user.institution?.name || "";

    if (!institutionSlug && user.institutionId) {
      try {
        const instRows: any = await db.$queryRaw`
          SELECT slug, name FROM institutions WHERE id = ${user.institutionId}
          UNION ALL
          SELECT slug, name FROM "Institution" WHERE id::text = ${user.institutionId}
          LIMIT 1
        `;
        if (instRows && instRows.length > 0) {
          institutionSlug = (instRows[0].slug || "").trim().toLowerCase();
          institutionName = instRows[0].name || "";
        }
      } catch (instErr) {
        console.warn("Failed to lookup institution slug in setup-password:", instErr);
      }
    }

    // Record PASSWORD_CHANGED audit log
    try {
      const auditId = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO audit_logs (id, "institutionId", "userId", "actorUserId", action, "entityType", "entityId", "newValuesJson", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        auditId,
        user.institutionId,
        user.id,
        user.id,
        "PASSWORD_CHANGED",
        "USER_CREDENTIALS",
        user.id,
        JSON.stringify({ status: "SUCCESS", source: "INVITATION_SETUP" })
      );
    } catch (auditErr) {
      console.warn("Failed to record setup audit log:", auditErr);
    }

    // Generate active session so user is immediately logged in upon setting password
    const sessionPayload: SessionUser = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName || user.name || "Member",
      role: (user.role as any) || "STUDENT",
      institutionId: user.institutionId || "",
      institutionName: institutionName || "Campus Administration",
      mustChangePassword: false,
      passwordSig: updatedSig,
    };

    const sessionToken = await signToken(sessionPayload);
    const response = NextResponse.json({
      success: true,
      message: "Password configured successfully! Welcome to SST-ERP.",
      role: user.role,
      institutionSlug: institutionSlug || undefined,
      institutionName: institutionName || undefined,
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
