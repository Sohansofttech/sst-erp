import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getCampusServicesOverview,
  updateResourceBookingStatus,
} from "@/lib/services/institution-admin.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const overview = await getCampusServicesOverview(institutionId);

    return NextResponse.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { bookingId, status } = body;

    if (!bookingId || !status) {
      return NextResponse.json(
        { success: false, error: "Booking ID and status are required." },
        { status: 400 }
      );
    }

    const updated = await updateResourceBookingStatus(institutionId, bookingId, status);

    return NextResponse.json({
      success: true,
      message: `Resource reservation marked as ${status}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
