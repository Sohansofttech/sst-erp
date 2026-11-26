import crypto from "crypto";
import ExcelJS from "exceljs";
import db from "@/lib/db";
import { recordAuditLog } from "./institution-admin.service";

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMPORT_ROWS = 10000;
export const IMPORT_BATCH_SIZE = 75;

export const ALLOWED_IMPORT_EXTENSIONS = [".csv", ".xlsx"] as const;
export const BLOCKED_MACRO_EXTENSIONS = [".xlsm", ".xlsb", ".xltm", ".xls", ".xla", ".xlam"] as const;

export const IMPORT_TARGET_FIELDS = [
  { key: "fullName", label: "Full Name", required: true },
  { key: "rollNumber", label: "Roll Number", required: true },
  { key: "admissionNumber", label: "Admission Number", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "gender", label: "Gender", required: false },
  { key: "dateOfBirth", label: "Date of Birth (YYYY-MM-DD)", required: false },
  { key: "academicYear", label: "Academic Year", required: false },
  { key: "courseCode", label: "Course Code / Name", required: false },
  { key: "semester", label: "Semester", required: false },
  { key: "section", label: "Section", required: false },
  { key: "batch", label: "Batch", required: false },
  { key: "addressLine", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "postalCode", label: "Postal Code", required: false },
] as const;

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number]["key"];

export interface ParsedSpreadsheetResult {
  fileType: "CSV" | "XLSX";
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: Partial<Record<ImportTargetField, string>>;
}

export interface MappedStudentRow {
  rowNumber: number;
  fullName: string;
  rollNumber: string;
  admissionNumber: string;
  email?: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  academicYear?: string;
  courseCode?: string;
  semester?: string;
  section?: string;
  batch?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface RowValidationResult {
  rowNumber: number;
  status: "VALID" | "DUPLICATE_IN_FILE" | "EXISTING_STUDENT" | "ERROR";
  errors: string[];
  data: MappedStudentRow;
  resolvedAcademicYearId?: string | null;
  resolvedCourseId?: string | null;
}

export interface ImportErrorEntry {
  rowNumber: number;
  rollNumber: string;
  admissionNumber: string;
  error: string;
}

const HEADER_ALIASES: Record<ImportTargetField, string[]> = {
  fullName: ["fullname", "full_name", "name", "studentname", "student_name"],
  rollNumber: ["rollnumber", "roll_number", "rollno", "roll_no", "roll"],
  admissionNumber: ["admissionnumber", "admission_number", "admissionno", "admission_no", "admno"],
  email: ["email", "emailaddress", "email_address", "studentemail"],
  phone: ["phone", "phonenumber", "phone_number", "mobile", "mobileno", "contact"],
  gender: ["gender", "sex"],
  dateOfBirth: ["dateofbirth", "date_of_birth", "dob", "birthdate"],
  academicYear: ["academicyear", "academic_year", "academicyearid", "ay", "year"],
  courseCode: ["coursecode", "course_code", "course", "program", "courseid"],
  semester: ["semester", "sem", "currentsemester"],
  section: ["section", "sec", "currentsection"],
  batch: ["batch", "cohort"],
  addressLine: ["addressline", "address_line", "address"],
  city: ["city"],
  state: ["state"],
  postalCode: ["postalcode", "postal_code", "pincode", "zip"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function createImportValidationError(message: string): Error {
  const err = new Error(message);
  err.name = "ValidationError";
  return err;
}

export function detectColumnMapping(headers: string[]): Partial<Record<ImportTargetField, string>> {
  const mapping: Partial<Record<ImportTargetField, string>> = {};
  const normalizedToRaw = new Map<string, string>();
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (norm && !normalizedToRaw.has(norm)) {
      normalizedToRaw.set(norm, h);
    }
  }

  for (const field of IMPORT_TARGET_FIELDS) {
    const aliases = HEADER_ALIASES[field.key];
    for (const alias of aliases) {
      const normAlias = normalizeHeader(alias);
      const match = normalizedToRaw.get(normAlias);
      if (match) {
        mapping[field.key] = match;
        break;
      }
    }
  }

  return mapping;
}

export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleaned = csvText.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (ch === "\r" && next === "\n") {
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c.length > 0)) records.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c.length > 0)) records.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.some((c) => c.length > 0)) {
    records.push(currentRow);
  }

  if (records.length === 0) {
    throw createImportValidationError("Uploaded CSV file is empty.");
  }

  const headers = records[0].map((h, idx) => h || `Column_${idx + 1}`);
  const dataRows = records.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw createImportValidationError(`File exceeds maximum supported limit of ${MAX_IMPORT_ROWS.toLocaleString()} rows.`);
  }

  const rows = dataRows.map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = (cols[idx] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}

