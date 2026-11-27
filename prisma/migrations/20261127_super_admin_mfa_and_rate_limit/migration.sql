-- CreateTable
CREATE TABLE "PlatformAdminMfa" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "secretIv" TEXT NOT NULL,
    "secretTag" TEXT NOT NULL,
    "isEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "enrolledAt" TIMESTAMP(3),
    "lastUsedCounter" BIGINT NOT NULL DEFAULT 0,
    "backupCodes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdminMfa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginRateLimit" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdminMfa_userId_key" ON "PlatformAdminMfa"("userId");
CREATE INDEX "PlatformAdminMfa_userId_isEnrolled_idx" ON "PlatformAdminMfa"("userId", "isEnrolled");

-- CreateIndex
CREATE UNIQUE INDEX "LoginRateLimit_key_key" ON "LoginRateLimit"("key");
CREATE INDEX "LoginRateLimit_key_lockedUntil_idx" ON "LoginRateLimit"("key", "lockedUntil");

-- AddForeignKey
ALTER TABLE "PlatformAdminMfa" ADD CONSTRAINT "PlatformAdminMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
