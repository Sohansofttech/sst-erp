-- ==============================================================================
-- SST-ERP BATCH 11: INSTITUTION PAYMENT GATEWAYS & TRANSACTION LOGS
-- Description: Additive schema for institution-specific merchant payment gateways
--              (Razorpay & Cashfree) for student fee collection.
-- Safety: Additive only. No existing tables modified or dropped.
-- ==============================================================================

-- 1. Create Enums if not exist
DO $$ BEGIN
    CREATE TYPE "PaymentGatewayProvider" AS ENUM ('RAZORPAY', 'CASHFREE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "GatewayEnvironment" AS ENUM ('TEST', 'LIVE', 'SANDBOX', 'PRODUCTION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "GatewayConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'FAILED', 'DISABLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "WebhookStatus" AS ENUM ('NOT_CONFIGURED', 'ACTIVE', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Table: institution_payment_gateways
CREATE TABLE IF NOT EXISTS institution_payment_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    provider "PaymentGatewayProvider" NOT NULL,
    environment "GatewayEnvironment" NOT NULL DEFAULT 'TEST',
    encrypted_credentials TEXT,
    encrypted_webhook_secret TEXT,
    webhook_endpoint_token VARCHAR(64) NOT NULL UNIQUE,
    connection_status "GatewayConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    webhook_status "WebhookStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    last_verified_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_institution_gateway_provider UNIQUE (institution_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_inst_gw_institution_id ON institution_payment_gateways(institution_id);
CREATE INDEX IF NOT EXISTS idx_inst_gw_token ON institution_payment_gateways(webhook_endpoint_token);
CREATE INDEX IF NOT EXISTS idx_inst_gw_default ON institution_payment_gateways(institution_id, is_default) WHERE is_default = true;

-- 3. Create Table: payment_transactions
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES fee_invoices(id) ON DELETE SET NULL,
    gateway_provider "PaymentGatewayProvider" NOT NULL,
    gateway_order_id VARCHAR(128),
    gateway_payment_id VARCHAR(128),
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    transaction_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    payment_reference VARCHAR(128) UNIQUE,
    error_code VARCHAR(64),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_txn_institution_student ON payment_transactions(institution_id, student_id);
CREATE INDEX IF NOT EXISTS idx_pay_txn_order_id ON payment_transactions(gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_pay_txn_status ON payment_transactions(transaction_status);

-- 4. Create Table: payment_webhook_events
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    gateway_provider "PaymentGatewayProvider" NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    processing_status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_webhook_event UNIQUE (institution_id, gateway_provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_pay_wh_event_id ON payment_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_pay_wh_status ON payment_webhook_events(processing_status);