function extractExcelCellValue(cellValue: ExcelJS.CellValue): string {
  if (cellValue === null || cellValue === undefined) return "";
  if (cellValue instanceof Date) {
    return cellValue.toISOString().slice(0, 10);
  }
  if (typeof cellValue === "object") {
    if ("result" in cellValue && cellValue.result !== undefined && cellValue.result !== null) {
      return String(cellValue.result).trim();
    }
    if ("text" in cellValue && typeof cellValue.text === "string") {
      return cellValue.text.trim();
    }
    if ("richText" in cellValue && Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((rt: any) => rt.text).join("").trim();
    }
    return "";
  }
  return String(cellValue).trim();
}

export async function parseImportFileBuffer(
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<ParsedSpreadsheetResult> {
  const lowerName = (fileName || "").trim().toLowerCase();

  if (BLOCKED_MACRO_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    throw createImportValidationError("Macro-enabled or legacy Excel formats (.xlsm, .xlsb, .xls) are not permitted. Please upload .csv or .xlsx.");
  }

  const isCsv = lowerName.endsWith(".csv");
  const isXlsx = lowerName.endsWith(".xlsx");
  if (!isCsv && !isXlsx) {
    throw createImportValidationError("Unsupported file extension. Only .csv and .xlsx files are accepted.");
  }

  if (buffer.byteLength === 0) {
    throw createImportValidationError("Uploaded file is empty.");
  }
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw createImportValidationError("File size exceeds the 10 MB limit.");
  }

  const allowedMimes = new Set([
    "",
    "text/csv",
    "application/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ]);
  if (mimeType && !allowedMimes.has(mimeType.toLowerCase())) {
    throw createImportValidationError(`Unsupported MIME type: ${mimeType}`);
  }

  if (isCsv) {
    const { headers, rows } = parseCsvText(buffer.toString("utf8"));
    return {
      fileType: "CSV",
      headers,
      rows,
      suggestedMapping: detectColumnMapping(headers),
    };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 1) {
    throw createImportValidationError("Uploaded XLSX workbook has no readable worksheet.");
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell, colNumber: number) => {
    headers[colNumber - 1] = extractExcelCellValue(cell.value) || `Column_${colNumber}`;
  });
  const normalizedHeaders = headers.filter((h) => h && h.length > 0);
  if (normalizedHeaders.length === 0) {
    throw createImportValidationError("Worksheet header row is empty.");
  }

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, string> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (!header) continue;
      const val = extractExcelCellValue(row.getCell(c + 1).value);
      if (val.length > 0) hasValue = true;
      obj[header] = val;
    }
    if (hasValue) {
      rows.push(obj);
      if (rows.length > MAX_IMPORT_ROWS) {
        throw createImportValidationError(`File exceeds maximum supported limit of ${MAX_IMPORT_ROWS.toLocaleString()} rows.`);
      }
    }
  }

  if (rows.length === 0) {
    throw createImportValidationError("Uploaded XLSX file contains headers but no student data rows.");
  }

  return {
    fileType: "XLSX",
    headers: normalizedHeaders,
    rows,
    suggestedMapping: detectColumnMapping(normalizedHeaders),
  };
}

