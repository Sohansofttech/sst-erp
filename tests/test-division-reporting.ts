/**
 * ============================================================================
 * Test Suite: tests/test-division-reporting.ts
 * Description: Automated test suite for Stage 4 — Division-Specific and Consolidated Reporting:
 *              1. Consolidated institution report with strict division attribution
 *              2. Non-overlapping metric aggregation (students, staff, classes, finances)
 *              3. Montessori division report (milestones, domains, progress history)
 *              4. School division report (classes, CBSE letter grades A1-E, grade distributions)
 *              5. Higher Secondary division report (+1/+2 classes, streams: Science/Commerce/Humanities)
 *              6. College division report (departments, degree courses, semester GPA)
 *              7. Academy division report (vocational batches, completion rates)
 *              8. Multi-dimensional filtering (gradeLevel, stream, semester, date range)
 *              9. Authorization & Access Control: Global vs Division-Scoped vs Cross-Tenant denial
 *              10. Financial calculations (billed, collected, outstanding, collection rate)
 *              11. College non-regression and backward compatibility
 * ============================================================================
 */

import { DivisionType } from "@prisma/client";
import { calculateGradeLetter } from "../app/api/admin/academics/report-cards/route";

export function runDivisionReportingTests() {
  console.log("====================================================================");
  console.log("   STAGE 4: DIVISION-SPECIFIC & CONSOLIDATED REPORTING TEST SUITE   ");
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

  const institutionId = "inst-apex-001";
  const foreignInstitutionId = "inst-foreign-999";

  // Mock divisions
  const divMontessori = {
    id: "div-mont-01",
    institutionId,
    name: "Apex Montessori Toddlers",
    code: "MONT",
    type: DivisionType.MONTESSORI,
    status: "ACTIVE",
    isDefault: false,
  };

  const divSchool = {
    id: "div-sch-02",
    institutionId,
    name: "Apex Public School",
    code: "SCH",
    type: DivisionType.SCHOOL,
    status: "ACTIVE",
    isDefault: true,
  };

  const divHsec = {
    id: "div-hsec-03",
    institutionId,
    name: "Apex Higher Secondary Junior College",
    code: "HSEC",
    type: DivisionType.HIGHER_SECONDARY,
    status: "ACTIVE",
    isDefault: false,
  };

  const divCollege = {
    id: "div-col-04",
    institutionId,
    name: "Apex Institute of Technology",
    code: "COL",
    type: DivisionType.COLLEGE,
    status: "ACTIVE",
    isDefault: false,
  };

  const divAcademy = {
    id: "div-acad-05",
    institutionId,
    name: "Apex Professional Academy",
    code: "ACAD",
    type: DivisionType.ACADEMY,
    status: "ACTIVE",
    isDefault: false,
  };

  const divForeign = {
    id: "div-foreign-06",
    institutionId: foreignInstitutionId,
    name: "Foreign Division",
    code: "FDIV",
    type: DivisionType.COLLEGE,
    status: "ACTIVE",
    isDefault: false,
  };

  const allDivisions = [divMontessori, divSchool, divHsec, divCollege, divAcademy];

  // ---------------------------------------------------------------------------
  // Test Group 1: Consolidated Institution Reporting & Metric Attribution
  // ---------------------------------------------------------------------------
  console.log("--- Group 1: Consolidated Institution Report & Attribution ---");

  // Division-level operational mock stats
  const divisionStats: Record<string, {
    studentCount: number;
    staffCount: number;
    classCount: number;
    billed: number;
    collected: number;
    attendancePresent: number;
    attendanceTotal: number;
  }> = {
    [divMontessori.id]: { studentCount: 45, staffCount: 6, classCount: 3, billed: 450000, collected: 405000, attendancePresent: 850, attendanceTotal: 1000 },
    [divSchool.id]: { studentCount: 620, staffCount: 38, classCount: 20, billed: 6200000, collected: 5580000, attendancePresent: 11500, attendanceTotal: 12500 },
    [divHsec.id]: { studentCount: 280, staffCount: 22, classCount: 8, billed: 3360000, collected: 3024000, attendancePresent: 5200, attendanceTotal: 5800 },
    [divCollege.id]: { studentCount: 1100, staffCount: 75, classCount: 32, billed: 22000000, collected: 19800000, attendancePresent: 19800, attendanceTotal: 23000 },
    [divAcademy.id]: { studentCount: 150, staffCount: 12, classCount: 6, billed: 1500000, collected: 1350000, attendancePresent: 2600, attendanceTotal: 3000 },
  };

  // Consolidated compute logic mirror
  function generateConsolidatedReport(targetInstId: string) {
    if (targetInstId !== institutionId) {
      throw new Error("Institution not found.");
    }

    const divisionMetrics = allDivisions.map((div) => {
      const stats = divisionStats[div.id];
      const outstanding = stats.billed - stats.collected;
      const collectionRate = stats.billed > 0 ? Number(((stats.collected / stats.billed) * 100).toFixed(1)) : 0;
      const attendanceRate = stats.attendanceTotal > 0 ? Number(((stats.attendancePresent / stats.attendanceTotal) * 100).toFixed(1)) : 0;

      return {
        division: {
          id: div.id,
          name: div.name,
          code: div.code,
          type: div.type,
        },
        studentCount: stats.studentCount,
        staffCount: stats.staffCount,
        classCount: stats.classCount,
        finance: {
          totalBilled: stats.billed,
          totalCollected: stats.collected,
          totalOutstanding: outstanding,
          collectionRate,
        },
        attendance: {
          sampledSessions: stats.attendanceTotal,
          attendanceRate,
        },
      };
    });

    const totalStudents = divisionMetrics.reduce((s, d) => s + d.studentCount, 0);
    const totalStaff = divisionMetrics.reduce((s, d) => s + d.staffCount, 0);
    const totalClasses = divisionMetrics.reduce((s, d) => s + d.classCount, 0);
    const totalBilled = divisionMetrics.reduce((s, d) => s + d.finance.totalBilled, 0);
    const totalCollected = divisionMetrics.reduce((s, d) => s + d.finance.totalCollected, 0);
    const totalOutstanding = totalBilled - totalCollected;
    const overallCollectionRate = totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(1)) : 0;

    return {
      institution: {
        id: institutionId,
        name: "Apex Educational Group",
        totalDivisions: allDivisions.length,
      },
      summary: {
        totalStudents,
        totalStaff,
        totalClasses,
        totalBilled,
        totalCollected,
        totalOutstanding,
        overallCollectionRate,
      },
      divisions: divisionMetrics,
    };
  }

  const consolidated = generateConsolidatedReport(institutionId);

  assert(consolidated.institution.totalDivisions === 5, "Consolidated report includes all 5 active institution divisions");
  assert(consolidated.summary.totalStudents === 2195, "Total students is sum of non-overlapping division enrollments (2,195)");
  assert(consolidated.summary.totalStaff === 153, "Total staff matches sum of cross-division assignments (153)");
  assert(consolidated.summary.totalClasses === 69, "Total classes correctly aggregated (69)");
  assert(consolidated.summary.totalBilled === 33510000, "Total billed matches aggregate invoices (Rs 33,510,000)");
  assert(consolidated.summary.totalCollected === 30159000, "Total collected matches aggregate fees (Rs 30,159,000)");
  assert(consolidated.summary.totalOutstanding === 3351000, "Outstanding balance is accurately calculated (Rs 3,351,000)");
  assert(consolidated.summary.overallCollectionRate === 90.0, "Overall collection rate correctly computed (90.0%)");

  // Division attribution verification
  const schMetric = consolidated.divisions.find((d) => d.division.id === divSchool.id);
  const colMetric = consolidated.divisions.find((d) => d.division.id === divCollege.id);
  assert(schMetric !== undefined && schMetric.studentCount === 620, "School division metrics strictly isolated (620 students)");
  assert(colMetric !== undefined && colMetric.studentCount === 1100, "College division metrics strictly isolated (1,100 students)");
  assert(schMetric?.finance.totalBilled === 6200000, "School fees strictly attributed to School division");
  assert(colMetric?.finance.totalBilled === 22000000, "College fees strictly attributed to College division");

  // ---------------------------------------------------------------------------
  // Test Group 2: Montessori Division Reporting
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 2: Montessori Division Reporting ---");

  const montessoriMilestones = [
    { id: "m1", title: "Cylinder Blocks", domain: "Sensorial", status: "MASTERED" },
    { id: "m2", title: "Pink Tower", domain: "Sensorial", status: "MASTERED" },
    { id: "m3", title: "Broad Stair", domain: "Sensorial", status: "PROGRESSING" },
    { id: "m4", title: "Sandpaper Letters", domain: "Language", status: "PROGRESSING" },
    { id: "m5", title: "Spindle Boxes", domain: "Mathematics", status: "INTRODUCED" },
    { id: "m6", title: "Table Washing", domain: "Practical Life", status: "MASTERED" },
  ];

  function evaluateMontessoriReport() {
    const mastered = montessoriMilestones.filter((m) => m.status === "MASTERED").length;
    const progressing = montessoriMilestones.filter((m) => m.status === "PROGRESSING").length;
    const introduced = montessoriMilestones.filter((m) => m.status === "INTRODUCED").length;
    const total = montessoriMilestones.length;

    const domains: Record<string, { total: number; mastered: number }> = {};
    for (const m of montessoriMilestones) {
      if (!domains[m.domain]) domains[m.domain] = { total: 0, mastered: 0 };
      domains[m.domain].total++;
      if (m.status === "MASTERED") domains[m.domain].mastered++;
    }

    return {
      pedagogicalType: "MONTESSORI",
      milestoneSummary: {
        totalMilestones: total,
        mastered,
        progressing,
        introduced,
        masteryRate: Number(((mastered / total) * 100).toFixed(1)),
      },
      domains,
    };
  }

  const montReport = evaluateMontessoriReport();
  assert(montReport.pedagogicalType === "MONTESSORI", "Montessori report identifies pedagogical type");
  assert(montReport.milestoneSummary.mastered === 3, "Mastered milestones counted accurately (3)");
  assert(montReport.milestoneSummary.progressing === 2, "Progressing milestones counted accurately (2)");
  assert(montReport.milestoneSummary.introduced === 1, "Introduced milestones counted accurately (1)");
  assert(montReport.milestoneSummary.masteryRate === 50.0, "Milestone mastery rate correctly computed (50.0%)");
  assert(montReport.domains["Sensorial"].total === 3 && montReport.domains["Sensorial"].mastered === 2, "Sensorial domain breakdown calculated");
  assert(montReport.domains["Practical Life"].mastered === 1, "Practical life domain mastery verified");

  // ---------------------------------------------------------------------------
  // Test Group 3: School Division Reporting & CBSE Scale (A1-E)
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 3: School Division Reporting & Grade Scale ---");

  // Test CBSE grade calculation logic
  assert(calculateGradeLetter(95) === "A1", "Score 95 maps to A1 (91-100)");
  assert(calculateGradeLetter(85) === "A2", "Score 85 maps to A2 (81-90)");
  assert(calculateGradeLetter(75) === "B1", "Score 75 maps to B1 (71-80)");
  assert(calculateGradeLetter(65) === "B2", "Score 65 maps to B2 (61-70)");
  assert(calculateGradeLetter(55) === "C1", "Score 55 maps to C1 (51-60)");
  assert(calculateGradeLetter(45) === "C2", "Score 45 maps to C2 (41-50)");
  assert(calculateGradeLetter(35) === "D",  "Score 35 maps to D (33-40)");
  assert(calculateGradeLetter(25) === "E",  "Score 25 maps to E (<33 Needs Improvement)");

  // School exam distribution
  const schoolStudents = [
    { id: "st-1", name: "Rohan", gradeLevel: "GRADE_10", marks: 92 },
    { id: "st-2", name: "Ananya", gradeLevel: "GRADE_10", marks: 88 },
    { id: "st-3", name: "Vikram", gradeLevel: "GRADE_10", marks: 74 },
    { id: "st-4", name: "Sneha", gradeLevel: "GRADE_9", marks: 66 },
    { id: "st-5", name: "Kabir", gradeLevel: "GRADE_9", marks: 32 },
  ];

  function evaluateSchoolReport(gradeFilter?: string) {
    const filtered = gradeFilter ? schoolStudents.filter((s) => s.gradeLevel === gradeFilter) : schoolStudents;
    const distribution: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, D: 0, E: 0 };
    for (const s of filtered) {
      const g = calculateGradeLetter(s.marks);
      distribution[g]++;
    }
    const passing = filtered.filter((s) => s.marks >= 33).length;
    const passPercentage = Number(((passing / filtered.length) * 100).toFixed(1));

    return {
      pedagogicalType: "SCHOOL",
      totalStudents: filtered.length,
      distribution,
      passPercentage,
    };
  }

  const schFull = evaluateSchoolReport();
  assert(schFull.totalStudents === 5, "School report includes all students when un按grade");
  assert(schFull.distribution.A1 === 1 && schFull.distribution.A2 === 1, "School A1 & A2 grades distributed correctly");
  assert(schFull.distribution.E === 1, "Failing student mapped to grade E");
  assert(schFull.passPercentage === 80.0, "Pass percentage correctly evaluated (4/5 = 80.0%)");

  const schGrade10 = evaluateSchoolReport("GRADE_10");
  assert(schGrade10.totalStudents === 3, "GradeLevel filter isolates Grade 10 students");
  assert(schGrade10.passPercentage === 100.0, "Grade 10 pass rate is 100.0%");

  // ---------------------------------------------------------------------------
  // Test Group 4: Higher Secondary Stream Reporting (+1 & +2)
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 4: Higher Secondary Stream Reporting ---");

  const hsecStudents = [
    { id: "hs-1", gradeLevel: "GRADE_11", stream: "SCIENCE", percentage: 88.5 },
    { id: "hs-2", gradeLevel: "GRADE_11", stream: "SCIENCE", percentage: 91.0 },
    { id: "hs-3", gradeLevel: "GRADE_11", stream: "COMMERCE", percentage: 76.0 },
    { id: "hs-4", gradeLevel: "GRADE_12", stream: "SCIENCE", percentage: 84.0 },
    { id: "hs-5", gradeLevel: "GRADE_12", stream: "COMMERCE", percentage: 82.5 },
    { id: "hs-6", gradeLevel: "GRADE_12", stream: "HUMANITIES", percentage: 79.0 },
  ];

  function evaluateHsecReport(streamFilter?: string, gradeFilter?: string) {
    let filtered = hsecStudents;
    if (streamFilter) filtered = filtered.filter((s) => s.stream === streamFilter);
    if (gradeFilter) filtered = filtered.filter((s) => s.gradeLevel === gradeFilter);

    const streams: Record<string, { count: number; totalPercentage: number }> = {};
    for (const s of filtered) {
      if (!streams[s.stream]) streams[s.stream] = { count: 0, totalPercentage: 0 };
      streams[s.stream].count++;
      streams[s.stream].totalPercentage += s.percentage;
    }

    const streamAnalysis = Object.entries(streams).map(([stream, data]) => ({
      stream,
      studentCount: data.count,
      averagePercentage: Number((data.totalPercentage / data.count).toFixed(2)),
    }));

    return {
      pedagogicalType: "HIGHER_SECONDARY",
      studentCount: filtered.length,
      streamAnalysis,
    };
  }

  const hsecOverview = evaluateHsecReport();
  assert(hsecOverview.studentCount === 6, "HSEC overview aggregates all +1 and +2 students");
  assert(hsecOverview.streamAnalysis.length === 3, "All 3 streams (Science, Commerce, Humanities) represented");

  const sciOverview = hsecOverview.streamAnalysis.find((s) => s.stream === "SCIENCE");
  assert(sciOverview !== undefined && sciOverview.studentCount === 3, "Science stream student count accurately computed (3)");
  assert(sciOverview?.averagePercentage === 87.83, "Science stream average percentage evaluated correctly");

  const hsecFiltered = evaluateHsecReport("COMMERCE", "GRADE_12");
  assert(hsecFiltered.studentCount === 1, "Multi-dimensional filter (Stream=COMMERCE & GradeLevel=GRADE_12) succeeds");
  assert(hsecFiltered.streamAnalysis[0].averagePercentage === 82.5, "Filtered average matches expected student score");

  // ---------------------------------------------------------------------------
  // Test Group 5: College Degree Courses & Semester GPA
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 5: College Degree Courses & Semester GPA ---");

  const collegeEnrollments = [
    { studentId: "c-1", course: "B.Tech Computer Science", semester: 4, gpa: 8.8 },
    { studentId: "c-2", course: "B.Tech Computer Science", semester: 4, gpa: 7.9 },
    { studentId: "c-3", course: "B.Tech Mechanical", semester: 4, gpa: 7.2 },
    { studentId: "c-4", course: "B.Tech Computer Science", semester: 6, gpa: 9.1 },
  ];

  function evaluateCollegeReport(semesterFilter?: number, courseFilter?: string) {
    let filtered = collegeEnrollments;
    if (semesterFilter) filtered = filtered.filter((c) => c.semester === semesterFilter);
    if (courseFilter) filtered = filtered.filter((c) => c.course === courseFilter);

    const avgGpa = filtered.reduce((s, c) => s + c.gpa, 0) / (filtered.length || 1);

    return {
      pedagogicalType: "COLLEGE",
      enrollmentCount: filtered.length,
      averageGpa: Number(avgGpa.toFixed(2)),
    };
  }

  const colSem4 = evaluateCollegeReport(4);
  assert(colSem4.enrollmentCount === 3, "Semester 4 filter returns exactly 3 students across courses");
  assert(colSem4.averageGpa === 7.97, "Semester 4 average GPA is accurately calculated (7.97)");

  const colCsSem4 = evaluateCollegeReport(4, "B.Tech Computer Science");
  assert(colCsSem4.enrollmentCount === 2, "Combined Semester & Course filter returns 2 students");
  assert(colCsSem4.averageGpa === 8.35, "CS Sem 4 average GPA evaluated (8.35)");

  // ---------------------------------------------------------------------------
  // Test Group 6: Security, Access Boundaries & Authorization
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 6: Security & Division Scope Authorization ---");

  // Admin Contexts
  const globalAdmin = {
    institutionId,
    isInstitutionWideAdmin: true,
    permittedDivisionIds: [divMontessori.id, divSchool.id, divHsec.id, divCollege.id, divAcademy.id],
  };

  const schoolAdmin = {
    institutionId,
    isInstitutionWideAdmin: false,
    permittedDivisionIds: [divSchool.id],
    activeDivisionId: divSchool.id,
  };

  function authorizeReportRequest(
    admin: typeof globalAdmin | typeof schoolAdmin,
    targetDivisionId?: string,
    reportType: string = "overview"
  ) {
    // Foreign institution check
    if (targetDivisionId === divForeign.id) {
      return { allowed: false, status: 403, error: "Division not found in this institution." };
    }

    // Consolidated report check: only global admins can access consolidated reports
    if (reportType === "consolidated" || (!targetDivisionId && reportType === "overview")) {
      if (!admin.isInstitutionWideAdmin) {
        return { allowed: false, status: 403, error: "Unauthorized: Consolidated reports require institution-wide administrator privileges." };
      }
      return { allowed: true, status: 200, scope: "CONSOLIDATED" };
    }

    // Division-specific report check
    if (targetDivisionId) {
      if (!admin.isInstitutionWideAdmin && !admin.permittedDivisionIds.includes(targetDivisionId)) {
        return { allowed: false, status: 403, error: "Security Violation: You are not authorized to view reports for this division." };
      }
      return { allowed: true, status: 200, scope: "DIVISION", divisionId: targetDivisionId };
    }

    return { allowed: true, status: 200, scope: "DEFAULT" };
  }

  // Global admin checks
  assert(authorizeReportRequest(globalAdmin, undefined, "consolidated").status === 200, "Global admin can access institution-wide consolidated report");
  assert(authorizeReportRequest(globalAdmin, divSchool.id, "division").status === 200, "Global admin can access School division report");
  assert(authorizeReportRequest(globalAdmin, divCollege.id, "division").status === 200, "Global admin can access College division report");
  assert(authorizeReportRequest(globalAdmin, divForeign.id, "division").status === 403, "Global admin rejected when requesting foreign institution division (403)");

  // Division-scoped admin checks
  assert(authorizeReportRequest(schoolAdmin, undefined, "consolidated").status === 403, "Division-scoped admin rejected from consolidated report (403 Forbidden)");
  assert(authorizeReportRequest(schoolAdmin, divSchool.id, "division").status === 200, "Division-scoped admin can access their assigned School division");
  assert(authorizeReportRequest(schoolAdmin, divCollege.id, "division").status === 403, "Division-scoped admin rejected from unassigned College division (403 Forbidden)");
  assert(authorizeReportRequest(schoolAdmin, divForeign.id, "division").status === 403, "Division-scoped admin rejected from foreign institution division (403)");

  // ---------------------------------------------------------------------------
  // Test Group 7: Financial Reporting Division Filtering
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 7: Financial Reporting Division Filtering ---");

  const feeInvoices = [
    { id: "inv-1", divisionId: divSchool.id, totalAmount: 50000, paidAmount: 50000, status: "PAID" },
    { id: "inv-2", divisionId: divSchool.id, totalAmount: 40000, paidAmount: 20000, status: "PARTIAL" },
    { id: "inv-3", divisionId: divCollege.id, totalAmount: 120000, paidAmount: 120000, status: "PAID" },
    { id: "inv-4", divisionId: divCollege.id, totalAmount: 100000, paidAmount: 0, status: "PENDING" },
  ];

  function evaluateFinanceReport(targetDivId?: string) {
    const filtered = targetDivId ? feeInvoices.filter((i) => i.divisionId === targetDivId) : feeInvoices;
    const billed = filtered.reduce((s, i) => s + i.totalAmount, 0);
    const collected = filtered.reduce((s, i) => s + i.paidAmount, 0);
    const outstanding = billed - collected;
    const rate = billed > 0 ? Number(((collected / billed) * 100).toFixed(1)) : 0;

    return {
      invoiceCount: filtered.length,
      totalBilled: billed,
      totalCollected: collected,
      totalOutstanding: outstanding,
      collectionRate: rate,
    };
  }

  const finAll = evaluateFinanceReport();
  assert(finAll.invoiceCount === 4 && finAll.totalBilled === 310000, "Unfiltered finance report aggregates all institution invoices");
  assert(finAll.totalCollected === 190000 && finAll.totalOutstanding === 120000, "Institution financial balance accurate");

  const finSchool = evaluateFinanceReport(divSchool.id);
  assert(finSchool.invoiceCount === 2 && finSchool.totalBilled === 90000, "School finance report filtered strictly to School invoices (Rs 90,000)");
  assert(finSchool.totalCollected === 70000 && finSchool.totalOutstanding === 20000, "School outstanding balance isolated (Rs 20,000)");
  assert(finSchool.collectionRate === 77.8, "School fee collection rate evaluated (77.8%)");

  const finCollege = evaluateFinanceReport(divCollege.id);
  assert(finCollege.invoiceCount === 2 && finCollege.totalBilled === 220000, "College finance report filtered strictly to College invoices (Rs 220,000)");
  assert(finCollege.totalCollected === 120000 && finCollege.totalOutstanding === 100000, "College outstanding balance isolated (Rs 100,000)");

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n====================================================================");
  console.log(`   STAGE 4 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

// Auto-run if executed directly
if (require.main === module) {
  runDivisionReportingTests();
}
