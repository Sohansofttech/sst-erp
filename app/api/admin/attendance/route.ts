import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";
import { PERMISSIONS } from "@/lib/security/rbac";
import {
  getAttendanceRecords,
  markStudentAttendance,
} from "@/lib/services/institution-admin.service";
import {
  calculateAttendance,
  calculateSubjectWiseAttendance,
  calculateMonthlyAttendance,
  RawAttendanceRecord,
} from "@/lib/services/attendance-calculator";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireReadReq(req, institutionId);
    const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
    const subjectId = req.nextUrl.searchParams.get("subjectId") || undefined;
    const academicYearId = req.nextUrl.searchParams.get("academicYearId") || undefined;
    const semesterStr = req.nextUrl.searchParams.get("semester");
    const semester = semesterStr ? parseInt(semesterStr, 10) : undefined;
    const classId = req.nextUrl.searchParams.get("classId") || undefined;
    const startDateStr = req.nextUrl.searchParams.get("startDate") || undefined;
    const endDateStr = req.nextUrl.searchParams.get("endDate") || undefined;
    const dateStr = req.nextUrl.searchParams.get("date") || undefined;

    const records = await getAttendanceRecords(institutionId, {
      studentId,
      subjectId,
      academicYearId,
      semester,
      classId,
      startDate: startDateStr ? new Date(startDateStr) : undefined,
      endDate: endDateStr ? new Date(endDateStr) : undefined,
      date: dateStr ? new Date(dateStr) : undefined,
    });

    // Compute centralized attendance metrics for this filtered set
    const rawItems: RawAttendanceRecord[] = records.map((r: any) => ({
      id: r.id,
      studentId: r.studentId,
      institutionId: r.institutionId,
      subjectId: r.subjectId,
      subjectCode: r.subject?.code || "SUB",
      subjectName: r.subject?.name || "Subject",
      date: r.date,
      status: r.status,
      remarks: r.remarks,
      recordedAt: r.recordedAt,
    }));

    const metrics = calculateAttendance(rawItems);
    const subjectWise = calculateSubjectWiseAttendance(rawItems);
    const monthly = calculateMonthlyAttendance(rawItems);

    return NextResponse.json({
      success: true,
      institutionId,
      data: records,
      metrics,
      subjectWise,
      monthly,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    // 1. Direct Attendance Correction for a single record
    if (body.recordId && body.status) {
      const existing = await db.attendanceRecord.findFirst({
        where: { id: body.recordId, institutionId },
        include: { student: { select: { fullName: true, firstName: true } } },
      });

      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Attendance record not found in this institution." },
          { status: 404 }
        );
      }

      const updateResult = await db.attendanceRecord.updateMany({
        where: { id: body.recordId, institutionId },
        data: {
          status: body.status,
          remarks: body.remarks || body.reason || existing.remarks,
        },
      });
      if (updateResult.count === 0) {
        return NextResponse.json(
          { success: false, error: "Attendance record not found in this institution." },
          { status: 404 }
        );
      }
      const updated = await db.attendanceRecord.findFirst({
        where: { id: body.recordId, institutionId },
      });

      // Institutional Audit Log entry for attendance correction
      try {
        await db.auditLog.create({
          data: {
            institutionId,
            userId,
            action: "ATTENDANCE_CORRECTED",
            entityType: "ATTENDANCE_RECORD",
            entityId: body.recordId,
            newValuesJson: JSON.stringify({
              oldStatus: existing.status,
              newStatus: body.status,
              reason: body.reason,
              studentId: existing.studentId,
              studentName: existing.student?.fullName || existing.student?.firstName,
            }),
          },
        });
      } catch (auditErr: any) {
        console.warn("[POST /api/admin/attendance] Audit log warning:", auditErr.message);
      }

      return NextResponse.json({
        success: true,
        message: "Attendance record successfully corrected and logged in audit history.",
        data: updated,
      });
    }

    // 2. Batch Attendance Marking
    if (!Array.isArray(body.records) || body.records.length === 0) {
      return NextResponse.json(
        { success: false, error: "A recordId & status or an array of attendance records is required." },
        { status: 400 }
      );
    }

    const formattedRecords = body.records.map((r: any) => ({
      studentId: r.studentId,
      sectionId: r.sectionId || body.sectionId,
      subjectId: r.subjectId || body.subjectId,
      date: new Date(r.date || body.date || new Date()),
      status: r.status,
      recordedByUserId: userId,
      remarks: r.remarks,
    }));

    const results = await markStudentAttendance(institutionId, formattedRecords);

    return NextResponse.json({
      success: true,
      message: `Recorded attendance for ${results.length} students.`,
      data: results,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
