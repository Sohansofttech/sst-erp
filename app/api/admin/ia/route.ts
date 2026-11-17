import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getIAAssessments, createIAAssessment } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const assessments = await getIAAssessments(institutionId);

    return NextResponse.json({
      success: true,
      data: assessments,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.name || !body.courseId || !body.academicYearId || !body.academicTermId) {
      return NextResponse.json(
        { success: false, error: "Assessment name, course, academic year, and term are required." },
        { status: 400 }
      );
    }

    const assessment = await createIAAssessment(institutionId, {
      name: body.name,
      courseId: body.courseId,
      academicYearId: body.academicYearId,
      academicTermId: body.academicTermId,
      maxMarks: parseFloat(body.maxMarks || "50"),
      weightagePercentage: parseFloat(body.weightagePercentage || "20"),
      components: body.components,
    });

    return NextResponse.json({
      success: true,
      message: "Internal Assessment configuration created successfully.",
      data: assessment,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ success: false, error: "Assessment ID and status required." }, { status: 400 });
    }

    const updated = await db.iAAssessment.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      message: `Assessment status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
