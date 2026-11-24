/**
 * Sohan Soft Tech — Biometric & RFID Attendance Integration Service
 * 
 * Database-backed architecture integrating:
 * 1. BiometricDevice: Hardware authentication via SHA-256 hashes and institution binding.
 * 2. StudentBiometricCredential: Multi-credential mapping (RFID + Fingerprint) without modifying Student.studentUniqueId.
 * 3. BiometricEventReceipt: Reliable event idempotency with database-level uniqueness to handle concurrent duplicates safely.
 * 4. BiometricUnknownScan: Durable recording of unknown RFID/fingerprint taps for admin review before returning acknowledged=true.
 * 5. CampusInOutLog: Persistence of physical entry/exit logs with exact event UUID tracking.
 */

import crypto from "crypto";
import db, { BiometricPrismaModels } from "@/lib/db";

// Model interface extension ensuring immediate compatibility with IDE TypeScript language servers
interface BiometricPrismaExtension extends BiometricPrismaModels {}

const prisma = db as unknown as typeof db & BiometricPrismaExtension;

export interface BiometricScanPayload {
  eventId: string;
  deviceId: string;
  authMethod: "RFID" | "FINGERPRINT";
  identifier: string; // RFID Card UID (e.g. "142F6B8A") or Fingerprint ID (e.g. "FP-105")
  logType?: "ENTRY" | "EXIT" | "AUTO";
  gateName?: string;
  deviceTimestamp?: number | null; // Unix epoch seconds or null if unsynced
  confidence?: number;
}

export interface IngestionResultItem {
  eventId: string;
  status: "ACCEPTED" | "DUPLICATE_IGNORED" | "UNKNOWN_CREDENTIAL" | "REJECTED";
  acknowledged: boolean; // Tells the ESP32 whether this event can be safely purged from LittleFS
  studentId?: string;
  studentName?: string;
  message?: string;
}

/**
 * Compute SHA-256 hex digest of an API key.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Authenticate an ESP32 hardware device using X-Device-Id and X-Device-Key against the database.
 * 
 * Security Guarantees:
 * 1. Queries BiometricDevice from the database using deviceId.
 * 2. Verifies device is marked active.
 * 3. Hashes rawApiKey using SHA-256 and compares using constant-time crypto.timingSafeEqual.
 * 4. Strictly resolves institutionId from the verified database record; never trusts client-supplied tenant IDs.
 * 5. Never logs or returns raw keys or stored hashes.
 */
export async function authenticateDeviceCredentials(
  deviceId: string,
  rawApiKey: string
): Promise<
  | {
      success: true;
      institutionId: string;
      deviceId: string;
      gateName: string;
      directionMode: "ENTRY" | "EXIT" | "AUTO";
    }
  | { success: false; error: string }
> {
  if (!deviceId || !rawApiKey) {
    return { success: false, error: "Device ID and API key are required." };
  }

  try {
    const device = await prisma.biometricDevice.findUnique({
      where: { deviceId },
    });

    if (!device || !device.isActive) {
      return { success: false, error: "Device not found or inactive." };
    }

    const computedHash = hashApiKey(rawApiKey);
    const storedHash = device.apiKeyHash;

    if (computedHash.length !== storedHash.length) {
      return { success: false, error: "Invalid device key." };
    }

    // Constant-time buffer comparison to prevent timing side-channel attacks
    const bufA = Buffer.from(computedHash, "hex");
    const bufB = Buffer.from(storedHash, "hex");
    if (!crypto.timingSafeEqual(bufA, bufB)) {
      return { success: false, error: "Invalid device key." };
    }

    return {
      success: true,
      institutionId: device.institutionId,
      deviceId: device.deviceId,
      gateName: device.gateName,
      directionMode: (device.directionMode as "ENTRY" | "EXIT" | "AUTO") || "AUTO",
    };
  } catch (err: any) {
    // If the database table does not exist (migration pending review), provide descriptive error
    if (err.code === "P2021") {
      return {
        success: false,
        error: "Database table 'biometric_devices' does not exist. Migration 6_biometric_credentials_and_devices is pending review.",
      };
    }
    return { success: false, error: err.message || "Failed to authenticate device." };
  }
}

