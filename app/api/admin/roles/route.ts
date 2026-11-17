import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
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