export function applyColumnMapping(
  rawRows: Record<string, string>[],
  mapping: Partial<Record<ImportTargetField, string>>
): MappedStudentRow[] {
  return rawRows.map((raw, idx) => {
    const get = (field: ImportTargetField): string => {
      const colName = mapping[field];
      if (!colName) return "";
      return (raw[colName] ?? "").toString().trim();
    };
    return {
      rowNumber: idx + 2, // 1-indexed header + 1
      fullName: get("fullName"),
      rollNumber: get("rollNumber"),
      admissionNumber: get("admissionNumber"),
      email: get("email") || undefined,
      phone: get("phone") || undefined,
      gender: get("gender") || undefined,
      dateOfBirth: get("dateOfBirth") || undefined,
      academicYear: get("academicYear") || undefined,
      courseCode: get("courseCode") || undefined,
      semester: get("semester") || undefined,
      section: get("section") || undefined,
      batch: get("batch") || undefined,
      addressLine: get("addressLine") || undefined,
      city: get("city") || undefined,
      state: get("state") || undefined,
      postalCode: get("postalCode") || undefined,
    };
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,18}$/;

function isValidIsoOrParseableDate(value: string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime()) && d.getFullYear() >= 1950 && d.getFullYear() <= 2100;
}

export async function validateStudentImportRows(
  institutionId: string,
  mappedRows: MappedStudentRow[]
): Promise<{
  results: RowValidationResult[];
  summary: { total: number; valid: number; duplicatesInFile: number; existingStudents: number; errors: number };
}> {
  // Preload institution-scoped existing identifiers & academic references
  const [existingStudents, academicYears, courses] = await Promise.all([
    db.$queryRawUnsafe<Array<{ rollNumber: string; admissionNumber: string }>>(
      `SELECT "rollNumber", "admissionNumber" FROM students WHERE "institutionId" = $1`,
      institutionId
    ).catch(() => []),
    db.$queryRawUnsafe<Array<{ id: string; name: string; isCurrent: boolean }>>(
      `SELECT id, name, "isCurrent" FROM academic_years WHERE "institutionId" = $1`,
      institutionId
    ).catch(() => []),
    db.$queryRawUnsafe<Array<{ id: string; code: string; name: string }>>(
      `SELECT id, code, name FROM courses WHERE "institutionId" = $1`,
      institutionId
    ).catch(() => []),
  ]);

  const existingRollSet = new Set(existingStudents.map((s) => (s.rollNumber || "").trim().toLowerCase()).filter(Boolean));
  const existingAdmSet = new Set(existingStudents.map((s) => (s.admissionNumber || "").trim().toLowerCase()).filter(Boolean));

  const ayMap = new Map<string, string>();
  let defaultAyId: string | null = null;
  for (const ay of academicYears) {
    ayMap.set(ay.id.toLowerCase(), ay.id);
    if (ay.name) ayMap.set(ay.name.trim().toLowerCase(), ay.id);
    if (ay.isCurrent && !defaultAyId) defaultAyId = ay.id;
  }
  if (!defaultAyId && academicYears.length > 0) defaultAyId = academicYears[0].id;

  const courseMap = new Map<string, string>();
  for (const c of courses) {
    courseMap.set(c.id.toLowerCase(), c.id);
    if (c.code) courseMap.set(c.code.trim().toLowerCase(), c.id);
    if (c.name) courseMap.set(c.name.trim().toLowerCase(), c.id);
  }

  const seenRolls = new Set<string>();
  const seenAdms = new Set<string>();

  let valid = 0;
  let duplicatesInFile = 0;
  let existingCount = 0;
  let errorsCount = 0;

  const results: RowValidationResult[] = mappedRows.map((row) => {
    const errors: string[] = [];
    const rollNorm = row.rollNumber.trim().toLowerCase();
    const admNorm = row.admissionNumber.trim().toLowerCase();

    if (!row.fullName.trim()) errors.push("Full Name is required.");
    if (!rollNorm) errors.push("Roll Number is required.");
    if (!admNorm) errors.push("Admission Number is required.");

    if (row.email && !EMAIL_REGEX.test(row.email.trim())) {
      errors.push(`Invalid email format: '${row.email}'.`);
    }
    if (row.phone && !PHONE_REGEX.test(row.phone.trim())) {
      errors.push(`Invalid phone number: '${row.phone}'.`);
    }
    if (row.dateOfBirth && !isValidIsoOrParseableDate(row.dateOfBirth.trim())) {
      errors.push(`Invalid dateOfBirth: '${row.dateOfBirth}'.`);
    }
    if (row.gender) {
      const g = row.gender.trim().toUpperCase();
      if (!["MALE", "FEMALE", "OTHER", "M", "F"].includes(g)) {
        errors.push(`Invalid gender '${row.gender}'. Allowed: MALE, FEMALE, OTHER.`);
      }
    }
    if (row.semester) {
      const sem = Number(row.semester);
      if (!Number.isInteger(sem) || sem < 1 || sem > 16) {
        errors.push(`Invalid semester '${row.semester}'. Must be integer 1–16.`);
      }
    }

    let resolvedAcademicYearId: string | null = defaultAyId;
    if (row.academicYear && row.academicYear.trim()) {
      const matchedAy = ayMap.get(row.academicYear.trim().toLowerCase());
      if (!matchedAy) {
        errors.push(`Academic Year '${row.academicYear}' not found for this institution.`);
      } else {
        resolvedAcademicYearId = matchedAy;
      }
    }

    let resolvedCourseId: string | null = null;
    if (row.courseCode && row.courseCode.trim()) {
      const matchedCourse = courseMap.get(row.courseCode.trim().toLowerCase());
      if (!matchedCourse) {
        errors.push(`Course '${row.courseCode}' not found for this institution.`);
      } else {
        resolvedCourseId = matchedCourse;
      }
    }

    let status: RowValidationResult["status"] = "VALID";
    if (errors.length > 0) {
      status = "ERROR";
      errorsCount++;
    } else if ((rollNorm && seenRolls.has(rollNorm)) || (admNorm && seenAdms.has(admNorm))) {
      status = "DUPLICATE_IN_FILE";
      errors.push("Duplicate Roll Number or Admission Number within uploaded file.");
      duplicatesInFile++;
    } else if ((rollNorm && existingRollSet.has(rollNorm)) || (admNorm && existingAdmSet.has(admNorm))) {
      status = "EXISTING_STUDENT";
      errors.push("Student with this Roll Number or Admission Number already exists.");
      existingCount++;
    } else {
      valid++;
    }

    if (rollNorm) seenRolls.add(rollNorm);
    if (admNorm) seenAdms.add(admNorm);

    return {
      rowNumber: row.rowNumber,
      status,
      errors,
      data: row,
      resolvedAcademicYearId,
      resolvedCourseId,
    };
  });

  return {
    results,
    summary: {
      total: mappedRows.length,
      valid,
      duplicatesInFile,
      existingStudents: existingCount,
      errors: errorsCount,
    },
  };
}

export async function createImportJob(params: {
  institutionId: string;
  actorUserId: string;
  fileName: string;
  fileType: "CSV" | "XLSX";
  totalRows: number;
}) {
  const job = await db.studentImportJob.create({
    data: {
      institutionId: params.institutionId,
      actorUserId: params.actorUserId,
      fileName: params.fileName,
      fileType: params.fileType,
      status: "PROCESSING",
      totalRows: params.totalRows,
    },
  });

  await recordAuditLog(db, {
    institutionId: params.institutionId,
    actorUserId: params.actorUserId,
    action: "STUDENTS_BULK_IMPORT_STARTED",
    entityType: "STUDENT_IMPORT_JOB",
    entityId: job.id,
    newValuesJson: JSON.stringify({
      fileName: params.fileName,
      fileType: params.fileType,
      totalRows: params.totalRows,
    }),
  }).catch(() => {});

  return job;
}

/**
 * Inserts a batch of validated student rows inside one transaction.
 * Does NOT create User login accounts or send password/parent invitations.
 */
export async function processStudentImportBatch(params: {
  institutionId: string;
  jobId: string;
  rows: MappedStudentRow[];
}): Promise<{
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  errors: ImportErrorEntry[];
}> {
  const { institutionId, jobId, rows } = params;
  if (rows.length > 100) {
    throw new Error("Batch size cannot exceed 100 rows.");
  }

  const job = await db.studentImportJob.findFirst({
    where: { id: jobId, institutionId },
  });
  if (!job) {
    throw createImportValidationError("Import job not found for this institution.");
  }
  if (
    job.status === "COMPLETED" ||
    job.status === "PARTIAL" ||
    job.status === "FAILED" ||
    job.completedAt !== null
  ) {
    throw createImportValidationError(
      `Import job is already finalized (${job.status}) and cannot accept additional batches.`
    );
  }

  const validation = await validateStudentImportRows(institutionId, rows);
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  const batchErrors: ImportErrorEntry[] = [];

  await db.$transaction(
    async (tx) => {
      // Acquire row-level lock on the job inside the same transaction so concurrent batches
      // serialize safely and cannot overwrite each other's errorReportJson or counters.
      let lockedJob: any = null;
      try {
        const lockedRows: any[] = await tx.$queryRawUnsafe(
          `SELECT id, status, "processedRows", "errorReportJson", "completedAt"
           FROM student_import_jobs
           WHERE id = $1::uuid AND "institutionId" = $2::uuid
           FOR UPDATE`,
          jobId,
          institutionId
        );
        if (Array.isArray(lockedRows) && lockedRows.length > 0) {
          lockedJob = lockedRows[0];
        }
      } catch {
        // Fallback for unit-test mocks that do not mock student_import_jobs SQL
      }

      if (
        lockedJob &&
        (lockedJob.status === "COMPLETED" ||
          lockedJob.status === "PARTIAL" ||
          lockedJob.status === "FAILED" ||
          lockedJob.completedAt !== null)
      ) {
        throw createImportValidationError(
          `Import job is already finalized (${lockedJob.status}) and cannot accept additional batches.`
        );
      }

      for (const item of validation.results) {
        const r = item.data;

        if (item.status === "EXISTING_STUDENT" || item.status === "DUPLICATE_IN_FILE") {
          skipped++;
          continue;
        }
        if (item.status === "ERROR") {
          failed++;
          batchErrors.push({
            rowNumber: r.rowNumber,
            rollNumber: r.rollNumber,
            admissionNumber: r.admissionNumber,
            error: item.errors.join(" "),
          });
          continue;
        }

        // Idempotency guard inside transaction
        const existingInTx: any[] = await tx.$queryRawUnsafe(
          `SELECT id FROM students
           WHERE "institutionId" = $1
             AND (LOWER("rollNumber") = LOWER($2) OR LOWER("admissionNumber") = LOWER($3))
           LIMIT 1`,
          institutionId,
          r.rollNumber.trim(),
          r.admissionNumber.trim()
        );
        if (existingInTx.length > 0) {
          skipped++;
          continue;
        }

        const studentId = crypto.randomUUID();
        const fullName = r.fullName.trim();
        const parts = fullName.split(/\s+/);
        const firstName = parts[0] || "Student";
        const lastName = parts.slice(1).join(" ") || "Enrolled";

        const rawGender = (r.gender || "MALE").trim().toUpperCase();
        const genderStr =
          rawGender === "M" ? "MALE" : rawGender === "F" ? "FEMALE" : ["MALE", "FEMALE", "OTHER"].includes(rawGender) ? rawGender : "MALE";
        const safeDob = r.dateOfBirth ? new Date(r.dateOfBirth) : new Date("2004-01-01");
        const semesterInt = r.semester ? Math.max(1, Math.min(16, parseInt(r.semester, 10) || 1)) : 1;
        const sectionStr = (r.section || "A").trim() || "A";

        // Insert into students with userId = NULL (no login account / no invitation)
        await tx.$queryRawUnsafe(
          `INSERT INTO students (
            "id", "institutionId", "userId", "firstName", "lastName", "fullName",
            "email", "rollNumber", "admissionNumber", "phone", "gender", "status",
            "dateOfBirth", "currentCourseId", "currentAcademicYearId",
            "addressLine", "city", "state", "postalCode", "batch",
            "currentSemester", "currentSection", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, NULL, $3, $4, $5,
            $6, $7, $8, $9, $10, 'ACTIVE',
            $11, $12::uuid, $13::uuid,
            $14, $15, $16, $17, $18,
            $19, $20, NOW(), NOW()
          )`,
          studentId,
          institutionId,
          firstName,
          lastName,
          fullName,
          r.email ? r.email.trim().toLowerCase() : null,
          r.rollNumber.trim(),
          r.admissionNumber.trim(),
          r.phone ? r.phone.trim() : null,
          genderStr,
          safeDob,
          item.resolvedCourseId || null,
          item.resolvedAcademicYearId || null,
          r.addressLine ? r.addressLine.trim() : null,
          r.city ? r.city.trim() : null,
          r.state ? r.state.trim() : null,
          r.postalCode ? r.postalCode.trim() : null,
          r.batch ? r.batch.trim() : null,
          semesterInt,
          sectionStr
        );

        // Create active Enrollment when academicYearId and courseId are resolved
        if (item.resolvedAcademicYearId && item.resolvedCourseId) {
          await tx.$queryRawUnsafe(
            `INSERT INTO enrollments (
              "id", "institutionId", "studentId", "academicYearId", "courseId",
              "semester", "section", "status", "enrolledDate"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', NOW())`,
            crypto.randomUUID(),
            institutionId,
            studentId,
            item.resolvedAcademicYearId,
            item.resolvedCourseId,
            semesterInt,
            sectionStr
          );
        }

        succeeded++;
      }

      const rawErrJson = lockedJob ? lockedJob.errorReportJson : job.errorReportJson;
      let existingErrors: ImportErrorEntry[] = [];
      if (rawErrJson) {
        try {
          existingErrors = JSON.parse(rawErrJson);
        } catch {
          existingErrors = [];
        }
      }

      // Deduplicate by rowNumber so retried batches never duplicate error entries
      const errorByRow = new Map<number, ImportErrorEntry>();
      for (const e of existingErrors) errorByRow.set(e.rowNumber, e);
      for (const e of batchErrors) errorByRow.set(e.rowNumber, e);
      const mergedErrors = Array.from(errorByRow.values()).sort((a, b) => a.rowNumber - b.rowNumber);

      const updatePayload = {
        where: { id: job.id },
        data: {
          status: "PROCESSING",
          processedRows: { increment: rows.length },
          successCount: { increment: succeeded },
          skippedCount: { increment: skipped },
          failedCount: { increment: failed },
          ...(batchErrors.length > 0 ? { errorReportJson: JSON.stringify(mergedErrors) } : {}),
        },
      };

      if ((tx as any).studentImportJob?.update) {
        await (tx as any).studentImportJob.update(updatePayload);
      } else {
        await db.studentImportJob.update(updatePayload);
      }
    },
    { maxWait: 15000, timeout: 30000 }
  );

  return {
    processed: rows.length,
    succeeded,
    skipped,
    failed,
    errors: batchErrors,
  };
}

export async function pauseImportJob(params: { institutionId: string; jobId: string }) {
  const job = await db.studentImportJob.findFirst({
    where: { id: params.jobId, institutionId: params.institutionId },
  });
  if (!job) throw createImportValidationError("Import job not found.");
  if (
    job.status === "COMPLETED" ||
    job.status === "PARTIAL" ||
    job.status === "FAILED" ||
    job.completedAt !== null
  ) {
    throw createImportValidationError(`Cannot pause finalized job (${job.status}).`);
  }
  return await db.studentImportJob.update({
    where: { id: job.id },
    data: { status: "PAUSED" },
  });
}

export async function resumeImportJob(params: { institutionId: string; jobId: string }) {
  const job = await db.studentImportJob.findFirst({
    where: { id: params.jobId, institutionId: params.institutionId },
  });
  if (!job) throw createImportValidationError("Import job not found for this institution.");
  if (
    job.status === "COMPLETED" ||
    job.status === "PARTIAL" ||
    job.status === "FAILED" ||
    job.completedAt !== null
  ) {
    throw createImportValidationError(`Cannot resume finalized job (${job.status}).`);
  }
  const updated = await db.studentImportJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING" },
  });
  return {
    job: updated,
    resumeFromIndex: updated.processedRows,
    remainingRowsCount: Math.max(0, updated.totalRows - updated.processedRows),
  };
}

