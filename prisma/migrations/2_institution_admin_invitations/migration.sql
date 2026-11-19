CREATE TYPE "ProvisioningStatus" AS ENUM ('PENDING', 'PROVISIONING', 'INVITED', 'FAILED', 'ACTIVATED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'ACCEPTED', 'EXPIRED', 'REVOKED');

ALTER TABLE "Institution"
ADD COLUMN "provisioningStatus" "ProvisioningStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "primaryAdminUserId" UUID;

CREATE TABLE "InstitutionAdminInvitation" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "platformUserId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "failedReason" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionAdminInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstitutionAdminInvitation_tokenHash_key" ON "InstitutionAdminInvitation"("tokenHash");
CREATE INDEX "InstitutionAdminInvitation_institutionId_status_idx" ON "InstitutionAdminInvitation"("institutionId","status");
CREATE INDEX "InstitutionAdminInvitation_platformUserId_status_idx" ON "InstitutionAdminInvitation"("platformUserId","status");
CREATE INDEX "InstitutionAdminInvitation_expiresAt_idx" ON "InstitutionAdminInvitation"("expiresAt");

ALTER TABLE "InstitutionAdminInvitation"
ADD CONSTRAINT "InstitutionAdminInvitation_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstitutionAdminInvitation"
ADD CONSTRAINT "InstitutionAdminInvitation_platformUserId_fkey"
FOREIGN KEY ("platformUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Institution"
ADD CONSTRAINT "Institution_primaryAdminUserId_fkey"
FOREIGN KEY ("primaryAdminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
