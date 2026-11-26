import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import { getAuditLogs, createAuditLog } from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    const take = parseInt(req.nextUrl.searchParams.get("take") || "50", 10);
    const logs = await getAuditLogs(institutionId, take);

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    const body = await req.json();

    const log = await createAuditLog({
      institutionId,
      userId,
      action: body.action || "MANUAL_AUDIT",
      tableName: body.tableName || "institution_admin",
      recordId: body.recordId || "system",
      oldValues: body.oldValues,
      newValues: body.newValues,
    });

    return NextResponse.json({
      success: true,
      data: log,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
