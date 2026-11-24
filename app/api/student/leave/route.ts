import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import db from "@/lib/db";
import { recordAudit } from "@/lib/services/audit.service";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    const url = new URL(req.url);
    const requestedStudentId =
      url.searchParams.get("studentId") || session.studentId || session.activeChildId;

    if (!requestedStudentId) {
      return NextResponse.json(
        { success: false, error: "Student ID is required." },
        { status: 400 }
      );
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);

    // Query approval_requests for STUDENT_LEAVE scoped strictly to this institution
    const rawRequests = await db.approvalRequest.findMany({
      where: {
        institutionId: session.institutionId,
        requestType: "STUDENT_LEAVE",
      },
      orderBy: { createdAt: "desc" },
    });

    const studentLeaves: any[] = [];
    for (const r of rawRequests) {
      try {
        const data = JSON.parse(r.requestedDataJson);
        if (data.studentId === studentId) {
          studentLeaves.push({
            id: r.id,
            institutionId: r.institutionId,
            studentId: data.studentId,
            studentName: data.studentName,
            rollNo: data.rollNo,
            className: data.className || "Class 10",
            section: data.section || "A",
            leaveType: data.leaveType || "Medical",
            fromDate: data.fromDate,
            toDate: data.toDate,
            daysCount: data.daysCount || 1,
            reason: data.reason,
            guardianName: data.guardianName,
            guardianPhone: data.guardianPhone,
            appliedByRole: data.appliedByRole || "STUDENT",
            appliedAt: r.createdAt.toISOString().slice(0, 10),
            status: (r.status.toLowerCase() as "pending" | "approved" | "rejected") || "pending",
            adminRemarks: r.adminRemarks,
            reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
          });
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      data: studentLeaves,
    }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    const isAuth = err.name === "UnauthorizedError" || /authentication|deactivated|suspended/i.test(err.message);
    const isForbidden = err.name === "ForbiddenError" || /unauthorized|forbidden|access denied/i.test(err.message);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch student leave requests" },
      { status: isAuth ? 401 : isForbidden ? 403 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "STUDENT" && session.role !== "PARENT") {
      return NextResponse.json(
        { success: false, error: "Only students or authorized parents may submit student leave requests." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { fromDate, toDate, leaveType, reason, attachmentUrl } = body;
    const targetStudentId = body.studentId || session.studentId;

    if (!targetStudentId) {
      return NextResponse.json(
        { success: false, error: "Student ID is required." },
        { status: 400 }
      );
    }

    if (!fromDate || !toDate || !reason) {
      return NextResponse.json(
        { success: false, error: "fromDate, toDate, and reason are required." },
        { status: 400 }
      );
    }

    // Authorize student or parent
    const { studentId, isParent } = await authorizeStudentOrParentAccess(session, targetStudentId);

    // Validate dates
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Invalid date format for leave request." },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { success: false, error: "fromDate cannot be after toDate." },
        { status: 400 }
      );
    }

    const daysCount = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1
    );

    // Fetch student info
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: {
        guardianLinks: {
          where: { isVerified: true, canAccessPortal: true },
          include: { guardianAccount: true },
        },
      },
    });

    if (!student || student.institutionId !== session.institutionId) {
      return NextResponse.json(
        { success: false, error: "Student not found in this institution." },
        { status: 404 }
      );
    }

    const guardianLink = student.guardianLinks?.[0];
    const guardianName = isParent
      ? session.fullName || "Parent"
      : guardianLink?.guardianAccount?.fullName || "Guardian";
    const guardianPhone = isParent
      ? undefined
      : guardianLink?.guardianAccount?.phone || student.emergencyContact || "";

    const id = crypto.randomUUID();
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const cleanLeaveType = leaveType || "Medical";
    const title = `${cleanLeaveType} Leave: ${fromDate} to ${toDate} (${daysCount} days)`;

    const leaveData = {
      id,
      studentId: student.id,
      studentName,
      rollNo: student.rollNumber,
      className: "Class 10",
      section: student.currentSection || "A",
      leaveType: cleanLeaveType,
      fromDate,
      toDate,
      daysCount,
      reason: reason.trim(),
      guardianName,
      guardianPhone,
      attachmentUrl: attachmentUrl || undefined,
      appliedByRole: session.role,
      appliedByUserId: session.userId,
      appliedAt: new Date().toISOString().slice(0, 10),
    };

    const request = await db.approvalRequest.create({
      data: {
        id,
        institutionId: session.institutionId,
        userId: session.userId,
        requestType: "STUDENT_LEAVE",
        title,
        status: "PENDING",
        requestedDataJson: JSON.stringify(leaveData),
      },
    });

    await recordAudit({
      institutionId: session.institutionId,
      actorUserId: session.userId,
      action: "CREATE",
      entityType: "STUDENT_LEAVE",
      entityId: id,
      newValues: {
        studentId: student.id,
        leaveType: cleanLeaveType,
        fromDate,
        toDate,
        daysCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Student leave request submitted for class teacher approval.",
      data: {
        status: "pending",
        ...leaveData,
      },
    });
  } catch (err: any) {
    const isAuth = err.name === "UnauthorizedError" || /authentication|deactivated|suspended/i.test(err.message);
    const isForbidden = err.name === "ForbiddenError" || /unauthorized|forbidden|access denied/i.test(err.message);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to submit leave request" },
      { status: isAuth ? 401 : isForbidden ? 403 : 500 }
    );
  }
}
