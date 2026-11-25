-- ============================================================================
-- Migration: 10_multi_division_core
-- Description: Core Multi-Division architecture schema additions.
-- Scope: Multi-Division foundation (InstitutionDivision, StaffDivisionAssignment,
--        DivisionMembership, nullable division pointers on Class, Student,
--        Enrollment, StudentEnrollmentHistory, Department, Course, FeeInvoice).
-- Engine: PostgreSQL 15+ (Supabase) via Prisma ORM 6/7
-- STATUS: DRAFT FOR REVIEW ONLY. DO NOT EXECUTE DIRECTLY AGAINST PRODUCTION DB.
-- ============================================================================

-- Step 1: Create Enums
DO $$ BEGIN
    CREATE TYPE "DivisionType" AS ENUM ('MONTESSORI', 'SCHOOL', 'HIGHER_SECONDARY', 'COLLEGE', 'ACADEMY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DivisionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Create New Tables

-- 2.1 InstitutionDivision
CREATE TABLE IF NOT EXISTS "institution_divisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "DivisionType" NOT NULL DEFAULT 'COLLEGE',
    "status" "DivisionStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "logoUrl" TEXT,
    "academicSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_divisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "institution_divisions_institutionId_code_key" UNIQUE ("institutionId", "code"),
    CONSTRAINT "institution_divisions_institutionId_slug_key" UNIQUE ("institutionId", "slug"),
    CONSTRAINT "institution_divisions_id_institutionId_key" UNIQUE ("id", "institutionId")
);

CREATE INDEX IF NOT EXISTS "institution_divisions_institutionId_status_idx" 
ON "institution_divisions"("institutionId", "status");

-- 2.2 StaffDivisionAssignment
CREATE TABLE IF NOT EXISTS "staff_division_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "designation" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_division_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_division_assignments_staffId_divisionId_key" UNIQUE ("staffId", "divisionId")
);

CREATE INDEX IF NOT EXISTS "staff_division_assignments_institutionId_divisionId_idx" 
ON "staff_division_assignments"("institutionId", "divisionId");

-- 2.3 DivisionMembership
CREATE TABLE IF NOT EXISTS "division_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "division_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "division_memberships_userId_divisionId_roleId_key" UNIQUE ("userId", "divisionId", "roleId")
);

CREATE INDEX IF NOT EXISTS "division_memberships_institutionId_userId_idx" 
ON "division_memberships"("institutionId", "userId");

CREATE INDEX IF NOT EXISTS "division_memberships_divisionId_roleId_idx" 
ON "division_memberships"("divisionId", "roleId");

-- Step 3: Composite Unique on Users
CREATE UNIQUE INDEX IF NOT EXISTS "users_id_institutionId_key" 
ON "users"("id", "institutionId");

-- Step 4: Alter Existing Tables (Additive Nullable Columns & Composite Keys)

-- 4.1 Department
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "divisionId" UUID;
CREATE INDEX IF NOT EXISTS "Department_institutionId_divisionId_idx" 
ON "Department"("institutionId", "divisionId");

-- 4.2 Course
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "divisionId" UUID;
CREATE INDEX IF NOT EXISTS "Course_institutionId_divisionId_idx" 
ON "Course"("institutionId", "divisionId");

-- 4.3 Class
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "divisionId" UUID;
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "gradeLevel" TEXT;
ALTER TABLE "Class" ALTER COLUMN "courseId" DROP NOT NULL;
ALTER TABLE "Class" ALTER COLUMN "semester" DROP NOT NULL;

DO $$ BEGIN
    ALTER TABLE "Class" ADD CONSTRAINT "Class_id_divisionId_institutionId_key" 
    UNIQUE ("id", "divisionId", "institutionId");
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Class_institutionId_divisionId_idx" 
ON "Class"("institutionId", "divisionId");

-- 4.4 Student
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "currentDivisionId" UUID;
CREATE INDEX IF NOT EXISTS "Student_currentDivisionId_institutionId_idx" 
ON "Student"("currentDivisionId", "institutionId");

-- 4.5 StudentEnrollmentHistory
ALTER TABLE "StudentEnrollmentHistory" ADD COLUMN IF NOT EXISTS "divisionId" UUID;
ALTER TABLE "StudentEnrollmentHistory" ADD COLUMN IF NOT EXISTS "gradeLevel" TEXT;
ALTER TABLE "StudentEnrollmentHistory" ALTER COLUMN "semester" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "StudentEnrollmentHistory_institutionId_divisionId_idx" 
ON "StudentEnrollmentHistory"("institutionId", "divisionId");

-- 4.6 Enrollment (enrollments table)
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "divisionId" UUID;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "classId" UUID;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "enrollments" ALTER COLUMN "courseId" DROP NOT NULL;
ALTER TABLE "enrollments" ALTER COLUMN "semester" DROP NOT NULL;
ALTER TABLE "enrollments" ALTER COLUMN "section" DROP NOT NULL;

DO $$ BEGIN
    ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_id_divisionId_institutionId_key" 
    UNIQUE ("id", "divisionId", "institutionId");
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "enrollments_institutionId_divisionId_idx" 
ON "enrollments"("institutionId", "divisionId");

CREATE INDEX IF NOT EXISTS "enrollments_classId_divisionId_idx" 
ON "enrollments"("classId", "divisionId");

-- 4.7 FeeInvoice (fee_invoices table)
ALTER TABLE "fee_invoices" ADD COLUMN IF NOT EXISTS "divisionId" UUID;
CREATE INDEX IF NOT EXISTS "fee_invoices_institutionId_divisionId_idx" 
ON "fee_invoices"("institutionId", "divisionId");

