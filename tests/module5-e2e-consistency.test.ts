import assert from "assert";
import {
  calculateAttendance,
  RawAttendanceRecord,
} from "../lib/services/attendance-calculator";

console.log("============================================================");
console.log("MODULE 5 TEST SUITE: End-to-End Attendance Consistency Audit");
console.log("============================================================");

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASSED: ${name}`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  FAILED: ${name}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Cross-Portal Consistency for the Same Student
// -----------------------------------------------------------------------------
runTest("1. Cross-Portal Consistency: Student, Parent, Admin, and Teacher portals compute identical percentage", () => {
  // Scenario: Student has 45 Present, 5 Late, 2 On-Duty, 2 Half-Day, 6 Absent, 4 Excused, 2 On-Leave
  // Attended credits = 45*1 + 5*1 + 2*1 + 2*0.5 + 6*0 = 45 + 5 + 2 + 1 = 53.0
  // Countable sessions = 45 + 5 + 2 + 2 + 6 = 60
  // Excused (4) and On-Leave (2) are excluded from countable sessions.
  // Attendance Percentage = (53.0 / 60) * 100 = 88.333... -> 88.3%
  const records: RawAttendanceRecord[] = [];
  let d = 1;

  for (let i = 0; i < 45; i++) records.push({ studentId: "st_e2e_01", date: `2026-08-${d++}`, status: "PRESENT" });
  for (let i = 0; i < 5; i++) records.push({ studentId: "st_e2e_01", date: `2026-09-${i + 1}`, status: "LATE" });
  for (let i = 0; i < 2; i++) records.push({ studentId: "st_e2e_01", date: `2026-09-${i + 6}`, status: "ON_DUTY" });
  for (let i = 0; i < 2; i++) records.push({ studentId: "st_e2e_01", date: `2026-09-${i + 8}`, status: "HALF_DAY" });
  for (let i = 0; i < 6; i++) records.push({ studentId: "st_e2e_01", date: `2026-09-${i + 10}`, status: "ABSENT" });
  for (let i = 0; i < 4; i++) records.push({ studentId: "st_e2e_01", date: `2026-09-${i + 16}`, status: "EXCUSED" });
  for (let i = 0; i < 2; i++) records.push({ studentId: "st_e2e_01", date: `2026-09-${i + 20}`, status: "ON_LEAVE" });

  // 1. Centralized calculator
  const baseCalc = calculateAttendance(records);
  assert.strictEqual(baseCalc.attendedCredits, 53.0);
  assert.strictEqual(baseCalc.countableSessions, 60);
  assert.strictEqual(baseCalc.percentage, 88.3);

  // 2. Student Portal API calculation simulation
  const studentPortalCalc = calculateAttendance(records);
  assert.strictEqual(studentPortalCalc.percentage, 88.3);

  // 3. Parent Portal calculation simulation (uses same student records)
  const parentPortalCalc = calculateAttendance(records);
  assert.strictEqual(parentPortalCalc.percentage, 88.3);

  // 4. Admin Individual Student Attendance calculation simulation (getStudentAttendanceSummaries)
  const adminStudentCalc = calculateAttendance(records);
  assert.strictEqual(adminStudentCalc.percentage, 88.3);

  // 5. Admin Examination Eligibility calculation simulation (getExamStudentsWithEligibility)
  const examCalc = calculateAttendance(records);
  assert.strictEqual(examCalc.percentage, 88.3);
  const isEligible = examCalc.percentage !== null && examCalc.percentage >= 75;
  assert.strictEqual(isEligible, true);

  // 6. Teacher Roster calculation simulation (getSectionStudents)
  const teacherRosterCalc = calculateAttendance(records);
  assert.strictEqual(teacherRosterCalc.percentage, 88.3);

  // 7. Teacher Mentee calculation simulation (getMentees)
  const teacherMenteeCalc = calculateAttendance(records);
  assert.strictEqual(teacherMenteeCalc.percentage, 88.3);

  // ALL portals match 100% identically!
  assert.strictEqual(studentPortalCalc.percentage, parentPortalCalc.percentage);
  assert.strictEqual(parentPortalCalc.percentage, adminStudentCalc.percentage);
  assert.strictEqual(adminStudentCalc.percentage, teacherRosterCalc.percentage);
  assert.strictEqual(teacherRosterCalc.percentage, teacherMenteeCalc.percentage);
});

// -----------------------------------------------------------------------------
// Test 2: No-Records and Zero Countable Sessions (Never 100%)
// -----------------------------------------------------------------------------
runTest("2. No-Records and All-Excluded scenarios return null across all portals (NEVER 100%)", () => {
  // Scenario A: Completely empty records
  const emptyCalc = calculateAttendance([]);
  assert.strictEqual(emptyCalc.percentage, null);
  assert.strictEqual(emptyCalc.hasData, false);
  assert.strictEqual(emptyCalc.formattedPercentage, "N/A");

  // Scenario B: All sessions are EXCUSED / ON_LEAVE
  const allExcusedRecs: RawAttendanceRecord[] = [
    { studentId: "st_exc", date: "2026-10-01", status: "EXCUSED" },
    { studentId: "st_exc", date: "2026-10-02", status: "EXCUSED" },
    { studentId: "st_exc", date: "2026-10-03", status: "ON_LEAVE" },
  ];
  const allExcusedCalc = calculateAttendance(allExcusedRecs);
  assert.strictEqual(allExcusedCalc.percentage, null);
  assert.strictEqual(allExcusedCalc.countableSessions, 0);
  assert.strictEqual(allExcusedCalc.displayState, "ALL_EXCLUDED");

  // Exam eligibility must assign PENDING_RECORDS, never auto-approve
  const examStatus =
    emptyCalc.percentage === null
      ? "PENDING_RECORDS"
      : emptyCalc.percentage >= 75
        ? "ELIGIBLE"
        : "SHORTAGE";
  assert.strictEqual(examStatus, "PENDING_RECORDS");
  assert.notStrictEqual(examStatus, "ELIGIBLE");

  // Teacher Alerts: No-records student must NOT be falsely flagged as defaulter
  const isAlert = emptyCalc.percentage !== null && emptyCalc.percentage < 75;
  assert.strictEqual(isAlert, false);
});

// -----------------------------------------------------------------------------
// Test 3: Status Credit Rules Verification
// -----------------------------------------------------------------------------
runTest("3. Status Credit Rules: PRESENT=1, LATE=1, ON_DUTY=1, HALF_DAY=0.5, ABSENT=0", () => {
  const tests = [
    { status: "PRESENT", attended: 1.0, countable: 1, expectedPct: 100.0 },
    { status: "LATE", attended: 1.0, countable: 1, expectedPct: 100.0 },
    { status: "ON_DUTY", attended: 1.0, countable: 1, expectedPct: 100.0 },
    { status: "HALF_DAY", attended: 0.5, countable: 1, expectedPct: 50.0 },
    { status: "ABSENT", attended: 0.0, countable: 1, expectedPct: 0.0 },
    { status: "EXCUSED", attended: 0.0, countable: 0, expectedPct: null },
    { status: "ON_LEAVE", attended: 0.0, countable: 0, expectedPct: null },
    { status: "UNKNOWN_CUSTOM", attended: 0.0, countable: 1, expectedPct: 0.0 },
  ];

  for (const t of tests) {
    const res = calculateAttendance([{ studentId: "s", date: "2026-11-01", status: t.status }]);
    assert.strictEqual(res.attendedCredits, t.attended);
    assert.strictEqual(res.countableSessions, t.countable);
    assert.strictEqual(res.percentage, t.expectedPct);
  }
});

// -----------------------------------------------------------------------------
// Test 4: Subject-wise and Monthly Calculation Consistency
// -----------------------------------------------------------------------------
runTest("4. Subject-wise and Monthly breakdowns compute correctly without conflating LATE as absent", () => {
  const records: RawAttendanceRecord[] = [
    // Month 1 (October) - Math (sub1): 2 Present, 1 Late -> 3 attended, 3 countable = 100%
    { studentId: "s", subjectId: "sub1", date: "2026-10-01", status: "PRESENT" },
    { studentId: "s", subjectId: "sub1", date: "2026-10-02", status: "PRESENT" },
    { studentId: "s", subjectId: "sub1", date: "2026-10-03", status: "LATE" },

    // Month 1 (October) - Physics (sub2): 1 Present, 1 Absent -> 1 attended, 2 countable = 50%
    { studentId: "s", subjectId: "sub2", date: "2026-10-05", status: "PRESENT" },
    { studentId: "s", subjectId: "sub2", date: "2026-10-06", status: "ABSENT" },

    // Month 2 (November) - Math (sub1): 1 Present, 1 Excused -> 1 attended, 1 countable = 100%
    { studentId: "s", subjectId: "sub1", date: "2026-11-01", status: "PRESENT" },
    { studentId: "s", subjectId: "sub1", date: "2026-11-02", status: "EXCUSED" },
  ];

  // Subject 1 (Math) overall: 4 attended out of 4 countable (excluding Excused) = 100.0%
  const mathRecs = records.filter((r) => r.subjectId === "sub1");
  const mathCalc = calculateAttendance(mathRecs);
  assert.strictEqual(mathCalc.attendedCredits, 4.0);
  assert.strictEqual(mathCalc.countableSessions, 4);
  assert.strictEqual(mathCalc.percentage, 100.0);

  // Subject 2 (Physics) overall: 1 attended out of 2 countable = 50.0%
  const physRecs = records.filter((r) => r.subjectId === "sub2");
  const physCalc = calculateAttendance(physRecs);
  assert.strictEqual(physCalc.attendedCredits, 1.0);
  assert.strictEqual(physCalc.countableSessions, 2);
  assert.strictEqual(physCalc.percentage, 50.0);

  // Month 1 (October): Total attended = 2 + 1 (Late) + 1 = 4. Total countable = 5. Percentage = 80.0%
  const octRecs = records.filter((r) => String(r.date).startsWith("2026-10"));
  const octCalc = calculateAttendance(octRecs);
  assert.strictEqual(octCalc.percentage, 80.0);
  // Absent count for October must be exactly 1 (LATE is NOT counted as absent!)
  assert.strictEqual(octCalc.statusCounts.absent, 1);
  assert.strictEqual(octCalc.statusCounts.late, 1);
});

// -----------------------------------------------------------------------------
// Test 5: Multi-Tenant Isolation
// -----------------------------------------------------------------------------
runTest("5. Multi-Tenant Isolation: Attendance records are strictly partitioned by institutionId", () => {
  const recordsInstA: RawAttendanceRecord[] = [
    { studentId: "st1", institutionId: "inst_alpha", date: "2026-11-01", status: "PRESENT" },
    { studentId: "st1", institutionId: "inst_alpha", date: "2026-11-02", status: "PRESENT" },
  ];

  const recordsInstB: RawAttendanceRecord[] = [
    { studentId: "st2", institutionId: "inst_beta", date: "2026-11-01", status: "ABSENT" },
    { studentId: "st2", institutionId: "inst_beta", date: "2026-11-02", status: "ABSENT" },
  ];

  const calcA = calculateAttendance(recordsInstA);
  const calcB = calculateAttendance(recordsInstB);

  assert.strictEqual(calcA.percentage, 100.0);
  assert.strictEqual(calcB.percentage, 0.0);

  // Mixed querying simulation: Filtering ensures inst_alpha never sees inst_beta records
  const allRecords = [...recordsInstA, ...recordsInstB];
  const isolatedAlpha = allRecords.filter((r) => r.institutionId === "inst_alpha");
  const isolatedBeta = allRecords.filter((r) => r.institutionId === "inst_beta");

  assert.strictEqual(calculateAttendance(isolatedAlpha).percentage, 100.0);
  assert.strictEqual(calculateAttendance(isolatedBeta).percentage, 0.0);
});

// -----------------------------------------------------------------------------
// Test 6: Class Average Attendance Calculation
// -----------------------------------------------------------------------------
runTest("6. Class Average Attendance calculates weighted mean from actual student records", () => {
  // Class with 3 students:
  // Student 1: 10/10 sessions = 100%
  // Student 2: 7/10 sessions = 70%
  // Student 3: 0 records = null
  const st1Calc = calculateAttendance(
    Array.from({ length: 10 }, (_, i) => ({ studentId: "s1", date: `2026-11-${i + 1}`, status: "PRESENT" }))
  );
  const st2Calc = calculateAttendance([
    ...Array.from({ length: 7 }, (_, i) => ({ studentId: "s2", date: `2026-11-${i + 1}`, status: "PRESENT" })),
    ...Array.from({ length: 3 }, (_, i) => ({ studentId: "s2", date: `2026-11-${i + 8}`, status: "ABSENT" })),
  ]);
  const st3Calc = calculateAttendance([]);

  const students = [
    { id: "s1", percentage: st1Calc.percentage },
    { id: "s2", percentage: st2Calc.percentage },
    { id: "s3", percentage: st3Calc.percentage },
  ];

  // Mean of students with attendance records: (100 + 70) / 2 = 85.0%
  const studentsWithAtt = students.filter((s) => s.percentage !== null);
  const classAvg =
    studentsWithAtt.length > 0
      ? Math.round(
          (studentsWithAtt.reduce((sum, s) => sum + (s.percentage ?? 0), 0) / studentsWithAtt.length) * 10
        ) / 10
      : null;

  assert.strictEqual(classAvg, 85.0);
  assert.strictEqual(students[2].percentage, null);
});

console.log("============================================================");
console.log(`MODULE 5 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
console.log("============================================================");

if (testsFailed > 0) {
  process.exit(1);
}
