-- ==============================================================================
-- SST-ERP BATCH 11 ROLLBACK: INSTITUTION PAYMENT GATEWAYS & TRANSACTION LOGS
-- Description: Safely drops Batch 11 tables and types in strict dependency order.
-- Safety: Additive objects only. No cascading deletion.
-- ==============================================================================

-- 1. Drop tables in reverse dependency order
DROP TABLE IF EXISTS payment_webhook_events;
DROP TABLE IF EXISTS payment_transactions;
DROP TABLE IF EXISTS institution_payment_gateways;

-- 2. Drop Enums created in Batch 11
DROP TYPE IF EXISTS "WebhookStatus";
DROP TYPE IF EXISTS "GatewayConnectionStatus";
DROP TYPE IF EXISTS "GatewayEnvironment";
DROP TYPE IF EXISTS "PaymentGatewayProvider";
