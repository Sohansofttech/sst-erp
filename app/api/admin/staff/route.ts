import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getStaff, createStaff } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

const ALLOWED_STAFF_ROLES = ["TEACHER", "ADMIN", "STAFF", "HOD"] as const;

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
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
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.fullName || !body.email || !body.role) {
      return NextResponse.json(
        { success: false, error: "Full name, email, and role (TEACHER | ADMIN | STAFF | HOD) are required." },
        { status: 400 }
      );
    }

    if (!ALLOWED_STAFF_ROLES.includes(body.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized role assignment. Permitted roles: TEACHER, ADMIN, STAFF, HOD." },
        { status: 403 }
      );
    }

    const staffMember = await createStaff(institutionId, body);
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
    const { institutionId } = await resolveAdminContext(req);
    const { id, fullName, phone, role } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "User ID is required." }, { status: 400 });
    }

    // Verify tenant ownership before updating
    const targetUser = await db.user.findFirst({
      where: { id, institutionId },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: "Staff member not found or access denied." },
        { status: 404 }
      );
    }

    // Block modifying Super Admin accounts
    if (targetUser.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Cannot modify a Super Admin user." },
        { status: 403 }
      );
    }

    // If role change requested, enforce allowed staff roles
    if (role !== undefined) {
      if (!ALLOWED_STAFF_ROLES.includes(role)) {
        return NextResponse.json(
          { success: false, error: "Unauthorized role assignment. Permitted roles: TEACHER, ADMIN, STAFF, HOD." },
          { status: 403 }
        );
      }
    }

    const result = await db.user.updateMany({
      where: {
        id,
        institutionId,
        role: { not: "SUPER_ADMIN" },
      },
      data: {
        ...(fullName ? { fullName: String(fullName).trim() } : {}),
        ...(phone ? { phone: String(phone).trim() } : {}),
        ...(role ? { role } : {}),
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Staff member not found or access denied." },
        { status: 404 }
      );
    }

    const updated = await db.user.findFirst({
      where: { id, institutionId },
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
