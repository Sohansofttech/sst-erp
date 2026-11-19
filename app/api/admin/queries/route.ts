import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getQueries, respondToQuery, QueryStatus } from "@/lib/services/query-management.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const searchParams = req.nextUrl.searchParams;

    const role = searchParams.get("role") || undefined;
    const status = searchParams.get("status") || undefined;
    const category = searchParams.get("category") || undefined;
    const search = searchParams.get("q") || undefined;

    const queries = await getQueries({
      institutionId,
      role,
      status,
      category,
      search,
    });

    return NextResponse.json({
      success: true,
      data: queries,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const body = await req.json();

    const { id, status, adminRemarks, assignedToUserId, assignedToName } = body;

    if (!id || !status || !adminRemarks) {
      return NextResponse.json(
        { success: false, error: "Query ID, decision status, and admin remarks are required." },
        { status: 400 }
      );
    }

    const updated = await respondToQuery({
      institutionId,
      adminUserId: userId || "admin",
      queryId: id,
      status: status as QueryStatus,
      adminRemarks,
      assignedToUserId,
      assignedToName,
    });

    return NextResponse.json({
      success: true,
      message: `Query marked as ${status} and response notification dispatched to user.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
