CREATE TABLE "OtpToken" (
    "id" UUID NOT NULL,
    "mobile" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OtpToken_mobile_key" ON "OtpToken"("mobile");

CREATE TABLE "OtpRateLimit" (
    "mobile" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OtpRateLimit_pkey" PRIMARY KEY ("mobile")
);
