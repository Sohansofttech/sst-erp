import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const url = new URL(req.url);
    let requestedStudentId = url.searchParams.get("studentId") || session.studentId || session.activeChildId;

    if (!requestedStudentId && session.role === "STUDENT" && session.userId) {
      const studentProfile = await db.student.findFirst({
        where: { userId: session.userId },
        select: { id: true, institutionId: true },
      });
      if (studentProfile) {
        requestedStudentId = studentProfile.id;
        session.studentId = studentProfile.id;
        if (!session.institutionId) {
          session.institutionId = studentProfile.institutionId;
        }
      }
    }

    if (!requestedStudentId) {
      return NextResponse.json({ success: false, error: "Missing student ID" }, { status: 400 });
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);

    const feedbackList = await db.feedback.findMany({
      where: {
        studentId,
        institutionId: session.institutionId,
      },
      orderBy: { submittedAt: "desc" },
    });

    const res = NextResponse.json({
      success: true,
      data: feedbackList,
    });
    res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (session.role !== "STUDENT") {
      return NextResponse.json({ success: false, error: "Only students may submit feedback" }, { status: 403 });
    }

    let studentId = session.studentId;
    let institutionId = session.institutionId;

    if (!studentId && session.userId) {
      const studentProfile = await db.student.findFirst({
        where: { userId: session.userId },
        select: { id: true, institutionId: true },
      });
      if (studentProfile) {
        studentId = studentProfile.id;
        if (!institutionId) {
          institutionId = studentProfile.institutionId;
        }
      }
    }

    if (!studentId) {
      return NextResponse.json({ success: false, error: "Student profile not found" }, { status: 400 });
    }

    const { category, subject, message } = await req.json();

    if (!category || !subject || !message) {
      return NextResponse.json({ success: false, error: "Missing feedback fields" }, { status: 400 });
    }

    const feedback = await db.feedback.create({
      data: {
        institutionId,
        studentId,
        category,
        subject: String(subject).trim(),
        message: String(message).trim(),
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Feedback submitted successfully.",
      data: feedback,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
