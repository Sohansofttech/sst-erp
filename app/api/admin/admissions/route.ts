import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getAdmissions,
  createAdmissionApplication,
  updateAdmissionStatus,
} from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const applications = await getAdmissions(institutionId, status);

    return NextResponse.json({
      success: true,
      data: applications,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.applicantName || !body.email || !body.phone || !body.courseId || !body.academicYearId) {
      return NextResponse.json(
        { success: false, error: "Missing required applicant details." },
        { status: 400 }
      );
    }

    const application = await createAdmissionApplication(institutionId, body);
    return NextResponse.json({
      success: true,
      message: "Admission application registered successfully.",
      data: application,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id, status, remarks } = await req.json();

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Application ID and status are required." },
        { status: 400 }
      );
    }

    const updated = await updateAdmissionStatus(institutionId, id, status, remarks);
    return NextResponse.json({
      success: true,
      message: `Application status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
