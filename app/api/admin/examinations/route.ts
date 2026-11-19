import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getExaminations,
  createExamination,
  getExamHalls,
  createExamHall,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const view = req.nextUrl.searchParams.get("view");

    if (view === "halls") {
      const halls = await getExamHalls(institutionId);
      return NextResponse.json({ success: true, data: halls });
    }

    const examinations = await getExaminations(institutionId);
    const halls = await getExamHalls(institutionId);

    return NextResponse.json({
      success: true,
      data: {
        examinations,
        halls,
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (body.type === "HALL") {
      if (!body.hallCode || !body.name || !body.capacity) {
        return NextResponse.json(
          { success: false, error: "Hall code, name, and capacity are required." },
          { status: 400 }
        );
      }
      const hall = await createExamHall(institutionId, body);
      return NextResponse.json({
        success: true,
        message: "Exam hall configured.",
        data: hall,
      });
    }

    if (!body.name || !body.academicYearId || !body.academicTermId || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, error: "Exam name, academic year, term, and date ranges are required." },
        { status: 400 }
      );
    }

    const exam = await createExamination(institutionId, {
      name: body.name,
      academicYearId: body.academicYearId,
      academicTermId: body.academicTermId,
      type: body.examType || "FINAL",
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    });

    return NextResponse.json({
      success: true,
      message: "Examination schedule created successfully.",
      data: exam,
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
      return NextResponse.json({ success: false, error: "Exam ID and status are required." }, { status: 400 });
    }

    const result = await db.examination.updateMany({
      where: { id, institutionId },
      data: { status },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Examination not found or access denied." },
        { status: 404 }
      );
    }

    const updated = await db.examination.findFirst({
      where: { id, institutionId },
    });

    return NextResponse.json({
      success: true,
      message: `Examination status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
