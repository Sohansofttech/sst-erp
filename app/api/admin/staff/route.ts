import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getStaff, createStaff } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

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
        { success: false, error: "Full name, email, and role (TEACHER | ADMIN) are required." },
        { status: 400 }
      );
    }

    const staffMember = await createStaff(institutionId, body);
    return NextResponse.json({
      success: true,
      message: "Staff member created successfully.",
      data: staffMember,
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

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(phone ? { phone } : {}),
        ...(role ? { role } : {}),
      },
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