-- Step 5: Foreign Key Constraints with Tenant & Division Safeguards

-- 5.1 InstitutionDivision -> Institution
DO $$ BEGIN
    ALTER TABLE "institution_divisions" 
    ADD CONSTRAINT "institution_divisions_institutionId_fkey" 
    FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.2 StaffDivisionAssignment -> Institution, Staff, InstitutionDivision
DO $$ BEGIN
    ALTER TABLE "staff_division_assignments" 
    ADD CONSTRAINT "staff_division_assignments_institutionId_fkey" 
    FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "staff_division_assignments" 
    ADD CONSTRAINT "staff_division_assignments_staffId_institutionId_fkey" 
    FOREIGN KEY ("staffId", "institutionId") REFERENCES "Staff"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "staff_division_assignments" 
    ADD CONSTRAINT "staff_division_assignments_divisionId_institutionId_fkey" 
    FOREIGN KEY ("divisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.3 DivisionMembership -> Institution, User, InstitutionDivision, Role
DO $$ BEGIN
    ALTER TABLE "division_memberships" 
    ADD CONSTRAINT "division_memberships_institutionId_fkey" 
    FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "division_memberships" 
    ADD CONSTRAINT "division_memberships_userId_institutionId_fkey" 
    FOREIGN KEY ("userId", "institutionId") REFERENCES "users"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "division_memberships" 
    ADD CONSTRAINT "division_memberships_divisionId_institutionId_fkey" 
    FOREIGN KEY ("divisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "division_memberships" 
    ADD CONSTRAINT "division_memberships_roleId_institutionId_fkey" 
    FOREIGN KEY ("roleId", "institutionId") REFERENCES "Role"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.4 Department -> InstitutionDivision
DO $$ BEGIN
    ALTER TABLE "Department" 
    ADD CONSTRAINT "Department_divisionId_institutionId_fkey" 
    FOREIGN KEY ("divisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.5 Course -> InstitutionDivision
DO $$ BEGIN
    ALTER TABLE "Course" 
    ADD CONSTRAINT "Course_divisionId_institutionId_fkey" 
    FOREIGN KEY ("divisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.6 Class -> InstitutionDivision
DO $$ BEGIN
    ALTER TABLE "Class" 
    ADD CONSTRAINT "Class_divisionId_institutionId_fkey" 
    FOREIGN KEY ("divisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.7 Student -> InstitutionDivision
DO $$ BEGIN
    ALTER TABLE "Student" 
    ADD CONSTRAINT "Student_currentDivisionId_institutionId_fkey" 
    FOREIGN KEY ("currentDivisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.8 StudentEnrollmentHistory -> InstitutionDivision
DO $$ BEGIN
    ALTER TABLE "StudentEnrollmentHistory" 
    ADD CONSTRAINT "StudentEnrollmentHistory_divisionId_institutionId_fkey" 
    FOREIGN KEY ("divisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.9 Enrollment -> Student, InstitutionDivision, Class, AcademicYear, Course
DO $$ BEGIN
    ALTER TABLE "enrollments" DROP CONSTRAINT IF EXISTS "enrollments_studentId_fkey";
    ALTER TABLE "enrollments" 
    ADD CONSTRAINT "enrollments_studentId_institutionId_fkey" 
    FOREIGN KEY ("studentId", "institutionId") REFERENCES "Student"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "enrollments" 
    ADD CONSTRAINT "enrollments_divisionId_institutionId_fkey" 
    FOREIGN KEY ("divisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "enrollments" 
    ADD CONSTRAINT "enrollments_classId_divisionId_institutionId_fkey" 
    FOREIGN KEY ("classId", "divisionId", "institutionId") REFERENCES "Class"("id", "divisionId", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "enrollments" DROP CONSTRAINT IF EXISTS "enrollments_courseId_fkey";
    ALTER TABLE "enrollments" 
    ADD CONSTRAINT "enrollments_courseId_institutionId_fkey" 
    FOREIGN KEY ("courseId", "institutionId") REFERENCES "Course"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "enrollments" DROP CONSTRAINT IF EXISTS "enrollments_academicYearId_fkey";
    ALTER TABLE "enrollments" 
    ADD CONSTRAINT "enrollments_academicYearId_institutionId_fkey" 
    FOREIGN KEY ("academicYearId", "institutionId") REFERENCES "academic_years"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5.10 FeeInvoice -> Student, InstitutionDivision
DO $$ BEGIN
    ALTER TABLE "fee_invoices" DROP CONSTRAINT IF EXISTS "fee_invoices_studentId_fkey";
    ALTER TABLE "fee_invoices" 
    ADD CONSTRAINT "fee_invoices_studentId_institutionId_fkey" 
    FOREIGN KEY ("studentId", "institutionId") REFERENCES "Student"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "fee_invoices" 
    ADD CONSTRAINT "fee_invoices_divisionId_institutionId_fkey" 
    FOREIGN KEY ("divisionId", "institutionId") REFERENCES "institution_divisions"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Step 6: Native PostgreSQL Partial Unique Index for Primary Active Enrollment
-- Enforces that no student can have more than ONE active primary enrollment,
-- while allowing concurrent secondary enrollments (isPrimary = false) and historical completed enrollments.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_single_active_primary_enrollment" 
ON "enrollments" ("studentId") 
WHERE status = 'ACTIVE' AND "isPrimary" = true;
