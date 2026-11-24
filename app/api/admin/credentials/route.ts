import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  issueStudentCredentials,
  issueTeacherCredentials,
  issueParentCredentials,
  togglePortalAccess,
  resetUserPassword,
  getUserCredentialStatus,
  isTeachingFaculty,
  isValidUuid,
  resendInvitation,
} from "@/lib/services/credential-management.service";
import db from "@/lib/db";
import { signPasswordSetupToken } from "@/lib/auth/jwt";
import {
  sendPasswordSetupInvitation,
  sendRoleCredentialInvitation,
  getAppBaseUrl,
  getRolePortalLoginUrl,
} from "@/lib/services/email.service";

async function dispatchSetupEmailSafe(
  institutionId: string,
  user: { id: string; email: string; name?: string; role?: string }
) {
  if (!user.email || !user.email.includes("@")) return;
  try {
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true, fullName: true, name: true, role: true, status: true, isActive: true },
    });

    if (!dbUser || dbUser.status === "LOCKED" || (dbUser.status as string) === "SUSPENDED" || (dbUser.status as string) === "ARCHIVED") {
      console.warn(`[dispatchSetupEmailSafe] Blocked invitation for inactive/suspended/archived user:`, user.id);
      return;
    }

    const inst = await db.institution.findUnique({
      where: { id: institutionId },
      select: { name: true, slug: true },
    });

    // Invalidate previous tokens by updating with a fresh setup marker
    const freshMarker = `INVITED_${Date.now()}_${crypto.randomUUID()}`;
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: freshMarker },
    });

    const setupToken = await signPasswordSetupToken({
      userId: user.id,
      email: user.email,
      institutionId,
      passwordHash: freshMarker,
    });

    const appUrl = getAppBaseUrl();
    const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;

    const resolvedRole = (user.role || dbUser?.role || "STUDENT").toUpperCase();
    const portalLoginUrl = getRolePortalLoginUrl(resolvedRole, inst?.slug, appUrl);

    await sendRoleCredentialInvitation(
      { email: user.email, name: user.name || dbUser?.fullName || dbUser?.name || "Member" },
      {
        setupUrl,
        institutionName: inst?.name || "Campus Administration",
        expiresIn: "24 hours",
        role: resolvedRole as any,
        loginUrl: portalLoginUrl,
        username: user.email,
        institutionId,
      }
    );
  } catch (err: any) {
    console.warn("[dispatchSetupEmailSafe] Non-blocking warning:", err.message);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type") || "status";
    const entityType = searchParams.get("entityType") as "STUDENT" | "TEACHER" | "PARENT" | "ADMIN" | "HOD" | "STAFF" | null;
    const entityId = searchParams.get("entityId");

    // Single entity credential status
    if (type === "status" && entityType && entityId) {
      const status = await getUserCredentialStatus(institutionId, entityType, entityId);

      // Additional metadata for UI
      const extraData: Record<string, any> = {};

      if (entityType === "TEACHER") {
        const teacherOrFilters: any[] = [];
        if (isValidUuid(entityId)) {
          teacherOrFilters.push({ id: entityId });
          teacherOrFilters.push({ userId: entityId });
        }
        teacherOrFilters.push({ employeeId: entityId });
        if (entityId.includes("@")) {
          teacherOrFilters.push({ user: { email: entityId.trim().toLowerCase() } });
        }

        const teacher = await db.teacher.findFirst({
          where: {
            institutionId,
            OR: teacherOrFilters,
          },
          select: { designation: true, department: true },
        });

        let designation = teacher?.designation || searchParams.get("designation") || "";
        let department = teacher?.department || searchParams.get("department") || "";
        let role = searchParams.get("role") || status?.role || "TEACHER";

        if (!teacher && isValidUuid(entityId)) {
          const userRecord = await db.user.findFirst({
            where: { id: entityId, institutionId },
            include: { teacherProfile: true },
          }).catch(() => null);

          if (userRecord) {
            role = userRecord.role || role;
            if (userRecord.teacherProfile) {
              designation = userRecord.teacherProfile.designation || designation;
              department = userRecord.teacherProfile.department || department;
            }
          }
        }

        const resolvedDesignation = designation || (role === "TEACHER" ? "Assistant Professor" : designation);
        const resolvedDepartment = department || "General Academics";

        extraData.designation = resolvedDesignation;
        extraData.department = resolvedDepartment;
        extraData.isTeachingFaculty = isTeachingFaculty(resolvedDesignation, role);
      } else if (entityType === "PARENT") {
        const parentOrFilters: any[] = [];
        if (isValidUuid(entityId)) {
          parentOrFilters.push({ guardianAccountId: entityId });
          parentOrFilters.push({ guardianAccount: { userId: entityId } });
          parentOrFilters.push({ id: entityId });
        }
        if (status?.entityId && isValidUuid(status.entityId) && status.entityId !== entityId) {
          parentOrFilters.push({ guardianAccountId: status.entityId });
        }
        if (status?.userId && isValidUuid(status.userId) && status.userId !== entityId) {
          parentOrFilters.push({ guardianAccount: { userId: status.userId } });
        }
        if (entityId.includes("@")) {
          parentOrFilters.push({
            guardianAccount: { user: { email: { equals: entityId.trim().toLowerCase(), mode: "insensitive" } } },
          });
        }
        if (status?.email && status.email.includes("@") && status.email.toLowerCase() !== entityId.toLowerCase()) {
          parentOrFilters.push({
            guardianAccount: { user: { email: { equals: status.email.trim().toLowerCase(), mode: "insensitive" } } },
          });
        }
        const cleanedPhone = entityId.replace(/[\s\-\+]/g, "");
        if (/^\d{7,15}$/.test(cleanedPhone)) {
          parentOrFilters.push({ guardianAccount: { phone: entityId.trim() } });
        }

        // If entityId is a guardianUniqueId (e.g. GRD-xxxx), resolve via GuardianAccount ID suffix
        if (parentOrFilters.length === 0 && entityId.startsWith("GRD-")) {
          const suffix = entityId.slice(4).toLowerCase();
          const accounts = await db.guardianAccount.findMany({
            where: { institutionId },
            select: { id: true, userId: true },
          });
          const matched = accounts.find((ga) => ga.id.toLowerCase().endsWith(suffix));
          if (matched) {
            parentOrFilters.push({ guardianAccountId: matched.id });
            if (matched.userId) {
              parentOrFilters.push({ guardianAccount: { userId: matched.userId } });
            }
          }
        }

        let guardianLinks: any[] = [];
        if (parentOrFilters.length > 0) {
          guardianLinks = await db.guardianLink.findMany({
            where: {
              institutionId,
              OR: parentOrFilters,
            },
            include: {
              student: {
                select: { id: true, fullName: true, rollNumber: true },
              },
            },
          });
        }

        const verified = guardianLinks.filter((l) => l.isVerified);
        const unverified = guardianLinks.filter((l) => !l.isVerified);

        extraData.totalLinkedChildren = guardianLinks.length;
        extraData.verifiedCount = verified.length;
        extraData.unverifiedCount = unverified.length;
        extraData.verifiedChildren = verified.map((l) => ({
          linkId: l.id,
          studentId: l.student.id,
          fullName: l.student.fullName,
          rollNumber: l.student.rollNumber,
          relationship: l.relationship,
          canAccessPortal: l.canAccessPortal,
        }));
        extraData.unverifiedChildren = unverified.map((l) => ({
          linkId: l.id,
          studentId: l.student.id,
          fullName: l.student.fullName,
          rollNumber: l.student.rollNumber,
          relationship: l.relationship,
        }));
      }

      return NextResponse.json({
        success: true,
        data: {
          ...status,
          ...extraData,
        },
      });
    }

    // Batch status retrieval for list views
    if (type === "batch" && entityType) {
      if (entityType === "STUDENT") {
        const students = await db.student.findMany({
          where: { institutionId },
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                status: true,
                passwordHash: true,
                lastLoginAt: true,
              },
            },
          },
        });

        const statusMap: Record<string, any> = {};
        for (const s of students) {
          const hasUser = !!s.user;
          const hasPassword = !!s.user?.passwordHash && s.user.passwordHash !== "UNPROVISIONED";
          const isActive = !!s.user?.isActive && s.user?.status === "ACTIVE";
          const portalStatus = !hasUser
            ? "NOT_CREATED"
            : !hasPassword
            ? "PENDING_SETUP"
            : isActive
            ? "ACTIVE"
            : "DISABLED";

          statusMap[s.id] = {
            hasAccount: hasUser,
            isActive,
            portalStatus,
            userId: s.userId,
            email: s.user?.email || null,
            lastLoginAt: s.user?.lastLoginAt || null,
          };
        }

        return NextResponse.json({ success: true, data: statusMap });
      }

      if (entityType === "TEACHER") {
        const teachers = await db.teacher.findMany({
          where: { institutionId },
          select: {
            id: true,
            userId: true,
            designation: true,
            department: true,
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                status: true,
                passwordHash: true,
                lastLoginAt: true,
              },
            },
          },
        });

        const statusMap: Record<string, any> = {};
        for (const t of teachers) {
          const designation = t.designation || "Assistant Professor";
          const role = t.user?.role || "TEACHER";

          const eligible = isTeachingFaculty(designation, role);
          const hasUser = !!t.user;
          const hasPassword = !!t.user?.passwordHash && t.user.passwordHash !== "UNPROVISIONED";
          const isActive = !!t.user?.isActive && t.user?.status === "ACTIVE";

          let portalStatus: string = "NOT_CREATED";
          if (!eligible) {
            portalStatus = "INELIGIBLE";
          } else if (!hasUser) {
            portalStatus = "NOT_CREATED";
          } else if (!hasPassword) {
            portalStatus = "PENDING_SETUP";
          } else {
            portalStatus = isActive ? "ACTIVE" : "DISABLED";
          }

          const entry = {
            hasAccount: hasUser,
            isActive,
            isTeachingFaculty: eligible,
            portalStatus,
            userId: t.userId,
            email: t.user?.email || null,
            lastLoginAt: t.user?.lastLoginAt || null,
            designation,
            department: t.department,
          };

          statusMap[t.id] = entry;
          if (t.userId) {
            statusMap[t.userId] = entry;
          }
        }

        const orphanTeachers = await db.user.findMany({
          where: {
            institutionId,
            role: "TEACHER",
            teacherProfile: null,
          },
          select: {
            id: true,
            email: true,
            isActive: true,
            status: true,
            passwordHash: true,
            lastLoginAt: true,
            fullName: true,
            role: true,
          },
        }).catch(() => []);

        for (const u of orphanTeachers) {
          if (!statusMap[u.id]) {
            const hasPassword = !!u.passwordHash && u.passwordHash !== "UNPROVISIONED";
            const isActive = !!u.isActive && u.status === "ACTIVE";
            const portalStatus = !hasPassword ? "PENDING_SETUP" : (isActive ? "ACTIVE" : "DISABLED");
            statusMap[u.id] = {
              hasAccount: true,
              isActive,
              isTeachingFaculty: true,
              portalStatus,
              userId: u.id,
              email: u.email || null,
              lastLoginAt: u.lastLoginAt || null,
              designation: "Assistant Professor",
              department: "Computer Science and Engineering",
            };
          }
        }

        return NextResponse.json({ success: true, data: statusMap });
      }

      if (entityType === "PARENT") {
        const guardianAccounts = await db.guardianAccount.findMany({
          where: { institutionId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                status: true,
                passwordHash: true,
                lastLoginAt: true,
              },
            },
            guardianLinks: {
              select: { isVerified: true, canAccessPortal: true },
            },
          },
        });

        const statusMap: Record<string, any> = {};
        for (const g of guardianAccounts) {
          const verifiedCount = g.guardianLinks.filter((l) => l.isVerified).length;
          const hasUser = !!g.user;
          const hasPassword =
            !!g.user?.passwordHash &&
            !g.user.passwordHash.startsWith("INVITED_") &&
            g.user.passwordHash.startsWith("$2");
          const isActive = !!g.user?.isActive && g.user?.status === "ACTIVE";

          let portalStatus = "NOT_CREATED";
          if (verifiedCount === 0) {
            portalStatus = "UNVERIFIED";
          } else if (!hasUser) {
            portalStatus = "NOT_CREATED";
          } else if (!hasPassword) {
            portalStatus = "PENDING_SETUP";
          } else {
            portalStatus = isActive ? "ACTIVE" : "DISABLED";
          }

          statusMap[g.id] = {
            hasAccount: hasUser,
            isActive,
            hasVerifiedRelationship: verifiedCount > 0,
            verifiedCount,
            portalStatus,
            userId: g.userId,
            email: g.user?.email || null,
            lastLoginAt: g.user?.lastLoginAt || null,
          };
        }

        return NextResponse.json({ success: true, data: statusMap });
      }
    }

    return NextResponse.json(
      { success: false, error: "Invalid credential status query parameters." },
      { status: 400 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req);
    const body = await req.json();
    const { action, entityType, customPassword } = body;

    if (!action || !entityType) {
      return NextResponse.json(
        { success: false, error: "Action and entityType are required." },
        { status: 400 }
      );
    }

    // 1. ISSUE CREDENTIALS
    if (action === "ISSUE") {
      if (entityType === "STUDENT") {
        const { studentId } = body;
        if (!studentId) {
          return NextResponse.json({ success: false, error: "studentId is required." }, { status: 400 });
        }

        const result = await issueStudentCredentials({
          institutionId,
          studentId,
          customPassword,
          forceReset: false,
          actorUserId,
        });

        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.message, code: result.code },
            { status: result.code === "ACCOUNT_EXISTS" ? 409 : 400 }
          );
        }

        if (result.userId && result.email) {
          dispatchSetupEmailSafe(institutionId, { id: result.userId, email: result.email, role: "STUDENT" });
        }

        return NextResponse.json({
          success: true,
          message: "Student portal credentials generated successfully.",
          data: {
            userId: result.userId,
            email: result.email,
            temporaryPassword: result.temporaryPassword,
            mustChangePassword: true,
            role: "STUDENT",
            instruction: "Temporary password displayed only once. Student must change password upon first login.",
          },
        });
      }

      if (entityType === "TEACHER") {
        const { teacherId, userId, employeeId, email, fullName, designation, department } = body;

        // Authoritative teaching eligibility validation
        if (designation && !isTeachingFaculty(designation)) {
          return NextResponse.json(
            {
              success: false,
              code: "INELIGIBLE_NON_TEACHING",
              error: `Policy Restriction: Designation '${designation}' is classified as non-teaching staff. Only eligible teaching faculty may be granted TEACHER portal access.`,
            },
            { status: 400 }
          );
        }

        const result = await issueTeacherCredentials({
          institutionId,
          teacherId,
          userId,
          employeeId,
          email,
          fullName,
          designation,
          department,
          customPassword,
          forceReset: false,
          actorUserId,
        });

        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.message, code: result.code },
            { status: result.code === "ACCOUNT_EXISTS" ? 409 : 400 }
          );
        }

        if (result.userId && result.email) {
          dispatchSetupEmailSafe(institutionId, { id: result.userId, email: result.email, role: "TEACHER" });
        }

        return NextResponse.json({
          success: true,
          message: "Teaching faculty portal credentials generated successfully.",
          data: {
            userId: result.userId,
            email: result.email,
            temporaryPassword: result.temporaryPassword,
            mustChangePassword: true,
            role: "TEACHER",
            instruction: "Temporary password displayed only once. Faculty must change password upon first login.",
          },
        });
      }

      if (entityType === "PARENT") {
        const { guardianAccountId, email, fullName, phone, relationship, studentIds } = body;

        const result = await issueParentCredentials({
          institutionId,
          guardianAccountId,
          email,
          fullName,
          phone,
          relationship,
          studentIds: studentIds || [],
          customPassword,
          forceReset: false,
          actorUserId,
        });

        if (!result.success) {
          return NextResponse.json(
            {
              success: false,
              error: result.message,
              code: result.code,
              details: result.details,
            },
            { status: result.code === "ACCOUNT_EXISTS" ? 409 : 400 }
          );
        }

        if (result.userId && result.email) {
          dispatchSetupEmailSafe(institutionId, { id: result.userId, email: result.email, name: fullName, role: "PARENT" });
        }

        return NextResponse.json({
          success: true,
          message: "Parent portal credentials generated successfully.",
          data: {
            userId: result.userId,
            email: result.email,
            temporaryPassword: result.temporaryPassword,
            mustChangePassword: true,
            role: "PARENT",
            details: result.details,
            instruction: "Temporary password displayed only once. Parent must change password upon first login.",
          },
        });
      }
    }

    // 2. RESET PASSWORD
    if (action === "RESET") {
      let targetUserId = body.userId;

      // If entity identifiers are passed instead of userId, resolve userId
      if (!targetUserId) {
        if (entityType === "STUDENT" && body.studentId) {
          const sFilter: any[] = [];
          if (isValidUuid(body.studentId)) sFilter.push({ id: body.studentId }, { userId: body.studentId });
          sFilter.push({ rollNumber: body.studentId }, { admissionNumber: body.studentId });
          const student = await db.student.findFirst({
            where: { institutionId, OR: sFilter },
            select: { userId: true },
          });
          targetUserId = student?.userId;
        } else if (entityType === "TEACHER" && body.teacherId) {
          const tFilter: any[] = [];
          if (isValidUuid(body.teacherId)) tFilter.push({ id: body.teacherId }, { userId: body.teacherId });
          tFilter.push({ employeeId: body.teacherId });
          const teacher = await db.teacher.findFirst({
            where: { institutionId, OR: tFilter },
            select: { userId: true },
          });
          targetUserId = teacher?.userId;
        } else if (entityType === "PARENT" && body.guardianAccountId) {
          const gFilter: any[] = [];
          if (isValidUuid(body.guardianAccountId)) {
            gFilter.push({ id: body.guardianAccountId }, { userId: body.guardianAccountId });
          }
          if (body.guardianAccountId.includes("@")) {
            gFilter.push({ user: { email: body.guardianAccountId.trim().toLowerCase() } });
          }
          const cleanedPhone = body.guardianAccountId.replace(/[\s\-\+]/g, "");
          if (/^\d{7,15}$/.test(cleanedPhone)) {
            gFilter.push({ phone: body.guardianAccountId.trim() });
          }
          const guardian = gFilter.length > 0 ? await db.guardianAccount.findFirst({
            where: { institutionId, OR: gFilter },
            select: { userId: true },
          }) : null;
          targetUserId = guardian?.userId;
        }
      }

      if (!targetUserId) {
        return NextResponse.json(
          {
            success: false,
            error: "Unable to identify user account to reset. Ensure the user profile exists.",
          },
          { status: 400 }
        );
      }

      const resetResult = await resetUserPassword({
        institutionId,
        userId: targetUserId,
        customPassword,
        actorUserId,
      });

      if (!resetResult.success) {
        return NextResponse.json({ success: false, error: resetResult.message }, { status: 400 });
      }

      if (targetUserId) {
        db.user
          .findUnique({
            where: { id: targetUserId },
            select: { email: true, fullName: true, name: true },
          })
          .then((u) => {
            if (u?.email) {
              dispatchSetupEmailSafe(institutionId, {
                id: targetUserId,
                email: u.email,
                name: u.fullName || u.name || undefined,
              });
            }
          })
          .catch(() => {});
      }

      return NextResponse.json({
        success: true,
        message: "User password reset successfully. All existing sessions have been invalidated.",
        data: {
          userId: targetUserId,
          temporaryPassword: resetResult.temporaryPassword,
          mustChangePassword: true,
          instruction: "Temporary password displayed only once. User must change password upon first login.",
        },
      });
    }

    // 3. TOGGLE ACCESS (ENABLE / DISABLE)
    if (action === "TOGGLE_ACCESS") {
      let targetUserId = body.userId;
      const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

      if (!targetUserId) {
        if (entityType === "STUDENT" && body.studentId) {
          const sFilter: any[] = [];
          if (isValidUuid(body.studentId)) sFilter.push({ id: body.studentId }, { userId: body.studentId });
          sFilter.push({ rollNumber: body.studentId }, { admissionNumber: body.studentId });
          const student = await db.student.findFirst({
            where: { institutionId, OR: sFilter },
            select: { userId: true },
          });
          targetUserId = student?.userId;
        } else if (entityType === "TEACHER" && body.teacherId) {
          const tFilter: any[] = [];
          if (isValidUuid(body.teacherId)) tFilter.push({ id: body.teacherId }, { userId: body.teacherId });
          tFilter.push({ employeeId: body.teacherId });
          const teacher = await db.teacher.findFirst({
            where: { institutionId, OR: tFilter },
            select: { userId: true },
          });
          targetUserId = teacher?.userId;
        } else if (entityType === "PARENT" && body.guardianAccountId) {
          const gFilter: any[] = [];
          if (isValidUuid(body.guardianAccountId)) {
            gFilter.push({ id: body.guardianAccountId }, { userId: body.guardianAccountId });
          }
          if (body.guardianAccountId.includes("@")) {
            gFilter.push({ user: { email: body.guardianAccountId.trim().toLowerCase() } });
          }
          const cleanedPhone = body.guardianAccountId.replace(/[\s\-\+]/g, "");
          if (/^\d{7,15}$/.test(cleanedPhone)) {
            gFilter.push({ phone: body.guardianAccountId.trim() });
          }
          const guardian = gFilter.length > 0 ? await db.guardianAccount.findFirst({
            where: { institutionId, OR: gFilter },
            select: { userId: true },
          }) : null;
          targetUserId = guardian?.userId;
        }
      }

      if (!targetUserId) {
        return NextResponse.json(
          { success: false, error: "Target user account not found or has no active portal profile." },
          { status: 400 }
        );
      }

      const toggleResult = await togglePortalAccess({
        institutionId,
        userId: targetUserId,
        isActive,
        reason: body.reason || `Administrator ${isActive ? "enabled" : "disabled"} portal access`,
        actorUserId,
      });

      return NextResponse.json({
        success: true,
        message: toggleResult.message,
        data: {
          userId: targetUserId,
          isActive: toggleResult.isActive,
        },
      });
    }

    // 4. RESEND INVITATION
    if (action === "RESEND_INVITATION") {
      const entityId = body.studentId || body.teacherId || body.guardianAccountId || body.entityId || body.userId;
      if (!entityId) {
        return NextResponse.json(
          { success: false, error: "Entity ID is required to resend setup invitation." },
          { status: 400 }
        );
      }

      const result = await resendInvitation({
        institutionId,
        entityType,
        entityId,
        actorUserId,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.message },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: result.message,
        data: {
          previewUrl: result.previewUrl,
          email: result.email,
          userId: result.userId,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported credential action '${action}'.` },
      { status: 400 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
