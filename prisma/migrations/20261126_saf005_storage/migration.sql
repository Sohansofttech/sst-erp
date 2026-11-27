CREATE TYPE "StorageReservationStatus" AS ENUM ('RESERVED','FINALIZED','RELEASED','EXPIRED');

CREATE TABLE "InstitutionStorageUsage" (
  "institutionId" UUID NOT NULL PRIMARY KEY,
  "usedBytes" BIGINT NOT NULL DEFAULT 0,
  "reservedBytes" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionStorageUsage_usedBytes_check" CHECK ("usedBytes" >= 0),
  CONSTRAINT "InstitutionStorageUsage_reservedBytes_check" CHECK ("reservedBytes" >= 0)
);

CREATE TABLE "StorageUploadReservation" (
  "id" UUID NOT NULL PRIMARY KEY,
  "institutionId" UUID NOT NULL,
  "fileSizeBytes" BIGINT NOT NULL,
  "objectPath" TEXT NOT NULL,
  "status" "StorageReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageUploadReservation_fileSizeBytes_check" CHECK ("fileSizeBytes" > 0)
);
CREATE INDEX "StorageUploadReservation_institutionId_status_idx" ON "StorageUploadReservation"("institutionId","status");
CREATE INDEX "StorageUploadReservation_expiresAt_idx" ON "StorageUploadReservation"("expiresAt");
CREATE UNIQUE INDEX "StorageUploadReservation_institutionId_objectPath_key" ON "StorageUploadReservation"("institutionId","objectPath");

ALTER TABLE "InstitutionStorageUsage" ADD CONSTRAINT "InstitutionStorageUsage_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorageUploadReservation" ADD CONSTRAINT "StorageUploadReservation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
