import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, requireActiveSubscription, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getApprovalRequests,
  processApprovalRequest,
} from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const requests = await getApprovalRequests(institutionId, status);

    return NextResponse.json({
      success: true,
      data: requests,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId } = await requireActiveSubscription(req);
    const { id, status, adminRemarks } = await req.json();

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Request ID and decision status are required." },
        { status: 400 }
      );
    }

    const updated = await processApprovalRequest(
      institutionId,
      id,
      status as any,
      adminRemarks,
      userId
    );

    return NextResponse.json({
      success: true,
      message: `Approval request marked as ${status}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
