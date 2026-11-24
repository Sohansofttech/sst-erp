import assert from "assert";

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysPerMonth[month - 1] || 0;
}

export function parseDateSafely(val: any, fieldLabel = "Date"): Date {
  if (val === null || val === undefined || val === "") {
    throw new Error(`${fieldLabel} is required.`);
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      throw new Error(`${fieldLabel} is an invalid Date object.`);
    }
    return val;
  }

  if (typeof val !== "string") {
    throw new Error(`${fieldLabel} must be a valid date string or Date object.`);
  }

  const trimmed = val.trim();

  // 1. Try ISO date or timestamp (e.g. 2026-08-01 or 2026-08-01T00:00:00.000Z)
  const yyyymmdd = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:T.*)?$/);
  let year: number, month: number, day: number;

  if (yyyymmdd) {
    year = parseInt(yyyymmdd[1], 10);
    month = parseInt(yyyymmdd[2], 10);
    day = parseInt(yyyymmdd[3], 10);
  } else {
    // 2. Try DD-MM-YYYY or DD/MM/YYYY
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyy) {
      day = parseInt(ddmmyyyy[1], 10);
      month = parseInt(ddmmyyyy[2], 10);
      year = parseInt(ddmmyyyy[3], 10);
    } else {
      throw new Error(`${fieldLabel} "${trimmed}" is not in a recognized format (expected YYYY-MM-DD or DD-MM-YYYY).`);
    }
  }

  // Validate calendar bounds
  if (year < 1900 || year > 2100) {
    throw new Error(`${fieldLabel} year ${year} is outside acceptable range (1900-2100).`);
  }
  if (month < 1 || month > 12) {
    throw new Error(`${fieldLabel} month ${month} is invalid (must be 1-12).`);
  }
  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    if (month === 2 && day === 29) {
      throw new Error(`${fieldLabel} Feb 29 is invalid because ${year} is not a leap year.`);
    }
    throw new Error(`${fieldLabel} day ${day} is invalid for month ${month}/${year} (max ${maxDays} days).`);
  }

  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (isNaN(d.getTime())) {
    throw new Error(`${fieldLabel} evaluated to an invalid calendar date.`);
  }

  return d;
}

// Tests
console.log("Testing date parser...");

// Standard YYYY-MM-DD
const d1 = parseDateSafely("2026-08-01");
assert.strictEqual(d1.toISOString().split("T")[0], "2026-08-01");

// Standard DD-MM-YYYY
const d2 = parseDateSafely("01-08-2026");
assert.strictEqual(d2.toISOString().split("T")[0], "2026-08-01");

// Standard Even Semester DD-MM-YYYY
const d3 = parseDateSafely("20-12-2026");
assert.strictEqual(d3.toISOString().split("T")[0], "2026-12-20");

const d4 = parseDateSafely("10-01-2027");
assert.strictEqual(d4.toISOString().split("T")[0], "2027-01-10");

const d5 = parseDateSafely("31-05-2027");
assert.strictEqual(d5.toISOString().split("T")[0], "2027-05-31");

// Leap year tests
const dLeap = parseDateSafely("29-02-2028");
assert.strictEqual(dLeap.toISOString().split("T")[0], "2028-02-29");

assert.throws(() => parseDateSafely("29-02-2026"), /Feb 29 is invalid because 2026 is not a leap year/);
assert.throws(() => parseDateSafely("31-04-2026"), /max 30 days/);
assert.throws(() => parseDateSafely("31-02-2026"), /max 28 days/);
assert.throws(() => parseDateSafely("00-01-2026"), /invalid for month/);
assert.throws(() => parseDateSafely("32-01-2026"), /invalid for month/);
assert.throws(() => parseDateSafely("invalid-date"), /not in a recognized format/);
assert.throws(() => parseDateSafely(""), /is required/);

console.log("All date parser tests passed!");
