/**
 * Sohan Soft Tech — Biometric & RFID Attendance Integration Test Suite
 * 
 * Tests the real exported service functions from `lib/services/biometric-attendance.service.ts`
 * by mocking Prisma `db` methods directly across all biometric tables:
 * - db.biometricDevice
 * - db.studentBiometricCredential
 * - db.biometricEventReceipt
 * - db.biometricUnknownScan
 * - db.campusInOutLog
 * - db.student
 */

import db from "../lib/db";
import {
  registerStudentBiometric,
  resolveStudentByCredential,
  processBiometricBatch,
  authenticateDeviceCredentials,
  hashApiKey,
  getUnknownBiometricScans,
  BiometricScanPayload,
} from "../lib/services/biometric-attendance.service";

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

// In-memory test state representing Postgres tables
interface MockStudentRow {
  id: string;
  institutionId: string;
  fullName: string;
  rollNumber: string;
  admissionNumber: string;
  currentSemester: number;
  currentSection: string;
  status: string;
  studentUniqueId?: string | null;
}

interface MockCredentialRow {
  id: string;
  institutionId: string;
  studentId: string;
  credentialType: string;
  credentialValue: string;
  status: string;
  student?: MockStudentRow;
}

interface MockDeviceRow {
  id: string;
  institutionId: string;
  deviceId: string;
  apiKeyHash: string;
  deviceName?: string | null;
  gateName: string;
  directionMode: string;
  isActive: boolean;
}

interface MockReceiptRow {
  id: string;
  institutionId: string;
  eventId: string;
  deviceId: string;
  authMethod: string;
  identifier: string;
  status: string;
  campusLogId?: string | null;
  receivedAt: Date;
}

interface MockUnknownScanRow {
  id: string;
  institutionId: string;
  deviceId: string;
  eventId: string;
  authMethod: string;
  identifier: string;
  gateName: string;
  scannedAt: Date;
  reviewed: boolean;
}

interface MockCampusInOutLogRow {
  id: string;
  institutionId: string;
  studentId: string;
  logType: string;
  timestamp: Date;
  gateName: string;
  verifiedBy: string;
}

// Global in-memory mock tables
const mockStudents: MockStudentRow[] = [
  {
    id: "student-1",
    institutionId: "inst-1",
    fullName: "Rahul Verma",
    rollNumber: "23CS01",
    admissionNumber: "ADM-2023-01",
    currentSemester: 3,
    currentSection: "A",
    status: "ACTIVE",
    studentUniqueId: "ORIGINAL_UNTOUCHED_ID_01",
  },
  {
    id: "student-2",
    institutionId: "inst-1",
    fullName: "Priya Sharma",
    rollNumber: "23CS02",
    admissionNumber: "ADM-2023-02",
    currentSemester: 3,
    currentSection: "A",
    status: "ACTIVE",
    studentUniqueId: "ORIGINAL_UNTOUCHED_ID_02",
  },
  {
    id: "student-3",
    institutionId: "inst-2", // Separate tenant
    fullName: "Amit Patel",
    rollNumber: "23EC01",
    admissionNumber: "ADM-2023-03",
    currentSemester: 3,
    currentSection: "B",
    status: "ACTIVE",
    studentUniqueId: "ORIGINAL_UNTOUCHED_ID_03",
  },
];

let mockCredentials: MockCredentialRow[] = [];
let mockDevices: MockDeviceRow[] = [];
let mockReceipts: MockReceiptRow[] = [];
let mockUnknownScans: MockUnknownScanRow[] = [];
let mockLogs: MockCampusInOutLogRow[] = [];
let simulateReceiptP2002 = false; // Flag to simulate concurrent unique constraint race condition

