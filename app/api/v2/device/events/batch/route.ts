import { NextRequest, NextResponse } from "next/server";
import {
  authenticateDeviceCredentials,
  processBiometricBatch,
  BiometricScanPayload,
} from "@/lib/services/biometric-attendance.service";

// Regex to validate canonical 36-character UUIDv4
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v2/device/events/batch
 * 
 * Hardware ingress endpoint for ESP32 RFID & Biometric reader offline event batches.
 * 
 * Invariants:
 * 1. Authenticates via X-Device-Id and X-Device-Key using SHA-256 constant-time hash comparison.
 * 2. Securely resolves institutionId from verified device registration.
 * 3. Never trusts institutionId provided in the request payload.
 * 4. Validates each event's UUID and format.
 * 5. Returns individual event acknowledgment status for LittleFS queue pruning.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Extract device authentication headers
    const deviceId = req.headers.get("x-device-id");
    const deviceKey = req.headers.get("x-device-key");

    if (!deviceId || !deviceKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Missing X-Device-Id or X-Device-Key headers.",
        },
        { status: 401 }
      );
    }

    // 2. Authenticate device and resolve bound institutionId
    const authResult = await authenticateDeviceCredentials(deviceId, deviceKey);
    if (!authResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Unauthorized: ${authResult.error}`,
        },
        { status: 401 }
      );
    }

    const { institutionId, gateName, directionMode } = authResult;

    // 3. Parse and validate request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request: Invalid JSON body.",
        },
        { status: 400 }
      );
    }

    // Support both `{ events: [...] }` and raw array `[...]`
    const rawEvents: any[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.events)
      ? body.events
      : body
      ? [body]
      : [];

    if (!rawEvents.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request: events array is required and cannot be empty.",
        },
        { status: 400 }
      );
    }

    // Bound maximum events per batch to prevent Denial of Service
    if (rawEvents.length > 250) {
      return NextResponse.json(
        {
          success: false,
          error: "Payload Too Large: Maximum 250 events per batch.",
        },
        { status: 413 }
      );
    }

    // 4. Validate and sanitize each event
    const scanPayloads: BiometricScanPayload[] = [];
    const validationErrors: { event_id: string; status: string; acknowledged: boolean; message: string }[] = [];

    for (let i = 0; i < rawEvents.length; i++) {
      const raw = rawEvents[i];
      const eventId = String(raw.event_id || raw.eventId || "").trim();

      if (!eventId || !UUID_REGEX.test(eventId)) {
        validationErrors.push({
          event_id: eventId || `item-${i}`,
          status: "REJECTED",
          acknowledged: false,
          message: "Invalid or missing UUIDv4 event_id.",
        });
        continue;
      }

      const identifier = String(raw.uid || raw.identifier || raw.fingerprint_id || "").trim().toUpperCase();
      if (!identifier) {
        validationErrors.push({
          event_id: eventId,
          status: "REJECTED",
          acknowledged: false,
          message: "Missing credential identifier (uid).",
        });
        continue;
      }

      // Map kind / auth_method
      let authMethod: "RFID" | "FINGERPRINT" = "RFID";
      const rawMethod = String(raw.auth_method || raw.authMethod || raw.kind || "").toUpperCase();
      if (rawMethod.includes("FINGERPRINT")) {
        authMethod = "FINGERPRINT";
      }

      // Validate device timestamp:
      // Enforce realistic bounds. Any timestamp before Jan 1, 2020 (RTC reset/unsynced)
      // or more than 24 hours in the future is treated as invalid and replaced with server time (null)
      // to ensure invalid/corrupt device clocks cannot corrupt physical attendance logs.
      const rawTimestamp = raw.device_timestamp ?? raw.deviceTimestamp;
      const currentEpochSec = Math.floor(Date.now() / 1000);
      const maxFutureEpochSec = currentEpochSec + 86400; // +24 hours
      const minValidEpochSec = 1577836800; // Jan 1, 2020 00:00:00 UTC

      let deviceTimestamp: number | null = null;
      if (
        typeof rawTimestamp === "number" &&
        Number.isFinite(rawTimestamp) &&
        rawTimestamp >= minValidEpochSec &&
        rawTimestamp <= maxFutureEpochSec
      ) {
        deviceTimestamp = Math.floor(rawTimestamp);
      }

      scanPayloads.push({
        eventId,
        deviceId, // Always bind to authenticated device ID
        authMethod,
        identifier,
        logType: (raw.log_type || raw.logType || directionMode) as "ENTRY" | "EXIT" | "AUTO",
        gateName: raw.gate_name || raw.gateName || gateName,
        deviceTimestamp,
      });
    }

    // 5. Ingest valid events through the centralized service
    const ingestionResults = await processBiometricBatch(institutionId, scanPayloads, {
      gateName,
      deviceId,
    });

    // 6. Format response with individual event acknowledgments
    const combinedResults = [
      ...ingestionResults.map((r) => ({
        event_id: r.eventId,
        status: r.status,
        acknowledged: r.acknowledged,
        student_id: r.studentId,
        student_name: r.studentName,
        message: r.message,
      })),
      ...validationErrors,
    ];

    const acknowledgedCount = combinedResults.filter((r) => r.acknowledged).length;

    return NextResponse.json({
      success: true,
      device_id: deviceId,
      institution_id: institutionId,
      processed_count: combinedResults.length,
      acknowledged_count: acknowledgedCount,
      results: combinedResults,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Internal server error during biometric ingestion.",
      },
      { status: 500 }
    );
  }
}
