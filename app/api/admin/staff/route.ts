import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getStaff,
  createStaff,
  archiveTeacher,
  restoreTeacher,
  getTeacherDependencies,
  recordAuditLog,
  replaceStaffRoleAssignments,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";
import { PERMISSIONS, RESERVED_PRIVILEGED_ROLE_CODES } from "@/lib/security/rbac";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


const ALLOWED_STAFF_ROLES = [
  "TEACHER",
  "STAFF",
  "HOD",
  "ADMISSIONS_OFFICER",
  "ACCOUNTANT",
  "HOSTEL_WARDEN",
  "TRANSPORT_OFFICER",
] as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, { requiredPermission: PERMISSIONS.ADMIN_ALL });
    await requireReadReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");
    const checkDependencies = req.nextUrl.searchParams.get("dependencies") === "true";

    if (id && checkDependencies) {
      const deps = await getTeacherDependencies(institutionId, id);
      return NextResponse.json({
        success: true,
        data: deps,
      });
    }

    const staff = await getStaff(institutionId);

    return NextResponse.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId: adminUserId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (!body.fullName || !body.email || !body.role) {
      return NextResponse.json(
        { success: false, error: "Full name, email, and role are required." },
        { status: 400 }
      );
    }

    const requestedRole = String(body.role).trim().toUpperCase();
    if (
      RESERVED_PRIVILEGED_ROLE_CODES.has(requestedRole) ||
      !(ALLOWED_STAFF_ROLES as readonly string[]).includes(requestedRole)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Unauthorized role assignment. Permitted roles: ${ALLOWED_STAFF_ROLES.join(", ")}.`,
        },
        { status: 403 }
      );
    }

    // Validate submitted roleIds strictly against authenticated institution & disallow privileged system roles
    let validatedRoleIds: string[] = [];
    if (Array.isArray(body.roleIds) && body.roleIds.length > 0) {
      if (!UUID_REGEX.test(institutionId)) {
        return NextResponse.json(
          { success: false, error: "Valid UUID institution is required for role assignments." },
          { status: 400 }
        );
      }
      const uniqueRoleIds = Array.from(new Set<string>(body.roleIds.map((r: any) => String(r))));
      if (!uniqueRoleIds.every((rId) => UUID_REGEX.test(rId))) {
        return NextResponse.json(
          { success: false, error: "Valid UUID role IDs are required." },
          { status: 400 }
        );
      }
      const validRoles = await db.role.findMany({
        where: { institutionId, id: { in: uniqueRoleIds } },
        select: { id: true, code: true },
      });
      if (validRoles.length !== uniqueRoleIds.length) {
        return NextResponse.json(
          { success: false, error: "Forbidden: One or more role IDs do not belong to your institution." },
          { status: 403 }
        );
      }
      if (validRoles.some((r) => RESERVED_PRIVILEGED_ROLE_CODES.has((r.code || "").toUpperCase()))) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Cannot assign privileged system roles via departmental provisioning." },
          { status: 403 }
        );
      }
      validatedRoleIds = validRoles.map((r) => r.id);
    }

    const staffMember = await createStaff(institutionId, {
      ...body,
      role: requestedRole,
      roleIds: validatedRoleIds,
      actorUserId: adminUserId,
    });

    return NextResponse.json({
      success: true,
      message: "Staff member and login account provisioned successfully.",
      data: staffMember,
      invitationSent: (staffMember as any).invitationSent,
      previewUrl: (staffMember as any).previewUrl,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId: adminUserId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const { id, fullName, phone, role, roleIds, isActive, designation, departmentId, department, employeeId } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "User ID is required." }, { status: 400 });
    }

    // Verify tenant ownership before updating
    const targetUser = await db.user.findFirst({
      where: { id, institutionId },
      include: { teacherProfile: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: "Staff member not found or access denied." },
        { status: 404 }
      );
    }

    // Block modifying, demoting, or deactivating reserved administrator accounts
    const targetRoleUpper = (targetUser.role || "").toUpperCase();
    if (RESERVED_PRIVILEGED_ROLE_CODES.has(targetRoleUpper)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Cannot modify, demote, or deactivate reserved administrator accounts." },
        { status: 403 }
      );
    }

    // If role change requested, enforce allowed non-reserved staff roles
    const normalizedRole = role !== undefined ? String(role).trim().toUpperCase() : undefined;
    if (normalizedRole !== undefined) {
      if (
        RESERVED_PRIVILEGED_ROLE_CODES.has(normalizedRole) ||
        !(ALLOWED_STAFF_ROLES as readonly string[]).includes(normalizedRole)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Unauthorized role assignment. Permitted roles: ${ALLOWED_STAFF_ROLES.join(", ")}.`,
          },
          { status: 403 }
        );
      }
    }

    const effectiveRole = normalizedRole || targetUser.role;
    const isFaculty = effectiveRole === "TEACHER" || effectiveRole === "HOD";
    const requestedDepartment = department?.trim() || departmentId?.trim();
    const departmentChanged = Boolean(
      requestedDepartment && requestedDepartment !== targetUser.teacherProfile?.department?.trim()
    );
    const roleChanged = normalizedRole !== undefined && normalizedRole !== targetUser.role;
    const shouldReplaceRoleAssignments =
      Array.isArray(roleIds) || roleChanged || departmentChanged;

    let validatedRoleIds: string[] = [];
    if (Array.isArray(roleIds)) {
      if (typeof id !== "string" || id.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "Valid user ID is required for role assignments." },
          { status: 400 }
        );
      }
      if (roleIds.length > 0 && !UUID_REGEX.test(institutionId)) {
        return NextResponse.json(
          { success: false, error: "Valid UUID institution is required for role assignments." },
          { status: 400 }
        );
      }
      const uniqueRoleIds = Array.from(new Set<string>(roleIds.map((r: any) => String(r))));
      if (!uniqueRoleIds.every((rId) => UUID_REGEX.test(rId))) {
        return NextResponse.json(
          { success: false, error: "Valid UUID role IDs are required." },
          { status: 400 }
        );
      }
      if (uniqueRoleIds.length > 0) {
        const validRoles = await db.role.findMany({
          where: { institutionId, id: { in: uniqueRoleIds } },
          select: { id: true, code: true },
        });
        if (validRoles.length !== uniqueRoleIds.length) {
          return NextResponse.json(
            { success: false, error: "Forbidden: One or more role IDs do not belong to your institution." },
            { status: 403 }
          );
        }
        if (validRoles.some((r) => RESERVED_PRIVILEGED_ROLE_CODES.has((r.code || "").toUpperCase()))) {
          return NextResponse.json(
            { success: false, error: "Forbidden: Cannot assign privileged system roles via departmental provisioning." },
            { status: 403 }
          );
        }
        validatedRoleIds = validRoles.map((r) => r.id);
      }
    }

    const updatedCount = await db.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: {
          id,
          institutionId,
          role: { notIn: Array.from(RESERVED_PRIVILEGED_ROLE_CODES) },
        },
        data: {
          ...(fullName ? { fullName: String(fullName).trim() } : {}),
          ...(phone ? { phone: String(phone).trim() } : {}),
          ...(normalizedRole ? { role: normalizedRole } : {}),
          ...(isActive !== undefined
            ? {
                isActive: Boolean(isActive),
                status: isActive ? "ACTIVE" : "INACTIVE",
              }
            : {}),
        },
      });

      if (result.count === 0) {
        return 0;
      }

      if (shouldReplaceRoleAssignments) {
        await replaceStaffRoleAssignments(tx, id, institutionId, validatedRoleIds);
      }

      await recordAuditLog(tx, {
        institutionId,
        actorUserId: adminUserId || null,
        userId: id,
        action: shouldReplaceRoleAssignments ? "STAFF_ROLES_UPDATED" : "STAFF_UPDATED",
        entityType: "USER",
        entityId: id,
        newValuesJson: JSON.stringify({
          ...(fullName !== undefined ? { fullName } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
          ...(shouldReplaceRoleAssignments ? { roleIds: validatedRoleIds } : {}),
        }),
      });

      return result.count;
    });

    if (updatedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Staff member not found or access denied." },
        { status: 404 }
      );
    }

    // Synchronize or create Teacher profile if faculty role or designation/department is provided
    if (isFaculty || designation || departmentId || department) {
      const existingTeacher = targetUser.teacherProfile || await db.teacher.findFirst({
        where: { userId: id, institutionId },
      });

      const effectiveDepartment = department?.trim() || departmentId?.trim() || "Computer Science and Engineering";
      const effectiveDesignation = designation?.trim() || "Assistant Professor";
      const effectiveEmployeeId = employeeId?.trim() || `EMP-${id.slice(0, 8)}`;

      if (existingTeacher) {
        await db.teacher.update({
          where: { id: existingTeacher.id },
          data: {
            ...(designation ? { designation: effectiveDesignation } : {}),
            ...(department || departmentId ? { department: effectiveDepartment } : {}),
            ...(employeeId ? { employeeId: effectiveEmployeeId } : {}),
          },
        }).catch((err) => console.warn("[PUT /api/admin/staff] Non-fatal teacher update error:", err.message));
      } else if (isFaculty) {
        await db.teacher.create({
          data: {
            institutionId,
            userId: id,
            employeeId: effectiveEmployeeId,
            designation: effectiveDesignation,
            department: effectiveDepartment,
          },
        }).catch((err) => console.warn("[PUT /api/admin/staff] Non-fatal teacher create error:", err.message));
      }
    }

    const updated = await db.user.findFirst({
      where: { id, institutionId },
      include: { teacherProfile: true },
    });

    return NextResponse.json({
      success: true,
      message: "Staff member details updated.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");
    const force = req.nextUrl.searchParams.get("force") === "true";

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Staff member ID is required." },
        { status: 400 }
      );
    }

    const targetUser = await db.user.findFirst({
      where: { id, institutionId },
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: "Staff user not found or access denied." }, { status: 404 });
    }

    if (RESERVED_PRIVILEGED_ROLE_CODES.has((targetUser.role || "").toUpperCase())) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Cannot modify or deactivate reserved administrator accounts." },
        { status: 403 }
      );
    }

    const result = await archiveTeacher(institutionId, id, actorUserId, force);
    return NextResponse.json({
      success: true,
      message: result.message,
      data: (result as any).data,
      alreadyArchived: (result as any).alreadyArchived,
    });
  } catch (error: any) {
    if (error.statusCode === 409) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          hasActiveAssignments: error.hasActiveAssignments,
          activeSlots: error.activeSlots,
        },
        { status: 409 }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Staff member ID is required." },
        { status: 400 }
      );
    }

    if (action === "RESTORE") {
      const result = await restoreTeacher(institutionId, id, actorUserId);
      return NextResponse.json({
        success: true,
        message: result.message,
        notArchived: (result as any).notArchived,
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action: ${action}. Expected RESTORE.` },
      { status: 400 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
