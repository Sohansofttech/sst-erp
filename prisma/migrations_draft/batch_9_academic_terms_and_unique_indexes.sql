-- ============================================================================
-- SST ERP Migration Draft - Batch 9: Academic Terms and Unique Index Hardening
-- Scope: AcademicYear case-insensitive uniqueness, Relational AcademicTerm table,
--        Composite Foreign Key for Database-Level Multi-Tenant Integrity
-- Multi-Tenant Scale: 1,000+ Educational Institutions
-- Status: DRAFT - PENDING USER APPROVAL (DO NOT EXECUTE DIRECTLY ON PRODUCTION)
-- ============================================================================

BEGIN;

-- 1. Idempotently enforce unique (id, institutionId) on academic_years
-- Required as target key for composite tenant foreign key on academic_terms
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'academic_years_id_institutionId_uq'
    ) THEN
        ALTER TABLE public.academic_years 
        ADD CONSTRAINT "academic_years_id_institutionId_uq" UNIQUE (id, "institutionId");
    END IF;
END $$;

-- 2. Enforce case-insensitive unique Academic Year name per institution
-- Validated: Zero duplicate rows exist in existing dataset across all tenants.
CREATE UNIQUE INDEX IF NOT EXISTS "academic_years_institution_id_name_lower_idx"
ON public.academic_years ("institutionId", LOWER(TRIM(name)));

-- 3. Create relational academic_terms table with composite foreign key
CREATE TABLE IF NOT EXISTS public.academic_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "institutionId" TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    "academicYearId" TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Boundary check constraint: Term start date must precede term end date
    CONSTRAINT "academic_terms_dates_check" CHECK ("startDate" < "endDate"),

    -- Composite foreign key: Guarantees academicYearId belongs to the EXACT SAME institutionId
    CONSTRAINT "academic_terms_academic_year_tenant_fkey" 
    FOREIGN KEY ("academicYearId", "institutionId") 
    REFERENCES public.academic_years(id, "institutionId") 
    ON DELETE CASCADE
);

-- 4. Indexes for performance and multi-tenant security isolation
CREATE UNIQUE INDEX IF NOT EXISTS "academic_terms_academic_year_name_lower_idx"
ON public.academic_terms ("academicYearId", LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS "academic_terms_institutionId_idx"
ON public.academic_terms ("institutionId");

CREATE INDEX IF NOT EXISTS "academic_terms_academicYearId_idx"
ON public.academic_terms ("academicYearId");

CREATE INDEX IF NOT EXISTS "academic_terms_institution_current_idx"
ON public.academic_terms ("institutionId", "isCurrent");

-- 5. Concurrency Protection: Enforce at most one current term per academic year
CREATE UNIQUE INDEX IF NOT EXISTS "academic_terms_one_current_per_year_idx"
ON public.academic_terms ("academicYearId")
WHERE ("isCurrent" = true);

COMMIT;

-- ============================================================================
-- DEPENDENCY-AWARE ROLLBACK SCRIPT (IF NEEDED)
-- Drops explicitly created objects in reverse order with RESTRICT
-- ============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS public.academic_terms_one_current_per_year_idx;
-- DROP INDEX IF EXISTS public.academic_terms_institution_current_idx;
-- DROP INDEX IF EXISTS public.academic_terms_academicYearId_idx;
-- DROP INDEX IF EXISTS public.academic_terms_institutionId_idx;
-- DROP INDEX IF EXISTS public.academic_terms_academic_year_name_lower_idx;
-- ALTER TABLE IF EXISTS public.academic_terms DROP CONSTRAINT IF EXISTS academic_terms_academic_year_tenant_fkey;
-- ALTER TABLE IF EXISTS public.academic_terms DROP CONSTRAINT IF EXISTS academic_terms_institutionId_fkey;
-- ALTER TABLE IF EXISTS public.academic_terms DROP CONSTRAINT IF EXISTS academic_terms_dates_check;
-- DROP TABLE IF EXISTS public.academic_terms RESTRICT;
-- DROP INDEX IF EXISTS public.academic_years_institution_id_name_lower_idx;
-- ALTER TABLE IF EXISTS public.academic_years DROP CONSTRAINT IF EXISTS academic_years_id_institutionId_uq;
-- COMMIT;
