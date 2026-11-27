import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";
import { PERMISSIONS, RESERVED_PRIVILEGED_ROLE_CODES } from "@/lib/security/rbac";
import { recordAuditLog } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, { requiredPermission: PERMISSIONS.ADMIN_ALL });
    await requireReadReq(req, institutionId);

    if (!isValidUuid(institutionId)) {
      return NextResponse.json({
        success: true,
        data: {
          roles: [
            { id: "system-admin", name: "Administrator", code: "ADMIN", isSystem: true },
            { id: "system-teacher", name: "Teacher", code: "TEACHER", isSystem: true },
            { id: "system-student", name: "Student", code: "STUDENT", isSystem: true },
            { id: "system-staff", name: "Staff", code: "STAFF", isSystem: true },
          ],
          permissions: [],
        },
      });
    }

    let roles: any[] = [];
    try {
      roles = await db.role.findMany({
        where: { institutionId },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
        orderBy: { name: "asc" },
      });
    } catch (err: any) {
      console.warn("Roles lookup notice (table may be empty or pending):", err?.message);
    }

    let permissions: any[] = [];
    try {
      permissions = await db.permission.findMany({
        orderBy: { name: "asc" },
      });
    } catch {
      // Permission table optional
    }

    return NextResponse.json({
      success: true,
      data: { roles, permissions },
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

    if (!body.name) {
      return NextResponse.json({ success: false, error: "Role name is required." }, { status: 400 });
    }

    if (!isValidUuid(institutionId)) {
      return NextResponse.json(
        { success: false, error: "Institution ID must be a valid UUID to create custom roles." },
        { status: 400 }
      );
    }

    const code = (body.code || body.name.toUpperCase().replace(/\s+/g, "_")).trim().toUpperCase();
    if (RESERVED_PRIVILEGED_ROLE_CODES.has(code)) {
      return NextResponse.json(
        { success: false, error: `Forbidden: Role code '${code}' is reserved for system administrators.` },
        { status: 403 }
      );
    }

    const role = await db.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          institutionId,
          name: body.name,
          code,
          description: body.description,
        },
      });

      await recordAuditLog(tx, {
        institutionId,
        actorUserId: adminUserId || null,
        action: "ROLE_CREATED",
        entityType: "ROLE",
        entityId: created.id,
        newValuesJson: JSON.stringify({ name: created.name, code: created.code }),
      });

      return created;
    });

    return NextResponse.json({
      success: true,
      message: "Role created successfully.",
      data: role,
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
    const { id, name, description, permissionIds } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "Role ID is required." }, { status: 400 });
    }

    if (!isValidUuid(institutionId) || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: "Invalid role or institution ID format." }, { status: 400 });
    }

    const existing = await db.role.findFirst({
      where: { id, institutionId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Role not found or access denied." }, { status: 404 });
    }

    if (existing.isSystem || RESERVED_PRIVILEGED_ROLE_CODES.has((existing.code || "").toUpperCase())) {
      return NextResponse.json({ success: false, error: "System or reserved roles cannot be modified." }, { status: 403 });
    }

    let uniquePermissionIds: string[] = [];
    if (Array.isArray(permissionIds)) {
      uniquePermissionIds = Array.from(new Set<string>(permissionIds.map((p: any) => String(p))));
      if (!uniquePermissionIds.every((pId) => isValidUuid(pId))) {
        return NextResponse.json(
          { success: false, error: "Valid UUID permission IDs are required." },
          { status: 400 }
        );
      }
      if (uniquePermissionIds.length > 0) {
        const requestedPerms = await db.permission.findMany({
          where: { id: { in: uniquePermissionIds } },
          select: { id: true, code: true },
        });
        if (requestedPerms.length !== uniquePermissionIds.length) {
          return NextResponse.json(
            { success: false, error: "One or more permission IDs do not exist." },
            { status: 400 }
          );
        }
        if (requestedPerms.some((p) => p.code === PERMISSIONS.ADMIN_ALL)) {
          return NextResponse.json(
            { success: false, error: "Forbidden: Tenant-defined roles cannot be granted 'admin:all' permission." },
            { status: 403 }
          );
        }
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id_institutionId: { id, institutionId } },
        data: {
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });

      if (Array.isArray(permissionIds)) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (uniquePermissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: uniquePermissionIds.map((pId: string) => ({
              roleId: id,
              permissionId: pId,
            })),
          });
        }
      }

      await recordAuditLog(tx, {
        institutionId,
        actorUserId: adminUserId || null,
        action: "ROLE_UPDATED",
        entityType: "ROLE",
        entityId: id,
        newValuesJson: JSON.stringify({
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(Array.isArray(permissionIds) ? { permissionIds: uniquePermissionIds } : {}),
        }),
      });

      return role;
    });

    return NextResponse.json({
      success: true,
      message: "Role updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId, userId: adminUserId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Role ID is required." }, { status: 400 });
    }

    if (!isValidUuid(institutionId) || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: "Invalid role or institution ID format." }, { status: 400 });
    }

    const existing = await db.role.findFirst({
      where: { id, institutionId },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Role not found or access denied." }, { status: 404 });
    }

    if (existing.isSystem || RESERVED_PRIVILEGED_ROLE_CODES.has((existing.code || "").toUpperCase())) {
      return NextResponse.json({ success: false, error: "System or reserved roles cannot be deleted." }, { status: 403 });
    }

    const assignmentCount = await db.userRoleAssignment.count({
      where: { roleId: id, institutionId },
    });
    if (assignmentCount > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete role: it is currently assigned to one or more staff members." },
        { status: 409 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.role.delete({ where: { id_institutionId: { id, institutionId } } });
      await recordAuditLog(tx, {
        institutionId,
        actorUserId: adminUserId || null,
        action: "ROLE_DELETED",
        entityType: "ROLE",
        entityId: id,
        oldValuesJson: JSON.stringify({ code: existing.code, name: existing.name }),
      });
    });

    return NextResponse.json({
      success: true,
      message: "Role deleted successfully.",
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
