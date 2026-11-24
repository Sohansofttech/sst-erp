ALTER TABLE "Invoice"
ADD COLUMN "description" TEXT;

ALTER TABLE "Payment"
ADD COLUMN "providerOrderId" TEXT;

CREATE UNIQUE INDEX "Payment_providerOrderId_key"
ON "Payment"("providerOrderId");
