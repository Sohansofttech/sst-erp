import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getAdmissions,
  createAdmissionApplication,
  updateAdmissionStatus,
  updateAdmissionApplication,
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

    const name = body.applicantName || `${body.applicantFirstName || ""} ${body.applicantLastName || ""}`.trim();
    if (!name || !body.email || !body.phone || !body.courseId || !body.academicYearId) {
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
    const body = await req.json();
    const { id, status, remarks, ...details } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Application ID is required." },
        { status: 400 }
      );
    }

    // If only status change is requested
    if (status && Object.keys(details).length === 0) {
      const updated = await updateAdmissionStatus(institutionId, id, status, remarks);
      return NextResponse.json({
        success: true,
        message: `Application status updated to ${status}.`,
        data: updated,
      });
    }

    // Full application edit / update
    const updated = await updateAdmissionApplication(institutionId, id, {
      ...details,
      ...(status ? { status } : {}),
      ...(remarks !== undefined ? { remarks } : {}),
    });

    return NextResponse.json({
      success: true,
      message: "Application details updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  return PUT(req);
}
