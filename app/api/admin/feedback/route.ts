import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getStudentFeedbacks,
  updateStudentFeedback,
} from "@/lib/services/institution-admin.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const feedbacks = await getStudentFeedbacks(institutionId, status);

    const res = NextResponse.json({
      success: true,
      data: feedbacks,
    });
    res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
    return res;
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const { id, status, response } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Feedback record ID is required." },
        { status: 400 }
      );
    }

    const updated = await updateStudentFeedback(
      institutionId,
      id,
      { status, response },
      userId
    );

    return NextResponse.json({
      success: true,
      message: "Student grievance status and response updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

