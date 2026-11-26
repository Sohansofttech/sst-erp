import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    // SEC-02: Enforce strict PARENT role check. Reject student sessions from accessing sibling/child records.
    if ((session.role as string) !== "PARENT" && (session.role as string) !== "GUARDIAN") {
      return NextResponse.json(
        { success: false, error: "Access denied: Only parent/guardian accounts are permitted to access the children directory." },
        { status: 403 }
      );
    }

    let guardianAccountId = session.guardianId;

    // Resolve guardian account strictly associated with the authenticated parent user
    if (!guardianAccountId && session.userId) {
      const guardianAccount = await db.guardianAccount.findFirst({
        where: {
          userId: session.userId,
          institutionId: session.institutionId,
        },
        select: { id: true },
      });
      if (guardianAccount) {
        guardianAccountId = guardianAccount.id;
      }
    }

    if (!guardianAccountId) {
      return NextResponse.json(
        { success: false, error: "No verified guardian account associated with authenticated parent." },
        { status: 403 }
      );
    }

    // Retrieve only children actively linked and verified to this parent in this institution
    const links = await db.guardianLink.findMany({
      where: {
        guardianAccountId: guardianAccountId,
        institutionId: session.institutionId,
        isVerified: true,
        canAccessPortal: true,
      },
      include: {
        student: {
          include: {
            currentDivision: {
              select: { id: true, name: true, code: true, type: true },
            },
            enrollments: {
              include: {
                division: { select: { id: true, name: true, code: true, type: true } },
                class: { select: { id: true, name: true, gradeLevel: true } },
                course: true,
                academicYear: true,
              },
              orderBy: { enrolledDate: "desc" },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: links.map((link) => {
        const activeEnrollments = link.student.enrollments.filter((e) => e.status === "ACTIVE");
        const activeEnrollment =
          activeEnrollments.find((e) => e.isPrimary) || activeEnrollments[0] || link.student.enrollments[0];

        return {
          linkId: link.id,
          relationship: link.relationship,
          isPrimary: link.isPrimary,
          student: {
            id: link.student.id,
            firstName: link.student.firstName,
            lastName: link.student.lastName,
            fullName: `${link.student.firstName} ${link.student.lastName}`.trim(),
            rollNumber: link.student.rollNumber,
            admissionNumber: link.student.admissionNumber,
            currentSemester: link.student.currentSemester,
            currentSection: link.student.currentSection,
            currentDivisionId: link.student.currentDivisionId,
            currentDivision: link.student.currentDivision,
            courseName: activeEnrollment?.course?.name || "",
            className: activeEnrollment?.class?.name || "",
            academicYear: activeEnrollment?.academicYear?.name || "",
            status: link.student.status,
            activeDivisions: activeEnrollments.map((e) => ({
              enrollmentId: e.id,
              divisionId: e.divisionId,
              divisionName: e.division?.name || "Standard Division",
              divisionCode: e.division?.code || "DIV",
              divisionType: e.division?.type || "COLLEGE",
              className: e.class?.name || "",
              isPrimary: e.isPrimary,
            })),
          },
        };
      }),
    });
  } catch (err: any) {
    const isForbidden = err.name === "ForbiddenError" || err.status === 403;
    const isUnauthorized = err.name === "UnauthorizedError" || err.status === 401;
    return NextResponse.json(
      { success: false, error: err.message },
      { status: isForbidden ? 403 : isUnauthorized ? 401 : 500 }
    );
  }
}
