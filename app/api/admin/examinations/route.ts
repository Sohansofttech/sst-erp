import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getExaminations,
  createExamination,
  createExamSlot,
  updateExaminationStatus,
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

    if (body.type === "SLOT") {
      if (!body.examScheduleId || !body.subjectCode || !body.subjectName || !body.examDate || !body.startTime || !body.endTime || !body.roomNumber) {
        return NextResponse.json(
          { success: false, error: "Schedule ID, subject code/name, date, start/end time, and room number are required." },
          { status: 400 }
        );
      }
      const slot = await createExamSlot(institutionId, {
        examScheduleId: body.examScheduleId,
        subjectCode: body.subjectCode,
        subjectName: body.subjectName,
        examDate: body.examDate,
        startTime: body.startTime,
        endTime: body.endTime,
        roomNumber: body.roomNumber,
      });
      return NextResponse.json({
        success: true,
        message: "Examination slot scheduled successfully.",
        data: slot,
      });
    }

    if (!body.name || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, error: "Exam name and start/end dates are required." },
        { status: 400 }
      );
    }

    let academicYearId = body.academicYearId;
    if (!academicYearId) {
      const ay = await db.academicYear.findFirst({
        where: { institutionId },
        orderBy: { startDate: "desc" },
      });
      academicYearId = ay?.id;
    }

    const exam = await createExamination(institutionId, {
      name: body.name,
      academicYearId: academicYearId || "",
      academicTermId: body.academicTermId || academicYearId,
      semester: body.semester ? parseInt(body.semester, 10) : 1,
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

    const updated = await updateExaminationStatus(institutionId, id, status);

    return NextResponse.json({
      success: true,
      message: `Examination status updated to ${status}.`,
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
    const type = req.nextUrl.searchParams.get("type");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID required." }, { status: 400 });
    }

    if (type === "HALL") {
      await db.examHall.deleteMany({ where: { id, institutionId } });
      return NextResponse.json({ success: true, message: "Exam hall deleted." });
    }

    const res = await db.examSchedule.deleteMany({ where: { id, institutionId } });
    if (res.count === 0) {
      return NextResponse.json(
        { success: false, error: "Examination not found or access denied." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: "Examination deleted." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
