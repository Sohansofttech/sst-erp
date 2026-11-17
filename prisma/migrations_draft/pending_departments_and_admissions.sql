-- ============================================================================
-- SST ERP Migration Draft - Academic Foundations: Department & Admissions
-- Scope: Department, StudentStatus Enum, AdmissionApplication
-- Target Database: Supabase PostgreSQL (Shared)
-- Note: Review only. Do NOT apply to production Supabase without explicit team approval.
-- ============================================================================

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ALUMNI', 'WITHDRAWN');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "AdmissionApplicationStatus" AS ENUM (
        'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ENROLLED', 'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Department Table
CREATE TABLE IF NOT EXISTS "Department" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "hodStaffId" UUID,
    "studentCapacity" INTEGER DEFAULT 0,
    "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Department_institutionId_fkey" FOREIGN KEY ("institutionId")
        REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Department_institutionId_code_key"
    ON "Department"("institutionId", "code");
CREATE INDEX IF NOT EXISTS "Department_institutionId_status_idx"
    ON "Department"("institutionId", "status");

-- 3. AdmissionApplication Table
CREATE TABLE IF NOT EXISTS "AdmissionApplication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "guardianName" TEXT,
    "guardianRelationship" TEXT,
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "status" "AdmissionApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "convertedStudentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionApplication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdmissionApplication_institutionId_fkey" FOREIGN KEY ("institutionId")
        REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionApplication_institutionId_applicationNumber_key"
    ON "AdmissionApplication"("institutionId", "applicationNumber");
CREATE INDEX IF NOT EXISTS "AdmissionApplication_institutionId_status_idx"
    ON "AdmissionApplication"("institutionId", "status");
