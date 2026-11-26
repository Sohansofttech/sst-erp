CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingRegistration_mobile_key" ON "PendingRegistration"("mobile");
