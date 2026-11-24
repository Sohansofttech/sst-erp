import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import { submitQuery, getQueries } from "@/lib/services/query-management.service";
import db from "@/lib/db";
import { recordAudit } from "@/lib/services/audit.service";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "PARENT") {
      return NextResponse.json({ success: false, error: "Unauthorized: Parent access required." }, { status: 403 });
    }

    const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
    if (studentId) {
      await authorizeStudentOrParentAccess(session, studentId);
    }

    // 1. Fetch general queries
    const queries = await getQueries({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "PARENT",
      studentId,
    });

    // 2. Fetch leave requests from approval_requests table
    const rawLeaves = await db.approvalRequest.findMany({
      where: {
        institutionId: session.institutionId,
        userId: session.userId,
        requestType: "STUDENT_LEAVE",
      },
      orderBy: { createdAt: "desc" },
    });

    const parsedLeaves: any[] = [];
    for (const r of rawLeaves) {
      try {
        const data = JSON.parse(r.requestedDataJson);
        if (!studentId || data.studentId === studentId) {
          parsedLeaves.push({
            id: r.id,
            studentId: data.studentId,
            studentName: data.studentName,
            title: r.title,
            subject: r.title,
            description: data.reason || r.title,
            message: data.reason || r.title,
            category: "LEAVE_APPLICATION",
            requestType: "STUDENT_LEAVE",
            status: r.status, // "PENDING", "APPROVED", "REJECTED"
            adminRemarks: r.adminRemarks,
            createdAt: r.createdAt.toISOString(),
            fromDate: data.fromDate,
            toDate: data.toDate,
            daysCount: data.daysCount || 1,
            leaveType: data.leaveType || "Medical",
          });
        }
      } catch {
        // If unparseable payload, skip gracefully
      }
    }

    // Merge and sort newest first
    const combined = [...parsedLeaves, ...(Array.isArray(queries) ? queries : [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      success: true,
      data: combined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.name === "ForbiddenError" || /unauthorized|forbidden|not linked/i.test(err.message) ? 403 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "PARENT") {
      return NextResponse.json({ success: false, error: "Only parents can submit parent requests." }, { status: 403 });
    }

    const body = await req.json();
    const { studentId, requestType, category, title, message } = body;

    if (!studentId || !title || !message) {
      return NextResponse.json({ success: false, error: "Missing required fields: child, title, and message." }, { status: 400 });
    }

    // Verify parent is authorized for this child (enforces tenant and guardianLink boundary)
    const { studentId: authorizedStudentId } = await authorizeStudentOrParentAccess(session, studentId);

    const isLeave =
      requestType === "LEAVE_APPLICATION" ||
      requestType === "STUDENT_LEAVE" ||
      category === "LEAVE_APPLICATION" ||
      category === "STUDENT_LEAVE";

    if (isLeave) {
      // Fetch student details
      const student = await db.student.findUnique({
        where: { id: authorizedStudentId },
        include: {
          guardianLinks: {
            where: { isVerified: true, canAccessPortal: true },
            include: { guardianAccount: true },
          },
        },
      });

      if (!student || student.institutionId !== session.institutionId) {
        return NextResponse.json({ success: false, error: "Student not found in this institution." }, { status: 404 });
      }

      let fromDateStr = body.fromDate;
      let toDateStr = body.toDate;
      if (!fromDateStr || !toDateStr) {
        const today = new Date().toISOString().slice(0, 10);
        fromDateStr = fromDateStr || today;
        toDateStr = toDateStr || today;
      }

      const startDate = new Date(fromDateStr);
      const endDate = new Date(toDateStr);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ success: false, error: "Invalid date format for leave request." }, { status: 400 });
      }
      if (startDate > endDate) {
        return NextResponse.json({ success: false, error: "fromDate cannot be after toDate." }, { status: 400 });
      }

      const daysCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1);
      const id = crypto.randomUUID();
      const studentName = `${student.firstName} ${student.lastName}`.trim();
      const cleanLeaveType = body.leaveType || "Medical";
      const cleanTitle = title?.trim() || `${cleanLeaveType} Leave: ${fromDateStr} to ${toDateStr}`;

      const leaveData = {
        id,
        studentId: student.id,
        studentName,
        rollNo: student.rollNumber,
        className: "Class 10",
        section: student.currentSection || "A",
        leaveType: cleanLeaveType,
        fromDate: fromDateStr,
        toDate: toDateStr,
        daysCount,
        reason: message.trim(),
        guardianName: session.fullName || student.guardianLinks?.[0]?.guardianAccount?.fullName || "Parent",
        guardianPhone: student.guardianLinks?.[0]?.guardianAccount?.phone || student.emergencyContact || "",
        appliedByRole: "PARENT",
        appliedByUserId: session.userId,
        appliedAt: new Date().toISOString().slice(0, 10),
      };

      const approvalReq = await db.approvalRequest.create({
        data: {
          id,
          institutionId: session.institutionId,
          userId: session.userId,
          requestType: "STUDENT_LEAVE",
          title: cleanTitle,
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
          fromDate: fromDateStr,
          toDate: toDateStr,
          daysCount,
          source: "PARENT_PORTAL",
        },
      });

      return NextResponse.json({
        success: true,
        message: "Parent leave request submitted to teacher approval workflow.",
        data: {
          status: "PENDING",
          ...leaveData,
        },
      });
    }

    // Non-leave parent request goes to query management workflow
    const query = await submitQuery({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "PARENT",
      category: category || requestType || "GENERAL_INQUIRY",
      subject: title.trim(),
      description: message.trim(),
      studentId: authorizedStudentId,
    });

    return NextResponse.json({
      success: true,
      message: "Parent request submitted to institution admin workflow.",
      data: query,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.name === "ForbiddenError" || /unauthorized|forbidden|not linked/i.test(err.message) ? 403 : 500 }
    );
  }
}
