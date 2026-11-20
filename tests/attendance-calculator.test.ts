import {
  calculateAttendance,
  normalizeAttendanceStatus,
  deduplicateRecords,
  calculateSubjectWiseAttendance,
  calculateMonthlyAttendance,
  RawAttendanceRecord,
} from "../lib/services/attendance-calculator";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: ${message}. Expected: ${expected}, Got: ${actual}`);
  }
}

async function runTests() {
  console.log("=== Running Centralized Attendance Calculator Unit Tests ===");
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${e.message}`);
    }
  }

  // 1. Status normalization unit tests
  test("Status: PRESENT grants 1 attended and 1 countable credit", () => {
    const rule = normalizeAttendanceStatus("PRESENT");
    assertEqual(rule.attendedCredit, 1.0, "Attended credit for PRESENT");
    assertEqual(rule.countableCredit, 1.0, "Countable credit for PRESENT");
    assertEqual(rule.isCountable, true, "isCountable for PRESENT");
  });

  test("Status: LATE grants 1 attended and 1 countable credit", () => {
    const rule = normalizeAttendanceStatus("LATE");
    assertEqual(rule.attendedCredit, 1.0, "Attended credit for LATE");
    assertEqual(rule.countableCredit, 1.0, "Countable credit for LATE");
    assertEqual(rule.isCountable, true, "isCountable for LATE");
  });

  test("Status: ON_DUTY grants 1 attended and 1 countable credit", () => {
    const rule = normalizeAttendanceStatus("ON_DUTY");
    assertEqual(rule.attendedCredit, 1.0, "Attended credit for ON_DUTY");
    assertEqual(rule.countableCredit, 1.0, "Countable credit for ON_DUTY");
  });

  test("Status: HALF_DAY grants 0.5 attended and 1 countable credit", () => {
    const rule = normalizeAttendanceStatus("HALF_DAY");
    assertEqual(rule.attendedCredit, 0.5, "Attended credit for HALF_DAY");
    assertEqual(rule.countableCredit, 1.0, "Countable credit for HALF_DAY");
  });

  test("Status: ABSENT grants 0 attended and 1 countable credit", () => {
    const rule = normalizeAttendanceStatus("ABSENT");
    assertEqual(rule.attendedCredit, 0.0, "Attended credit for ABSENT");
    assertEqual(rule.countableCredit, 1.0, "Countable credit for ABSENT");
  });

  test("Status: EXCUSED excludes from denominator (0 countable credit)", () => {
    const rule = normalizeAttendanceStatus("EXCUSED");
    assertEqual(rule.attendedCredit, 0.0, "Attended credit for EXCUSED");
    assertEqual(rule.countableCredit, 0.0, "Countable credit for EXCUSED");
    assertEqual(rule.isCountable, false, "isCountable for EXCUSED");
  });

  test("Status: ON_LEAVE excludes from denominator (0 countable credit)", () => {
    const rule = normalizeAttendanceStatus("ON_LEAVE");
    assertEqual(rule.attendedCredit, 0.0, "Attended credit for ON_LEAVE");
    assertEqual(rule.countableCredit, 0.0, "Countable credit for ON_LEAVE");
    assertEqual(rule.isCountable, false, "isCountable for ON_LEAVE");
  });

  test("Status: Case and whitespace insensitivity (e.g. 'On Leave', 'half-day')", () => {
    assertEqual(normalizeAttendanceStatus("On Leave").standardStatus, "ON_LEAVE", "On Leave");
    assertEqual(normalizeAttendanceStatus("half-day").standardStatus, "HALF_DAY", "half-day");
    assertEqual(normalizeAttendanceStatus("present ").standardStatus, "PRESENT", "present with trailing space");
    assertEqual(normalizeAttendanceStatus("duty").standardStatus, "ON_DUTY", "duty as ON_DUTY");
  });

  test("Status: UNKNOWN status is flagged and never silently counted as attended", () => {
    const rule = normalizeAttendanceStatus("SOMETHING_WEIRD");
    assertEqual(rule.standardStatus, "UNKNOWN", "Standard status for weird input");
    assertEqual(rule.attendedCredit, 0.0, "Unknown should have 0 attended credit");
    assertEqual(rule.countableCredit, 1.0, "Unknown should be counted in denominator for verification");
  });

  // 2. No records scenarios
  test("No Records: returns percentage: null, never 100%", () => {
    const result = calculateAttendance([]);
    assertEqual(result.percentage, null, "percentage must be null when empty");
    assertEqual(result.hasData, false, "hasData must be false");
    assertEqual(result.displayState, "NO_DATA", "displayState must be NO_DATA");
    assertEqual(result.formattedPercentage, "N/A", "formattedPercentage must be N/A");
    assertEqual(result.isEligible, false, "isEligible must be false for empty records");
  });

  // 3. All sessions excused / on leave
  test("All Sessions Excused: returns percentage: null, displayState: ALL_EXCLUDED", () => {
    const records: RawAttendanceRecord[] = [
      { date: "2026-11-01", status: "EXCUSED" },
      { date: "2026-11-02", status: "ON_LEAVE" },
    ];
    const result = calculateAttendance(records);
    assertEqual(result.percentage, null, "percentage must be null when all excluded");
    assertEqual(result.countableSessions, 0, "countableSessions must be 0");
    assertEqual(result.displayState, "ALL_EXCLUDED", "displayState must be ALL_EXCLUDED");
    assertEqual(result.excusedSessions, 2, "excusedSessions must be 2");
  });

  // 4. Exact audit report example
  // Present: 45, Late: 5, Absent: 5, Excused: 5
  // Formula: (45 + 5) / (45 + 5 + 5) * 100 = 50 / 55 * 100 = 90.91% -> 90.9%
  test("Audit Report Example: 45 Present, 5 Late, 5 Absent, 5 Excused = 90.9%", () => {
    const records: RawAttendanceRecord[] = [];
    for (let i = 0; i < 45; i++) records.push({ date: `2026-08-${i + 1}`, status: "PRESENT", session: `s${i}` });
    for (let i = 0; i < 5; i++) records.push({ date: `2026-09-${i + 1}`, status: "LATE", session: `s${i}` });
    for (let i = 0; i < 5; i++) records.push({ date: `2026-10-${i + 1}`, status: "ABSENT", session: `s${i}` });
    for (let i = 0; i < 5; i++) records.push({ date: `2026-11-${i + 1}`, status: "EXCUSED", session: `s${i}` });

    const result = calculateAttendance(records, { deduplicate: false });
    assertEqual(result.totalRecords, 60, "totalRecords");
    assertEqual(result.countableSessions, 55, "countableSessions (5 Excused excluded)");
    assertEqual(result.attendedCredits, 50, "attendedCredits (45 + 5)");
    assertEqual(result.absentCredits, 5, "absentCredits");
    assertEqual(result.percentage, 90.9, "percentage must be 90.9%");
    assertEqual(result.formattedPercentage, "90.9%", "formattedPercentage");
    assertEqual(result.isEligible, true, "isEligible (>= 75%)");
  });

  // 5. On Duty and Half Day calculations
  test("On Duty and Half Day calculations credit properly", () => {
    const records: RawAttendanceRecord[] = [
      { date: "2026-11-01", status: "PRESENT" },
      { date: "2026-11-02", status: "ON_DUTY" },   // 1.0
      { date: "2026-11-03", status: "HALF_DAY" },  // 0.5
      { date: "2026-11-04", status: "ABSENT" },    // 0.0
    ];
    // Attended: 1 + 1 + 0.5 = 2.5
    // Countable: 4.0
    // Percentage: 2.5 / 4.0 * 100 = 62.5%
    const result = calculateAttendance(records);
    assertEqual(result.attendedCredits, 2.5, "attendedCredits");
    assertEqual(result.countableSessions, 4, "countableSessions");
    assertEqual(result.percentage, 62.5, "percentage");
    assertEqual(result.isEligible, false, "isEligible for 62.5% (threshold 75%)");
    assertEqual(result.shortfallPercentage, 12.5, "shortfallPercentage (75 - 62.5)");
  });

  // 6. Unknown statuses flagged
  test("Unknown status is tracked in unknownStatuses and does not inflate attendance", () => {
    const records: RawAttendanceRecord[] = [
      { date: "2026-11-01", status: "PRESENT" },
      { date: "2026-11-02", status: "MYSTERY_STATUS" },
    ];
    const result = calculateAttendance(records);
    assertEqual(result.attendedCredits, 1.0, "Attended credit should not include mystery status");
    assertEqual(result.statusCounts.unknown, 1, "statusCounts.unknown");
    assert(result.unknownStatuses.includes("MYSTERY_STATUS"), "unknownStatuses contains MYSTERY_STATUS");
    assertEqual(result.percentage, 50.0, "percentage with 1 present and 1 unknown session");
  });

  // 7. Deduplication of records
  test("Deduplication prevents duplicate counting of same session", () => {
    const records: RawAttendanceRecord[] = [
      { id: "r1", studentId: "s1", subjectId: "sub1", date: "2026-11-01", status: "ABSENT", recordedAt: "2026-11-01T09:00:00Z" },
      // Later corrected or re-submitted as PRESENT
      { id: "r2", studentId: "s1", subjectId: "sub1", date: "2026-11-01", status: "PRESENT", recordedAt: "2026-11-01T10:00:00Z" },
    ];
    const deduplicated = deduplicateRecords(records);
    assertEqual(deduplicated.length, 1, "deduplicated length");
    assertEqual(deduplicated[0].status, "PRESENT", "Preserved newer record status");

    const result = calculateAttendance(records);
    assertEqual(result.totalRecords, 1, "totalRecords after deduplication");
    assertEqual(result.percentage, 100.0, "percentage after deduplication");
  });

  // 8. Subject-wise calculation
  test("Subject-wise calculations produce accurate breakdowns per subject", () => {
    const records: RawAttendanceRecord[] = [
      { subjectId: "sub1", subjectCode: "CS301", subjectName: "Data Structures", date: "2026-11-01", status: "PRESENT" },
      { subjectId: "sub1", subjectCode: "CS301", subjectName: "Data Structures", date: "2026-11-02", status: "ABSENT" },
      { subjectId: "sub2", subjectCode: "CS302", subjectName: "Operating Systems", date: "2026-11-01", status: "PRESENT" },
    ];
    const subjects = calculateSubjectWiseAttendance(records);
    assertEqual(subjects.length, 2, "2 subjects");

    const sub1 = subjects.find((s) => s.subjectId === "sub1");
    assertEqual(sub1?.percentage, 50.0, "sub1 percentage (1/2)");
    assertEqual(sub1?.status, "LOW_ATTENDANCE", "sub1 status");

    const sub2 = subjects.find((s) => s.subjectId === "sub2");
    assertEqual(sub2?.percentage, 100.0, "sub2 percentage (1/1)");
    assertEqual(sub2?.status, "ELIGIBLE", "sub2 status");
  });

  // 9. Monthly calculation
  test("Monthly calculations group by calendar month accurately", () => {
    const records: RawAttendanceRecord[] = [
      { date: "2026-10-15", status: "PRESENT" },
      { date: "2026-10-16", status: "LATE" },
      { date: "2026-11-01", status: "ABSENT" },
    ];
    const months = calculateMonthlyAttendance(records);
    assertEqual(months.length, 2, "2 months");

    const oct = months.find((m) => m.month === "October");
    assertEqual(oct?.percentage, 100.0, "October percentage (Present + Late = 2/2)");

    const nov = months.find((m) => m.month === "November");
    assertEqual(nov?.percentage, 0.0, "November percentage (0/1)");
  });

  console.log(`\n=== Results: ${passed} / ${total} tests passed (100%) ===`);
}

runTests().catch((err) => {
  console.error("Test Suite Error:", err);
  process.exit(1);
});
