/**
 * ============================================================================
 * Service: lib/services/student-cross-division.service.ts
 * Description: Production-grade service for Student Cross-Division Support:
 *              1. Student progression between educational divisions (e.g. School Gr 10 -> Higher Sec Gr 11)
 *              2. Concurrent multi-division enrolments (e.g. College Degree + Academy Certification)
 *              3. Stable student identity & credential preservation
 *              4. Full historical records preservation (marks, attendance, past enrollments)
 *              5. Strict multi-tenant isolation and IDOR prevention
 * ============================================================================
 */

import db from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/session";
import { EnrollmentStatus } from "@prisma/client";

export class CrossDivisionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
    readonly code: string = "CROSS_DIVISION_ERROR"
  ) {
    super(message);
    this.name = "CrossDivisionError";
  }
}

export interface ProgressStudentDivisionInput {
  studentId: string;
  targetDivisionId: string;
  targetClassId: string;
  targetAcademicYearId: string;
  targetGradeLevel?: string;
  targetSemester?: number;
  targetSection?: string;
  promotionDecision?: string;
  remarks?: string;
}

export interface ConcurrentEnrollmentInput {
  studentId: string;
  targetDivisionId: string;
  targetClassId: string;
  targetAcademicYearId: string;
  targetSemester?: number;
  targetSection?: string;
  isPrimary?: boolean;
  remarks?: string;
}

/**
 * Executes a secure progression of a student from their current division into a new division
 * (e.g., School Grade 10 -> Higher Secondary Grade 11).
 *
 * Guarantees:
 * 1. Preserves Student.id, userId, user credentials, login, and profile.
 * 2. Archives current active primary enrollment with status "PROMOTED".
 * 3. Records historical snapshot in StudentEnrollmentHistory with source division & grade level.
 * 4. Creates a new active primary Enrollment in the target division and class.
 * 5. Updates Student.currentDivisionId, currentClassId, currentAcademicYearId.
 * 6. Existing attendance, fee invoices, and marks remain completely preserved.
 */
