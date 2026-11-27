import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  verifyPasswordSetupToken,
  computePasswordSignature,
  signToken,
  AUTH_COOKIE_NAME,
} from "@/lib/auth/jwt";
import {
  validatePasswordStrength,
  checkPwnedPassword,
  hashPassword,
} from "@/lib/auth/password-security";
import { SessionUser } from "@/types";
import { isInstitutionOperational } from "@/lib/services/institution-lifecycle";
import { getRoleLandingRoute, isAdminPortalRole } from "@/lib/security/rbac";
import { resolveUserPermissionsFromDb } from "@/lib/security/rbac-server";
import { assertUserRegistrationCapacity, UserCapacityError } from "@/lib/billing/user-capacity";

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
        status: true,
        isActive: true,
        role: true,
        institution: {
          select: { name: true, slug: true, status: true, isActive: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User account not found." },
        { status: 404 }
      );
    }

    // Security Invariant: Suspended or archived accounts must not activate or configure password
    if (user.status === "LOCKED" || (user.status as string) === "SUSPENDED" || (user.status as string) === "ARCHIVED") {
      return NextResponse.json(
        { success: false, error: "This account has been suspended or archived. Password setup is not permitted." },
        { status: 403 }
      );
    }

    if (
      user.institutionId &&
      user.role?.toUpperCase() !== "SUPER_ADMIN" &&
      !(await isInstitutionOperational(user.institutionId))
    ) {
      return NextResponse.json(
        { success: false, error: "This institution is not currently operational." },
        { status: 403 }
      );
    }

    if (user.institutionId) {
      try {
        const archivedKey = user.role === "TEACHER" 
          ? `archived_staff:${user.institutionId}` 
          : user.role === "PARENT" 
          ? `archived_guardians:${user.institutionId}` 
          : `archived_students:${user.institutionId}`;
        const archivedSetting = await db.platformSetting.findUnique({ where: { key: archivedKey } }).catch(() => null);
        if (archivedSetting?.value && Array.isArray(archivedSetting.value)) {
          const isArchived = (archivedSetting.value as any[]).some((a: any) => a.id === user.id || a.userId === user.id);
          if (isArchived) {
            return NextResponse.json(
              { success: false, error: "This account has been archived. Password setup is not permitted." },
              { status: 403 }
            );
          }
        }
      } catch {}
    }

    const currentSig = computePasswordSignature(user.passwordHash || "");
    if (payload.sig !== currentSig) {
      return NextResponse.json(
        { success: false, error: "This setup link has already been used or has been superseded by a newer invitation. Please log in or request a new reset." },
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
        status: true,
        isActive: true,
        institution: {
          select: {
            id: true,
            name: true,
            slug: true,
            code: true,
            status: true,
            isActive: true,
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

    // Security Invariant: Suspended or archived accounts must not activate or configure password
    if (user.status === "LOCKED" || (user.status as string) === "SUSPENDED" || (user.status as string) === "ARCHIVED") {
      return NextResponse.json(
        { success: false, error: "This account has been suspended or archived. Password setup is not permitted." },
        { status: 403 }
      );
    }

    if (
      user.institutionId &&
      user.role?.toUpperCase() !== "SUPER_ADMIN" &&
      !(await isInstitutionOperational(user.institutionId))
    ) {
      return NextResponse.json(
        { success: false, error: "This institution is not currently operational." },
        { status: 403 }
      );
    }

    if (user.institutionId) {
      try {
        const archivedKey = user.role === "TEACHER" 
          ? `archived_staff:${user.institutionId}` 
          : user.role === "PARENT" 
          ? `archived_guardians:${user.institutionId}` 
          : `archived_students:${user.institutionId}`;
        const archivedSetting = await db.platformSetting.findUnique({ where: { key: archivedKey } }).catch(() => null);
        if (archivedSetting?.value && Array.isArray(archivedSetting.value)) {
          const isArchived = (archivedSetting.value as any[]).some((a: any) => a.id === user.id || a.userId === user.id);
          if (isArchived) {
            return NextResponse.json(
              { success: false, error: "This account has been archived. Password setup is not permitted." },
              { status: 403 }
            );
          }
        }
      } catch {}
    }

    const currentSig = computePasswordSignature(user.passwordHash || "");
    if (payload.sig !== currentSig) {
      return NextResponse.json(
        { success: false, error: "This setup link has already been used or has been superseded by a newer invitation." },
        { status: 400 }
      );
    }

    const strengthResult = validatePasswordStrength(newPassword, {
      email: user.email,
      fullName: user.fullName || user.name || undefined,
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

    const newHash = await hashPassword(newPassword);
    const updatedSig = computePasswordSignature(newHash);
    const now = new Date();

    // Activate user upon successful password setup — atomic with capacity check.
    // Re-read the user inside the transaction; if not already ACTIVE and it belongs
    // to an institution, enforce the registration capacity before activating so a
    // race between the capacity check and activation cannot occur.
    try {
      await db.$transaction(async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: user.id },
          select: { id: true, status: true, isActive: true, institutionId: true },
        });
        if (!fresh) {
          throw new UserCapacityError("User account not found.", 404);
        }
        const alreadyActive = fresh.status === "ACTIVE" && fresh.isActive === true;
        if (!alreadyActive && fresh.institutionId) {
          await assertUserRegistrationCapacity(tx, fresh.institutionId);
        }
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash: newHash,
            lastLoginAt: now,
            isActive: true,
            status: "ACTIVE",
          },
        });
      });
    } catch (capErr: any) {
      if (capErr instanceof UserCapacityError) {
        return NextResponse.json(
          { success: false, error: capErr.message },
          { status: capErr.statusCode }
        );
      }
      throw capErr;
    }

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

    const userRoleUpper = ((user.role as string) || "STUDENT").toUpperCase();
    const { assignedRoles, permissions } = isAdminPortalRole(userRoleUpper)
      ? await resolveUserPermissionsFromDb(user.id, user.institutionId, userRoleUpper)
      : { assignedRoles: [userRoleUpper], permissions: [] };

    let redirectUrl = "/dashboard";
    if (isAdminPortalRole(userRoleUpper)) {
      redirectUrl = getRoleLandingRoute(userRoleUpper);
    } else if (userRoleUpper === "TEACHER") {
      redirectUrl = institutionSlug ? `/campus/${institutionSlug}/teacher` : "/login";
    } else if (userRoleUpper === "HOD") {
      redirectUrl = institutionSlug ? `/campus/${institutionSlug}/teacher/hod` : "/login";
    } else if (userRoleUpper === "PARENT" || userRoleUpper === "GUARDIAN") {
      redirectUrl = "/parent/dashboard";
    } else if (userRoleUpper === "STUDENT") {
      redirectUrl = "/student/dashboard";
    }

    // Generate active session so user is immediately logged in upon setting password
    const sessionPayload: SessionUser = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName || user.name || "Member",
      role: (userRoleUpper as any) || "STUDENT",
      institutionId: user.institutionId || "",
      institutionName: institutionName || "Campus Administration",
      assignedRoles,
      permissions,
      mustChangePassword: false,
      passwordSig: updatedSig,
    };

    const sessionToken = await signToken(sessionPayload);
    const response = NextResponse.json({
      success: true,
      message: "Password configured successfully! Welcome to SST-ERP.",
      role: userRoleUpper,
      redirectUrl,
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

    response.cookies.set({
      name: "sst_session",
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
