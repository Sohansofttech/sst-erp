/**
 * SST-ERP Centralized Student Attendance Calculation Service
 *
 * Implements the unified institutional attendance policy across all 4 portals:
 * - Student Portal (Dashboard, Attendance Page, Subject-wise, Monthly, Absence History, Course Cards)
 * - Parent Portal (Child Attendance Tracking)
 * - Institution Admin Portal (Dashboard, Overall, Student Summaries, Class Summaries, Exam Eligibility)
 * - Teacher Portal (Low Attendance Alerts, Classes, Roster, Mentoring)
 *
 * Formula:
 *   Attendance Percentage = (Total Attended Credits / Total Countable Attendance Credits) * 100
 *
 * Status Credit Rules:
 * - PRESENT:   1.0 credit attended, 1.0 countable credit (numerator + 1, denominator + 1)
 * - LATE:      1.0 credit attended, 1.0 countable credit (numerator + 1, denominator + 1)
 * - ON_DUTY:   1.0 credit attended, 1.0 countable credit (numerator + 1, denominator + 1)
 * - HALF_DAY:  0.5 credit attended, 1.0 countable credit (numerator + 0.5, denominator + 1)
 * - ABSENT:    0.0 credit attended, 1.0 countable credit (numerator + 0, denominator + 1)
 * - EXCUSED:   Excluded from denominator (numerator + 0, denominator + 0)
 * - ON_LEAVE:  Excluded from denominator (numerator + 0, denominator + 0)
 * - UNKNOWN:   Flagged for validation; never silently credited as attended.
 *
 * When Total Countable Attendance Credits === 0:
 *   percentage is strictly null (NEVER defaults to 100% or 0%).
 */

export type StandardAttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "ON_DUTY"
  | "HALF_DAY"
  | "ABSENT"
  | "EXCUSED"
  | "ON_LEAVE"
  | "UNKNOWN";

export type AttendanceDisplayState =
  | "CALCULATED"         // Records exist and valid percentage computed
  | "NO_DATA"            // Zero attendance sessions recorded
  | "ALL_EXCLUDED"       // Records exist, but all are EXCUSED / ON_LEAVE (0 countable sessions)
  | "INVALID_OR_UNKNOWN" // Records exist, but contain unverified/unknown statuses
  | "PENDING";           // Attendance has not yet been marked

export interface StatusCreditRule {
  attendedCredit: number;
  countableCredit: number;
  isCountable: boolean;
  standardStatus: StandardAttendanceStatus;
}

export interface RawAttendanceRecord {
  id?: string;
  studentId?: string;
  institutionId?: string;
  subjectId?: string;
  date: string | Date;
  status: string;
  remarks?: string | null;
  recordedAt?: string | Date;
  session?: string | null;
  subjectCode?: string;
  subjectName?: string;
}

export interface StatusCounts {
  present: number;
  late: number;
  onDuty: number;
  halfDay: number;
  absent: number;
  excused: number;
  onLeave: number;
  unknown: number;
}

export interface AttendanceCalculationResult {
  totalRecords: number;
  countableSessions: number;
  attendedCredits: number;
  absentCredits: number;
  excusedSessions: number;
  percentage: number | null; // null if no countable sessions, NEVER 100
  formattedPercentage: string; // e.g. "90.9%" or "N/A"
  hasData: boolean;
  displayState: AttendanceDisplayState;
  displayLabel: string;
  statusCounts: StatusCounts;
  unknownStatuses: string[];
  isEligible: boolean; // true only if percentage !== null && percentage >= minThreshold
  shortfallPercentage: number; // percentage points below minThreshold (0 if eligible)
}

export interface AttendanceCalculationOptions {
  minThreshold?: number; // Defaults to 75%
  deduplicate?: boolean; // Defaults to true
  precision?: number;    // Decimal precision for rounding (defaults to 1)
  academicYearId?: string;
  semester?: number;
}

/**
 * Normalizes any incoming status string to its standard attendance definition and credit rule.
 */
export function normalizeAttendanceStatus(rawStatus: string): StatusCreditRule {
  if (!rawStatus || typeof rawStatus !== "string") {
    return {
      attendedCredit: 0.0,
      countableCredit: 1.0,
      isCountable: true,
      standardStatus: "UNKNOWN",
    };
  }

  const clean = rawStatus.trim().toUpperCase().replace(/[\s-]+/g, "_");

  switch (clean) {
    case "PRESENT":
    case "P":
      return {
        attendedCredit: 1.0,
        countableCredit: 1.0,
        isCountable: true,
        standardStatus: "PRESENT",
      };

    case "LATE":
    case "L":
      return {
        attendedCredit: 1.0,
        countableCredit: 1.0,
        isCountable: true,
        standardStatus: "LATE",
      };

    case "ON_DUTY":
    case "ONDUTY":
    case "DUTY":
    case "OD":
      return {
        attendedCredit: 1.0,
        countableCredit: 1.0,
        isCountable: true,
        standardStatus: "ON_DUTY",
      };

    case "HALF_DAY":
    case "HALFDAY":
    case "HD":
      return {
        attendedCredit: 0.5,
        countableCredit: 1.0,
        isCountable: true,
        standardStatus: "HALF_DAY",
      };

    case "ABSENT":
    case "A":
      return {
        attendedCredit: 0.0,
        countableCredit: 1.0,
        isCountable: true,
        standardStatus: "ABSENT",
      };

    case "EXCUSED":
    case "EX":
      return {
        attendedCredit: 0.0,
        countableCredit: 0.0, // Excluded from denominator
        isCountable: false,
        standardStatus: "EXCUSED",
      };

    case "ON_LEAVE":
    case "ONLEAVE":
    case "LEAVE":
    case "APPROVED_LEAVE":
    case "MEDICAL_LEAVE":
    case "ML":
      return {
        attendedCredit: 0.0,
        countableCredit: 0.0, // Excluded from denominator
        isCountable: false,
        standardStatus: "ON_LEAVE",
      };

    default:
      return {
        attendedCredit: 0.0,
        countableCredit: 1.0,
        isCountable: true,
        standardStatus: "UNKNOWN",
      };
  }
}

