import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getGuardians, createGuardian } from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const guardians = await getGuardians(institutionId);

    return NextResponse.json({
      success: true,
      data: guardians,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.fullName || !body.relationship || !body.phone) {
      return NextResponse.json(
        { success: false, error: "Guardian full name, relationship, and phone are required." },
        { status: 400 }
      );
    }

    const guardian = await createGuardian(institutionId, body);
    return NextResponse.json({
      success: true,
      message: "Guardian registered successfully.",
      data: guardian,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
