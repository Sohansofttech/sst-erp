import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import db from "@/lib/db";
import {
  calculateAttendance,
  calculateSubjectWiseAttendance,
  calculateMonthlyAttendance,
  normalizeAttendanceStatus,
  RawAttendanceRecord,
} from "@/lib/services/attendance-calculator";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const url = new URL(req.url);
    const requestedStudentId = url.searchParams.get("studentId") || session.studentId || session.activeChildId;

    if (!requestedStudentId) {
      return NextResponse.json({ success: false, error: "Missing student ID" }, { status: 400 });
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);

    // Extract optional academic period and range filters
    const academicYearId = url.searchParams.get("academicYearId") || undefined;
    const semesterParam = url.searchParams.get("semester");
    const semester = semesterParam ? parseInt(semesterParam, 10) : undefined;
    const subjectId = url.searchParams.get("subjectId") || undefined;
    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;

    // Construct robust Prisma query where clause
    const whereClause: any = {
      studentId,
      institutionId: session.institutionId,
    };

    if (subjectId) {
      whereClause.subjectId = subjectId;
    }

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.date.lte = new Date(endDate);
      }
    }

    if (academicYearId || semester) {
      whereClause.enrollment = {};
      if (academicYearId) {
        whereClause.enrollment.academicYearId = academicYearId;
      }
      if (semester && !isNaN(semester)) {
        whereClause.enrollment.semester = semester;
      }
    }

    // Retrieve attendance records scoped by student, tenant and filters
    const records = await db.attendanceRecord.findMany({
      where: whereClause,
      include: {
        subject: true,
      },
      orderBy: { date: "desc" },
    });

    // Map database records to normalized calculation items
    const rawItems: RawAttendanceRecord[] = records.map((r) => ({
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

    // Centralized calculations
    const calc = calculateAttendance(rawItems);
    const subjectWise = calculateSubjectWiseAttendance(rawItems);
    const monthlyAttendance = calculateMonthlyAttendance(rawItems);

    // Absence history - only legitimate unexcused absences and late arrivals
    const absenceHistory = records
      .filter((r) => {
        const norm = normalizeAttendanceStatus(r.status);
        return norm.standardStatus === "ABSENT" || norm.standardStatus === "LATE";
      })
      .map((r) => ({
        id: r.id,
        date: r.date,
        subjectCode: r.subject?.code || "SUB",
        subjectName: r.subject?.name || "Subject",
        status: r.status,
        remarks: r.remarks || "No remarks logged",
      }));

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalClasses: calc.countableSessions,
          totalRecords: calc.totalRecords,
          attendedClasses: calc.attendedCredits,
          absentClasses: calc.statusCounts.absent,
          lateClasses: calc.statusCounts.late,
          onDutyClasses: calc.statusCounts.onDuty,
          halfDayClasses: calc.statusCounts.halfDay,
          excusedClasses: calc.statusCounts.excused,
          leaveClasses: calc.statusCounts.onLeave,
          overallPercentage: calc.percentage, // number | null (never defaults to 100)
          formattedPercentage: calc.formattedPercentage,
          hasData: calc.hasData,
          displayState: calc.displayState,
          displayLabel: calc.displayLabel,
          isEligible: calc.isEligible,
          shortfallPercentage: calc.shortfallPercentage,
        },
        subjectWise,
        monthlyAttendance,
        dailyHistory: records.map((r) => ({
          id: r.id,
          date: r.date,
          subjectCode: r.subject?.code || "SUB",
          subjectName: r.subject?.name || "Subject",
          status: r.status,
          remarks: r.remarks,
        })),
        absenceHistory,
      },
    }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch attendance" },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}
