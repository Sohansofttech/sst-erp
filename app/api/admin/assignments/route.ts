import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getAdminAssignments } from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const assignments = await getAdminAssignments(institutionId);

    return NextResponse.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
