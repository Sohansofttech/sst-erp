import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import db from "@/lib/db";
import {
  getAdmissions,
  createAdmissionApplication,
  updateAdmissionStatus,
  convertAdmissionApplicationToStudent,
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
    const body = await req.json();
    const { status, remarks, action, classId, sectionId, rollNumber } = body;
    const targetId = body.id || body.applicationId;

    if (!targetId) {
      return NextResponse.json(
        { success: false, error: "Application ID is required." },
        { status: 400 }
      );
    }

    if (action === "CONVERT" || status === "ENROLLED" || status === "Enrolled") {
      const conversion = await convertAdmissionApplicationToStudent(institutionId, targetId, {
        classId,
        sectionId,
        rollNumber,
      });
      return NextResponse.json({
        success: true,
        message: conversion.message,
        data: conversion,
      });
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Application status is required." },
        { status: 400 }
      );
    }

    const updated = await updateAdmissionStatus(institutionId, targetId, status, remarks);
    return NextResponse.json({
      success: true,
      message: `Application status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Application ID is required." }, { status: 400 });
    }
    const result = await db.admissionApplication.deleteMany({
      where: { id, institutionId, convertedStudentId: null },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Application not found, already converted, or access denied." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: "Application deleted successfully." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
