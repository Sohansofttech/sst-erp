import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  listStudentDivisionEnrollments,
  enrollStudentConcurrentDivision,
  switchPrimaryEnrollment,
  withdrawDivisionEnrollment,
  CrossDivisionError,
} from "@/lib/services/student-cross-division.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const { id: studentId } = await params;

    const data = await listStudentDivisionEnrollments(institutionId, studentId);
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const { id: studentId } = await params;
    const body = await req.json();

    const result = await enrollStudentConcurrentDivision(institutionId, {
      studentId,
      targetDivisionId: body.targetDivisionId,
      targetClassId: body.targetClassId,
      targetAcademicYearId: body.targetAcademicYearId,
      targetSemester: body.targetSemester,
      targetSection: body.targetSection,
      isPrimary: body.isPrimary,
      remarks: body.remarks,
    });

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result.enrollment,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof CrossDivisionError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const { id: studentId } = await params;
    const body = await req.json();

    const { targetEnrollmentId } = body;
    if (!targetEnrollmentId) {
      return NextResponse.json(
        { success: false, error: "targetEnrollmentId is required." },
        { status: 400 }
      );
    }

    const result = await switchPrimaryEnrollment(institutionId, studentId, targetEnrollmentId);
    return NextResponse.json({
      success: true,
      message: result.message,
      data: result.primaryEnrollment,
    });
  } catch (error: any) {
    if (error instanceof CrossDivisionError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const { id: studentId } = await params;
    const { searchParams } = new URL(req.url);
    const enrollmentId = searchParams.get("enrollmentId");

    if (!enrollmentId) {
      return NextResponse.json(
        { success: false, error: "Query parameter 'enrollmentId' is required." },
        { status: 400 }
      );
    }

    const result = await withdrawDivisionEnrollment(institutionId, studentId, enrollmentId);
    return NextResponse.json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof CrossDivisionError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return handleAdminApiError(error);
  }
}
