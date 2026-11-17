-- ============================================================================
-- SST-ERP MIGRATION DRAFT: BATCH 7 - VISITOR GATE MANAGEMENT & CAMPUS SECURITY
-- ============================================================================
-- Author: SST-ERP Development Team
-- Created: 2026-11-16
-- Note: Draft migration for architectural review. DO NOT apply to shared Supabase directly.

CREATE TABLE IF NOT EXISTS public.visitor_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    pass_number VARCHAR(64) NOT NULL,
    visitor_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(32) NOT NULL,
    id_proof_type VARCHAR(64),
    id_proof_number VARCHAR(64),
    organization VARCHAR(255),
    purpose VARCHAR(255) NOT NULL,
    host_name VARCHAR(255) NOT NULL,
    host_department VARCHAR(128),
    gate_name VARCHAR(128) NOT NULL DEFAULT 'Main Gate',
    vehicle_number VARCHAR(64),
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out_time TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'CHECKED_IN',
    issued_by VARCHAR(255),
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_passes_institution ON public.visitor_passes(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_pass_no ON public.visitor_passes(institution_id, pass_number);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_checkin ON public.visitor_passes(institution_id, check_in_time DESC);
