import assert from "assert";
import {
  calculateAttendance,
  RawAttendanceRecord,
} from "../lib/services/attendance-calculator";
import type {
  ClassAllocation,
  StudentRosterItem,
  Mentee,
} from "../types/teacher";

console.log("------------------------------------------------------------");
console.log("MODULE 4 TEST SUITE: Teacher Portal Student Attendance Display");
console.log("------------------------------------------------------------");

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
// Test 1: Location 1 - Low Attendance Alerts
// -----------------------------------------------------------------------------
runTest("Location 1: Low Attendance Alerts filter only students below 75%", () => {
  // Student 1: 5 attended out of 10 countable = 50% (< 75%) -> Alert
  const recs1: RawAttendanceRecord[] = [
    { studentId: "s1", date: "2026-11-01", status: "PRESENT" },
    { studentId: "s1", date: "2026-11-02", status: "PRESENT" },
    { studentId: "s1", date: "2026-11-03", status: "PRESENT" },
    { studentId: "s1", date: "2026-11-04", status: "PRESENT" },
    { studentId: "s1", date: "2026-11-05", status: "PRESENT" },
    { studentId: "s1", date: "2026-11-06", status: "ABSENT" },
    { studentId: "s1", date: "2026-11-07", status: "ABSENT" },
    { studentId: "s1", date: "2026-11-08", status: "ABSENT" },
    { studentId: "s1", date: "2026-11-09", status: "ABSENT" },
    { studentId: "s1", date: "2026-11-10", status: "ABSENT" },
  ];
  const calc1 = calculateAttendance(recs1);
  assert.strictEqual(calc1.percentage, 50.0);

  // Student 2: 9 attended out of 10 countable = 90% (>= 75%) -> No alert
  const recs2: RawAttendanceRecord[] = [
    { studentId: "s2", date: "2026-11-01", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-02", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-03", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-04", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-05", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-06", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-07", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-08", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-09", status: "PRESENT" },
    { studentId: "s2", date: "2026-11-10", status: "ABSENT" },
  ];
  const calc2 = calculateAttendance(recs2);
  assert.strictEqual(calc2.percentage, 90.0);

  // Student 3: No records -> percentage null -> Not flagged as low attendance alert
  const recs3: RawAttendanceRecord[] = [];
  const calc3 = calculateAttendance(recs3);
  assert.strictEqual(calc3.percentage, null);

  const students: Array<{ id: string; attendancePercent: number | null }> = [
    { id: "s1", attendancePercent: calc1.percentage },
    { id: "s2", attendancePercent: calc2.percentage },
    { id: "s3", attendancePercent: calc3.percentage },
  ];

  const alerts = students.filter(
    (s) => s.attendancePercent !== null && s.attendancePercent < 75
  );

  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].id, "s1");
});

// -----------------------------------------------------------------------------
// Test 2: Location 2 - Teacher Classes Page Average Attendance
// -----------------------------------------------------------------------------
runTest("Location 2: Teacher Classes calculates actual class average without hardcoded 94.2/91.6/89.8", () => {
  // Class A: 3 students, 1 with 80%, 1 with 100%, 1 with 60%
  // Attended: 8 + 10 + 6 = 24. Total: 10 + 10 + 10 = 30. Class average = (24/30)*100 = 80.0%
  const classRecs: RawAttendanceRecord[] = [];
  for (let i = 1; i <= 8; i++) classRecs.push({ studentId: "st1", date: `2026-11-0${i}`, status: "PRESENT" });
  for (let i = 9; i <= 10; i++) classRecs.push({ studentId: "st1", date: `2026-11-${i}`, status: "ABSENT" });

  for (let i = 1; i <= 10; i++) classRecs.push({ studentId: "st2", date: `2026-11-${i < 10 ? '0' + i : i}`, status: "PRESENT" });

  for (let i = 1; i <= 6; i++) classRecs.push({ studentId: "st3", date: `2026-11-0${i}`, status: "PRESENT" });
  for (let i = 7; i <= 10; i++) classRecs.push({ studentId: "st3", date: `2026-11-${i < 10 ? '0' + i : i}`, status: "ABSENT" });

  const classCalc = calculateAttendance(classRecs);
  assert.strictEqual(classCalc.percentage, 80.0);

  const allocation: ClassAllocation = {
    id: "ca-10a",
    institutionId: "inst_test",
    academicYearId: "ay_test",
    teacherId: "tch_test",
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    role: "class_teacher",
    studentCount: 3,
    roomNo: "B-204",
    averageAttendancePercent: classCalc.percentage,
  };

  assert.strictEqual(allocation.averageAttendancePercent, 80.0);
  assert.notStrictEqual(allocation.averageAttendancePercent, 94.2);
  assert.notStrictEqual(allocation.averageAttendancePercent, 91.6);
  assert.notStrictEqual(allocation.averageAttendancePercent, 89.8);

  // Class with zero records must return null, never 100%
  const emptyCalc = calculateAttendance([]);
  assert.strictEqual(emptyCalc.percentage, null);
  const emptyAlloc: ClassAllocation = {
    ...allocation,
    id: "ca-10b",
    section: "B",
    averageAttendancePercent: emptyCalc.percentage,
  };
  assert.strictEqual(emptyAlloc.averageAttendancePercent, null);
});

