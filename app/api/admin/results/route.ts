import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getResultBatches,
  publishResultBatch,
  saveExamResults,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const batches = await getResultBatches(institutionId);

    return NextResponse.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    // 1. Direct exam results entry
    if (body.results && Array.isArray(body.results)) {
      if (!body.examScheduleId || !body.subjectId) {
        return NextResponse.json(
          { success: false, error: "Exam schedule ID and subject ID are required to save results." },
          { status: 400 }
        );
      }
      const saved = await saveExamResults(institutionId, {
        examScheduleId: body.examScheduleId,
        subjectId: body.subjectId,
        results: body.results,
      });
      return NextResponse.json({
        success: true,
        message: `Saved results for ${saved.count} students.`,
        data: saved,
      });
    }

    // 2. Create examination result schedule batch
    let academicYearId = body.academicYearId;
    if (!academicYearId) {
      const ay = await db.academicYear.findFirst({
        where: { institutionId },
        orderBy: { startDate: "desc" },
      });
      academicYearId = ay?.id;
    }

    const schedule = await db.examSchedule.create({
      data: {
        institutionId,
        academicYearId: academicYearId || "",
        semester: body.semester ? parseInt(body.semester, 10) : 1,
        title: body.name || body.batchName || `Semester ${body.semester || 1} Examination Results`,
        examType: body.examType || "FINAL",
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        endDate: body.endDate ? new Date(body.endDate) : new Date(),
        isPublished: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Result batch schedule created.",
      data: {
        id: schedule.id,
        institutionId: schedule.institutionId,
        name: schedule.title,
        status: "Draft",
        isPublished: false,
        totalStudents: 0,
        passedStudents: 0,
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id, action } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "Batch ID required." }, { status: 400 });
    }

    if (action === "PUBLISH" || action === "Published") {
      const updated = await publishResultBatch(institutionId, id);
      return NextResponse.json({
        success: true,
        message: "Result batch published to students and parents.",
        data: updated,
      });
    }

    if (action === "UNPUBLISH" || action === "Draft") {
      await db.examSchedule.updateMany({
        where: { id, institutionId },
        data: { isPublished: false },
      });
      return NextResponse.json({
        success: true,
        message: "Result batch unpublished and set to draft.",
      });
    }

    return NextResponse.json({
      success: true,
      message: `Result batch action ${action} completed.`,
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
      return NextResponse.json({ success: false, error: "Result batch ID required." }, { status: 400 });
    }
    await db.examSchedule.deleteMany({
      where: { id, institutionId, isPublished: false },
    });
    return NextResponse.json({ success: true, message: "Draft result batch deleted." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
