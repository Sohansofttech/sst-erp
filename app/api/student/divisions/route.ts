import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import { listStudentDivisionEnrollments } from "@/lib/services/student-cross-division.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const url = new URL(req.url);
    let requestedStudentId = url.searchParams.get("studentId") || session.studentId || session.activeChildId;

    if (!requestedStudentId && session.role === "STUDENT") {
      const studentRec = await db.student.findFirst({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (studentRec) requestedStudentId = studentRec.id;
    }

    if (!requestedStudentId) {
      return NextResponse.json({ success: false, error: "No student ID associated." }, { status: 400 });
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);
    const data = await listStudentDivisionEnrollments(session.institutionId, studentId);

    const cookieDivId = req.cookies.get("sst_active_division")?.value;
    let activeEnrollment = data.activeEnrollments.find((e) => e.divisionId === cookieDivId);

    if (!activeEnrollment) {
      activeEnrollment = data.primaryEnrollment || data.activeEnrollments[0] || null;
    }

    return NextResponse.json({
      success: true,
      studentId,
      hasMultipleDivisions: data.activeEnrollments.length > 1,
      activeDivisionId: activeEnrollment?.divisionId || null,
      activeDivision: activeEnrollment?.division || null,
      activeEnrollment: activeEnrollment || null,
      enrollments: data.activeEnrollments.map((e) => ({
        enrollmentId: e.id,
        divisionId: e.divisionId,
        divisionName: e.division?.name || "Standard Division",
        divisionCode: e.division?.code || "DIV",
        divisionType: e.division?.type || "COLLEGE",
        isPrimary: e.isPrimary,
        className: e.class?.name || "Active Class",
        academicYear: e.academicYear?.name || "",
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.name === "ForbiddenError" ? 403 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const body = await req.json();
    const { divisionId, studentId: targetStudentId } = body;

    if (!divisionId) {
      return NextResponse.json({ success: false, error: "divisionId is required" }, { status: 400 });
    }

    let effectiveStudentId = targetStudentId || session.studentId || session.activeChildId;
    if (!effectiveStudentId && session.role === "STUDENT") {
      const studentRec = await db.student.findFirst({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (studentRec) effectiveStudentId = studentRec.id;
    }

    if (!effectiveStudentId) {
      return NextResponse.json({ success: false, error: "No student ID associated." }, { status: 400 });
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, effectiveStudentId);

    // Verify student is actually actively enrolled in target division
    const enrollment = await db.enrollment.findFirst({
      where: {
        institutionId: session.institutionId,
        studentId,
        divisionId,
        status: "ACTIVE",
      },
      include: {
        division: { select: { id: true, name: true, type: true } },
      },
    });

    if (!enrollment) {
      return NextResponse.json(
        { success: false, error: "Security Violation: Student does not have an active enrollment in this division." },
        { status: 403 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Active division view switched successfully.",
      activeDivisionId: divisionId,
      divisionName: enrollment.division?.name,
    });

    response.cookies.set({
      name: "sst_active_division",
      value: divisionId,
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.name === "ForbiddenError" ? 403 : 500 });
  }
}
