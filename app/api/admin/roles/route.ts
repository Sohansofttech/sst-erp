import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import db from "@/lib/db";

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);

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

    const roles = await db.role.findMany({
      where: { institutionId },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const permissions = await db.permission.findMany({
      orderBy: { name: "asc" },
    });

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
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.name) {
      return NextResponse.json({ success: false, error: "Role name is required." }, { status: 400 });
    }

    if (!isValidUuid(institutionId)) {
      return NextResponse.json({ success: false, error: "Invalid institution ID format for role assignment." }, { status: 400 });
    }

    const code = body.code || body.name.toUpperCase().replace(/\s+/g, "_");
    const role = await db.role.create({
      data: {
        institutionId,
        name: body.name,
        code,
        description: body.description,
      },
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
    const { institutionId } = await resolveAdminContext(req);
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

    if (existing.isSystem) {
      return NextResponse.json({ success: false, error: "System roles cannot be modified." }, { status: 403 });
    }

    const updated = await db.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });

      if (Array.isArray(permissionIds)) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((pId: string) => ({
              roleId: id,
              permissionId: pId,
            })),
          });
        }
      }

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
    const { institutionId } = await resolveAdminContext(req);
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

    if (existing.isSystem) {
      return NextResponse.json({ success: false, error: "System roles cannot be deleted." }, { status: 403 });
    }

    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.role.delete({ where: { id } });
    });

    return NextResponse.json({
      success: true,
      message: "Role deleted successfully.",
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