export async function progressStudentDivision(
  institutionId: string,
  input: ProgressStudentDivisionInput
) {
  const {
    studentId,
    targetDivisionId,
    targetClassId,
    targetAcademicYearId,
    targetGradeLevel,
    targetSemester,
    targetSection = "A",
    promotionDecision,
    remarks,
  } = input;

  if (!studentId || !targetDivisionId || !targetClassId || !targetAcademicYearId) {
    throw new CrossDivisionError(
      "Missing mandatory progression parameters: studentId, targetDivisionId, targetClassId, targetAcademicYearId.",
      400,
      "MISSING_PARAMETERS"
    );
  }

  // 1. Verify Student exists and belongs to this institution
  const student = await db.student.findFirst({
    where: { id: studentId, institutionId },
    include: {
      user: { select: { id: true, email: true, status: true } },
    },
  });

  if (!student) {
    throw new ForbiddenError("Student not found or access denied across institutions.");
  }

  // 2. Verify Target Division belongs to this institution
  const targetDivision = await db.institutionDivision.findFirst({
    where: { id: targetDivisionId, institutionId },
    select: { id: true, name: true, code: true, type: true, status: true },
  });

  if (!targetDivision) {
    throw new ForbiddenError("Target division not found or does not belong to this institution.");
  }

  if (targetDivision.status !== "ACTIVE") {
    throw new CrossDivisionError(
      `Cannot progress student into division "${targetDivision.name}" because it is currently ${targetDivision.status}.`,
      400,
      "DIVISION_INACTIVE"
    );
  }

  // 3. Verify Target Class belongs to target division and institution
  const targetClass = await db.class.findFirst({
    where: { id: targetClassId, divisionId: targetDivisionId, institutionId },
    select: { id: true, name: true, gradeLevel: true, courseId: true },
  });

  if (!targetClass) {
    throw new CrossDivisionError(
      "Target class does not belong to the selected division or institution.",
      400,
      "INVALID_TARGET_CLASS"
    );
  }

  // 4. Verify Academic Year belongs to this institution
  const targetAY = await db.academicYear.findFirst({
    where: { id: targetAcademicYearId, institutionId },
    select: { id: true, name: true, isCurrent: true },
  });

  if (!targetAY) {
    throw new CrossDivisionError(
      "Target academic year does not belong to this institution.",
      400,
      "INVALID_ACADEMIC_YEAR"
    );
  }

  const previousDivisionId = student.currentDivisionId;

  // 5. Execute Progression Transaction
  return await db.$transaction(async (tx) => {
    const now = new Date();

    // Fetch existing active primary enrollment
    const currentPrimaryEnrollment = await tx.enrollment.findFirst({
      where: {
        institutionId,
        studentId,
        isPrimary: true,
        status: "ACTIVE",
      },
    });

    if (currentPrimaryEnrollment) {
      // Archive existing primary enrollment
      await tx.enrollment.update({
        where: { id: currentPrimaryEnrollment.id },
        data: {
          status: "PROMOTED",
          completedDate: now,
          promotionRemarks:
            remarks ||
            `Successfully progressed to ${targetDivision.name} (${targetClass.name}) on ${now.toISOString().split("T")[0]}`,
        },
      });

      // Record immutable snapshot in StudentEnrollmentHistory
      await tx.studentEnrollmentHistory.create({
        data: {
          institutionId,
          divisionId: currentPrimaryEnrollment.divisionId || previousDivisionId,
          studentId,
          academicYearId: currentPrimaryEnrollment.academicYearId,
          classId: currentPrimaryEnrollment.classId || targetClassId,
          gradeLevel: targetGradeLevel || targetClass.gradeLevel || null,
          semester: currentPrimaryEnrollment.semester || null,
          status: EnrollmentStatus.ACTIVE,
          promotionDecision:
            promotionDecision || `PROGRESSED_TO_${targetDivision.type}`,
          remarks:
            remarks || `Progressed from division ${previousDivisionId || "Default"} to ${targetDivision.name}`,
        },
      });
    }

    // Ensure no other enrollments remain marked isPrimary = true
    await tx.enrollment.updateMany({
      where: { institutionId, studentId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Create new primary enrollment in target division
    const newEnrollment = await tx.enrollment.create({
      data: {
        institutionId,
        divisionId: targetDivisionId,
        studentId,
        classId: targetClassId,
        academicYearId: targetAcademicYearId,
        courseId: targetClass.courseId || null,
        semester: targetSemester || null,
        section: targetSection,
        isPrimary: true,
        status: "ACTIVE",
        enrolledDate: now,
      },
      include: {
        division: { select: { id: true, name: true, code: true, type: true } },
        class: { select: { id: true, name: true, gradeLevel: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });

    // Update Student record with new currentDivisionId and class pointers
    const updatedStudent = await tx.student.update({
      where: { id: studentId },
      data: {
        currentDivisionId: targetDivisionId,
        currentClassId: targetClassId,
        currentAcademicYearId: targetAcademicYearId,
        currentCourseId: targetClass.courseId || null,
        currentSection: targetSection,
        currentSemester: targetSemester || 1,
      },
      select: {
        id: true,
        fullName: true,
        rollNumber: true,
        admissionNumber: true,
        currentDivisionId: true,
        currentClassId: true,
        currentAcademicYearId: true,
        currentSemester: true,
        currentSection: true,
      },
    });

    return {
      success: true,
      message: `Student successfully progressed to ${targetDivision.name}.`,
      student: updatedStudent,
      newEnrollment,
      previousDivisionId,
      targetDivisionId,
    };
  });
}

/**
 * Creates a concurrent (secondary) enrollment for a student in an additional division
 * (e.g. College degree student enrolling in Academy certificate).
 */
export async function enrollStudentConcurrentDivision(
  institutionId: string,
  input: ConcurrentEnrollmentInput
) {
  const {
    studentId,
    targetDivisionId,
    targetClassId,
    targetAcademicYearId,
    targetSemester,
    targetSection = "A",
    isPrimary = false,
    remarks,
  } = input;

  if (!studentId || !targetDivisionId || !targetClassId || !targetAcademicYearId) {
    throw new CrossDivisionError(
      "Missing required fields for concurrent enrollment: studentId, targetDivisionId, targetClassId, targetAcademicYearId.",
      400,
      "MISSING_PARAMETERS"
    );
  }

  // 1. Verify Student
  const student = await db.student.findFirst({
    where: { id: studentId, institutionId },
  });
  if (!student) {
    throw new ForbiddenError("Student not found or access denied across institutions.");
  }

  // 2. Verify Target Division
  const targetDivision = await db.institutionDivision.findFirst({
    where: { id: targetDivisionId, institutionId },
    select: { id: true, name: true, code: true, type: true, status: true },
  });
  if (!targetDivision) {
    throw new ForbiddenError("Target division not found or does not belong to this institution.");
  }
  if (targetDivision.status !== "ACTIVE") {
    throw new CrossDivisionError(
      `Cannot enroll into division "${targetDivision.name}" because it is currently ${targetDivision.status}.`,
      400,
      "DIVISION_INACTIVE"
    );
  }

  // 3. Verify Target Class
  const targetClass = await db.class.findFirst({
    where: { id: targetClassId, divisionId: targetDivisionId, institutionId },
    select: { id: true, name: true, gradeLevel: true, courseId: true },
  });
  if (!targetClass) {
    throw new CrossDivisionError(
      "Target class does not belong to the selected division or institution.",
      400,
      "INVALID_TARGET_CLASS"
    );
  }

  // 4. Verify Academic Year
  const targetAY = await db.academicYear.findFirst({
    where: { id: targetAcademicYearId, institutionId },
    select: { id: true, name: true },
  });
  if (!targetAY) {
    throw new CrossDivisionError(
      "Target academic year does not belong to this institution.",
      400,
      "INVALID_ACADEMIC_YEAR"
    );
  }

  return await db.$transaction(async (tx) => {
    // Check for duplicate active enrollment in the exact same division and class
    const duplicate = await tx.enrollment.findFirst({
      where: {
        institutionId,
        studentId,
        divisionId: targetDivisionId,
        classId: targetClassId,
        status: "ACTIVE",
      },
    });

    if (duplicate) {
      throw new CrossDivisionError(
        `Student is already actively enrolled in class "${targetClass.name}" within ${targetDivision.name}.`,
        409,
        "DUPLICATE_ENROLLMENT"
      );
    }

    const now = new Date();

    if (isPrimary) {
      // Demote existing primary enrollments
      await tx.enrollment.updateMany({
        where: { institutionId, studentId, isPrimary: true },
        data: { isPrimary: false },
      });

      // Update Student's primary division pointer
      await tx.student.update({
        where: { id: studentId },
        data: {
          currentDivisionId: targetDivisionId,
          currentClassId: targetClassId,
          currentAcademicYearId: targetAcademicYearId,
          currentCourseId: targetClass.courseId || null,
        },
      });
    }

    const newEnrollment = await tx.enrollment.create({
      data: {
        institutionId,
        divisionId: targetDivisionId,
        studentId,
        classId: targetClassId,
        academicYearId: targetAcademicYearId,
        courseId: targetClass.courseId || null,
        semester: targetSemester || null,
        section: targetSection,
        isPrimary: Boolean(isPrimary),
        status: "ACTIVE",
        enrolledDate: now,
        promotionRemarks: remarks || "Concurrent multi-division enrollment",
      },
      include: {
        division: { select: { id: true, name: true, code: true, type: true } },
        class: { select: { id: true, name: true, gradeLevel: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });

    // Record in StudentEnrollmentHistory
    await tx.studentEnrollmentHistory.create({
      data: {
        institutionId,
        divisionId: targetDivisionId,
        studentId,
        academicYearId: targetAcademicYearId,
        classId: targetClassId,
        gradeLevel: targetClass.gradeLevel || null,
        status: EnrollmentStatus.ACTIVE,
        remarks: remarks || `Concurrent enrollment in ${targetDivision.name}`,
      },
    });

    return {
      success: true,
      message: `Student concurrently enrolled into ${targetDivision.name}.`,
      enrollment: newEnrollment,
    };
  });
}

/**
 * Lists all division enrollments (active and historical) for a student with division metadata.
 */
export async function listStudentDivisionEnrollments(
  institutionId: string,
  studentId: string
) {
  const student = await db.student.findFirst({
    where: { id: studentId, institutionId },
    select: { id: true, fullName: true, rollNumber: true, currentDivisionId: true },
  });

  if (!student) {
    throw new ForbiddenError("Student not found in this institution.");
  }

  const enrollments = await db.enrollment.findMany({
    where: { institutionId, studentId },
    include: {
      division: {
        select: { id: true, name: true, code: true, type: true, status: true },
      },
      class: {
        select: { id: true, name: true, gradeLevel: true, courseId: true },
      },
      academicYear: {
        select: { id: true, name: true, isCurrent: true },
      },
      course: {
        select: { id: true, name: true, code: true },
      },
      _count: {
        select: {
          attendanceRecords: true,
          assessmentRecords: true,
          feeInvoices: true,
        },
      },
    },
    orderBy: [{ isPrimary: "desc" }, { enrolledDate: "desc" }],
  });

  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");
  const pastEnrollments = enrollments.filter((e) => e.status !== "ACTIVE");

  return {
    student,
    totalEnrollments: enrollments.length,
    activeCount: activeEnrollments.length,
    primaryEnrollment: activeEnrollments.find((e) => e.isPrimary) || null,
    activeEnrollments,
    pastEnrollments,
  };
}

/**
 * Designates a specific active enrollment as the student's primary division enrollment.
 */
export async function switchPrimaryEnrollment(
  institutionId: string,
  studentId: string,
  targetEnrollmentId: string
) {
  const enrollment = await db.enrollment.findFirst({
    where: { id: targetEnrollmentId, studentId, institutionId },
    include: { class: true, division: true },
  });

  if (!enrollment) {
    throw new ForbiddenError("Enrollment not found for this student in this institution.");
  }

  if (enrollment.status !== "ACTIVE") {
    throw new CrossDivisionError(
      "Cannot set an inactive or completed enrollment as primary.",
      400,
      "INACTIVE_ENROLLMENT"
    );
  }

  return await db.$transaction(async (tx) => {
    // Demote other enrollments
    await tx.enrollment.updateMany({
      where: { institutionId, studentId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Promote target enrollment
    const updatedEnrollment = await tx.enrollment.update({
      where: { id: targetEnrollmentId },
      data: { isPrimary: true },
      include: {
        division: { select: { id: true, name: true, code: true, type: true } },
        class: { select: { id: true, name: true, gradeLevel: true } },
      },
    });

    // Synchronize Student record
    await tx.student.update({
      where: { id: studentId },
      data: {
        currentDivisionId: enrollment.divisionId,
        currentClassId: enrollment.classId,
        currentAcademicYearId: enrollment.academicYearId,
        currentCourseId: enrollment.courseId,
      },
    });

    return {
      success: true,
      message: `Primary division enrollment switched to ${enrollment.division?.name || "Target Division"}.`,
      primaryEnrollment: updatedEnrollment,
    };
  });
}

/**
 * Safely withdraws or drops a secondary enrollment without deleting attendance or marks.
 */
export async function withdrawDivisionEnrollment(
  institutionId: string,
  studentId: string,
  enrollmentId: string,
  remarks?: string
) {
  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, studentId, institutionId },
  });

  if (!enrollment) {
    throw new ForbiddenError("Enrollment not found in this institution.");
  }

  if (enrollment.isPrimary) {
    // Check if there is another active enrollment available
    const otherActive = await db.enrollment.findFirst({
      where: {
        institutionId,
        studentId,
        id: { not: enrollmentId },
        status: "ACTIVE",
      },
    });

    if (!otherActive) {
      throw new CrossDivisionError(
        "Cannot withdraw the student's only active primary enrollment without progressing or dropping the student entirely.",
        400,
        "CANNOT_WITHDRAW_SOLE_PRIMARY"
      );
    }
  }

  const updated = await db.enrollment.update({
    where: { id: enrollmentId },
    data: {
      status: "DROPPED",
      completedDate: new Date(),
      promotionRemarks: remarks || "Withdrawn from division enrollment",
    },
  });

  return {
    success: true,
    message: "Division enrollment withdrawn. Historical records preserved.",
    withdrawnEnrollmentId: updated.id,
  };
}
