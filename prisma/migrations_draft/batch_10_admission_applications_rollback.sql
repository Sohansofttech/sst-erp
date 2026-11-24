-- ============================================================================
-- SST ERP Migration Rollback: Batch 10 - Admission Applications
-- Scope: Explicit, Non-Cascading Removal of Batch 10 Objects in Dependency Order
-- Safety Guarantee: Uses RESTRICT to strictly prevent unintended cascading drops
-- ============================================================================

-- 1. Drop compatibility view first (depends on table admission_applications)
DROP VIEW IF EXISTS "AdmissionApplication" RESTRICT;

-- 2. Drop table explicitly without CASCADE
DROP TABLE IF EXISTS "admission_applications" RESTRICT;

-- 3. Drop Batch 10 custom enum types explicitly (only after columns using them are gone)
DROP TYPE IF EXISTS "AdmissionApplicationStatus" RESTRICT;
DROP TYPE IF EXISTS "DocumentStatus" RESTRICT;
DROP TYPE IF EXISTS "Gender" RESTRICT;
