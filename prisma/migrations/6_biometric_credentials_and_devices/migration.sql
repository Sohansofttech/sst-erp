-- Migration: 6_biometric_credentials_and_devices
-- Description: Dedicated tables for biometric devices, student credentials, event receipts, and unknown scan audit.
-- Target DB: PostgreSQL (Supabase)
-- Status: PENDING USER REVIEW (Not applied to production database)

-- 1. Student Biometric Credentials Table
CREATE TABLE IF NOT EXISTS "student_biometric_credentials" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "credentialType" VARCHAR(32) NOT NULL, -- 'RFID' or 'FINGERPRINT'
    "credentialValue" VARCHAR(128) NOT NULL, -- Normalized Hex UID or Fingerprint Sensor Slot ID
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'REVOKED', 'SUSPENDED'
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_biometric_credentials_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_biometric_credentials_institution_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE,
    CONSTRAINT "student_biometric_credentials_student_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_biometric_credentials_unique_idx" 
ON "student_biometric_credentials" ("institutionId", "credentialType", "credentialValue");

CREATE INDEX IF NOT EXISTS "student_biometric_credentials_student_idx" 
ON "student_biometric_credentials" ("institutionId", "studentId");

CREATE INDEX IF NOT EXISTS "student_biometric_credentials_value_idx" 
ON "student_biometric_credentials" ("institutionId", "credentialValue");

-- 2. Biometric Hardware Devices Table
CREATE TABLE IF NOT EXISTS "biometric_devices" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "institutionId" TEXT NOT NULL,
    "deviceId" VARCHAR(64) NOT NULL, -- Public hardware identifier (e.g. 'sst-c69c65691062b1aa')
    "apiKeyHash" VARCHAR(64) NOT NULL, -- SHA-256 hex digest of device secret
    "deviceName" VARCHAR(128),
    "gateName" VARCHAR(128) NOT NULL DEFAULT 'Main Gate',
    "directionMode" VARCHAR(16) NOT NULL DEFAULT 'AUTO', -- 'ENTRY', 'EXIT', 'AUTO'
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastHeartbeat" TIMESTAMP(3),
    "firmwareVersion" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "biometric_devices_institution_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE,
    CONSTRAINT "biometric_devices_device_id_key" UNIQUE ("deviceId")
);

CREATE INDEX IF NOT EXISTS "biometric_devices_institution_idx" 
ON "biometric_devices" ("institutionId", "isActive");

-- 3. Biometric Event Receipts Table (Event Idempotency & Concurrency Safety)
CREATE TABLE IF NOT EXISTS "biometric_event_receipts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "institutionId" TEXT NOT NULL,
    "eventId" VARCHAR(64) NOT NULL, -- ESP32 device-generated UUIDv4
    "deviceId" VARCHAR(64) NOT NULL,
    "authMethod" VARCHAR(32) NOT NULL, -- 'RFID' or 'FINGERPRINT'
    "identifier" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL, -- 'ACCEPTED', 'DUPLICATE_IGNORED', 'UNKNOWN_CREDENTIAL', 'REJECTED'
    "campusLogId" TEXT, -- Reference to campus_in_out_logs.id if created
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_event_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "biometric_event_receipts_institution_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE,
    CONSTRAINT "biometric_event_receipts_campus_log_fkey" FOREIGN KEY ("campusLogId") REFERENCES "campus_in_out_logs"("id") ON DELETE SET NULL,
    CONSTRAINT "biometric_event_receipts_event_id_unique" UNIQUE ("institutionId", "eventId")
);

CREATE INDEX IF NOT EXISTS "biometric_event_receipts_event_idx" 
ON "biometric_event_receipts" ("institutionId", "eventId");

CREATE INDEX IF NOT EXISTS "biometric_event_receipts_time_idx" 
ON "biometric_event_receipts" ("institutionId", "receivedAt");

-- 4. Biometric Unknown Scans Table (Durable Audit & Quarantine for Unregistered Scans)
CREATE TABLE IF NOT EXISTS "biometric_unknown_scans" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "institutionId" TEXT NOT NULL,
    "deviceId" VARCHAR(64) NOT NULL,
    "eventId" VARCHAR(64) NOT NULL,
    "authMethod" VARCHAR(32) NOT NULL, -- 'RFID' or 'FINGERPRINT'
    "identifier" VARCHAR(128) NOT NULL, -- Scanned unknown card UID or fingerprint ID
    "gateName" VARCHAR(128) NOT NULL DEFAULT 'Main Gate',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "resolvedStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_unknown_scans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "biometric_unknown_scans_institution_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE,
    CONSTRAINT "biometric_unknown_scans_student_fkey" FOREIGN KEY ("resolvedStudentId") REFERENCES "students"("id") ON DELETE SET NULL,
    CONSTRAINT "biometric_unknown_scans_event_id_unique" UNIQUE ("institutionId", "eventId")
);

CREATE INDEX IF NOT EXISTS "biometric_unknown_scans_review_idx" 
ON "biometric_unknown_scans" ("institutionId", "reviewed");

CREATE INDEX IF NOT EXISTS "biometric_unknown_scans_time_idx" 
ON "biometric_unknown_scans" ("institutionId", "scannedAt");
