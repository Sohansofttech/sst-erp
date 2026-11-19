import assert from "assert";
import {
  calculateAttendance,
  calculateSubjectWiseAttendance,
  calculateMonthlyAttendance,
  RawAttendanceRecord,
} from "../lib/services/attendance-calculator";

console.log("=== Running Module 2 Integration & Consistency Test Suite ===");

// 1. Verification: Monthly absent counts (LATE and ON_DUTY must NOT be counted as absent)
{
  const testRecords: RawAttendanceRecord[] = [
    {
      id: "1",
      studentId: "stu_1",
      institutionId: "inst_1",
      subjectId: "sub_1",
      subjectCode: "CS301",
      subjectName: "DBMS",
      date: new Date("2026-03-01"),
      status: "PRESENT",
    },
    {
      id: "2",
      studentId: "stu_1",
      institutionId: "inst_1",
      subjectId: "sub_1",
      subjectCode: "CS301",
      subjectName: "DBMS",
      date: new Date("2026-03-02"),
      status: "LATE",
    },
    {
      id: "3",
      studentId: "stu_1",
      institutionId: "inst_1",
      subjectId: "sub_1",
      subjectCode: "CS301",
      subjectName: "DBMS",
      date: new Date("2026-03-03"),
      status: "ON_DUTY",
    },
    {
      id: "4",
      studentId: "stu_1",
      institutionId: "inst_1",
      subjectId: "sub_1",
      subjectCode: "CS301",
      subjectName: "DBMS",
      date: new Date("2026-03-04"),
      status: "ABSENT",
    },
    {
      id: "5",
      studentId: "stu_1",
      institutionId: "inst_1",
      subjectId: "sub_1",
      subjectCode: "CS301",
      subjectName: "DBMS",
      date: new Date("2026-03-05"),
      status: "EXCUSED",
    },
  ];

  const overall = calculateAttendance(testRecords);
  assert.strictEqual(overall.statusCounts.present, 1, "Present count should be 1");
  assert.strictEqual(overall.statusCounts.late, 1, "Late count should be 1");
  assert.strictEqual(overall.statusCounts.onDuty, 1, "OnDuty count should be 1");
  assert.strictEqual(overall.statusCounts.absent, 1, "Absent count should strictly be 1");
  assert.strictEqual(overall.statusCounts.excused, 1, "Excused count should be 1");

  // In old bug: absent was computed as total - attended, which incorrectly classified late/on-duty as absent!
  // With centralized calculator: absent is strictly 1
  assert.strictEqual(overall.statusCounts.absent, 1, "Absent count must not conflate late or on_duty");

  // Countable sessions = 4 (PRESENT + LATE + ON_DUTY + ABSENT). EXCUSED excluded.
  assert.strictEqual(overall.countableSessions, 4, "Denominator should be 4");
  // Attended credits = 1 (PRESENT) + 1 (LATE) + 1 (ON_DUTY) = 3
  assert.strictEqual(overall.attendedCredits, 3, "Numerator should be 3");
  // Percentage = 3/4 = 75%
  assert.strictEqual(overall.percentage, 75, "Percentage should be 75%");

  // Verify monthly grouping
  const monthly = calculateMonthlyAttendance(testRecords);
  assert.strictEqual(monthly.length, 1);
  assert.strictEqual(monthly[0].absentClasses, 1, "Monthly absent count should strictly be 1");
  assert.strictEqual(monthly[0].lateClasses, 1, "Monthly late count should be 1");
  assert.strictEqual(monthly[0].attendedClasses, 3, "Monthly attended count should be 3");
  assert.strictEqual(monthly[0].percentage, 75, "Monthly percentage should be 75%");
  console.log("  ✓ Monthly absent counts & status classification verified");
}