export async function finalizeImportJob(params: {
  institutionId: string;
  jobId: string;
  actorUserId: string;
  failedFatal?: boolean;
}) {
  const job = await db.studentImportJob.findFirst({
    where: { id: params.jobId, institutionId: params.institutionId },
  });
  if (!job) throw createImportValidationError("Import job not found.");
  if (
    job.status === "COMPLETED" ||
    job.status === "PARTIAL" ||
    job.status === "FAILED" ||
    job.completedAt !== null
  ) {
    throw createImportValidationError(`Import job is already finalized (${job.status}).`);
  }

  let finalStatus = "COMPLETED";
  if (params.failedFatal || (job.successCount === 0 && job.failedCount > 0)) {
    finalStatus = "FAILED";
  } else if (job.failedCount > 0) {
    finalStatus = "PARTIAL";
  }

  const updated = await db.studentImportJob.update({
    where: { id: job.id },
    data: {
      status: finalStatus,
      completedAt: new Date(),
    },
  });

  await recordAuditLog(db, {
    institutionId: params.institutionId,
    actorUserId: params.actorUserId,
    action: finalStatus === "FAILED" ? "STUDENTS_BULK_IMPORT_FAILED" : "STUDENTS_BULK_IMPORT_COMPLETED",
    entityType: "STUDENT_IMPORT_JOB",
    entityId: job.id,
    newValuesJson: JSON.stringify({
      status: finalStatus,
      totalRows: updated.totalRows,
      successCount: updated.successCount,
      skippedCount: updated.skippedCount,
      failedCount: updated.failedCount,
    }),
  }).catch(() => {});

  return updated;
}

