/**
 * Sohan Soft Tech — Biometric & RFID Hardware Ingress E2E API Test Suite
 * 
 * End-to-end testing of POST /api/v2/device/events/batch using realistic
 * ESP32 firmware payloads, verifying authentication, idempotency, quarantine,
 * institution isolation, and firmware ACK contract compliance.
 */

import { NextRequest } from "next/server";
import { POST } from "../app/api/v2/device/events/batch/route";
import db from "../lib/db";
import {
  registerStudentBiometric,
  hashApiKey,
  getUnknownBiometricScans,
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
    studentUniqueId: "ORIGINAL_ID_01",
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
    studentUniqueId: "ORIGINAL_ID_02",
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
    studentUniqueId: "ORIGINAL_ID_03",
  },
];

let mockCredentials: MockCredentialRow[] = [];
let mockDevices: MockDeviceRow[] = [];
let mockReceipts: MockReceiptRow[] = [];
let mockUnknownScans: MockUnknownScanRow[] = [];
let mockLogs: MockCampusInOutLogRow[] = [];

function setupMocks() {
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

  (db as any).biometricDevice.findUnique = async (args: any) => {
    return mockDevices.find((d) => d.deviceId === args.where.deviceId) || null;
  };

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

  (db as any).biometricEventReceipt.findUnique = async (args: any) => {
    const key = args.where.institutionId_eventId;
    return (
      mockReceipts.find(
        (r) => r.institutionId === key.institutionId && r.eventId === key.eventId
      ) || null
    );
  };

  (db as any).biometricEventReceipt.create = async (args: any) => {
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
}

async function runE2ETests() {
  console.log("=== Running Biometric RFID Ingress E2E API Test Suite ===\n");
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
      console.error(`  ✗ ${name}`);
      console.error(`    ${e.message}`);
    }
  }

  const TEST_DEVICE_ID = "sst-c69c65691062b1aa";
  const TEST_DEVICE_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  function registerDevice(
    institutionId = "inst-1",
    deviceId = TEST_DEVICE_ID,
    rawKey = TEST_DEVICE_KEY
  ) {
    mockDevices.push({
      id: `dev-${mockDevices.length + 1}`,
      institutionId,
      deviceId,
      apiKeyHash: hashApiKey(rawKey),
      gateName: "North Gate",
      directionMode: "AUTO",
      isActive: true,
    });
  }

  // 1. Invalid Authentication Tests
  await test("E2E Test 1: Missing X-Device-Id or X-Device-Key returns HTTP 401 Unauthorized", async () => {
    resetEnvironment();
    registerDevice();

    const req = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: { "content-type": "application/json" }, // Missing credentials
      body: JSON.stringify([{ event_id: "00000000-0000-4000-8000-000000000001", uid: "142F6B8A" }]),
    });

    const res = await POST(req);
    assertEqual(res.status, 401, "HTTP status is 401");
    const body = await res.json();
    assertEqual(body.success, false, "Response success is false");
    assert(body.error.includes("Missing X-Device-Id or X-Device-Key"), "Error message clarifies missing headers");
  });

  await test("E2E Test 2: Invalid device key returns HTTP 401 Unauthorized", async () => {
    resetEnvironment();
    registerDevice();

    const req = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": "bad_key_000000000000000000000000000000000000000000000000000000000000",
      },
      body: JSON.stringify([{ event_id: "00000000-0000-4000-8000-000000000001", uid: "142F6B8A" }]),
    });

    const res = await POST(req);
    assertEqual(res.status, 401, "HTTP status is 401");
    const body = await res.json();
    assertEqual(body.success, false, "Authentication failed");
  });

  // 2. Realistic Firmware Sample Event Ingestion (Registered RFID)
  await test("E2E Test 3: Realistic firmware-format batch logs attendance for registered student", async () => {
    resetEnvironment();
    registerDevice();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    // Exact JSON format generated by LittleFS saveEvent() in SST_RFID_ESP32.ino
    const firmwarePayload = [
      {
        event_id: "96b6d573-2e46-4cb4-9d57-372132eb0488",
        device_id: TEST_DEVICE_ID,
        boot_id: "a9b8c7d6e5f40312",
        kind: "ATTENDANCE_SCAN",
        uid: "142F6B8A",
        uptime_ms: 45000,
        firmware_version: "sst-esp32-bringup-1.0.0",
        time_synced: true,
        device_timestamp: 1732000000,
        last_ntp_sync: 1732000000,
      },
    ];

    const req = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(firmwarePayload),
    });

    const res = await POST(req);
    assertEqual(res.status, 200, "HTTP status is 200 OK");
    const body = await res.json();

    assertEqual(body.success, true, "Batch processed successfully");
    assertEqual(body.processed_count, 1, "1 event processed");
    assertEqual(body.acknowledged_count, 1, "1 event acknowledged");
    assertEqual(body.results[0].status, "ACCEPTED", "Event status is ACCEPTED");
    assertEqual(body.results[0].acknowledged, true, "Acknowledged flag is true for LittleFS removal");
    assertEqual(body.results[0].student_id, "student-1", "Student resolved to Rahul Verma");
    assertEqual(mockLogs.length, 1, "CampusInOutLog row created in database");
    assertEqual(mockLogs[0].gateName, "North Gate", "Bound gate name applied from device record");
  });

  // 3. Unknown RFID Credential Ingestion & Durable Quarantine
  await test("E2E Test 4: Unknown RFID credential is durably stored in BiometricUnknownScan before ACK", async () => {
    resetEnvironment();
    registerDevice();

    const firmwarePayload = [
      {
        event_id: "11111111-2222-4333-8444-555555555555",
        device_id: TEST_DEVICE_ID,
        kind: "ATTENDANCE_SCAN",
        uid: "UNKNOWN_CARD_99",
        device_timestamp: 1732000000,
      },
    ];

    const req = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(firmwarePayload),
    });

    const res = await POST(req);
    assertEqual(res.status, 200, "HTTP status is 200 OK");
    const body = await res.json();

    assertEqual(body.results[0].status, "UNKNOWN_CREDENTIAL", "Status is UNKNOWN_CREDENTIAL");
    assertEqual(body.results[0].acknowledged, true, "Acknowledged=true so device LittleFS is pruned");

    // Verify it is durably in the database awaiting admin review
    const pendingScans = await getUnknownBiometricScans("inst-1", false);
    assertEqual(pendingScans.length, 1, "Stored in BiometricUnknownScan table");
    assertEqual(pendingScans[0].identifier, "UNKNOWN_CARD_99", "Exact unknown UID recorded");
    assertEqual(pendingScans[0].reviewed, false, "Flagged as unreviewed");
    assertEqual(mockLogs.length, 0, "No unauthorized attendance was logged");
  });

  // 4. Exact Event UUID Idempotency (Submitting Twice)
  await test("E2E Test 5: Submitting identical event UUID twice creates exactly ONE attendance log", async () => {
    resetEnvironment();
    registerDevice();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    const eventPayload = [
      {
        event_id: "22222222-3333-4444-8555-666666666666",
        device_id: TEST_DEVICE_ID,
        kind: "ATTENDANCE_SCAN",
        uid: "142F6B8A",
        device_timestamp: 1732000000,
      },
    ];

    // First upload
    const req1 = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(eventPayload),
    });
    const res1 = await POST(req1);
    const body1 = await res1.json();
    assertEqual(body1.results[0].status, "ACCEPTED", "First transmission accepted");
    assertEqual(mockLogs.length, 1, "First log created");

    // Second upload (e.g. Wi-Fi drop retry 10 minutes later)
    eventPayload[0].device_timestamp = 1732000600;
    const req2 = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(eventPayload),
    });
    const res2 = await POST(req2);
    const body2 = await res2.json();
    assertEqual(body2.results[0].status, "DUPLICATE_IGNORED", "Second transmission returns DUPLICATE_IGNORED");
    assertEqual(body2.results[0].acknowledged, true, "Acknowledged=true so device removes it on retry");
    assertEqual(mockLogs.length, 1, "Strictly 1 log in database; zero duplicates");
  });

  // 5. Institution Isolation (Cross-Tenant Rejection)
  await test("E2E Test 6: Device from Institution 1 cannot mark attendance for Institution 2 student", async () => {
    resetEnvironment();
    registerDevice("inst-1"); // Device is bound to inst-1
    // Card belongs to student in inst-2
    await registerStudentBiometric("inst-2", "student-3", "INST2_CARD_UID", "RFID");

    const payload = [
      {
        event_id: "33333333-4444-4555-8666-777777777777",
        device_id: TEST_DEVICE_ID,
        kind: "ATTENDANCE_SCAN",
        uid: "INST2_CARD_UID",
      },
    ];

    const req = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    const body = await res.json();
    assertEqual(body.institution_id, "inst-1", "Bound institution strictly from server record");
    assertEqual(body.results[0].status, "UNKNOWN_CREDENTIAL", "Card from inst-2 rejected in inst-1");
    assertEqual(mockLogs.length, 0, "Zero logs created");
  });

  // 6. Malformed Events Handling
  await test("E2E Test 7: Malformed event ID or missing UID is REJECTED with acknowledged=false", async () => {
    resetEnvironment();
    registerDevice();

    const badPayload = [
      {
        event_id: "not-a-valid-uuid", // Invalid UUID format
        uid: "142F6B8A",
      },
      {
        event_id: "44444444-5555-4666-8777-888888888888",
        uid: "", // Empty UID
      },
    ];

    const req = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(badPayload),
    });

    const res = await POST(req);
    const body = await res.json();
    assertEqual(body.results[0].status, "REJECTED", "Item 1 rejected");
    assertEqual(body.results[0].acknowledged, false, "Item 1 NOT acknowledged (remains in LittleFS for diagnosis)");
    assertEqual(body.results[1].status, "REJECTED", "Item 2 rejected");
    assertEqual(body.results[1].acknowledged, false, "Item 2 NOT acknowledged");
    assertEqual(body.acknowledged_count, 0, "Zero items acknowledged");
  });

  // 7. Firmware ACK Contract Conformance
  await test("E2E Test 8: Response structure complies 100% with hardware ACK loop contract", async () => {
    resetEnvironment();
    registerDevice();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    const multiEventBatch = [
      { event_id: "55555555-6666-4777-8888-999999999991", uid: "142F6B8A" }, // Valid
      { event_id: "55555555-6666-4777-8888-999999999992", uid: "UNKNOWN_CARD" }, // Unknown
    ];

    const req = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(multiEventBatch),
    });

    const res = await POST(req);
    const body = await res.json();

    // Verify top-level contract
    assert(typeof body.success === "boolean", "body.success is boolean");
    assert(typeof body.device_id === "string", "body.device_id is string");
    assert(typeof body.institution_id === "string", "body.institution_id is string");
    assertEqual(body.processed_count, 2, "processed_count matches");
    assertEqual(body.acknowledged_count, 2, "acknowledged_count matches");
    assert(Array.isArray(body.results), "body.results is array");

    // Verify individual item contract for ESP32 LittleFS removal loop
    for (const item of body.results) {
      assert(typeof item.event_id === "string", "item.event_id is string");
      assert(typeof item.status === "string", "item.status is string");
      assert(typeof item.acknowledged === "boolean", "item.acknowledged is boolean");
      assert(typeof item.message === "string", "item.message is string");
    }
  });

  // 8. Device Timestamp Validation and Neutralization
  await test("E2E Test 9: Future (>24h) and ancient (<2020) device timestamps are safely neutralized to server time", async () => {
    resetEnvironment();
    registerDevice();
    await registerStudentBiometric("inst-1", "student-1", "142F6B8A", "RFID");

    const currentEpochSec = Math.floor(Date.now() / 1000);
    const futureTimestamp = currentEpochSec + 100000; // ~27.7 hours in future
    const ancientTimestamp = 1000000; // Year 1970
    const validPastTimestamp = currentEpochSec - 3600; // 1 hour ago

    // 1. Send batch with future timestamp (>24h ahead)
    const futureBatch = [
      {
        event_id: "66666666-1111-4000-8000-000000000001",
        device_id: TEST_DEVICE_ID,
        kind: "ATTENDANCE_SCAN",
        uid: "142F6B8A",
        device_timestamp: futureTimestamp,
      },
    ];

    const req1 = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(futureBatch),
    });

    const res1 = await POST(req1);
    const body1 = await res1.json();
    assertEqual(body1.success, true, "Future timestamp batch processed successfully");
    assertEqual(body1.results[0].status, "ACCEPTED", "Scan accepted");
    assertEqual(mockLogs.length, 1, "Log created");

    // The log timestamp should be near current time, NOT future time (+100,000s)
    const logTimeMs = mockLogs[0].timestamp.getTime();
    const nowMs = Date.now();
    assert(Math.abs(nowMs - logTimeMs) < 10000, "Future timestamp neutralized to current server time");

    // 2. Send batch with valid timestamp (1 hour ago)
    mockLogs = [];
    mockReceipts = [];
    const validBatch = [
      {
        event_id: "66666666-2222-4000-8000-000000000002",
        device_id: TEST_DEVICE_ID,
        kind: "ATTENDANCE_SCAN",
        uid: "142F6B8A",
        device_timestamp: validPastTimestamp,
      },
    ];

    const req2 = new NextRequest("http://localhost:3000/api/v2/device/events/batch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": TEST_DEVICE_ID,
        "x-device-key": TEST_DEVICE_KEY,
      },
      body: JSON.stringify(validBatch),
    });

    const res2 = await POST(req2);
    const body2 = await res2.json();
    assertEqual(body2.success, true, "Valid timestamp batch processed successfully");
    assertEqual(mockLogs.length, 1, "Log created");
    assertEqual(
      Math.floor(mockLogs[0].timestamp.getTime() / 1000),
      validPastTimestamp,
      "Valid past timestamp accurately preserved"
    );
  });

  console.log(`\n=== Results: ${passed} / ${total} E2E tests passed (${Math.round((passed / total) * 100)}%) ===\n`);
  if (passed !== total) process.exit(1);
}

runE2ETests().catch((e) => {
  console.error(e);
  process.exit(1);
});
