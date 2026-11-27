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
    }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
