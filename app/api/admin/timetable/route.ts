import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getTimetableSlots, createTimetableSlot } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const sectionId = req.nextUrl.searchParams.get("sectionId") || undefined;
    const dayOfWeek = req.nextUrl.searchParams.get("dayOfWeek") || undefined;
    const courseId = req.nextUrl.searchParams.get("courseId") || req.nextUrl.searchParams.get("classId") || undefined;

    const isUuid = (val?: string | null) =>
      typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    const where: any = {
      institutionId,
      ...(courseId ? { courseId } : {}),
    };

    if (sectionId) {
      if (isUuid(sectionId)) {
        where.sectionId = sectionId;
      } else {
        where.section = sectionId;
      }
    }

    if (dayOfWeek) {
      where.dayOfWeek = dayOfWeek.toUpperCase() as any;
    }

    const slots = await db.timetableSlot.findMany({
      where,
      include: {
        subject: true,
        teacher: {
          include: {
            user: true,
          },
        },
        course: true,
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({
      success: true,
      institutionId,
      data: slots,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (!body.subjectId || !body.dayOfWeek || !body.startTime || !body.endTime) {
      return NextResponse.json(
        { success: false, error: "Subject, day, start and end time are required." },
        { status: 400 }
      );
    }

    const normDay = body.dayOfWeek.toUpperCase().trim();

    // 1. Validate subject ownership
    const subject = await db.subject.findFirst({
      where: { id: body.subjectId, institutionId },
    });
    if (!subject) {
      return NextResponse.json(
        { success: false, error: "Subject not found in this institution." },
        { status: 400 }
      );
    }

    // 2. Resolve and validate teacher ownership
    let resolvedTeacherId: string | null = null;
    if (body.teacherId) {
      let teacher = await db.teacher.findFirst({
        where: { id: body.teacherId, institutionId },
      });
      if (!teacher) {
        teacher = await db.teacher.findFirst({
          where: { userId: body.teacherId, institutionId },
        });
      }
      if (!teacher) {
        return NextResponse.json(
          { success: false, error: "Teacher not found in this institution." },
          { status: 400 }
        );
      }
      resolvedTeacherId = teacher.id;

      // 3. Check for conflict: teacher already booked at this time slot
      const teacherConflict = await db.timetableSlot.findFirst({
        where: {
          institutionId,
          teacherId: resolvedTeacherId,
          dayOfWeek: normDay as any,
          startTime: body.startTime,
        },
        include: { subject: true },
      });

      if (teacherConflict) {
        return NextResponse.json(
          {
            success: false,
            error: `Scheduling conflict: Faculty is already assigned to ${teacherConflict.subject?.name || "another class"} on ${body.dayOfWeek} at ${body.startTime}.`,
          },
          { status: 409 }
        );
      }
    }

    // 4. Check for room conflict if room specified
    if (body.roomNumber && body.roomNumber !== "Main Hall") {
      const roomConflict = await db.timetableSlot.findFirst({
        where: {
          institutionId,
          roomNumber: body.roomNumber.trim(),
          dayOfWeek: normDay as any,
          startTime: body.startTime,
        },
      });

      if (roomConflict) {
        return NextResponse.json(
          {
            success: false,
            error: `Room conflict: Room ${body.roomNumber} is already occupied on ${body.dayOfWeek} at ${body.startTime}.`,
          },
          { status: 409 }
        );
      }
    }

    const slot = await createTimetableSlot(institutionId, {
      sectionId: body.sectionId || undefined,
      section: body.section || body.sectionId || "A",
      subjectId: body.subjectId,
      teacherId: resolvedTeacherId || undefined,
      dayOfWeek: normDay as any,
      startTime: body.startTime,
      endTime: body.endTime,
      roomNumber: body.roomNumber || "Main Hall",
      courseId: body.courseId || subject.courseId || undefined,
      semester: body.semester || subject.semester || 1,
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
    await requireWriteReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Slot ID required." }, { status: 400 });
    }

    const result = await db.timetableSlot.deleteMany({
      where: { id, institutionId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Timetable slot not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Timetable slot removed." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
