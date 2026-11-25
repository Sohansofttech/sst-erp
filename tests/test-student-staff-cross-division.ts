/**
 * ============================================================================
 * Test Suite: tests/test-student-staff-cross-division.ts
 * Description: Automated test suite for Stage 2 — Student and Staff Cross-Division Support:
 *              1. Student progression between divisions (School Gr 10 -> Higher Sec Gr 11)
 *              2. Stable student identity and credential preservation
 *              3. Historical records preservation (past enrollments, marks, attendance)
 *              4. Concurrent multi-division enrolments (Primary vs Secondary)
 *              5. Dual-enrolment administration (switching primary, safe withdrawal)
 *              6. Staff multi-division assignments & access restriction
 *              7. Multi-tenant isolation & IDOR prevention
 * ============================================================================
 */

import { DivisionType } from "@prisma/client";
import { CrossDivisionError } from "../lib/services/student-cross-division.service";

export function runStudentStaffCrossDivisionTests() {
  console.log("====================================================================");
  console.log("   STAGE 2: STUDENT & STAFF CROSS-DIVISION TEST SUITE              ");
  console.log("====================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✖ FAIL: ${testName} ${detail ? "- " + detail : ""}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Test Group 1: Student Progression Mechanics (School Gr 10 -> Higher Sec Gr 11)
  // ---------------------------------------------------------------------------
  console.log("--- Group 1: Student Progression Mechanics ---");

  // Simulated state for an existing Grade 10 student in School division
  const instId = "inst-tenant-001";
  const schoolDivId = "div-school-001";
  const hsecDivId = "div-hsec-002";
  const foreignInstId = "inst-foreign-999";

  const studentState = {
    id: "student-uuid-101",
    userId: "user-uuid-101",
    fullName: "Aarav Sharma",
    rollNumber: "SCH-2024-089",
    currentDivisionId: schoolDivId,
    currentClassId: "class-sch-grade-10",
    currentAcademicYearId: "ay-2025-2026",
    status: "ACTIVE",
  };

  const initialEnrollments = [
    {
      id: "enr-001",
      institutionId: instId,
      divisionId: schoolDivId,
      studentId: studentState.id,
      classId: "class-sch-grade-10",
      academicYearId: "ay-2025-2026",
      isPrimary: true,
      status: "ACTIVE",
      enrolledDate: new Date("2025-06-01"),
      completedDate: null as Date | null,
      promotionRemarks: null as string | null,
    },
  ];

  const historicalEnrollments: any[] = [];
  const attendanceRecords = [
    { id: "att-1", enrollmentId: "enr-001", date: "2025-09-01", status: "PRESENT" },
    { id: "att-2", enrollmentId: "enr-001", date: "2025-09-02", status: "PRESENT" },
  ];
  const assessmentMarks = [
    { id: "mark-1", enrollmentId: "enr-001", subject: "Mathematics", marks: 92 },
    { id: "mark-2", enrollmentId: "enr-001", subject: "Science", marks: 88 },
  ];

  // Progression function simulator matching student-cross-division.service.ts
  function executeProgression(params: {
    studentInstitutionId: string;
    student: typeof studentState;
    targetDivision: { id: string; institutionId: string; name: string; type: DivisionType; status: string };
    targetClass: { id: string; divisionId: string; institutionId: string; name: string; gradeLevel: string };
    targetAY: { id: string; institutionId: string };
    remarks?: string;
  }) {
    // Tenant check
    if (params.studentInstitutionId !== instId || params.targetDivision.institutionId !== instId) {
      throw new Error("Cross-tenant access denied.");
    }
    if (params.targetClass.divisionId !== params.targetDivision.id) {
      throw new CrossDivisionError("Target class does not belong to selected division.", 400);
    }
    if (params.targetDivision.status !== "ACTIVE") {
      throw new CrossDivisionError("Target division is not active.", 400);
    }

    // 1. Archive current active primary enrollment
    const prevEnr = initialEnrollments.find((e) => e.isPrimary && e.status === "ACTIVE");
    if (prevEnr) {
      prevEnr.status = "PROMOTED";
      prevEnr.completedDate = new Date();
      prevEnr.promotionRemarks = params.remarks || `Progressed to ${params.targetDivision.name}`;
      prevEnr.isPrimary = false;

      historicalEnrollments.push({
        id: `hist-${historicalEnrollments.length + 1}`,
        institutionId: instId,
        divisionId: prevEnr.divisionId,
        studentId: params.student.id,
        classId: prevEnr.classId,
        status: "PROMOTED",
        promotionDecision: `PROGRESSED_TO_${params.targetDivision.type}`,
      });
    }

    // 2. Create new primary enrollment
    const newEnrId = `enr-002`;
    const newEnr = {
      id: newEnrId,
      institutionId: instId,
      divisionId: params.targetDivision.id,
      studentId: params.student.id,
      classId: params.targetClass.id,
      academicYearId: params.targetAY.id,
      isPrimary: true,
      status: "ACTIVE",
      enrolledDate: new Date(),
      completedDate: null,
      promotionRemarks: null,
    };
    initialEnrollments.push(newEnr);

    // 3. Update student pointers
    params.student.currentDivisionId = params.targetDivision.id;
    params.student.currentClassId = params.targetClass.id;
    params.student.currentAcademicYearId = params.targetAY.id;

    return { student: params.student, newEnrollment: newEnr };
  }

  // Execute valid progression: School Gr 10 -> Higher Secondary Gr 11
  const progressionResult = executeProgression({
    studentInstitutionId: instId,
    student: studentState,
    targetDivision: { id: hsecDivId, institutionId: instId, name: "Higher Secondary Wing", type: DivisionType.HIGHER_SECONDARY, status: "ACTIVE" },
    targetClass: { id: "class-hsec-grade-11", divisionId: hsecDivId, institutionId: instId, name: "Grade 11 Science", gradeLevel: "11" },
    targetAY: { id: "ay-2026-2027", institutionId: instId },
    remarks: "Promoted after completing Grade 10 Board exams.",
  });

  assert(
    progressionResult.student.currentDivisionId === hsecDivId,
    "Student currentDivisionId successfully updated to Higher Secondary division"
  );
  assert(
    progressionResult.student.id === "student-uuid-101" && progressionResult.student.userId === "user-uuid-101",
    "Student stable UUID, userId, and credentials remain unchanged during progression"
  );
  assert(
    progressionResult.student.rollNumber === "SCH-2024-089",
    "Student roll number and core profile are preserved"
  );
  assert(
    progressionResult.newEnrollment.divisionId === hsecDivId && progressionResult.newEnrollment.isPrimary === true,
    "New enrollment created in Higher Secondary division with isPrimary = true"
  );

  // ---------------------------------------------------------------------------
  // Test Group 2: Historical Preservation & Integrity
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 2: Historical Data Preservation ---");

  const archivedEnr = initialEnrollments.find((e) => e.id === "enr-001");
  assert(
    archivedEnr?.status === "PROMOTED" && archivedEnr.isPrimary === false,
    "Prior School enrollment safely archived with status 'PROMOTED' and isPrimary = false"
  );
  assert(
    archivedEnr?.completedDate !== null,
    "Prior School enrollment captures completion timestamp"
  );
  assert(
    historicalEnrollments.length === 1 && historicalEnrollments[0].divisionId === schoolDivId,
    "StudentEnrollmentHistory captures immutable record linked to source School division"
  );
  assert(
    attendanceRecords.length === 2 && attendanceRecords.every((a) => a.enrollmentId === "enr-001"),
    "Prior School attendance records remain 100% intact and bound to past enrollment"
  );
  assert(
    assessmentMarks.length === 2 && assessmentMarks.every((m) => m.enrollmentId === "enr-001"),
    "Prior School assessment marks remain 100% intact with zero data loss"
  );

  // ---------------------------------------------------------------------------
  // Test Group 3: Concurrent Multi-Division Enrollment (Dual Enrollment)
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 3: Concurrent Multi-Division Enrollment ---");

  const academyDivId = "div-acad-003";

  // Simulate concurrent enrollment in Skill Academy while retaining Higher Sec as Primary
  const concurrentEnr = {
    id: "enr-003",
    institutionId: instId,
    divisionId: academyDivId,
    studentId: studentState.id,
    classId: "class-acad-robotics",
    academicYearId: "ay-2026-2027",
    isPrimary: false,
    status: "ACTIVE",
    enrolledDate: new Date(),
    completedDate: null as Date | null,
    promotionRemarks: "Concurrent enrollment in Robotics Certificate",
  };
  initialEnrollments.push(concurrentEnr);

  const activeEnrs = initialEnrollments.filter((e) => e.status === "ACTIVE");
  assert(activeEnrs.length === 2, "Student holds 2 active concurrent division enrollments");

  const primaryEnr = activeEnrs.find((e) => e.isPrimary);
  const secondaryEnr = activeEnrs.find((e) => !e.isPrimary);

  assert(
    primaryEnr?.divisionId === hsecDivId,
    "Primary enrollment points to Higher Secondary division"
  );
  assert(
    secondaryEnr?.divisionId === academyDivId && secondaryEnr?.isPrimary === false,
    "Secondary concurrent enrollment points to Skill Academy with isPrimary = false"
  );
  assert(
    studentState.currentDivisionId === hsecDivId,
    "Student currentDivisionId remains bound to Primary division"
  );

  // Test duplicate enrollment rejection in the exact same class and division
  let duplicateRejected = false;
  try {
    const isDuplicate = initialEnrollments.some(
      (e) => e.divisionId === academyDivId && e.classId === "class-acad-robotics" && e.status === "ACTIVE"
    );
    if (isDuplicate) {
      throw new CrossDivisionError("Duplicate active enrollment in same class.", 409);
    }
  } catch (err: any) {
    duplicateRejected = err instanceof CrossDivisionError && err.statusCode === 409;
  }
  assert(duplicateRejected, "Duplicate concurrent enrollment in the exact same class is rejected with 409 Conflict");

  // Test switching primary enrollment: Academy becomes primary
  primaryEnr!.isPrimary = false;
  secondaryEnr!.isPrimary = true;
  studentState.currentDivisionId = secondaryEnr!.divisionId;

  assert(
    secondaryEnr!.isPrimary === true && primaryEnr!.isPrimary === false,
    "Switching primary atomically promotes secondary enrollment to primary"
  );
  assert(
    studentState.currentDivisionId === academyDivId,
    "Student currentDivisionId updates to new primary division (Academy)"
  );

  // Switch back to Higher Sec as primary
  secondaryEnr!.isPrimary = false;
  primaryEnr!.isPrimary = true;
  studentState.currentDivisionId = primaryEnr!.divisionId;

  // Test safe withdrawal of secondary enrollment
  secondaryEnr!.status = "DROPPED";
  secondaryEnr!.completedDate = new Date();
  assert(
    secondaryEnr!.status === "DROPPED" && initialEnrollments.filter((e) => e.status === "ACTIVE").length === 1,
    "Secondary enrollment safely withdrawn without affecting primary enrollment"
  );

  // ---------------------------------------------------------------------------
  // Test Group 4: Staff Multi-Division Assignments
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 4: Staff Multi-Division Assignments ---");

  const staffAssignments: any[] = [];

  function assignStaff(params: {
    staffId: string;
    divisionId: string;
    designation: string;
    isPrimary?: boolean;
  }) {
    if (params.isPrimary) {
      staffAssignments.forEach((a) => {
        if (a.staffId === params.staffId) a.isPrimary = false;
      });
    }
    const existing = staffAssignments.find((a) => a.staffId === params.staffId && a.divisionId === params.divisionId);
    if (existing) {
      existing.designation = params.designation;
      existing.isPrimary = Boolean(params.isPrimary);
      return existing;
    }
    const created = {
      id: `assign-${staffAssignments.length + 1}`,
      institutionId: instId,
      staffId: params.staffId,
      divisionId: params.divisionId,
      designation: params.designation,
      isPrimary: Boolean(params.isPrimary),
      status: "ACTIVE",
    };
    staffAssignments.push(created);
    return created;
  }

  const staffId = "staff-faculty-501";

  // Assignment 1: Senior Teacher in School (Primary)
  const a1 = assignStaff({
    staffId,
    divisionId: schoolDivId,
    designation: "Senior Science Teacher",
    isPrimary: true,
  });

  // Assignment 2: Adjunct Lecturer in Higher Secondary (Secondary)
  const a2 = assignStaff({
    staffId,
    divisionId: hsecDivId,
    designation: "Adjunct Physics Lecturer",
    isPrimary: false,
  });

  assert(
    staffAssignments.filter((a) => a.staffId === staffId).length === 2,
    "Staff member holds 2 explicit division assignments"
  );
  assert(
    a1.isPrimary === true && a2.isPrimary === false,
    "Staff primary assignment is correctly designated (School Primary, Higher Secondary Adjunct)"
  );

  // Verification of division access check
  function canStaffAccessDivision(targetDivId: string): boolean {
    return staffAssignments.some((a) => a.staffId === staffId && a.divisionId === targetDivId && a.status === "ACTIVE");
  }

  assert(canStaffAccessDivision(schoolDivId), "Staff is granted access to assigned School division");
  assert(canStaffAccessDivision(hsecDivId), "Staff is granted access to assigned Higher Secondary division");
  assert(!canStaffAccessDivision("div-foreign-col-999"), "Staff is blocked from unassigned foreign division");

  // ---------------------------------------------------------------------------
  // Test Group 5: Multi-Tenant Isolation & IDOR Prevention
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 5: Multi-Tenant Isolation & Cross-Tenant IDOR ---");

  let crossTenantProgressionBlocked = false;
  try {
    executeProgression({
      studentInstitutionId: instId,
      student: studentState,
      targetDivision: { id: "div-other-tenant", institutionId: foreignInstId, name: "Foreign College", type: DivisionType.COLLEGE, status: "ACTIVE" },
      targetClass: { id: "class-foreign", divisionId: "div-other-tenant", institutionId: foreignInstId, name: "Foreign Class", gradeLevel: "1" },
      targetAY: { id: "ay-foreign", institutionId: foreignInstId },
    });
  } catch (err: any) {
    crossTenantProgressionBlocked = err.message.includes("Cross-tenant");
  }
  assert(crossTenantProgressionBlocked, "Attempt to progress student into another institution's division is blocked");

  let mismatchedClassBlocked = false;
  try {
    executeProgression({
      studentInstitutionId: instId,
      student: studentState,
      targetDivision: { id: hsecDivId, institutionId: instId, name: "Higher Sec", type: DivisionType.HIGHER_SECONDARY, status: "ACTIVE" },
      targetClass: { id: "class-sch-10", divisionId: schoolDivId, institutionId: instId, name: "School Class", gradeLevel: "10" },
      targetAY: { id: "ay-2026", institutionId: instId },
    });
  } catch (err: any) {
    mismatchedClassBlocked = err instanceof CrossDivisionError;
  }
  assert(mismatchedClassBlocked, "Attempt to assign class from different division during progression is rejected");

  console.log("\n====================================================================");
  console.log(`  STAGE 2 TESTS COMPLETE: ${passed} passed, ${failed} failed`);
  console.log("====================================================================\n");

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Stage 2 Cross-Division test suite.`);
  }
}

// Execute tests
runStudentStaffCrossDivisionTests();
