import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getDashboardMetrics } from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const data = await getDashboardMetrics(institutionId);

    return NextResponse.json({
      success: true,
      institutionId,
      data,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
