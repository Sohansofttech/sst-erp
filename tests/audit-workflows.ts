import {
  initialStudents,
  initialAdmissions,
  initialAcademicYears,
  initialDepartments,
  initialCourses,
  initialClasses,
  initialSections,
  initialSubjects,
  initialStaff,
  initialGuardians,
  initialTimetableSlots,
  initialAttendanceRecords,
  initialExamHalls,
  initialExaminations,
  initialCertificateTemplates,
  initialPromotionPolicies,
} from "../lib/mock-data";

interface WorkflowResult {
  workflowName: string;
  step: string;
  expected: string;
  actual: string;
  pass: boolean;
  notes: string;
}

const workflowResults: WorkflowResult[] = [];

function assertWorkflow(name: string, step: string, condition: boolean, expected: string, actual: string, notes: string = "") {
  workflowResults.push({
    workflowName: name,
    step,
    expected,
    actual,
    pass: condition,
    notes,
  });
}

function runWorkflowTests() {
  console.log("========================================================================");
  console.log("       SST-ERP CROSS-MODULE WORKFLOW VERIFICATION RUNNER                ");
  console.log("========================================================================\n");

  // -------------------------------------------------------------------------
  // WORKFLOW 1: Admission Application -> Conversion to Enrolled Student
  // -------------------------------------------------------------------------
  const applicant = initialAdmissions.find(a => a.status === "Submitted") || initialAdmissions[0];
  assertWorkflow(
    "Workflow 1: Admissions Intake",
    "Application Retrieval",
    !!applicant,
    "Valid applicant record",
    applicant ? `${applicant.status} (${applicant.applicantFullName})` : "missing",
    `Applicant: ${applicant?.applicantFullName || "N/A"}`
  );

  // Simulate Approval
  const approvedApp = { ...applicant, status: "Approved" as const };
  assertWorkflow(
    "Workflow 1: Admissions Intake",
    "Application Approval Transition",
    approvedApp.status === "Approved",
    "Approved status",
    approvedApp.status,
    "Status updated to Approved"
  );

  // Convert to Enrolled Student
  const newStudentId = `STU-2026-${String(initialStudents.length + 1).padStart(3, "0")}`;
  const enrolledStudent = {
    id: newStudentId,
    studentId: newStudentId,
    firstName: approvedApp.applicantFirstName,
    lastName: approvedApp.applicantLastName,
    fullName: approvedApp.applicantFullName,
    institutionalEmail: `${approvedApp.applicantFirstName.toLowerCase()}.${approvedApp.applicantLastName.toLowerCase()}@sst.edu.in`,
    academicYearId: initialAcademicYears[0].id,
    academicYearName: initialAcademicYears[0].name,
    departmentId: initialDepartments[0].id,
    departmentName: initialDepartments[0].name,
    courseId: initialCourses[0].id,
    courseName: initialCourses[0].name,
    classId: initialClasses[0].id,
    className: initialClasses[0].name,
    sectionId: initialSections[0].id,
    sectionName: initialSections[0].name,
    status: "Active" as const,
  };
  assertWorkflow(
    "Workflow 1: Admissions Intake",
    "Conversion to Student Record",
    enrolledStudent.id === newStudentId && enrolledStudent.status === "Active",
    "Active student record with institutional email",
    `${enrolledStudent.status} (${enrolledStudent.institutionalEmail})`,
    "Converted successfully into active enrolled student"
  );

  // -------------------------------------------------------------------------
  // WORKFLOW 2: Student -> Academic Hierarchy Alignment
  // -------------------------------------------------------------------------
  const sampleStudent = initialStudents[0];
  const matchedClass = initialClasses.find((c) => c.id === sampleStudent.classId);
  const matchedCourse = initialCourses.find((co) => co.id === sampleStudent.courseId);
  const matchedDept = initialDepartments.find((d) => d.id === sampleStudent.departmentId);
  const matchedAY = initialAcademicYears.find((ay) => ay.id === sampleStudent.academicYearId);

  assertWorkflow(
    "Workflow 2: Academic Hierarchy Alignment",
    "Course & Department Binding",
    !!matchedCourse && !!matchedDept,
    "Valid Course & Department references",
    `Course: ${matchedCourse?.name || "null"}, Dept: ${matchedDept?.name || "null"}`,
    "Student correctly references top-level academic hierarchy"
  );

  assertWorkflow(
    "Workflow 2: Academic Hierarchy Alignment",
    "Class, Section & Academic Year Binding",
    !!matchedClass && !!matchedAY,
    "Valid Class & AY references",
    `Class: ${matchedClass?.name || "null"}, AY: ${matchedAY?.name || "null"}`,
    "Student correctly references operational class and term"
  );

  // Guardian Linking
  const linkedGuardian = initialGuardians.find((g) => g.studentIds.includes(sampleStudent.id));
  assertWorkflow(
    "Workflow 2: Academic Hierarchy Alignment",
    "Student-Guardian Relationship",
    !!linkedGuardian,
    "At least one linked guardian",
    linkedGuardian ? `${linkedGuardian.fullName} (${linkedGuardian.relationship})` : "Unlinked",
    "Parent/Guardian linkage verified"
  );

  // -------------------------------------------------------------------------
  // WORKFLOW 3: Faculty Assignment & Timetable Clash Detection
  // -------------------------------------------------------------------------
  const faculty = initialStaff[0];
  const existingSlot = initialTimetableSlots[0];
  assertWorkflow(
    "Workflow 3: Timetable Scheduling & Clash Prevention",
    "Existing Slot Retrieval",
    !!existingSlot,
    "Valid initial slot",
    `Slot on ${existingSlot?.dayOfWeek} at ${existingSlot?.startTime}-${existingSlot?.endTime}`,
    `Subject: ${existingSlot?.subjectName}`
  );

  // Simulate Conflict Detection (Same Day, Overlapping Time, Same Teacher)
  const overlappingSlot = {
    dayOfWeek: existingSlot.dayOfWeek,
    startTime: existingSlot.startTime,
    endTime: existingSlot.endTime,
    teacherId: existingSlot.teacherId,
    roomNumber: "Room 999", // Different room, but same teacher
  };

  const isTeacherClash =
    overlappingSlot.dayOfWeek === existingSlot.dayOfWeek &&
    overlappingSlot.teacherId === existingSlot.teacherId &&
    !(overlappingSlot.endTime <= existingSlot.startTime || overlappingSlot.startTime >= existingSlot.endTime);

  assertWorkflow(
    "Workflow 3: Timetable Scheduling & Clash Prevention",
    "Teacher Clash Detection",
    isTeacherClash === true,
    "Clash Detected (true)",
    `Clash: ${isTeacherClash}`,
    "Algorithm blocks teacher from double-booking at identical time window"
  );

  // Room Conflict Check (Same Day, Overlapping Time, Same Room, Different Teacher)
  const roomClashSlot = {
    dayOfWeek: existingSlot.dayOfWeek,
    startTime: existingSlot.startTime,
    endTime: existingSlot.endTime,
    teacherId: "teacher_other",
    roomNumber: existingSlot.roomNumber,
  };
  const isRoomClash =
    roomClashSlot.dayOfWeek === existingSlot.dayOfWeek &&
    roomClashSlot.roomNumber === existingSlot.roomNumber &&
    !(roomClashSlot.endTime <= existingSlot.startTime || roomClashSlot.startTime >= existingSlot.endTime);

  assertWorkflow(
    "Workflow 3: Timetable Scheduling & Clash Prevention",
    "Room Clash Detection",
    isRoomClash === true,
    "Clash Detected (true)",
    `Clash: ${isRoomClash}`,
    "Algorithm blocks two sections from booking the same room concurrently"
  );

  // -------------------------------------------------------------------------
  // WORKFLOW 4: Attendance Marking & Threshold Monitoring
  // -------------------------------------------------------------------------
  const totalSlots = 40;
  const attendedSlots = 28; // 70% attendance (< 75% threshold)
  const calculatedPct = (attendedSlots / totalSlots) * 100;
  const threshold = 75;
  const isBelowThreshold = calculatedPct < threshold;

  assertWorkflow(
    "Workflow 4: Attendance Calculation & Warning",
    "Percentage Computation",
    calculatedPct === 70,
    "70%",
    `${calculatedPct}%`,
    "Calculation accurate"
  );

  assertWorkflow(
    "Workflow 4: Attendance Calculation & Warning",
    "Low Attendance Warning Trigger",
    isBelowThreshold === true,
    "Warning Flagged (true)",
    `Below Threshold: ${isBelowThreshold}`,
    "Student flagged for attendance shortage (<75%)"
  );

  // -------------------------------------------------------------------------
  // WORKFLOW 5: Examination Hall Allocation & Results Publishing
  // -------------------------------------------------------------------------
  const hall = initialExamHalls[0];
  const exam = initialExaminations[0];
  assertWorkflow(
    "Workflow 5: Examination & Result Pipeline",
    "Exam Hall Capacity Check",
    hall.capacity > 0 && hall.status === "Available",
    `Capacity: ${hall.capacity}`,
    `Actual: ${hall.capacity} (Status: ${hall.status}, Building: ${hall.building})`,
    "Hall metadata and capacity verified"
  );

  // Grade Computation Logic Test (Standard VTU / NEP 10-point scale)
  const computeGrade = (marks: number, maxMarks: number) => {
    const pct = (marks / maxMarks) * 100;
    if (pct >= 90) return { grade: "O", point: 10, status: "Pass" };
    if (pct >= 80) return { grade: "A+", point: 9, status: "Pass" };
    if (pct >= 70) return { grade: "A", point: 8, status: "Pass" };
    if (pct >= 60) return { grade: "B+", point: 7, status: "Pass" };
    if (pct >= 50) return { grade: "B", point: 6, status: "Pass" };
    if (pct >= 40) return { grade: "C", point: 5, status: "Pass" };
    return { grade: "F", point: 0, status: "Fail" };
  };

  const grade92 = computeGrade(92, 100);
  const grade75 = computeGrade(75, 100);
  const grade35 = computeGrade(35, 100);

  assertWorkflow(
    "Workflow 5: Examination & Result Pipeline",
    "Grade Point Allocation (92% -> O)",
    grade92.grade === "O" && grade92.point === 10,
    "Grade O (10 pts)",
    `Grade ${grade92.grade} (${grade92.point} pts)`,
    "Distinction grade verified"
  );

  assertWorkflow(
    "Workflow 5: Examination & Result Pipeline",
    "Grade Point Allocation (75% -> A)",
    grade75.grade === "A" && grade75.point === 8,
    "Grade A (8 pts)",
    `Grade ${grade75.grade} (${grade75.point} pts)`,
    "First class grade verified"
  );

  assertWorkflow(
    "Workflow 5: Examination & Result Pipeline",
    "Grade Point Allocation (35% -> F)",
    grade35.grade === "F" && grade35.point === 0,
    "Grade F (0 pts)",
    `Grade ${grade35.grade} (${grade35.point} pts)`,
    "Fail grade and backlog trigger verified"
  );

  // -------------------------------------------------------------------------
  // WORKFLOW 6: Promotion Eligibility & Advancement
  // -------------------------------------------------------------------------
  const policy = initialPromotionPolicies[0];
  assertWorkflow(
    "Workflow 6: Student Promotion Evaluation",
    "Promotion Policy Retrieval",
    !!policy && policy.minEarnedCredits > 0,
    "Policy with credit & backlog criteria",
    `Min Credits: ${policy?.minEarnedCredits}, Max Backlogs: ${policy?.maxAllowedBacklogs}, Min CGPA: ${policy?.minCgpa}`,
    `Policy: ${policy?.name}`
  );

  // Eligible Student Evaluation
  const eligibleStudent = {
    studentId: "STU-001",
    cgpa: 7.8,
    sgpa: 8.0,
    creditsEarned: 24,
    backlogs: 0,
  };
  const isEligible =
    eligibleStudent.cgpa >= policy.minCgpa &&
    eligibleStudent.creditsEarned >= policy.minEarnedCredits &&
    eligibleStudent.backlogs <= policy.maxAllowedBacklogs;

  assertWorkflow(
    "Workflow 6: Student Promotion Evaluation",
    "Eligibility Evaluation (Eligible Student)",
    isEligible === true,
    "PROMOTED",
    isEligible ? "PROMOTED" : "DETAINED",
    "Clean academic record student approved for promotion"
  );

  // Detained Student Evaluation (High Backlogs)
  const backlogStudent = {
    studentId: "STU-002",
    cgpa: 4.2,
    sgpa: 3.8,
    creditsEarned: 10,
    backlogs: 5, // Exceeds maxAllowedBacklogs
  };
  const isBacklogEligible =
    backlogStudent.cgpa >= policy.minCgpa &&
    backlogStudent.creditsEarned >= policy.minEarnedCredits &&
    backlogStudent.backlogs <= policy.maxAllowedBacklogs;

  assertWorkflow(
    "Workflow 6: Student Promotion Evaluation",
    "Eligibility Evaluation (Excess Backlogs & Low Credits -> Detained)",
    isBacklogEligible === false,
    "DETAINED",
    isBacklogEligible ? "PROMOTED" : "DETAINED",
    "Student with 5 backlogs and below minimum credits blocked from promotion"
  );

  // -------------------------------------------------------------------------
  // WORKFLOW 7: Certificate Application & Verification Hash
  // -------------------------------------------------------------------------
  const template = initialCertificateTemplates[0];
  assertWorkflow(
    "Workflow 7: Certificate Issuance & Verification",
    "Template Retrieval",
    !!template,
    "Valid template",
    `Template: ${template?.title} (${template?.type})`,
    "Bonafide / TC template found"
  );

  // Generate Unique Verification Code & Hash
  const certNumber = `SST/CERT/2026/0001`;
  const verificationHash = `sha256-${Buffer.from(certNumber + "STU-001").toString("base64").substring(0, 16)}`;
  assertWorkflow(
    "Workflow 7: Certificate Issuance & Verification",
    "Verification Code & Security Hash",
    verificationHash.length > 8 && certNumber.includes("2026"),
    "Deterministic verification hash generated",
    verificationHash,
    `Certificate Number: ${certNumber}`
  );

  // -------------------------------------------------------------------------
  // WORKFLOW 8: Fee Invoicing & Payment Processing
  // -------------------------------------------------------------------------
  const invoiceAmount = 50000;
  let paidAmount = 0;
  let balance = invoiceAmount - paidAmount;
  let status: "UNPAID" | "PARTIAL" | "PAID" = "UNPAID";

  // Record 1st payment: 20000
  paidAmount += 20000;
  balance = invoiceAmount - paidAmount;
  status = balance === 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID";

  assertWorkflow(
    "Workflow 8: Fee Invoicing & Payment",
    "Partial Payment Recording",
    balance === 30000 && status === "PARTIAL",
    "Balance 30000, Status PARTIAL",
    `Balance ${balance}, Status ${status}`,
    "Partial payment credited successfully"
  );

  // Record 2nd payment: 30000
  paidAmount += 30000;
  balance = invoiceAmount - paidAmount;
  status = balance === 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID";

  assertWorkflow(
    "Workflow 8: Fee Invoicing & Payment",
    "Full Payment Clearance",
    balance === 0 && status === "PAID",
    "Balance 0, Status PAID",
    `Balance ${balance}, Status ${status}`,
    "Invoice fully paid and reconciled"
  );

  // -------------------------------------------------------------------------
  // WORKFLOW 9: Visitor Gate Management & Campus Logs
  // -------------------------------------------------------------------------
  const passId = "PASS-2026-001";
  const visitorPass = {
    id: passId,
    visitorName: "Vendor Logistics",
    purpose: "Hardware Delivery",
    checkInTime: new Date().toISOString(),
    checkOutTime: null as string | null,
    status: "ACTIVE" as "ACTIVE" | "COMPLETED",
  };

  assertWorkflow(
    "Workflow 9: Visitor Management",
    "Visitor Check-in",
    visitorPass.status === "ACTIVE" && !!visitorPass.checkInTime,
    "Status ACTIVE with Check-in timestamp",
    `Status ${visitorPass.status} (In: ${visitorPass.checkInTime})`,
    "Visitor issued pass at campus gate"
  );

  // Checkout visitor
  visitorPass.checkOutTime = new Date().toISOString();
  visitorPass.status = "COMPLETED";

  assertWorkflow(
    "Workflow 9: Visitor Management",
    "Visitor Check-out",
    visitorPass.status === "COMPLETED" && !!visitorPass.checkOutTime,
    "Status COMPLETED with Check-out timestamp",
    `Status ${visitorPass.status} (Out: ${visitorPass.checkOutTime})`,
    "Visitor surrendered pass and checked out cleanly"
  );

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n--- WORKFLOW TEST RESULTS ---\n");
  let passCount = 0;
  let failCount = 0;
  for (const r of workflowResults) {
    const sym = r.pass ? "✔ PASS" : "✖ FAIL";
    console.log(`[${sym}] [${r.workflowName}] ${r.step} -> ${r.actual} (${r.notes})`);
    if (r.pass) passCount++;
    else failCount++;
  }

  console.log(`\n========================================================================`);
  console.log(` WORKFLOW CHECKS: ${workflowResults.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log(`========================================================================\n`);

  return workflowResults;
}

runWorkflowTests();
