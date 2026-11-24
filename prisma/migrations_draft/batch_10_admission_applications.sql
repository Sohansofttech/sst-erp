-- ============================================================================
-- SST ERP Migration Draft: Batch 10 - Admission Applications Foundation
-- Scope: admission_applications table, enums, indexes, and compatibility view
-- Type: 100% Additive, Zero Downtime, Non-Destructive
-- Status: Prepared for User Approval. DO NOT APPLY without explicit authorization.
-- ============================================================================

-- 1. Create Enums (Idempotent)
DO $$ BEGIN
    CREATE TYPE "AdmissionApplicationStatus" AS ENUM (
        'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WAITLISTED', 'ENROLLED', 'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PARTIALLY_SUBMITTED', 'VERIFIED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Base Table: admission_applications
CREATE TABLE IF NOT EXISTS "admission_applications" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "institutionId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'MALE',
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "guardianName" TEXT,
    "guardianRelationship" TEXT,
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "guardianOccupation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "documentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "documentsJson" TEXT,
    "convertedStudentId" TEXT,
    "remarks" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admission_applications_institutionId_fkey" FOREIGN KEY ("institutionId")
        REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "admission_applications_academicYearId_fkey" FOREIGN KEY ("academicYearId")
        REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admission_applications_courseId_fkey" FOREIGN KEY ("courseId")
        REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "admission_applications_convertedStudentId_fkey" FOREIGN KEY ("convertedStudentId")
        REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED
);

-- 3. Create Unique & Search Indexes (Matching Prisma schema specifications)
CREATE UNIQUE INDEX IF NOT EXISTS "admission_applications_institutionId_applicationNumber_key"
    ON "admission_applications"("institutionId", "applicationNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "admission_applications_id_institutionId_key"
    ON "admission_applications"("id", "institutionId");

CREATE UNIQUE INDEX IF NOT EXISTS "admission_applications_convertedStudentId_key"
    ON "admission_applications"("convertedStudentId")
    WHERE "convertedStudentId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "admission_applications_institutionId_status_idx"
    ON "admission_applications"("institutionId", "status");

CREATE INDEX IF NOT EXISTS "admission_applications_academicYearId_institutionId_idx"
    ON "admission_applications"("academicYearId", "institutionId");

CREATE INDEX IF NOT EXISTS "admission_applications_courseId_institutionId_idx"
    ON "admission_applications"("courseId", "institutionId");

-- 4. Create Prisma Compatibility View (PascalCase)
-- Allows db.admissionApplication queries in Prisma Client to resolve seamlessly
CREATE OR REPLACE VIEW "AdmissionApplication" AS
SELECT * FROM "admission_applications";
