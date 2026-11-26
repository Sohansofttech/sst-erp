import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import db from "@/lib/db";
import {
  calculateAttendance,
  calculateSubjectWiseAttendance,
  RawAttendanceRecord,
} from "@/lib/services/attendance-calculator";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const url = new URL(req.url);
    let requestedStudentId =
      url.searchParams.get("studentId") || session.studentId || session.activeChildId;

    if (!requestedStudentId && session.role === "STUDENT") {
      const studentRec = await db.student.findFirst({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (studentRec) {
        requestedStudentId = studentRec.id;
        session.studentId = studentRec.id;
      }
    }

    if (!requestedStudentId) {
      return NextResponse.json(
        { success: false, error: "No student ID provided or associated." },
        { status: 400 }
      );
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);

    // 1. Student details and enrollment
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: {
        institution: {
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            address: true,
            phone: true,
            email: true,
            website: true,
            city: true,
            state: true,
            country: true,
          },
        },
        enrollments: {
          include: {
            course: true,
            academicYear: true,
            class: true,
            division: { select: { id: true, name: true, code: true, type: true } },
          },
          orderBy: { enrolledDate: "desc" },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ success: false, error: "Student not found" }, { status: 404 });
    }

    if (student.enrollments && student.enrollments.length > 1) {
      student.enrollments.sort((a: any, b: any) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
    }

    const requestedDivisionId =
      url.searchParams.get("divisionId") ||
      req.headers.get("x-division-id") ||
      req.cookies.get("sst_active_division")?.value;

    let activeEnrollment = student.enrollments.find(
      (e) => e.status === "ACTIVE" && requestedDivisionId && e.divisionId === requestedDivisionId
    );

    if (!activeEnrollment) {
      activeEnrollment =
        student.enrollments.find((e) => e.status === "ACTIVE" && e.isPrimary) ||
        student.enrollments.find((e) => e.status === "ACTIVE") ||
        student.enrollments[0];
    }
    const courseName = activeEnrollment?.course?.name || "";
    const academicYearName = activeEnrollment?.academicYear?.name || "";

    // Execute independent student dashboard queries concurrently to eliminate database waterfalls
    const currentDay = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date().getDay()];

    const [
      allAttendance,
      todaySlots,
      invoices,
      upcomingExams,
      activeAssignments,
      notifications,
      allResults,
    ] = await Promise.all([
      // 2. Attendance summary
      db.attendanceRecord.findMany({
        where: { studentId, institutionId: session.institutionId },
        include: { subject: true },
      }),
      // 3. Timetable for current day
      db.timetableSlot.findMany({
        where: {
          institutionId: session.institutionId,
          semester: student.currentSemester,
          section: student.currentSection,
          dayOfWeek: (currentDay === "SUNDAY" ? "MONDAY" : currentDay) as any,
        },
        include: {
          subject: true,
          teacher: { include: { user: true } },
        },
        orderBy: { startTime: "asc" },
      }),
      // 4. Fees summary
      db.feeInvoice.findMany({
        where: { studentId, institutionId: session.institutionId },
      }),
      // 5. Upcoming Examinations
      db.examSchedule.findMany({
        where: {
          institutionId: session.institutionId,
          semester: student.currentSemester,
          isPublished: true,
        },
        include: {
          slots: { orderBy: { examDate: "asc" } },
          admitCards: { where: { studentId } },
        },
        take: 2,
      }),
      // 6. Active assignments
      db.assignment.findMany({
        where: {
          institutionId: session.institutionId,
          subject: { semester: student.currentSemester },
        },
        include: {
          subject: true,
          submissions: { where: { studentId } },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      // 7. Recent notifications
      db.notificationRecipient.findMany({
        where: {
          userId: session.userId,
          isRead: false,
        },
        include: { notification: true },
        orderBy: { notification: { createdAt: "desc" } },
        take: 5,
      }),
      // 8. Exam Results & Dynamic CGPA Calculation (STU-FE-02)
      db.examResult.findMany({
        where: { studentId, institutionId: session.institutionId },
        include: { subject: true },
        orderBy: { publishedAt: "desc" },
      }),
    ]);

    const attendanceItems: RawAttendanceRecord[] = allAttendance.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      institutionId: a.institutionId,
      subjectId: a.subjectId,
      subjectCode: a.subject?.code || "SUB",
      subjectName: a.subject?.name || "Subject",
      date: a.date,
      status: a.status,
      remarks: a.remarks,
      recordedAt: a.recordedAt,
    }));

    const attendanceCalc = calculateAttendance(attendanceItems);
    const subjectWiseAttendance = calculateSubjectWiseAttendance(attendanceItems);

    const totalOutstanding = invoices.reduce((acc, inv) => acc + inv.outstandingAmount, 0);
    const totalPaid = invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);

    const totalCredits = allResults.reduce((sum, r) => sum + r.credits, 0);
    const totalWeightedPoints = allResults.reduce((sum, r) => sum + r.gradePoint * r.credits, 0);
    const dynamicCgpa = totalCredits > 0 ? parseFloat((totalWeightedPoints / totalCredits).toFixed(2)) : 0.0;

    const recentResults = allResults.slice(0, 4);

    const isParent = session.role === "PARENT";

    return NextResponse.json({
      success: true,
      data: {
        isParent,
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          fullName: `${student.firstName} ${student.lastName || ""}`.trim() || student.fullName,
          rollNumber: student.rollNumber,
          admissionNumber: student.admissionNumber,
          currentSemester: student.currentSemester,
          currentSection: student.currentSection,
          course: courseName,
          academicYear: academicYearName,
          institutionId: student.institutionId,
          currentDivisionId: activeEnrollment?.divisionId || student.currentDivisionId,
          activeDivision: activeEnrollment?.division || null,
          className: activeEnrollment?.class?.name || null,
        },
        institution: student.institution,
        attendanceSummary: {
          totalClasses: attendanceCalc.countableSessions,
          totalRecords: attendanceCalc.totalRecords,
          attendedClasses: attendanceCalc.attendedCredits,
          absentClasses: attendanceCalc.statusCounts.absent,
          lateClasses: attendanceCalc.statusCounts.late,
          onDutyClasses: attendanceCalc.statusCounts.onDuty,
          attendancePercentage: attendanceCalc.percentage,
          formattedPercentage: attendanceCalc.formattedPercentage,
          hasData: attendanceCalc.hasData,
          displayState: attendanceCalc.displayState,
          displayLabel: attendanceCalc.displayLabel,
          isEligible: attendanceCalc.isEligible,
        },
        subjectWiseAttendance,
        todaySchedule: todaySlots.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          roomNumber: s.roomNumber,
          subjectCode: (s as any).subject?.code ?? "SUB",
          subjectName: (s as any).subject?.name ?? "Subject",
          teacherName: (s as any).teacher?.user?.fullName || "Faculty",
        })),
        feeSummary: {
          totalOutstanding,
          totalPaid,
          hasDue: totalOutstanding > 0,
        },
        // Final examinations are accessible only to students per institutional policy
        upcomingExams: isParent
          ? []
          : upcomingExams.map((e) => ({
              id: e.id,
              title: e.title,
              examType: e.examType,
              startDate: e.startDate,
              endDate: e.endDate,
              slotsCount: e.slots.length,
              hasHallTicket: e.admitCards.length > 0,
            })),
        assignments: activeAssignments.map((a) => ({
          id: a.id,
          title: a.title,
          subjectName: a.subject?.name || "Subject",
          dueDate: a.dueDate,
          isSubmitted: Array.isArray(a.submissions) && a.submissions.length > 0,
          status: a.submissions?.[0]?.status || "PENDING",
        })),
        notifications: notifications
          .filter((n) => n && n.notification)
          .map((n) => ({
            id: n.id,
            title: n.notification.title,
            message: n.notification.message,
            category: n.notification.category,
            createdAt: n.notification.createdAt,
          })),
        recentResults: isParent
          ? []
          : recentResults.map((r) => ({
              id: r.id,
              subjectCode: r.subject?.code || "SUB",
              subjectName: r.subject?.name || "Subject",
              grade: r.grade,
              totalMarks: r.totalMarks,
              isPassed: r.isPassed,
            })),
        cgpa: isParent ? undefined : dynamicCgpa,
      },
    }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    const status =
      err.name === "UnauthorizedError"
        ? 401
        : err.name === "ForbiddenError"
        ? 403
        : 500;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load dashboard" },
      { status }
    );
  }
}
