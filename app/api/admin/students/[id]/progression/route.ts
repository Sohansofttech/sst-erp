import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  progressStudentDivision,
  CrossDivisionError,
} from "@/lib/services/student-cross-division.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id: studentId } = await params;
    const body = await req.json();

    const {
      targetDivisionId,
      targetClassId,
      targetAcademicYearId,
      targetGradeLevel,
      targetSemester,
      targetSection,
      promotionDecision,
      remarks,
    } = body;

    const result = await progressStudentDivision(institutionId, {
      studentId,
      targetDivisionId,
      targetClassId,
      targetAcademicYearId,
      targetGradeLevel,
      targetSemester,
      targetSection,
      promotionDecision,
      remarks,
    });

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        data: result,
      },
      { status: 200 }
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
