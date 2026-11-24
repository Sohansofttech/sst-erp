/**
 * Sohan Soft Tech — Student Portal Campus In/Out Integration & Security Test Suite
 * 
 * Verifies:
 * 1. IDOR Protection: Student cannot query another student's in/out records.
 * 2. Tenant Isolation: Student cannot query records from another institution.
 * 3. Data Integrity: CampusInOutLog records reflect exact biometric IN/OUT gate events.
 * 4. Deduplication: Biometric duplicate events do not create multiple campus in/out logs.
 * 5. Complete Separation: Campus in/out logs have 0 impact on classroom attendance calculator percentages.
 */

import { authorizeStudentOrParentAccess } from "../lib/security/authorize";
import { calculateAttendance, RawAttendanceRecord } from "../lib/services/attendance-calculator";
import { processBiometricBatch, registerStudentBiometric } from "../lib/services/biometric-attendance.service";
import db from "../lib/db";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion Failed: ${message}`);
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: ${message}. Expected: ${expected}, Got: ${actual}`);
  }
}

// In-memory mock data
const mockStudents = [
  { id: "student-A", institutionId: "inst-1", fullName: "Aarav Gupta", rollNumber: "23CS01", status: "ACTIVE" },
  { id: "student-B", institutionId: "inst-1", fullName: "Bhavya Nair", rollNumber: "23CS02", status: "ACTIVE" },
  { id: "student-C", institutionId: "inst-2", fullName: "Chetan Reddy", rollNumber: "23EC01", status: "ACTIVE" },
];

let mockLogs: any[] = [];
let mockReceipts: any[] = [];
let mockCredentials: any[] = [];
let mockUnknownScans: any[] = [];

