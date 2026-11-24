-- ==============================================================================
-- SST-ERP BATCH 12: STUDENT STATUS ENUM (OPTIONAL ADDITIVE SCHEMA MIGRATION DRAFT)
-- Description: Draft migration for environments choosing to convert the established
--              students.status text column to an explicit PostgreSQL enum.
-- Target: Review only. Do NOT apply to shared staging or production without explicit approval.
-- Baseline state: students.status column is text DEFAULT 'ACTIVE'::text across all 87 records.
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE "StudentStatus" AS ENUM (
        'ACTIVE', 'INACTIVE', 'SUSPENDED', 'ALUMNI', 'TRANSFERRED', 'DROPOUT', 'ARCHIVED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