/**
 * Register an RFID Card or Fingerprint ID to an existing Student.
 * 
 * Safety invariants:
 * - NEVER overwrites or alters Student.studentUniqueId.
 * - Does NOT use studentUniqueId as a multi-credential store.
 * - Stores separate RFID and Fingerprint credentials in StudentBiometricCredential.
 * - Enforces database-level uniqueness for (institutionId, credentialType, credentialValue).
 */
export async function registerStudentBiometric(
  institutionId: string,
  studentId: string,
  credentialValue: string,
  credentialType: "RFID" | "FINGERPRINT" = "RFID"
) {
  const trimmedVal = credentialValue.trim().toUpperCase();
  if (!trimmedVal) {
    throw new Error("Credential value cannot be empty.");
  }

  // 1. Verify student exists within the institution
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    select: { id: true, fullName: true, rollNumber: true, studentUniqueId: true },
  });

  if (!student) {
    throw new Error("Student not found in this institution.");
  }

  // 2. Check for duplicate assignment within the same institution
  const existingHolder = await prisma.studentBiometricCredential.findUnique({
    where: {
      institutionId_credentialType_credentialValue: {
        institutionId,
        credentialType,
        credentialValue: trimmedVal,
      },
    },
    select: { id: true, studentId: true },
  });

  if (existingHolder && existingHolder.studentId !== studentId) {
    throw new Error(
      `Credential ${trimmedVal} (${credentialType}) is already assigned to another student in this institution.`
    );
  }

  // 3. Upsert into dedicated StudentBiometricCredential table (Student.studentUniqueId is untouched)
  const credentialRecord = await prisma.studentBiometricCredential.upsert({
    where: {
      institutionId_credentialType_credentialValue: {
        institutionId,
        credentialType,
        credentialValue: trimmedVal,
      },
    },
    create: {
      institutionId,
      studentId,
      credentialType,
      credentialValue: trimmedVal,
      status: "ACTIVE",
    },
    update: {
      studentId,
      status: "ACTIVE",
    },
  });

  return {
    success: true,
    student: {
      id: student.id,
      fullName: student.fullName,
      rollNumber: student.rollNumber,
      studentUniqueId: student.studentUniqueId, // Preserved untouched!
    },
    credentialType,
    credentialValue: trimmedVal,
    credentialRecordId: credentialRecord.id,
  };
}

/**
 * Resolve a student using an RFID UID or Fingerprint Identifier.
 * 
 * Resolution order:
 * 1. Dedicated database table StudentBiometricCredential (scoped to institutionId and credentialType).
 * 2. Read-only legacy fallback: Student.studentUniqueId (only for RFID, never modifying it).
 */