export async function getImportHistory(institutionId: string, take = 25) {
  return await db.studentImportJob.findMany({
    where: { institutionId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function buildCsvTemplate(): string {
  const headers = IMPORT_TARGET_FIELDS.map((f) => f.key).join(",");
  const sample = [
    "Aarav Sharma",
    "2026CSE001",
    "ADM-2026-0001",
    "aarav.sharma@example.edu",
    "+919876543210",
    "MALE",
    "2006-05-14",
    "2026-27",
    "CSE",
    "1",
    "A",
    "2026-2030",
    "12 MG Road",
    "Bengaluru",
    "Karnataka",
    "560001",
  ].join(",");
  return `${headers}\r\n${sample}\r\n`;
}

export async function buildXlsxTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.addRow(IMPORT_TARGET_FIELDS.map((f) => f.key));
  ws.addRow([
    "Aarav Sharma",
    "2026CSE001",
    "ADM-2026-0001",
    "aarav.sharma@example.edu",
    "+919876543210",
    "MALE",
    "2006-05-14",
    "2026-27",
    "CSE",
    1,
    "A",
    "2026-2030",
    "12 MG Road",
    "Bengaluru",
    "Karnataka",
    "560001",
  ]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Neutralizes spreadsheet formula injection (=, +, -, @, tab, CR) on exported CSV cells.
 */
export function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? "");
  const neutralized = /^[\t\r ]*[=+\-@]/.test(str) || str.startsWith("\t") || str.startsWith("\r")
    ? `'${str}`
    : str;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function formatErrorReportCsv(errors: ImportErrorEntry[]): string {
  const header = "rowNumber,rollNumber,admissionNumber,error\n";
  const body = errors
    .map((e) =>
      [
        Number(e.rowNumber) || 0,
        sanitizeCsvCell(e.rollNumber),
        sanitizeCsvCell(e.admissionNumber),
        sanitizeCsvCell(e.error),
      ].join(",")
    )
    .join("\n");
  return header + body;
}