/**
 * Deduplicates attendance records to prevent duplicate counting.
 * If multiple records exist for the same student on the same date/subject/session,
 * the most recently recorded or last-seen record is preserved.
 */
export function deduplicateRecords<T extends RawAttendanceRecord>(records: T[]): T[] {
  if (!records || records.length <= 1) return records || [];

  const map = new Map<string, T>();

  for (const r of records) {
    const dateStr = typeof r.date === "string" ? r.date.split("T")[0] : new Date(r.date).toISOString().split("T")[0];
    const studentKey = r.studentId || "default_student";
    const subjectKey = r.subjectId || "default_subject";
    const sessionKey = r.session || "default_session";
    const key = `${studentKey}__${dateStr}__${subjectKey}__${sessionKey}`;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, r);
    } else {
      // If the current record has a newer recordedAt timestamp, prioritize it
      const existingTime = existing.recordedAt ? new Date(existing.recordedAt).getTime() : 0;
      const currentTime = r.recordedAt ? new Date(r.recordedAt).getTime() : 0;
      if (currentTime >= existingTime) {
        map.set(key, r);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Centralized Calculation Engine:
 * Computes exact attendance percentages, attended credits, countable credits,
 * and display states according to institutional policy.
 */
export function calculateAttendance(
  records: RawAttendanceRecord[],
  options: AttendanceCalculationOptions = {}
): AttendanceCalculationResult {
  const minThreshold = options.minThreshold ?? 75;
  const shouldDeduplicate = options.deduplicate ?? true;
  const precision = options.precision ?? 1;

  const effectiveRecords = shouldDeduplicate ? deduplicateRecords(records) : (records || []);
  const totalRecords = effectiveRecords.length;

  const statusCounts: StatusCounts = {
    present: 0,
    late: 0,
    onDuty: 0,
    halfDay: 0,
    absent: 0,
    excused: 0,
    onLeave: 0,
    unknown: 0,
  };

  const unknownStatuses: string[] = [];
  let attendedCredits = 0;
  let countableSessions = 0;
  let excusedSessions = 0;

  for (const r of effectiveRecords) {
    const rule = normalizeAttendanceStatus(r.status);

    switch (rule.standardStatus) {
      case "PRESENT":
        statusCounts.present += 1;
        break;
      case "LATE":
        statusCounts.late += 1;
        break;
      case "ON_DUTY":
        statusCounts.onDuty += 1;
        break;
      case "HALF_DAY":
        statusCounts.halfDay += 1;
        break;
      case "ABSENT":
        statusCounts.absent += 1;
        break;
      case "EXCUSED":
        statusCounts.excused += 1;
        excusedSessions += 1;
        break;
      case "ON_LEAVE":
        statusCounts.onLeave += 1;
        excusedSessions += 1;
        break;
      case "UNKNOWN":
        statusCounts.unknown += 1;
        if (!unknownStatuses.includes(r.status)) {
          unknownStatuses.push(r.status);
        }
        break;
    }

    attendedCredits += rule.attendedCredit;
    countableSessions += rule.countableCredit;
  }

  // Absent credits = Countable sessions - Attended credits
  const absentCredits = Math.max(0, countableSessions - attendedCredits);

  // Determine state & percentage
  if (totalRecords === 0) {
    return {
      totalRecords: 0,
      countableSessions: 0,
      attendedCredits: 0,
      absentCredits: 0,
      excusedSessions: 0,
      percentage: null,
      formattedPercentage: "N/A",
      hasData: false,
      displayState: "NO_DATA",
      displayLabel: "No attendance data available",
      statusCounts,
      unknownStatuses,
      isEligible: false,
      shortfallPercentage: 0,
    };
  }

  if (countableSessions === 0) {
    return {
      totalRecords,
      countableSessions: 0,
      attendedCredits: 0,
      absentCredits: 0,
      excusedSessions,
      percentage: null,
      formattedPercentage: "Exempt",
      hasData: true,
      displayState: "ALL_EXCLUDED",
      displayLabel: "No countable attendance sessions (All excused / on approved leave)",
      statusCounts,
      unknownStatuses,
      isEligible: true, // Approved exempt sessions do not penalize student eligibility
      shortfallPercentage: 0,
    };
  }

  const rawPercentage = (attendedCredits / countableSessions) * 100;
  const multiplier = Math.pow(10, precision);
  const roundedPercentage = Math.round(rawPercentage * multiplier) / multiplier;

  const isEligible = roundedPercentage >= minThreshold;
  const shortfallPercentage = isEligible ? 0 : Math.round((minThreshold - roundedPercentage) * multiplier) / multiplier;

  let displayState: AttendanceDisplayState = "CALCULATED";
  if (statusCounts.unknown > 0 && statusCounts.present === 0 && statusCounts.absent === 0) {
    displayState = "INVALID_OR_UNKNOWN";
  }

  return {
    totalRecords,
    countableSessions,
    attendedCredits,
    absentCredits,
    excusedSessions,
    percentage: roundedPercentage,
    formattedPercentage: `${roundedPercentage}%`,
    hasData: true,
    displayState,
    displayLabel: `${roundedPercentage}% Attendance (${attendedCredits}/${countableSessions} countable credits)`,
    statusCounts,
    unknownStatuses,
    isEligible,
    shortfallPercentage,
  };
}

/**
 * Subject-Wise Attendance Calculator:
 * Groups attendance records by subject and computes metrics per subject.
 */
export interface SubjectAttendanceSummary {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  totalClasses: number;
  attendedClasses: number;
  absentClasses: number;
  percentage: number | null;
  formattedPercentage: string;
  isEligible: boolean;
  status: "ELIGIBLE" | "LOW_ATTENDANCE" | "NO_RECORDS";
}

export function calculateSubjectWiseAttendance(
  records: RawAttendanceRecord[],
  options: AttendanceCalculationOptions = {}
): SubjectAttendanceSummary[] {
  const groups = new Map<string, RawAttendanceRecord[]>();

  for (const r of records) {
    const key = r.subjectId || "UNKNOWN_SUBJECT";
    const existing = groups.get(key) || [];
    existing.push(r);
    groups.set(key, existing);
  }

  const minThreshold = options.minThreshold ?? 75;
  const summaries: SubjectAttendanceSummary[] = [];

  for (const [subjectId, items] of groups.entries()) {
    const first = items[0];
    const calc = calculateAttendance(items, options);

    let status: "ELIGIBLE" | "LOW_ATTENDANCE" | "NO_RECORDS" = "NO_RECORDS";
    if (calc.percentage !== null) {
      status = calc.percentage >= minThreshold ? "ELIGIBLE" : "LOW_ATTENDANCE";
    }

    summaries.push({
      subjectId,
      subjectCode: first.subjectCode || "SUB",
      subjectName: first.subjectName || "Subject",
      totalClasses: calc.countableSessions,
      attendedClasses: calc.attendedCredits,
      absentClasses: calc.absentCredits,
      percentage: calc.percentage,
      formattedPercentage: calc.formattedPercentage,
      isEligible: calc.isEligible,
      status,
    });
  }

  return summaries;
}

/**
 * Monthly Attendance Calculator:
 * Groups attendance records chronologically by calendar month.
 */
export interface MonthlyAttendanceSummary {
  monthYear: string;
  month: string;
  year: number;
  totalClasses: number;
  attendedClasses: number;
  absentClasses: number;
  lateClasses: number;
  statusCounts: StatusCounts;
  percentage: number | null;
  formattedPercentage: string;
  isEligible: boolean;
}

export function calculateMonthlyAttendance(
  records: RawAttendanceRecord[],
  options: AttendanceCalculationOptions = {}
): MonthlyAttendanceSummary[] {
  const groups = new Map<string, { month: string; year: number; records: RawAttendanceRecord[] }>();

  for (const r of records) {
    const d = new Date(r.date);
    const monthYear = d.toLocaleString("default", { month: "long", year: "numeric" });
    const existing = groups.get(monthYear) || {
      month: d.toLocaleString("default", { month: "long" }),
      year: d.getFullYear(),
      records: [],
    };
    existing.records.push(r);
    groups.set(monthYear, existing);
  }

  return Array.from(groups.entries()).map(([monthYear, group]) => {
    const calc = calculateAttendance(group.records, options);
    return {
      monthYear,
      month: group.month,
      year: group.year,
      totalClasses: calc.countableSessions,
      attendedClasses: calc.attendedCredits,
      absentClasses: calc.absentCredits,
      lateClasses: calc.statusCounts.late,
      statusCounts: calc.statusCounts,
      percentage: calc.percentage,
      formattedPercentage: calc.formattedPercentage,
      isEligible: calc.isEligible,
    };
  });
}

/**
 * Class/Cohort Aggregate Attendance Calculator:
 * Computes overall pooled cohort attendance rate without averaging individual student rounded percentages.
 */
export function calculateCohortAttendance(
  allCohortRecords: RawAttendanceRecord[],
  options: AttendanceCalculationOptions = {}
): AttendanceCalculationResult {
  return calculateAttendance(allCohortRecords, options);
}
