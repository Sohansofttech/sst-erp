ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_providerOrderId_key"
ON "Payment"("providerOrderId");