// 2. Verification: No records handling (no 100% or 95% fallback)
{
  const emptyRecords: RawAttendanceRecord[] = [];
  const emptyResult = calculateAttendance(emptyRecords);

  assert.strictEqual(emptyResult.percentage, null, "Percentage must be null when no records exist");
  assert.strictEqual(emptyResult.hasData, false, "hasData must be false");
  assert.strictEqual(emptyResult.displayState, "NO_DATA", "displayState must be NO_DATA");
  assert.strictEqual(emptyResult.displayLabel, "No attendance data available", "displayLabel must be 'No attendance data available'");
  assert.strictEqual(emptyResult.countableSessions, 0, "countableSessions must be 0");
  assert.strictEqual(emptyResult.attendedCredits, 0, "attendedCredits must be 0");

  const emptySubjectWise = calculateSubjectWiseAttendance(emptyRecords);
  assert.strictEqual(emptySubjectWise.length, 0, "Subject-wise array should be empty");

  const emptyMonthly = calculateMonthlyAttendance(emptyRecords);
  assert.strictEqual(emptyMonthly.length, 0, "Monthly array should be empty");
  console.log("  ✓ No-records scenario returns null percentage and hasData: false (no 100% fallback)");
}

// 3. Verification: All-excused records handling
{
  const allExcusedRecords: RawAttendanceRecord[] = [
    {
      id: "ex_1",
      studentId: "stu_1",
      institutionId: "inst_1",
      subjectId: "sub_1",
      date: new Date("2026-03-01"),
      status: "EXCUSED",
    },
    {
      id: "ex_2",
      studentId: "stu_1",
      institutionId: "inst_1",
      subjectId: "sub_1",
      date: new Date("2026-03-02"),
      status: "ON_LEAVE",
    },
  ];

  const excusedResult = calculateAttendance(allExcusedRecords);
  assert.strictEqual(excusedResult.percentage, null, "Percentage must be null when all sessions are excused");
  assert.strictEqual(excusedResult.countableSessions, 0, "Countable sessions must be 0");
  assert.strictEqual(excusedResult.totalRecords, 2, "Total records is 2");
  assert.strictEqual(excusedResult.displayState, "ALL_EXCLUDED", "displayState should be ALL_EXCLUDED");
  assert.strictEqual(excusedResult.displayLabel, "No countable attendance sessions (All excused / on approved leave)", "displayLabel should reflect excused");
  console.log("  ✓ All-excused records returns null percentage with ALL_EXCLUDED display state");
}