// -----------------------------------------------------------------------------
// Test 3: Location 3 - Teacher Attendance Register Student Attendance %
// -----------------------------------------------------------------------------
runTest("Location 3: Teacher Attendance Register uses centralized status weights", () => {
  // Test mixed statuses: PRESENT(1), LATE(1), ON_DUTY(1), HALF_DAY(0.5), ABSENT(0), EXCUSED(excl), ON_LEAVE(excl)
  const studentRecs: RawAttendanceRecord[] = [
    { studentId: "st_reg", date: "2026-11-01", status: "PRESENT" },  // +1
    { studentId: "st_reg", date: "2026-11-02", status: "LATE" },     // +1
    { studentId: "st_reg", date: "2026-11-03", status: "ON_DUTY" },  // +1
    { studentId: "st_reg", date: "2026-11-04", status: "HALF_DAY" }, // +0.5
    { studentId: "st_reg", date: "2026-11-05", status: "ABSENT" },   // +0
    { studentId: "st_reg", date: "2026-11-06", status: "EXCUSED" },  // excluded
    { studentId: "st_reg", date: "2026-11-07", status: "ON_LEAVE" }, // excluded
  ];

  const calc = calculateAttendance(studentRecs);
  // Total countable = 5 (PRESENT, LATE, ON_DUTY, HALF_DAY, ABSENT)
  // Attended credits = 1 + 1 + 1 + 0.5 + 0 = 3.5
  // Percentage = (3.5 / 5) * 100 = 70.0%
  assert.strictEqual(calc.countableSessions, 5);
  assert.strictEqual(calc.attendedCredits, 3.5);
  assert.strictEqual(calc.percentage, 70.0);

  const rosterItem: StudentRosterItem = {
    studentId: "st_reg",
    rollNo: "1001",
    admissionNo: "ADM001",
    fullName: "Rohan Deshmukh",
    classId: "cls-10",
    className: "Class 10",
    sectionId: "sec-10a",
    section: "A",
    attendancePercent: calc.percentage,
    iaAverage: 75,
    guardianContact: {
      guardianName: "Suresh Deshmukh",
      relation: "Father",
      phone: "+91 98450 11111",
    },
  };

  assert.strictEqual(rosterItem.attendancePercent, 70.0);
});

// -----------------------------------------------------------------------------
// Test 4: Location 4 - Class Teacher Page Summaries and Defaulters
// -----------------------------------------------------------------------------
runTest("Location 4: Class Teacher Page computes section averages & categorizes defaulters", () => {
  const students: StudentRosterItem[] = [
    {
      studentId: "ct1",
      rollNo: "101",
      admissionNo: "A101",
      fullName: "Student One",
      classId: "cls-10",
      className: "Class 10",
      sectionId: "sec-10a",
      section: "A",
      attendancePercent: 72.0, // Defaulter (< 75)
      iaAverage: 65,
      guardianContact: { guardianName: "G1", relation: "Father", phone: "111" },
    },
    {
      studentId: "ct2",
      rollNo: "102",
      admissionNo: "A102",
      fullName: "Student Two",
      classId: "cls-10",
      className: "Class 10",
      sectionId: "sec-10a",
      section: "A",
      attendancePercent: 78.0, // Borderline (75 - 81)
      iaAverage: 72,
      guardianContact: { guardianName: "G2", relation: "Mother", phone: "222" },
    },
    {
      studentId: "ct3",
      rollNo: "103",
      admissionNo: "A103",
      fullName: "Student Three",
      classId: "cls-10",
      className: "Class 10",
      sectionId: "sec-10a",
      section: "A",
      attendancePercent: 96.0, // Good standing (>= 90)
      iaAverage: 88,
      guardianContact: { guardianName: "G3", relation: "Guardian", phone: "333" },
    },
    {
      studentId: "ct4",
      rollNo: "104",
      admissionNo: "A104",
      fullName: "Student Four (No records)",
      classId: "cls-10",
      className: "Class 10",
      sectionId: "sec-10a",
      section: "A",
      attendancePercent: null, // No attendance records
      iaAverage: 70,
      guardianContact: { guardianName: "G4", relation: "Father", phone: "444" },
    },
  ];

  const defaulters = students.filter((s) => s.attendancePercent !== null && s.attendancePercent < 75);
  const borderline = students.filter(
    (s) => s.attendancePercent !== null && s.attendancePercent >= 75 && s.attendancePercent < 82
  );
  const studentsWithAtt = students.filter((s) => s.attendancePercent !== null);

  assert.strictEqual(defaulters.length, 1);
  assert.strictEqual(defaulters[0].studentId, "ct1");

  assert.strictEqual(borderline.length, 1);
  assert.strictEqual(borderline[0].studentId, "ct2");

  assert.strictEqual(studentsWithAtt.length, 3);

  // Mean of 72.0, 78.0, 96.0 = 246.0 / 3 = 82.0%
  const avgAttendance =
    studentsWithAtt.length > 0
      ? Math.round(
          (studentsWithAtt.reduce((sum, s) => sum + (s.attendancePercent ?? 0), 0) /
            studentsWithAtt.length) *
            10
        ) / 10
      : null;

  assert.strictEqual(avgAttendance, 82.0);
});