function setupPrismaMocks() {
  // Ensure model properties exist on db instance
  if (!(db as any).biometricDevice) (db as any).biometricDevice = {};
  if (!(db as any).studentBiometricCredential) (db as any).studentBiometricCredential = {};
  if (!(db as any).biometricEventReceipt) (db as any).biometricEventReceipt = {};
  if (!(db as any).biometricUnknownScan) (db as any).biometricUnknownScan = {};

  // Mock db.$transaction with atomic snapshot rollback
  (db as any).$transaction = async (fn: (tx: any) => Promise<any>) => {
    const logsSnapshot = [...mockLogs];
    const receiptsSnapshot = [...mockReceipts];
    const unknownScansSnapshot = [...mockUnknownScans];
    const credentialsSnapshot = [...mockCredentials];
    try {
      return await fn(db);
    } catch (err) {
      mockLogs = logsSnapshot;
      mockReceipts = receiptsSnapshot;
      mockUnknownScans = unknownScansSnapshot;
      mockCredentials = credentialsSnapshot;
      throw err;
    }
  };

  // Mock db.biometricDevice
  (db as any).biometricDevice.findUnique = async (args: any) => {
    return mockDevices.find((d) => d.deviceId === args.where.deviceId) || null;
  };

  // Mock db.studentBiometricCredential
  (db as any).studentBiometricCredential.findUnique = async (args: any) => {
    const key = args.where.institutionId_credentialType_credentialValue;
    if (key) {
      return (
        mockCredentials.find(
          (c) =>
            c.institutionId === key.institutionId &&
            c.credentialType === key.credentialType &&
            c.credentialValue === key.credentialValue
        ) || null
      );
    }
    return null;
  };

  (db as any).studentBiometricCredential.findFirst = async (args: any) => {
    const where = args.where || {};
    const cred = mockCredentials.find((c) => {
      if (where.institutionId && c.institutionId !== where.institutionId) return false;
      if (where.credentialValue && c.credentialValue !== where.credentialValue) return false;
      if (where.credentialType && c.credentialType !== where.credentialType) return false;
      if (where.status && c.status !== where.status) return false;
      return true;
    });

    if (cred && args.include?.student) {
      const student = mockStudents.find((s) => s.id === cred.studentId);
      return { ...cred, student };
    }
    return cred || null;
  };

  (db as any).studentBiometricCredential.upsert = async (args: any) => {
    const key = args.where.institutionId_credentialType_credentialValue;
    let existing = mockCredentials.find(
      (c) =>
        c.institutionId === key.institutionId &&
        c.credentialType === key.credentialType &&
        c.credentialValue === key.credentialValue
    );

    if (existing) {
      existing.studentId = args.update.studentId;
      existing.status = args.update.status;
      return existing;
    }

    const created: MockCredentialRow = {
      id: `cred-${mockCredentials.length + 1}`,
      institutionId: args.create.institutionId,
      studentId: args.create.studentId,
      credentialType: args.create.credentialType,
      credentialValue: args.create.credentialValue,
      status: args.create.status,
    };
    mockCredentials.push(created);
    return created;
  };

  // Mock db.biometricEventReceipt
  (db as any).biometricEventReceipt.findUnique = async (args: any) => {
    const key = args.where.institutionId_eventId;
    return (
      mockReceipts.find(
        (r) => r.institutionId === key.institutionId && r.eventId === key.eventId
      ) || null
    );
  };

  (db as any).biometricEventReceipt.create = async (args: any) => {
    if (simulateReceiptP2002) {
      const p2002 = new Error("Unique constraint failed on the fields: (`institution_id`,`event_id`)");
      (p2002 as any).code = "P2002";
      throw p2002;
    }

    const duplicate = mockReceipts.find(
      (r) => r.institutionId === args.data.institutionId && r.eventId === args.data.eventId
    );
    if (duplicate) {
      const p2002 = new Error("Unique constraint failed on the fields: (`institution_id`,`event_id`)");
      (p2002 as any).code = "P2002";
      throw p2002;
    }

    const row: MockReceiptRow = {
      id: `rcpt-${mockReceipts.length + 1}`,
      institutionId: args.data.institutionId,
      eventId: args.data.eventId,
      deviceId: args.data.deviceId,
      authMethod: args.data.authMethod,
      identifier: args.data.identifier,
      status: args.data.status,
      campusLogId: args.data.campusLogId || null,
      receivedAt: new Date(),
    };
    mockReceipts.push(row);
    return row;
  };

  // Mock db.biometricUnknownScan
  (db as any).biometricUnknownScan.create = async (args: any) => {
    const row: MockUnknownScanRow = {
      id: `unkn-${mockUnknownScans.length + 1}`,
      institutionId: args.data.institutionId,
      deviceId: args.data.deviceId,
      eventId: args.data.eventId,
      authMethod: args.data.authMethod,
      identifier: args.data.identifier,
      gateName: args.data.gateName || "Main Gate",
      scannedAt: args.data.scannedAt || new Date(),
      reviewed: false,
    };
    mockUnknownScans.push(row);
    return row;
  };

  (db as any).biometricUnknownScan.findMany = async (args: any) => {
    return mockUnknownScans.filter((u) => {
      if (args.where?.institutionId && u.institutionId !== args.where.institutionId) return false;
      if (args.where?.reviewed !== undefined && u.reviewed !== args.where.reviewed) return false;
      return true;
    });
  };

  // Mock db.student
  (db.student as any).findFirst = async (args: any) => {
    const where = args.where || {};
    return (
      mockStudents.find((s) => {
        if (where.id && s.id !== where.id) return false;
        if (where.institutionId && s.institutionId !== where.institutionId) return false;
        if (where.studentUniqueId && s.studentUniqueId !== where.studentUniqueId) return false;
        if (where.status && s.status !== where.status) return false;
        return true;
      }) || null
    );
  };

  // Mock db.campusInOutLog
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
    const row: MockCampusInOutLogRow = {
      id: `log-${mockLogs.length + 1}`,
      institutionId: args.data.institutionId,
      studentId: args.data.studentId,
      logType: args.data.logType,
      timestamp: args.data.timestamp || new Date(),
      gateName: args.data.gateName || "Main Gate",
      verifiedBy: args.data.verifiedBy || "",
    };
    mockLogs.push(row);
    return row;
  };

  (db.campusInOutLog as any).delete = async (args: any) => {
    const idx = mockLogs.findIndex((l) => l.id === args.where.id);
    if (idx !== -1) mockLogs.splice(idx, 1);
    return {};
  };

  (db.campusInOutLog as any).findMany = async (args: any) => {
    return mockLogs.filter((l) => l.institutionId === args.where.institutionId);
  };
}

