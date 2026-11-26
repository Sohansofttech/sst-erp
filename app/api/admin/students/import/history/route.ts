import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import { getImportHistory } from "@/lib/services/student-import.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    const take = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("take") || "25", 10) || 25));
    const history = await getImportHistory(institutionId, take);

    return NextResponse.json({
      success: true,
      data: history,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