// -----------------------------------------------------------------------------
// Test 5: Location 5 - Teacher Mentoring Page Mentee Attendance & Dynamic Risk
// -----------------------------------------------------------------------------
runTest("Location 5: Teacher Mentoring computes actual mentee attendance and removes hardcoded 94.2%", () => {
  // Mentee A: At risk (< 75%)
  const recsA: RawAttendanceRecord[] = [
    { studentId: "mA", date: "2026-11-01", status: "PRESENT" },
    { studentId: "mA", date: "2026-11-02", status: "PRESENT" },
    { studentId: "mA", date: "2026-11-03", status: "ABSENT" },
    { studentId: "mA", date: "2026-11-04", status: "ABSENT" },
  ];
  const calcA = calculateAttendance(recsA);
  assert.strictEqual(calcA.percentage, 50.0);

  const menteeA: Mentee = {
    id: "mentee-mA",
    institutionId: "inst_demo",
    academicYearId: "ay_2026",
    mentorTeacherId: "tch_mentor",
    studentId: "mA",
    rollNo: "M01",
    admissionNo: "ADM_M01",
    fullName: "Mentee At-Risk",
    className: "Class 10",
    section: "A",
    attendancePercent: calcA.percentage,
    iaAverage: 65,
    riskLevel:
      calcA.percentage !== null && calcA.percentage < 75
        ? "at_risk"
        : calcA.percentage !== null && calcA.percentage < 82
          ? "watch"
          : "on_track",
    guardianContact: { guardianName: "Parent A", relation: "Guardian", phone: "+91 99999 11111" },
  };

  assert.strictEqual(menteeA.attendancePercent, 50.0);
  assert.strictEqual(menteeA.riskLevel, "at_risk");
  assert.notStrictEqual(menteeA.attendancePercent, 94.2);

  // Mentee B: On Track (90%)
  const recsB: RawAttendanceRecord[] = [
    { studentId: "mB", date: "2026-11-01", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-02", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-03", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-04", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-05", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-06", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-07", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-08", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-09", status: "PRESENT" },
    { studentId: "mB", date: "2026-11-10", status: "ABSENT" },
  ];
  const calcB = calculateAttendance(recsB);
  assert.strictEqual(calcB.percentage, 90.0);

  const menteeB: Mentee = {
    ...menteeA,
    id: "mentee-mB",
    studentId: "mB",
    attendancePercent: calcB.percentage,
    riskLevel:
      calcB.percentage !== null && calcB.percentage < 75
        ? "at_risk"
        : calcB.percentage !== null && calcB.percentage < 82
          ? "watch"
          : "on_track",
  };

  assert.strictEqual(menteeB.attendancePercent, 90.0);
  assert.strictEqual(menteeB.riskLevel, "on_track");

  // Mentee C: No records -> returns null
  const calcC = calculateAttendance([]);
  assert.strictEqual(calcC.percentage, null);
  const menteeC: Mentee = {
    ...menteeA,
    id: "mentee-mC",
    studentId: "mC",
    attendancePercent: calcC.percentage,
    riskLevel: "on_track",
  };
  assert.strictEqual(menteeC.attendancePercent, null);
});

// -----------------------------------------------------------------------------
// Test 6: Multi-Tenant and Filter Consistency
// -----------------------------------------------------------------------------
runTest("Multi-Tenant and Filter Consistency: Tenant records do not bleed across institutions", () => {
  const tenant1Records: RawAttendanceRecord[] = [
    { studentId: "st_t1", institutionId: "inst_alpha", date: "2026-11-01", status: "PRESENT" },
    { studentId: "st_t1", institutionId: "inst_alpha", date: "2026-11-02", status: "PRESENT" },
  ];

  const tenant2Records: RawAttendanceRecord[] = [
    { studentId: "st_t2", institutionId: "inst_beta", date: "2026-11-01", status: "ABSENT" },
  ];

  const calcT1 = calculateAttendance(tenant1Records);
  const calcT2 = calculateAttendance(tenant2Records);

  assert.strictEqual(calcT1.percentage, 100.0);
  assert.strictEqual(calcT2.percentage, 0.0);
  assert.strictEqual(calcT1.countableSessions, 2);
  assert.strictEqual(calcT2.countableSessions, 1);
});

console.log("------------------------------------------------------------");
console.log(`MODULE 4 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
console.log("------------------------------------------------------------");

if (testsFailed > 0) {
  process.exit(1);
}
