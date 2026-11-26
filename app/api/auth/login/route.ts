import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/db";
import { signToken, AUTH_COOKIE_NAME, computePasswordSignature } from "@/lib/auth/jwt";
import { isDefaultOrTemporaryPassword, checkPwnedPassword } from "@/lib/auth/password-security";
import { SessionUser } from "@/types";
import { syncInstitutionToAppDb } from "@/lib/services/institution-provisioning.service";
import { isTemporaryPasswordActive } from "@/lib/services/credential-management.service";
import {
  signTeacherSession,
  hashSessionToken,
  createDbSessionRecord,
  TEACHER_AUTH_COOKIE,
  type TeacherSessionPayload,
} from "@/lib/auth/teacher-session";
import {
  findDeterministicAccount,
  type TeacherRole,
} from "@/lib/auth/roles";
import { resolveTeacherAssignmentsFromDb } from "@/lib/security/tenant-context";
import { getRoleLandingRoute, isAdminPortalRole } from "@/lib/security/rbac";
import { resolveUserPermissionsFromDb } from "@/lib/security/rbac-server";

export async function POST(req: NextRequest) {
  try {
    const { email, password, loginType, institutionCode } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email or identifier is required." },
        { status: 400 }
      );
    }

    if (loginType === "OTP") {
      return NextResponse.json(
        { success: false, error: "OTP login is not enabled." },
        { status: 403 }
      );
    }
    if (!password) {
      return NextResponse.json(
        { success: false, error: "Password is required." },
        { status: 400 }
      );
    }

    // Find institution if code provided, or search by email domain / lookup
    let institutionId: string | undefined;
    let resolvedInstitutionName = "";
    const trimmedCode = typeof institutionCode === "string" ? institutionCode.trim() : "";
    if (trimmedCode) {
      let inst = await db.institution.findFirst({
        where: {
          OR: [
            { code: { equals: trimmedCode, mode: "insensitive" } },
            { id: { equals: trimmedCode, mode: "insensitive" } },
            { slug: { equals: trimmedCode, mode: "insensitive" } },
          ],
        },
      });

      if (!inst) {
        // Fallback: check table "Institution" (PlatformInstitution)
        try {
          const rawInst: any = await db.$queryRaw`
            SELECT id, name, code, slug, type, status, email
            FROM "Institution"
            WHERE LOWER(code) = LOWER(${trimmedCode})
               OR LOWER(slug) = LOWER(${trimmedCode})
               OR id::text = ${trimmedCode}
            LIMIT 1
          `;
          if (rawInst && rawInst.length > 0) {
            inst = rawInst[0];
            await syncInstitutionToAppDb(rawInst[0].id);
          }
        } catch (e) {
          console.warn("PlatformInstitution lookup in login fallback:", e);
        }
      }

      if (!inst) {
        return NextResponse.json(
          { success: false, error: "Invalid College Code / Institution Code or institution not found." },
          { status: 400 }
        );
      }
      institutionId = inst.id;
      resolvedInstitutionName = inst.name || "";
    }

    // Lookup user using safe select to ensure compatibility with PostgreSQL users table
    const user = await db.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: "insensitive" },
        ...(institutionId ? { institutionId } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        passwordHash: true,
        role: true,
        platformRole: true,
        isActive: true,
        status: true,
        lastLoginAt: true,
        institutionId: true,
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

    if (!user || !user.isActive || user.status === "LOCKED" || (user.status as string) === "SUSPENDED" || (user.status as string) === "ARCHIVED") {
      return NextResponse.json(
        { success: false, error: "Account is inactive, suspended, or archived." },
        { status: 401 }
      );
    }

    if (user.institutionId) {
      try {
        const archivedKey = user.role === "TEACHER" 
          ? `archived_staff:${user.institutionId}` 
          : (user.role === "PARENT" || user.role === "GUARDIAN")
          ? `archived_guardians:${user.institutionId}` 
          : `archived_students:${user.institutionId}`;
        const archivedSetting = await db.platformSetting.findUnique({ where: { key: archivedKey } }).catch(() => null);
        if (archivedSetting?.value && Array.isArray(archivedSetting.value)) {
          const isArchived = (archivedSetting.value as any[]).some((a: any) => a.id === user.id || a.userId === user.id);
          if (isArchived) {
            return NextResponse.json(
              { success: false, error: "Account has been archived. Access denied." },
              { status: 403 }
            );
          }
        }
      } catch {}
    }

    // Check password if standard login
    if (loginType !== "OTP") {
      const isPwValid = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!isPwValid) {
        return NextResponse.json(
          { success: false, error: "Invalid email or password." },
          { status: 401 }
        );
      }
    }

    // Normalize and verify role from trusted database record
    const userRole = (user.role || (user.platformRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "")).toUpperCase();
    let redirectUrl = "";

    const isInstitutionalPortalUser = isAdminPortalRole(userRole) && userRole !== "SUPER_ADMIN";

    if (isInstitutionalPortalUser) {
      const isLegacyInstitution =
        user.institutionId === "inst_apex" ||
        user.institutionId?.startsWith("inst_") ||
        user.id === "user_apex_admin";

      if (!isLegacyInstitution && !trimmedCode) {
        return NextResponse.json(
          { success: false, error: "College Code is required for this institution. Please enter your College Code." },
          { status: 400 }
        );
      }

      if (trimmedCode && institutionId && user.institutionId !== institutionId) {
        return NextResponse.json(
          { success: false, error: "Access denied: Account does not belong to this institution." },
          { status: 403 }
        );
      }

      let currentInst = user.institution;
      if (!currentInst && user.institutionId) {
        await syncInstitutionToAppDb(user.institutionId);
        currentInst = await db.institution.findUnique({
          where: { id: user.institutionId },
          select: { id: true, name: true, slug: true, code: true, status: true, isActive: true },
        });
      }

      if (!user.institutionId || !currentInst) {
        return NextResponse.json({ success: false, error: "Administrator institution association is missing." }, { status: 403 });
      }

      if (
        currentInst.status === "ARCHIVED" ||
        currentInst.status === "SUSPENDED" ||
        (!currentInst.isActive && currentInst.status !== "ACTIVE" && currentInst.status !== "PENDING")
      ) {
        return NextResponse.json({ success: false, error: "This institution is not currently operational." }, { status: 403 });
      }
    }

    // Validate active administrator membership for ADMIN / INSTITUTION_ADMIN role
    if ((userRole === "ADMIN" || userRole === "INSTITUTION_ADMIN") && user.institutionId) {
      try {
        const memberships: any = await db.$queryRaw`
          SELECT m.id, m.status
          FROM "InstitutionMembership" m
          WHERE (m."userId"::text = ${user.id} OR m."userId" IN (SELECT id FROM "User" WHERE LOWER(BTRIM(email)) = LOWER(BTRIM(${user.email}))))
            AND m."institutionId"::text = ${user.institutionId}
            AND m.status = 'ACTIVE'
          LIMIT 1
        `;

        if (memberships.length === 0) {
          const totalMemberships = await db.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint as count FROM "InstitutionMembership" WHERE "institutionId"::text = ${user.institutionId}
          `;
          const hasMemberships = Number(totalMemberships[0]?.count ?? 0) > 0;

          if (hasMemberships) {
            return NextResponse.json(
              { success: false, error: "Access denied: Account does not have an active administrator membership for this institution." },
              { status: 403 }
            );
          }
        }
      } catch (err) {
        console.warn("Membership validation fallback:", err);
      }
    }
    let studentId: string | undefined;
    let guardianId: string | undefined;
    let activeChildId: string | undefined;
    let teacherToken: string | undefined;

    if (userRole === "STUDENT") {
      redirectUrl = "/student/dashboard";
      let studentRecord: any = null;
      try {
        const students = await db.$queryRaw<any[]>`
          SELECT id, "institutionId" FROM students WHERE "userId" = ${user.id} LIMIT 1
        `;
        studentRecord = students[0] || null;
      } catch (err) {
        console.warn("Raw student lookup error:", err);
      }

      if (studentRecord) {
        studentId = studentRecord.id;
      }
    } else if (userRole === "PARENT" || userRole === "GUARDIAN") {
      redirectUrl = "/parent/dashboard";
      try {
        const guardians = await db.$queryRaw<any[]>`
          SELECT id FROM guardian_accounts WHERE "userId" = ${user.id} LIMIT 1
        `;
        if (guardians.length > 0) {
          guardianId = guardians[0].id;
          const links = await db.$queryRaw<any[]>`
            SELECT "studentId" FROM guardian_links
            WHERE "guardianAccountId" = ${guardianId} AND "isVerified" = true AND "canAccessPortal" = true
            LIMIT 1
          `;
          if (links.length > 0) {
            activeChildId = links[0].studentId;
          }
        }
      } catch (err) {
        console.warn("Raw guardian lookup error:", err);
      }
    } else if (userRole === "TEACHER") {
      let instSlug = (user.institution?.slug || user.institution?.code || "").toLowerCase();
      const resolvedInstId = user.institutionId || user.institution?.id;
      if (!resolvedInstId) {
        return NextResponse.json(
          { success: false, error: "Institution configuration error: User account is not assigned to an institution." },
          { status: 400 }
        );
      }
      if (!instSlug && resolvedInstId) {
        try {
          const insts: any[] = await db.$queryRaw`
            SELECT slug, code FROM institutions WHERE id = ${resolvedInstId} LIMIT 1
          `;
          if (insts.length > 0) {
            instSlug = (insts[0].slug || insts[0].code || "").toLowerCase();
          }
        } catch {}
      }
      if (!instSlug) {
        return NextResponse.json(
          { success: false, error: "Institution configuration error: Missing institution slug or code." },
          { status: 400 }
        );
      }
      redirectUrl = `/campus/${instSlug}/teacher`;

      // Resolve teacher record from DB
      let teacherRecord: any = null;
      try {
        const teachers: any[] = await db.$queryRaw`
          SELECT id, "employeeId", department, designation
          FROM teachers
          WHERE "userId" = ${user.id}
          LIMIT 1
        `;
        teacherRecord = teachers[0] || null;
      } catch (err) {
        console.warn("[Login] Teacher lookup error:", err);
      }

      // Dynamically resolve roles from database assignments and test account config
      const dbAssignments = await resolveTeacherAssignmentsFromDb(
        teacherRecord?.id || user.id,
        user.id,
        resolvedInstId,
        teacherRecord?.department,
        teacherRecord?.designation
      );
      const testAccount = findDeterministicAccount(user.email) || findDeterministicAccount(user.id);
      const availableRoles: TeacherRole[] = testAccount?.roles || dbAssignments.roles;
      const activeRole: TeacherRole = testAccount?.defaultRole || (availableRoles[0] || "teacher");
      const homeroomClass = testAccount?.homeroomClass || dbAssignments.homeroomClass;

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const teacherPayload: TeacherSessionPayload = {
        userId: user.id,
        teacherId: teacherRecord?.id || `teacher_${user.id}`,
        institutionId: resolvedInstId,
        institutionSlug: instSlug,
        email: user.email,
        fullName: user.fullName || "Faculty Member",
        employeeId: teacherRecord?.employeeId || testAccount?.employeeId || "VNPS-TCH-001",
        designation: teacherRecord?.designation || testAccount?.designation || "Faculty",
        department: teacherRecord?.department || testAccount?.department || "Mathematics",
        homeroomClass,
        activeRole,
        availableRoles,
        issuedAt: Date.now(),
        expiresAt: expiresAt.getTime(),
        lastActivity: Date.now(),
      };

      teacherToken = await signTeacherSession(teacherPayload);
      const tokenHash = hashSessionToken(teacherToken);

      // Store in PostgreSQL teacher_portal_sessions table
      try {
        await createDbSessionRecord({
          tokenHash,
          userId: user.id,
          institutionId: resolvedInstId,
          activeRole,
          expiresAt,
        });
      } catch (err) {
        console.error("[Login] Failed to record teacher portal session in DB:", err);
      }
    } else if (isAdminPortalRole(userRole)) {
      redirectUrl = getRoleLandingRoute(userRole);
    } else {
      return NextResponse.json(
        { success: false, error: "Access denied: Account role is unrecognized or unsupported." },
        { status: 403 }
      );
    }

    let institutionName = resolvedInstitutionName || user.institution?.name || "";
    if (!institutionName && user.institutionId) {
      try {
        const insts = await db.$queryRaw<any[]>`
          SELECT name FROM institutions WHERE id = ${user.institutionId}
          UNION ALL
          SELECT name FROM "Institution" WHERE id::text = ${user.institutionId}
          LIMIT 1
        `;
        if (insts.length > 0) {
          institutionName = insts[0].name || "";
        }
      } catch (err) {
        console.warn("Raw institution lookup error:", err);
      }
    }

    let mustChangePassword = await isTemporaryPasswordActive(user.id);
    if (!mustChangePassword && password && isDefaultOrTemporaryPassword(password)) {
      mustChangePassword = true;
    }
    const passwordSig = computePasswordSignature(user.passwordHash || "");

    const { assignedRoles, permissions } = isAdminPortalRole(userRole)
      ? await resolveUserPermissionsFromDb(user.id, user.institutionId, userRole)
      : { assignedRoles: [userRole], permissions: [] };

    const sessionUser: SessionUser = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName || "",
      role: (userRole as any) || "STUDENT",
      institutionId: user.institutionId || "",
      institutionName,
      studentId,
      guardianId,
      activeChildId,
      permissions,
      assignedRoles,
      mustChangePassword,
      passwordSig,
    };

    const token = await signToken(sessionUser);

    // Update last login timestamp without corrupting audit history
    try {
      await db.$executeRaw`
        UPDATE users SET "lastLoginAt" = NOW() WHERE id = ${user.id}
      `;
    } catch {
      // Non-critical background update
    }

    // Strip internal security signatures from client response
    const safeUser = { ...sessionUser };
    delete safeUser.passwordSig;

    const response = NextResponse.json({
      success: true,
      message: "Authentication successful.",
      data: {
        user: safeUser,
        token,
        redirectUrl,
        mustChangePassword,
      },
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    response.cookies.set({
      name: "sst_session",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });

    if (teacherToken) {
      response.cookies.set({
        name: TEACHER_AUTH_COOKIE,
        value: teacherToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
