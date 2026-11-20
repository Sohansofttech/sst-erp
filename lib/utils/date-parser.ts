function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysPerMonth[month - 1] || 0;
}

export class DateValidationError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = "DateValidationError";
    this.statusCode = 400;
  }
}

export function parseDateSafely(val: any, fieldLabel = "Date"): Date {
  if (val === null || val === undefined || val === "") {
    throw new DateValidationError(`${fieldLabel} is required.`);
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      throw new DateValidationError(`${fieldLabel} is an invalid Date object.`);
    }
    return val;
  }

  if (typeof val !== "string") {
    throw new DateValidationError(`${fieldLabel} must be a valid date string or Date object.`);
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
      throw new DateValidationError(`${fieldLabel} "${trimmed}" is not in a recognized format (expected YYYY-MM-DD or DD-MM-YYYY).`);
    }
  }

  // Validate calendar bounds
  if (year < 1900 || year > 2100) {
    throw new DateValidationError(`${fieldLabel} year ${year} is outside acceptable range (1900-2100).`);
  }
  if (month < 1 || month > 12) {
    throw new DateValidationError(`${fieldLabel} month ${month} is invalid (must be 1-12).`);
  }
  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    if (month === 2 && day === 29) {
      throw new DateValidationError(`${fieldLabel} Feb 29 is invalid because ${year} is not a leap year.`);
    }
    throw new DateValidationError(`${fieldLabel} day ${day} is invalid for month ${month}/${year} (max ${maxDays} days).`);
  }

  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (isNaN(d.getTime())) {
    throw new DateValidationError(`${fieldLabel} evaluated to an invalid calendar date.`);
  }

  return d;
}
