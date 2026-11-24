import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const url = new URL(req.url);
    const requestedStudentId = url.searchParams.get("studentId") || session.studentId || session.activeChildId;

    if (!requestedStudentId) {
      return NextResponse.json({ success: false, error: "Missing student ID" }, { status: 400 });
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);

    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { currentSemester: true },
    });

    if (!student) {
      return NextResponse.json({ success: false, error: "Student not found" }, { status: 404 });
    }

    const assignments = await db.assignment.findMany({
      where: {
        institutionId: session.institutionId,
        subject: { semester: student.currentSemester },
      },
      include: {
        subject: true,
        submissions: { where: { studentId } },
      },
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: assignments.map((a) => {
        const sub = a.submissions[0] || null;
        return {
          id: a.id,
          title: a.title,
          description: a.description,
          dueDate: a.dueDate,
          totalPoints: a.totalPoints,
          attachmentUrl: a.attachmentUrl,
          subjectId: a.subjectId,
          subjectCode: a.subject.code,
          subjectName: a.subject.name,
          submissionStatus: sub ? sub.status : "PENDING",
          submission: sub
            ? {
                id: sub.id,
                fileUrl: sub.fileUrl,
                textContent: sub.textContent,
                submittedAt: sub.submittedAt,
                score: sub.score,
                feedback: sub.feedback,
                status: sub.status,
              }
            : null,
        };
      }),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch assignments" },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "STUDENT" || !session.studentId) {
      return NextResponse.json(
        { success: false, error: "Only students with an active profile can submit assignments." },
        { status: 403 }
      );
    }

    const studentId = session.studentId;
    const body = await req.json();
    const { assignmentId, textContent, fileUrl } = body;

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: "Assignment ID is required." },
        { status: 400 }
      );
    }

    // Verify assignment belongs to student's institution
    const assignment = await db.assignment.findFirst({
      where: { id: assignmentId, institutionId: session.institutionId },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Assignment not found or does not belong to your institution." },
        { status: 404 }
      );
    }

    const isLate = new Date() > new Date(assignment.dueDate);

    const submission = await db.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId,
        },
      },
      update: {
        textContent: textContent || undefined,
        fileUrl: fileUrl || undefined,
        submittedAt: new Date(),
        status: isLate ? "LATE" : "SUBMITTED",
      },
      create: {
        institutionId: session.institutionId,
        assignmentId,
        studentId,
        textContent,
        fileUrl,
        submittedAt: new Date(),
        status: isLate ? "LATE" : "SUBMITTED",
      },
    });

    return NextResponse.json({
      success: true,
      message: isLate ? "Assignment submitted (Late)." : "Assignment submitted successfully.",
      data: submission,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to submit assignment" },
      { status: 500 }
    );
  }
}
