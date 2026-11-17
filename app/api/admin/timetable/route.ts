import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getTimetableSlots, createTimetableSlot } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const sectionId = req.nextUrl.searchParams.get("sectionId") || undefined;
    const slots = await getTimetableSlots(institutionId, sectionId);

    return NextResponse.json({
      success: true,
      data: slots,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.sectionId || !body.subjectId || !body.dayOfWeek || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { success: false, error: "Section, subject, day, start and end time are required." },
        { status: 400 }
      );
    }

    const slot = await createTimetableSlot(institutionId, {
      sectionId: body.sectionId,
      subjectId: body.subjectId,
      teacherId: body.teacherId,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      roomNumber: body.roomNumber || "Main Hall",
    });

    return NextResponse.json({
      success: true,
      message: "Timetable slot configured successfully.",
      data: slot,
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
      return NextResponse.json({ success: false, error: "Slot ID required." }, { status: 400 });
    }

    await db.timetableSlot.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Timetable slot removed." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