function resetEnvironment() {
  mockCredentials = [];
  mockDevices = [];
  mockReceipts = [];
  mockUnknownScans = [];
  mockLogs = [];
  simulateReceiptP2002 = false;
  mockStudents[0].studentUniqueId = "ORIGINAL_UNTOUCHED_ID_01";
  mockStudents[1].studentUniqueId = "ORIGINAL_UNTOUCHED_ID_02";
  mockStudents[2].studentUniqueId = "ORIGINAL_UNTOUCHED_ID_03";
}

async function runTests() {
  console.log("=== Running Biometric Attendance Database-Backed Test Suite ===\n");
  setupPrismaMocks();

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${e.message}`);
    }
  }

  const TEST_DEVICE_ID = "sst-c69c65691062b1aa";
  const TEST_DEVICE_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  function registerTestDeviceInMock(
    institutionId = "inst-1",
    deviceId = TEST_DEVICE_ID,
    rawKey = TEST_DEVICE_KEY
  ) {
    mockDevices.push({
      id: `dev-${mockDevices.length + 1}`,
      institutionId,
      deviceId,
      apiKeyHash: hashApiKey(rawKey),
      gateName: "Main Gate",
      directionMode: "AUTO",
      isActive: true,
    });
  }

  // Test Case 1: Student Unique ID Preservation
  await test("Test Case 1: RFID registration preserves existing studentUniqueId without overwriting", async () => {
    resetEnvironment();
    const result = await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");
    assertEqual(result.success, true, "Registration succeeded");
    assertEqual(mockStudents[0].studentUniqueId, "ORIGINAL_UNTOUCHED_ID_01", "studentUniqueId preserved in DB");
    assertEqual(result.student.studentUniqueId, "ORIGINAL_UNTOUCHED_ID_01", "Returned student preserved");
  });

  // Test Case 2: Multi-Credential Support (RFID + Fingerprint)
  await test("Test Case 2: Student can hold both RFID card and Fingerprint credential independently", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");
    const fpResult = await registerStudentBiometric("inst-1", "student-1", "FP-105", "FINGERPRINT");
    assertEqual(fpResult.success, true, "Fingerprint registered");
    assertEqual(mockStudents[0].studentUniqueId, "ORIGINAL_UNTOUCHED_ID_01", "studentUniqueId preserved");

    // Both credentials resolve to student-1
    const rfidStudent = await resolveStudentByCredential("inst-1", "142F6B8A", "RFID");
    const fpStudent = await resolveStudentByCredential("inst-1", "FP-105", "FINGERPRINT");
    assertEqual(rfidStudent?.id, "student-1", "RFID resolves to student-1");
    assertEqual(fpStudent?.id, "student-1", "Fingerprint resolves to student-1");
  });

  // Test Case 3: Institution Credential Collision
  await test("Test Case 3: Duplicate credential assignment within same institution is prevented", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");
    let caught = false;
    try {
      await registerStudentBiometric("inst-1", "student-2", "142F6B8A", "RFID");
    } catch {
      caught = true;
    }
    assert(caught, "Second student cannot be assigned same card UID in inst-1");
  });

  // Test Case 4: Valid RFID Scan & Receipt Creation
  await test("Test Case 4: Valid RFID scan logs ENTRY and creates BiometricEventReceipt", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    const batch: BiometricScanPayload[] = [
      {
        eventId: "a1b2c3d4-0001-4000-8000-000000000001",
        deviceId: TEST_DEVICE_ID,
        authMethod: "RFID",
        identifier: "142F6B8A",
        logType: "ENTRY",
        deviceTimestamp: 1732000000,
      },
    ];

    const results = await processBiometricBatch("inst-1", batch);
    assertEqual(results[0].status, "ACCEPTED", "Scan accepted");
    assertEqual(results[0].acknowledged, true, "Acknowledged for LittleFS removal");
    assertEqual(mockLogs.length, 1, "Log created in database");
    assertEqual(mockReceipts.length, 1, "Receipt created in database");
    assertEqual(mockReceipts[0].status, "ACCEPTED", "Receipt status is ACCEPTED");
  });

  // Test Case 5: Valid Fingerprint Ingestion
  await test("Test Case 5: Valid Fingerprint scan logs attendance with BIO:FINGERPRINT verifier", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-2", "FP-205", "FINGERPRINT");

    const batch: BiometricScanPayload[] = [
      {
        eventId: "a1b2c3d4-0002-4000-8000-000000000002",
        deviceId: TEST_DEVICE_ID,
        authMethod: "FINGERPRINT",
        identifier: "FP-205",
        logType: "ENTRY",
        deviceTimestamp: 1732000000,
      },
    ];

    const results = await processBiometricBatch("inst-1", batch);
    assertEqual(results[0].status, "ACCEPTED", "Fingerprint scan accepted");
    assertEqual(results[0].studentId, "student-2", "Resolved to Priya Sharma");
    assert(mockLogs[0].verifiedBy.startsWith("BIO:FINGERPRINT:"), "Verified by fingerprint reader");
  });

  // Test Case 6: Exact Event UUID Deduplication (Receipt Check)
  await test("Test Case 6: Exact event UUID retry returns DUPLICATE_IGNORED and creates zero duplicate logs", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    const event: BiometricScanPayload = {
      eventId: "e0000000-0000-4000-8000-000000000006",
      deviceId: TEST_DEVICE_ID,
      authMethod: "RFID",
      identifier: "142F6B8A",
      logType: "ENTRY",
      deviceTimestamp: 1732000000,
    };

    // First ingestion
    const firstRes = await processBiometricBatch("inst-1", [event]);
    assertEqual(firstRes[0].status, "ACCEPTED", "First upload accepted");
    assertEqual(mockLogs.length, 1, "Initial log created");

    // Network re-transmission (even hours later)
    event.deviceTimestamp = 1732010000;
    const retryRes = await processBiometricBatch("inst-1", [event]);
    assertEqual(retryRes[0].status, "DUPLICATE_IGNORED", "Retry flagged as duplicate via receipt");
    assertEqual(retryRes[0].acknowledged, true, "Acknowledged so LittleFS can delete the file");
    assertEqual(mockLogs.length, 1, "Zero duplicate logs created");
  });

  // Test Case 7: Concurrent Duplicate Race Handling (P2002 Unique Constraint Simulation)
  await test("Test Case 7: Concurrent duplicate event insert triggers P2002 and is safely handled without duplicates", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    // Simulate race condition where receipt insert triggers P2002
    simulateReceiptP2002 = true;

    const event: BiometricScanPayload = {
      eventId: "race-000000-4000-8000-000000000007",
      deviceId: TEST_DEVICE_ID,
      authMethod: "RFID",
      identifier: "142F6B8A",
      logType: "ENTRY",
    };

    const results = await processBiometricBatch("inst-1", [event]);
    assertEqual(results[0].status, "DUPLICATE_IGNORED", "Handled race safely as DUPLICATE_IGNORED");
    assertEqual(results[0].acknowledged, true, "Acknowledged for device queue clearing");
    assertEqual(mockLogs.length, 0, "No duplicate log remained in database");
    simulateReceiptP2002 = false;
  });

  // Test Case 8: Durable UNKNOWN_CREDENTIAL Recording for Admin Review
  await test("Test Case 8: Unknown card/fingerprint is durably recorded in BiometricUnknownScan before returning acknowledged=true", async () => {
    resetEnvironment();
    const batch: BiometricScanPayload[] = [
      {
        eventId: "unknown-000-4000-8000-000000000008",
        deviceId: TEST_DEVICE_ID,
        authMethod: "RFID",
        identifier: "DEADBEEF",
      },
    ];

    const results = await processBiometricBatch("inst-1", batch);
    assertEqual(results[0].status, "UNKNOWN_CREDENTIAL", "Status is UNKNOWN_CREDENTIAL");
    assertEqual(results[0].acknowledged, true, "Acknowledged only after durable recording");

    // Verify it is recorded in BiometricUnknownScan for admin review
    const pendingScans = await getUnknownBiometricScans("inst-1", false);
    assertEqual(pendingScans.length, 1, "Durably saved in BiometricUnknownScan table");
    assertEqual(pendingScans[0].identifier, "DEADBEEF", "Unknown identifier recorded");
    assertEqual(pendingScans[0].reviewed, false, "Pending admin review");

    // Verify receipt was also created for idempotency
    assertEqual(mockReceipts.length, 1, "Receipt created for unknown scan");
    assertEqual(mockReceipts[0].status, "UNKNOWN_CREDENTIAL", "Receipt tracks unknown credential");
  });

  // Test Case 9: Rapid Scan Cooldown Window
  await test("Test Case 9: Rapid consecutive scans of same student within 60s cooldown are ignored", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    const time = 1732000000;
    const batch: BiometricScanPayload[] = [
      {
        eventId: "tap-000001-4000-8000-000000000001",
        deviceId: TEST_DEVICE_ID,
        authMethod: "RFID",
        identifier: "142F6B8A",
        deviceTimestamp: time,
      },
      {
        eventId: "tap-000002-4000-8000-000000000002",
        deviceId: TEST_DEVICE_ID,
        authMethod: "RFID",
        identifier: "142F6B8A",
        deviceTimestamp: time + 10,
      },
    ];

    const results = await processBiometricBatch("inst-1", batch);
    assertEqual(results[0].status, "ACCEPTED", "First tap accepted");
    assertEqual(results[1].status, "DUPLICATE_IGNORED", "Rapid second tap ignored");
    assertEqual(results[1].acknowledged, true, "Acknowledged for hardware queue pruning");
    assertEqual(mockLogs.length, 1, "Only 1 log entry created");
  });

  // Test Case 10: AUTO Gate Direction Mode
  await test("Test Case 10: AUTO mode toggles from ENTRY to EXIT on subsequent scan", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    const time = 1732000000;
    await processBiometricBatch("inst-1", [
      {
        eventId: "dir-000001-4000-8000-000000000001",
        deviceId: TEST_DEVICE_ID,
        authMethod: "RFID",
        identifier: "142F6B8A",
        logType: "AUTO",
        deviceTimestamp: time,
      },
    ]);
    assertEqual(mockLogs[0].logType, "ENTRY", "First auto scan is ENTRY");

    await processBiometricBatch("inst-1", [
      {
        eventId: "dir-000002-4000-8000-000000000002",
        deviceId: TEST_DEVICE_ID,
        authMethod: "RFID",
        identifier: "142F6B8A",
        logType: "AUTO",
        deviceTimestamp: time + 3600,
      },
    ]);
    assertEqual(mockLogs[1].logType, "EXIT", "Subsequent auto scan is EXIT");
  });

  // Test Case 11: Tenant / Institution Isolation
  await test("Test Case 11: Credential registered in Institution 2 cannot scan into Institution 1", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-2", "student-3", "CROSS_TENANT_CARD", "RFID");

    const results = await processBiometricBatch("inst-1", [
      {
        eventId: "iso-000001-4000-8000-000000000001",
        deviceId: "inst-1-reader",
        authMethod: "RFID",
        identifier: "CROSS_TENANT_CARD",
      },
    ]);
    assertEqual(results[0].status, "UNKNOWN_CREDENTIAL", "Institution boundary enforced");
    assertEqual(mockLogs.length, 0, "No cross-tenant log created");
  });

  // Test Case 12: Device Authentication Success via Database SHA-256 Hash
  await test("Test Case 12: Valid X-Device-Id and X-Device-Key authenticates via database SHA-256 hash", async () => {
    resetEnvironment();
    registerTestDeviceInMock("inst-1", TEST_DEVICE_ID, TEST_DEVICE_KEY);

    const auth = await authenticateDeviceCredentials(TEST_DEVICE_ID, TEST_DEVICE_KEY);
    assertEqual(auth.success, true, "Device authenticated");
    if (auth.success) {
      assertEqual(auth.institutionId, "inst-1", "Bound institution resolved from database");
      assertEqual(auth.gateName, "Main Gate", "Bound gate resolved");
    }
  });

  // Test Case 13: Device Authentication Failure
  await test("Test Case 13: Invalid device key or unknown device is rejected with unauthorized", async () => {
    resetEnvironment();
    registerTestDeviceInMock("inst-1", TEST_DEVICE_ID, TEST_DEVICE_KEY);

    const badKeyAuth = await authenticateDeviceCredentials(TEST_DEVICE_ID, "wrong_device_key_000000000000000000000000000000000000000000000000000000");
    assertEqual(badKeyAuth.success, false, "Wrong key rejected");

    const unknownDevAuth = await authenticateDeviceCredentials("sst-non-existent-device", TEST_DEVICE_KEY);
    assertEqual(unknownDevAuth.success, false, "Unknown device rejected");
  });

  // Test Case 14: Device Key Privacy (Never Exposed)
  await test("Test Case 14: Authenticated device response never echoes raw key or stored key hash", async () => {
    resetEnvironment();
    registerTestDeviceInMock("inst-1", TEST_DEVICE_ID, TEST_DEVICE_KEY);

    const auth: any = await authenticateDeviceCredentials(TEST_DEVICE_ID, TEST_DEVICE_KEY);
    assertEqual(auth.success, true, "Device authenticated");
    assert(auth.rawApiKey === undefined, "rawApiKey is undefined in return object");
    assert(auth.apiKeyHash === undefined, "apiKeyHash is undefined in return object");
    assert(auth.device === undefined, "raw device row is not leaked");
  });

  // Test Case 15: Prisma Transaction Atomicity & Rollback Guarantee
  await test("Test Case 15: Prisma interactive transaction rolls back CampusInOutLog if receipt creation fails", async () => {
    resetEnvironment();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    // Enable receipt creation failure simulation (P2002 unique constraint conflict)
    simulateReceiptP2002 = true;

    const results = await processBiometricBatch("inst-1", [
      {
        eventId: "atomic-fail-0000-8000-000000000001",
        deviceId: TEST_DEVICE_ID,
        authMethod: "RFID",
        identifier: "142F6B8A",
        deviceTimestamp: 1732000000,
      },
    ]);

    // When BiometricEventReceipt throws P2002, processBiometricBatch handles it as DUPLICATE_IGNORED
    assertEqual(results[0].status, "DUPLICATE_IGNORED", "Receipt conflict safely caught");
    assertEqual(results[0].acknowledged, true, "Acknowledged for hardware queue pruning");
    // Verify that NO orphan CampusInOutLog was created due to atomic transaction rollback
    assertEqual(mockLogs.length, 0, "CampusInOutLog creation was atomically rolled back (zero orphan records)");
  });

  console.log(`\n=== Results: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%) ===\n`);
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