export async function resolveStudentByCredential(
  institutionId: string,
  credentialValue: string,
  credentialType?: "RFID" | "FINGERPRINT"
) {
  const searchVal = credentialValue.trim().toUpperCase();
  if (!searchVal) return null;

  // 1. Check dedicated biometric credential table
  const credRecord = await prisma.studentBiometricCredential.findFirst({
    where: {
      institutionId,
      credentialValue: searchVal,
      status: "ACTIVE",
      ...(credentialType ? { credentialType } : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          institutionId: true,
          fullName: true,
          rollNumber: true,
          admissionNumber: true,
          currentSemester: true,
          currentSection: true,
          studentUniqueId: true,
        },
      },
    },
  });

  if (credRecord?.student) {
    return credRecord.student;
  }

  // 2. Read-only fallback for legacy RFID cards mapped to studentUniqueId
  // Fingerprints are NEVER matched against studentUniqueId
  if (!credentialType || credentialType === "RFID") {
    try {
      return await prisma.student.findFirst({
        where: {
          institutionId,
          studentUniqueId: searchVal,
        },
        select: {
          id: true,
          institutionId: true,
          fullName: true,
          rollNumber: true,
          admissionNumber: true,
          currentSemester: true,
          currentSection: true,
          studentUniqueId: true,
        },
      });
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Process a single or batch of biometric/RFID events from an ESP32 hardware reader.
 * 
 * Reliability & Security Invariants:
 * 1. Dedicated BiometricEventReceipt table with database-level UNIQUE(institutionId, eventId)
 *    ensures absolute idempotency and safe concurrent duplicate handling.
 * 2. UNKNOWN_CREDENTIAL events are durably recorded in BiometricUnknownScan (and receipted)
 *    for admin review BEFORE returning acknowledged=true.
 * 3. 60-second cooldown check prevents duplicate logs for rapid taps of the same student.
 * 4. AUTO mode safely toggles direction (ENTRY -> EXIT).
 * 5. CampusInOutLog.verifiedBy stores `BIO:<authMethod>:<deviceId>:<eventId>`.
 */
export async function processBiometricBatch(
  institutionId: string,
  events: BiometricScanPayload[],
  deviceContext?: { gateName?: string; deviceId?: string }
): Promise<IngestionResultItem[]> {
  const results: IngestionResultItem[] = [];

  for (const ev of events) {
    try {
      if (!ev.eventId || !ev.identifier) {
        results.push({
          eventId: ev.eventId || "UNKNOWN",
          status: "REJECTED",
          acknowledged: false,
          message: "Missing eventId or identifier.",
        });
        continue;
      }

      // 1. Idempotency Check: Verify if an event receipt already exists in the database
      const existingReceipt = await prisma.biometricEventReceipt.findUnique({
        where: {
          institutionId_eventId: {
            institutionId,
            eventId: ev.eventId,
          },
        },
      });

      if (existingReceipt) {
        results.push({
          eventId: ev.eventId,
          status: "DUPLICATE_IGNORED",
          acknowledged: true, // Tells ESP32 this event was already durably recorded; safe to purge
          message: "Event already ingested (idempotent duplicate).",
        });
        continue;
      }

      // 2. Parse scan timestamp
      const scanDate = ev.deviceTimestamp
        ? new Date(ev.deviceTimestamp * 1000)
        : new Date();

      // 3. Resolve student by RFID UID or Biometric ID
      const student = await resolveStudentByCredential(institutionId, ev.identifier, ev.authMethod);

      // 4. Handle UNKNOWN_CREDENTIAL: Record durably in BiometricUnknownScan before returning acknowledged=true
      if (!student) {
        try {
          // Atomically persist unknown scan and event receipt in a single transaction
          await prisma.$transaction(async (tx: any) => {
            await tx.biometricUnknownScan.create({
              data: {
                institutionId,
                deviceId: ev.deviceId,
                eventId: ev.eventId,
                authMethod: ev.authMethod,
                identifier: ev.identifier,
                gateName: ev.gateName || deviceContext?.gateName || "Main Gate",
                scannedAt: scanDate,
                reviewed: false,
              },
            });

            await tx.biometricEventReceipt.create({
              data: {
                institutionId,
                eventId: ev.eventId,
                deviceId: ev.deviceId,
                authMethod: ev.authMethod,
                identifier: ev.identifier,
                status: "UNKNOWN_CREDENTIAL",
              },
            });
          });

          results.push({
            eventId: ev.eventId,
            status: "UNKNOWN_CREDENTIAL",
            acknowledged: true, // Safe to remove from LittleFS because it is durably saved in BiometricUnknownScan
            message: `Unknown credential durably recorded for administrator review: ${ev.identifier}`,
          });
        } catch (raceErr: any) {
          // Catch concurrent duplicate insert (P2002) - transaction safely rolled back
          if (raceErr.code === "P2002") {
            results.push({
              eventId: ev.eventId,
              status: "DUPLICATE_IGNORED",
              acknowledged: true,
              message: "Concurrent duplicate event ID ignored.",
            });
          } else {
            throw raceErr;
          }
        }
        continue;
      }

      // 5. Cooldown check (60 seconds) to prevent multiple scans of the same student
      const oneMinuteBefore = new Date(scanDate.getTime() - 60 * 1000);
      const oneMinuteAfter = new Date(scanDate.getTime() + 60 * 1000);

      const recentLog = await prisma.campusInOutLog.findFirst({
        where: {
          institutionId,
          studentId: student.id,
          timestamp: { gte: oneMinuteBefore, lte: oneMinuteAfter },
        },
      });

      if (recentLog) {
        // Record receipt as DUPLICATE_IGNORED
        try {
          await prisma.biometricEventReceipt.create({
            data: {
              institutionId,
              eventId: ev.eventId,
              deviceId: ev.deviceId,
              authMethod: ev.authMethod,
              identifier: ev.identifier,
              status: "DUPLICATE_IGNORED",
              campusLogId: recentLog.id,
            },
          });
        } catch (raceErr: any) {
          if (raceErr.code !== "P2002") throw raceErr;
        }

        results.push({
          eventId: ev.eventId,
          status: "DUPLICATE_IGNORED",
          acknowledged: true,
          studentId: student.id,
          studentName: student.fullName || student.rollNumber,
          message: "Scan ignored: duplicate event within cooldown period.",
        });
        continue;
      }

      // 6. Determine log direction (ENTRY vs EXIT)
      let resolvedDirection = ev.logType || "ENTRY";
      if (resolvedDirection === "AUTO") {
        const lastLog = await prisma.campusInOutLog.findFirst({
          where: { institutionId, studentId: student.id },
          orderBy: { timestamp: "desc" },
        });
        resolvedDirection = lastLog && lastLog.logType === "ENTRY" ? "EXIT" : "ENTRY";
      }

      // 7. Persist to CampusInOutLog and record BiometricEventReceipt atomically in a single Prisma transaction
      const verifierString = `BIO:${ev.authMethod}:${ev.deviceId}:${ev.eventId}`;

      try {
        await prisma.$transaction(async (tx: any) => {
          const log = await tx.campusInOutLog.create({
            data: {
              institutionId,
              studentId: student.id,
              logType: resolvedDirection,
              timestamp: scanDate,
              gateName: ev.gateName || deviceContext?.gateName || "Main Gate",
              verifiedBy: verifierString,
            },
          });

          await tx.biometricEventReceipt.create({
            data: {
              institutionId,
              eventId: ev.eventId,
              deviceId: ev.deviceId,
              authMethod: ev.authMethod,
              identifier: ev.identifier,
              status: "ACCEPTED",
              campusLogId: log.id,
            },
          });
        });

        results.push({
          eventId: ev.eventId,
          status: "ACCEPTED",
          acknowledged: true,
          studentId: student.id,
          studentName: student.fullName || student.rollNumber,
          message: `Biometric attendance logged successfully (${resolvedDirection}).`,
        });
      } catch (raceErr: any) {
        // Database unique constraint violation on eventId: transaction automatically rolled back
        if (raceErr.code === "P2002") {
          results.push({
            eventId: ev.eventId,
            status: "DUPLICATE_IGNORED",
            acknowledged: true,
            studentId: student.id,
            studentName: student.fullName || student.rollNumber,
            message: "Concurrent duplicate event ID ignored.",
          });
        } else {
          throw raceErr;
        }
      }
    } catch (err: any) {
      results.push({
        eventId: ev.eventId,
        status: "REJECTED",
        acknowledged: false,
        message: err.message || "Failed to process event.",
      });
    }
  }

  return results;
}

/**
 * Retrieve date-wise and gate-wise biometric logs.
 */
export async function getBiometricAuditLogs(
  institutionId: string,
  filters?: {
    studentId?: string;
    startDate?: Date;
    endDate?: Date;
    take?: number;
  }
) {
  const where: any = { institutionId };
  if (filters?.studentId) where.studentId = filters.studentId;

  if (filters?.startDate || filters?.endDate) {
    where.timestamp = {};
    if (filters.startDate) where.timestamp.gte = filters.startDate;
    if (filters.endDate) where.timestamp.lte = filters.endDate;
  }

  return await prisma.campusInOutLog.findMany({
    where,
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          rollNumber: true,
          studentUniqueId: true,
        },
      },
    },
    orderBy: { timestamp: "desc" },
    take: filters?.take || 50,
  });
}

/**
 * Retrieve unknown biometric scans awaiting administrator review.
 */
export async function getUnknownBiometricScans(
  institutionId: string,
  reviewed = false
) {
  return await prisma.biometricUnknownScan.findMany({
    where: { institutionId, reviewed },
    orderBy: { scannedAt: "desc" },
  });
}