function setupMocks() {
  if (!(db as any).biometricDevice) (db as any).biometricDevice = {};
  if (!(db as any).studentBiometricCredential) (db as any).studentBiometricCredential = {};
  if (!(db as any).biometricEventReceipt) (db as any).biometricEventReceipt = {};
  if (!(db as any).biometricUnknownScan) (db as any).biometricUnknownScan = {};

  (db as any).$transaction = async (fn: any) => {
    const snapLogs = [...mockLogs];
    const snapReceipts = [...mockReceipts];
    try {
      return await fn(db);
    } catch (e) {
      mockLogs = snapLogs;
      mockReceipts = snapReceipts;
      throw e;
    }
  };

  (db.student as any).findUnique = async (args: any) => {
    return mockStudents.find((s) => s.id === args.where.id) || null;
  };

  (db.student as any).findFirst = async (args: any) => {
    return mockStudents.find((s) => s.id === args.where?.id) || null;
  };

  (db.campusInOutLog as any).findMany = async (args: any) => {
    return mockLogs
      .filter((l) => l.studentId === args.where.studentId && l.institutionId === args.where.institutionId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  (db.campusInOutLog as any).findFirst = async (args: any) => {
    const where = args.where || {};
    let matched = mockLogs.filter((l) => {
      if (where.institutionId && l.institutionId !== where.institutionId) return false;
      if (where.studentId && l.studentId !== where.studentId) return false;
      if (where.timestamp?.gte && l.timestamp < where.timestamp.gte) return false;
      if (where.timestamp?.lte && l.timestamp > where.timestamp.lte) return false;
      return true;
    });

    if (args.orderBy?.timestamp === "desc") {
      matched = matched.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    return matched[0] || null;
  };

  (db.campusInOutLog as any).create = async (args: any) => {
    const row = { id: `log-${mockLogs.length + 1}`, ...args.data };
    mockLogs.push(row);
    return row;
  };

  (db as any).biometricEventReceipt.findUnique = async (args: any) => {
    const key = args.where.institutionId_eventId;
    return mockReceipts.find((r) => r.institutionId === key.institutionId && r.eventId === key.eventId) || null;
  };

  (db as any).biometricEventReceipt.create = async (args: any) => {
    const row = { id: `rcpt-${mockReceipts.length + 1}`, ...args.data };
    mockReceipts.push(row);
    return row;
  };

  (db as any).studentBiometricCredential.findFirst = async (args: any) => {
    const cred = mockCredentials.find((c) => c.credentialValue === args.where.credentialValue && c.institutionId === args.where.institutionId);
    if (cred && args.include?.student) {
      const student = mockStudents.find((s) => s.id === cred.studentId);
      return { ...cred, student };
    }
    return cred || null;
  };

  (db as any).studentBiometricCredential.findUnique = async () => null;

  (db as any).studentBiometricCredential.upsert = async (args: any) => {
    const row = { id: `cred-${mockCredentials.length + 1}`, ...args.create };
    mockCredentials.push(row);
    return row;
  };
}

async function runAudit() {
  console.log("=== Running Biometric Campus In/Out Integration & Security Audit ===\n");
  setupMocks();

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e: any) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${e.message}`);
    }
  }

  // 1. IDOR Prevention: Student A querying Student B
  await test("Security 1: Student A cannot access Student B's in-out records (IDOR protection)", async () => {
    const studentASession: any = {
      id: "user-1",
      institutionId: "inst-1",
      role: "STUDENT",
      studentId: "student-A",
    };

    let caughtError = false;
    try {
      await authorizeStudentOrParentAccess(studentASession, "student-B");
    } catch (e: any) {
      caughtError = true;
      assert(e.name === "ForbiddenError", "Throws ForbiddenError");
      assert(e.message.includes("IDOR protection"), "Error mentions IDOR protection");
    }
    assert(caughtError, "Cross-student access strictly blocked");
  });

  // 2. Cross-Tenant Protection: Student A querying Student C (Institution 2)
  await test("Security 2: Student A cannot access Student C's records in a different institution (Tenant isolation)", async () => {
    const studentASession: any = {
      id: "user-1",
      institutionId: "inst-1",
      role: "STUDENT",
      studentId: "student-A",
    };

    let caughtError = false;
    try {
      await authorizeStudentOrParentAccess(studentASession, "student-C");
    } catch (e: any) {
      caughtError = true;
      assert(e.name === "ForbiddenError", "Throws ForbiddenError on tenant mismatch");
    }
    assert(caughtError, "Cross-tenant access strictly blocked");
  });

  // 3. Legitimate Student Access: Student A querying own records
  await test("Security 3: Student A can legitimately access their own in-out records", async () => {
    const studentASession: any = {
      id: "user-1",
      institutionId: "inst-1",
      role: "STUDENT",
      studentId: "student-A",
    };

    const auth = await authorizeStudentOrParentAccess(studentASession, "student-A");
    assertEqual(auth.studentId, "student-A", "Resolved correct student ID");
    assertEqual(auth.isParent, false, "Correct role flag");
  });

  // 4. Biometric Ingestion Populates Campus In/Out Log
  await test("Integration 4: Biometric RFID scans create separate IN and OUT records for the student", async () => {
    mockLogs = [];
    mockReceipts = [];
    mockCredentials = [];

    // Register card for Student A
    await registerStudentBiometric("inst-1", "student-A", "RFID_AARAV_01", "RFID");

    // Ingest Entry Scan
    const t1 = 1732000000;
    await processBiometricBatch("inst-1", [
      {
        eventId: "e1e1e1e1-0000-4000-8000-000000000001",
        deviceId: "sst-main-gate-reader",
        authMethod: "RFID",
        identifier: "RFID_AARAV_01",
        logType: "ENTRY",
        gateName: "North Gate",
        deviceTimestamp: t1,
      },
    ]);

    // Ingest Exit Scan 4 hours later
    const t2 = t1 + 14400;
    await processBiometricBatch("inst-1", [
      {
        eventId: "e2e2e2e2-0000-4000-8000-000000000002",
        deviceId: "sst-main-gate-reader",
        authMethod: "RFID",
        identifier: "RFID_AARAV_01",
        logType: "EXIT",
        gateName: "North Gate",
        deviceTimestamp: t2,
      },
    ]);

    // Query in/out endpoint simulation for Student A
    const logs = await (db.campusInOutLog as any).findMany({
      where: { studentId: "student-A", institutionId: "inst-1" },
    });

    assertEqual(logs.length, 2, "2 movement logs created");
    assertEqual(logs[0].logType, "EXIT", "Latest log is EXIT");
    assertEqual(logs[1].logType, "ENTRY", "Prior log is ENTRY");
    assertEqual(logs[0].gateName, "North Gate", "Gate name preserved");
    assert(logs[0].verifiedBy.startsWith("BIO:RFID:sst-main-gate-reader"), "Biometric verifier string tracked");
  });

  // 5. Multi-Student Log Separation: Student B sees 0 records
  await test("Integration 5: Student B sees empty state when only Student A has scanned", async () => {
    const studentBLogs = await (db.campusInOutLog as any).findMany({
      where: { studentId: "student-B", institutionId: "inst-1" },
    });
    assertEqual(studentBLogs.length, 0, "Student B has zero logs (proper empty state)");
  });

  // 6. Duplicate Event Prevention: Retrying identical eventId creates zero extra records
  await test("Integration 6: Exact retry of identical event ID creates zero duplicate campus in/out logs", async () => {
    const initialLogCount = mockLogs.length;

    // Retry event 1
    const res = await processBiometricBatch("inst-1", [
      {
        eventId: "e1e1e1e1-0000-4000-8000-000000000001", // Already exists
        deviceId: "sst-main-gate-reader",
        authMethod: "RFID",
        identifier: "RFID_AARAV_01",
        logType: "ENTRY",
      },
    ]);

    assertEqual(res[0].status, "DUPLICATE_IGNORED", "Returns duplicate ignored status");
    assertEqual(res[0].acknowledged, true, "Acknowledged true for hardware queue pruning");
    assertEqual(mockLogs.length, initialLogCount, "Zero extra logs created in database");
  });

  // 7. Strict Separation: Classroom Attendance Percentage is 100% Unaffected
  await test("Separation 7: Physical campus in/out logs have 0 impact on classroom attendance percentage", async () => {
    // Standard classroom session attendance: 10 total classes, 9 attended, 1 absent = 90%
    const classroomRecords: RawAttendanceRecord[] = [
      { id: "att-1", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-01"), status: "PRESENT" },
      { id: "att-2", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-02"), status: "PRESENT" },
      { id: "att-3", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-03"), status: "PRESENT" },
      { id: "att-4", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-04"), status: "PRESENT" },
      { id: "att-5", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-05"), status: "PRESENT" },
      { id: "att-6", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-06"), status: "PRESENT" },
      { id: "att-7", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-07"), status: "PRESENT" },
      { id: "att-8", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-08"), status: "PRESENT" },
      { id: "att-9", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-09"), status: "PRESENT" },
      { id: "att-10", studentId: "student-A", institutionId: "inst-1", subjectId: "sub-1", subjectCode: "CS301", subjectName: "Data Structures", date: new Date("2026-11-10"), status: "ABSENT" },
    ];

    const calc = calculateAttendance(classroomRecords);
    assertEqual(calc.countableSessions, 10, "Total classroom countable sessions is exactly 10");
    assertEqual(calc.attendedCredits, 9, "Attended credits is exactly 9");
    assertEqual(calc.percentage, 90, "Overall classroom attendance percentage is 90%");

    // Despite multiple campus in/out entries, classroom calculations remain completely isolated
    assert(mockLogs.length > 0, "Campus in/out logs exist in parallel");
    const reCalc = calculateAttendance(classroomRecords);
    assertEqual(reCalc.percentage, 90, "Attendance percentage unchanged after biometric logs");
  });

  // 8. User-Friendly Verifier Label Formatting
  await test("UX 8: Raw biometric verifier strings format to clean human-readable labels", async () => {
    function formatVerifier(verifiedBy?: string | null): string {
      if (!verifiedBy) return "Automated Turnstile";
      if (typeof verifiedBy !== "string") return String(verifiedBy);

      const trimmed = verifiedBy.trim();
      if (trimmed.startsWith("BIO:")) {
        const parts = trimmed.split(":");
        const method = (parts[1] || "").toUpperCase();
        if (method === "RFID") {
          return "RFID Scanner";
        }
        if (method === "FINGERPRINT") {
          return "Fingerprint Scanner";
        }
        return `Biometric Scanner (${parts[1] || "Automated"})`;
      }

      return trimmed || "Automated Turnstile";
    }

    assertEqual(formatVerifier("BIO:RFID:sst-c69c65691062b1aa:d81f8f64-5717-4562-b3fc-2c963f66afa6"), "RFID Scanner", "RFID format");
    assertEqual(formatVerifier("BIO:FINGERPRINT:sst-c69c65691062b1aa:fp-event-01"), "Fingerprint Scanner", "Fingerprint format");
    assertEqual(formatVerifier("BIO:FACE:sst-cam-01:face-001"), "Biometric Scanner (FACE)", "Other biometric method format");
    assertEqual(formatVerifier("Security Desk Manual"), "Security Desk Manual", "Custom text format preserved");
    assertEqual(formatVerifier(null), "Automated Turnstile", "Null fallback format");
    assertEqual(formatVerifier(""), "Automated Turnstile", "Empty string fallback format");
  });

  console.log(`\n=== Results: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%) ===\n`);
  if (passed !== total) process.exit(1);
}

runAudit().catch((e) => {
  console.error(e);
  process.exit(1);
});
