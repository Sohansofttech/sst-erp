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
        user: { select: { email: true, phone: true, avatarUrl: true, fullName: true } },
        documents: true,
        guardianLinks: {
          include: {
            guardianAccount: {
              include: { user: { select: { email: true, phone: true } } },
            },
          },
        },
        enrollments: {
          include: { course: true, academicYear: true },
          orderBy: { semester: "desc" },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ success: false, error: "Student not found" }, { status: 404 });
    }

    let institution: any = student.institution;
    if (!institution && (student.institutionId || session.institutionId)) {
      const instId = student.institutionId || session.institutionId;
      institution = await db.institution.findUnique({
        where: { id: instId },
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
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...student,
        institution,
      },
    }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch profile" },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}