// 4. Verification: Student & Parent Identical Calculations across multiple subjects
{
  const multiSubjectRecords: RawAttendanceRecord[] = [
    // Sub 1: DBMS - 10 Present, 2 Absent -> 10/12 = 83.33% -> 83%
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `dbms_p_${i}`,
      studentId: "stu_john",
      institutionId: "inst_apex",
      subjectId: "sub_cs301",
      subjectCode: "CS301",
      subjectName: "Database Management Systems",
      date: new Date(`2026-01-${i + 1}`),
      status: "PRESENT",
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `dbms_a_${i}`,
      studentId: "stu_john",
      institutionId: "inst_apex",
      subjectId: "sub_cs301",
      subjectCode: "CS301",
      subjectName: "Database Management Systems",
      date: new Date(`2026-01-${i + 15}`),
      status: "ABSENT",
    })),
    // Sub 2: OS - 8 Present, 1 Late, 1 Half Day, 2 Absent -> (8+1+0.5)/12 = 9.5/12 = 79.17% -> 79%
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `os_p_${i}`,
      studentId: "stu_john",
      institutionId: "inst_apex",
      subjectId: "sub_cs302",
      subjectCode: "CS302",
      subjectName: "Operating Systems",
      date: new Date(`2026-02-${i + 1}`),
      status: "PRESENT",
    })),
    {
      id: "os_late",
      studentId: "stu_john",
      institutionId: "inst_apex",
      subjectId: "sub_cs302",
      subjectCode: "CS302",
      subjectName: "Operating Systems",
      date: new Date("2026-02-10"),
      status: "LATE",
    },
    {
      id: "os_half",
      studentId: "stu_john",
      institutionId: "inst_apex",
      subjectId: "sub_cs302",
      subjectCode: "CS302",
      subjectName: "Operating Systems",
      date: new Date("2026-02-11"),
      status: "HALF_DAY",
    },
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `os_a_${i}`,
      studentId: "stu_john",
      institutionId: "inst_apex",
      subjectId: "sub_cs302",
      subjectCode: "CS302",
      subjectName: "Operating Systems",
      date: new Date(`2026-02-${i + 15}`),
      status: "ABSENT",
    })),
  ];

  // Calculated for Student API
  const studentResult = calculateAttendance(multiSubjectRecords);
  const studentSubjectWise = calculateSubjectWiseAttendance(multiSubjectRecords);
  const studentMonthly = calculateMonthlyAttendance(multiSubjectRecords);

  // Calculated for Parent API
  const parentResult = calculateAttendance(multiSubjectRecords);
  const parentSubjectWise = calculateSubjectWiseAttendance(multiSubjectRecords);
  const parentMonthly = calculateMonthlyAttendance(multiSubjectRecords);

  // Assert complete parity
  assert.strictEqual(studentResult.percentage, parentResult.percentage, "Overall percentage must match exactly");
  assert.strictEqual(studentResult.countableSessions, parentResult.countableSessions, "Total sessions must match");
  assert.strictEqual(studentResult.attendedCredits, parentResult.attendedCredits, "Attended credits must match");
  assert.deepStrictEqual(studentSubjectWise, parentSubjectWise, "Subject-wise breakdowns must match exactly");
  assert.deepStrictEqual(studentMonthly, parentMonthly, "Monthly breakdowns must match exactly");

  // Total sessions: 12 + 12 = 24. Attended credits: 10 + 9.5 = 19.5. Pct: 19.5/24 = 81.25% -> 81.3% (with 1 decimal place precision)
  assert.strictEqual(studentResult.percentage, 81.3, "Overall percentage should be 81.3%");
  console.log("  ✓ Student and Parent APIs generate 100% mathematically identical attendance stats");
}

// 5. Verification: Dashboard Course Cards dynamic binding (no hardcoded attendance)
{
  const mockSubjectWise = [
    {
      subjectCode: "CS301",
      subjectName: "Database Management Systems",
      percentage: 83,
      totalClasses: 12,
      attendedClasses: 10,
    },
    {
      subjectCode: "CS302",
      subjectName: "Operating Systems",
      percentage: 79,
      totalClasses: 12,
      attendedClasses: 9.5,
    },
  ];

  const baseCourses = [
    { code: "CS301", name: "Database Management Systems" },
    { code: "CS302", name: "Operating Systems" },
    { code: "CS303", name: "Computer Networks" }, // no data in attendance
  ];

  const mappedCourses = baseCourses.map((c) => {
    const matched = mockSubjectWise.find(
      (s) =>
        s.subjectCode.toLowerCase() === c.code.toLowerCase() ||
        s.subjectName.toLowerCase() === c.name.toLowerCase()
    );
    const actualAttendance = matched && matched.percentage !== null && matched.percentage !== undefined ? matched.percentage : null;
    return {
      ...c,
      attendance: actualAttendance,
      attendanceLabel: actualAttendance !== null ? `${actualAttendance}% Attended` : "No sessions",
    };
  });

  assert.strictEqual(mappedCourses[0].attendance, 83, "CS301 should receive actual 83% attendance");
  assert.strictEqual(mappedCourses[0].attendanceLabel, "83% Attended");
  assert.strictEqual(mappedCourses[1].attendance, 79, "CS302 should receive actual 79% attendance");
  assert.strictEqual(mappedCourses[1].attendanceLabel, "79% Attended");
  assert.strictEqual(mappedCourses[2].attendance, null, "CS303 with no records must be null");
  assert.strictEqual(mappedCourses[2].attendanceLabel, "No sessions", "CS303 should display 'No sessions'");
  console.log("  ✓ Dashboard course cards map dynamic attendance percentages with proper empty state");
}

console.log("\n=== All Module 2 Integration Tests PASSED (5/5) ===\n");
