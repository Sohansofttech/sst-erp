import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import db from "@/lib/db";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const isUuid = UUID_REGEX.test(institutionId);

    let roles: any[] = [];
    if (isUuid) {
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
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.name) {
      return NextResponse.json({ success: false, error: "Role name is required." }, { status: 400 });
    }

    const isUuid = UUID_REGEX.test(institutionId);
    if (!isUuid) {
      return NextResponse.json(
        { success: false, error: "Institution ID must be a valid UUID to create custom roles." },
        { status: 400 }
      );
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
