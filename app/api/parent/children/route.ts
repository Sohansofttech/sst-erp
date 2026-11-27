import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    // SEC-02: Enforce strict PARENT/GUARDIAN role check. Reject student sessions from accessing sibling/child records.
    const session = await requireRole(req, ["PARENT", "GUARDIAN"]);

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
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            admissionNumber: true,
            currentSemester: true,
            currentSection: true,
            currentDivisionId: true,
            status: true,
            currentDivision: {
              select: { id: true, name: true, code: true, type: true },
            },
            enrollments: {
              select: {
                id: true,
                status: true,
                isPrimary: true,
                divisionId: true,
                division: { select: { id: true, name: true, code: true, type: true } },
                class: { select: { id: true, name: true, gradeLevel: true } },
                course: { select: { name: true } },
                academicYear: { select: { name: true } },
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
    const status = err instanceof UnauthorizedError ? 401 : err instanceof ForbiddenError ? 403 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
