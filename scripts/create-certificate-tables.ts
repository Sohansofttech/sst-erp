import "dotenv/config";
import db from "../lib/db";

async function main() {
  console.log("Applying safe additive tables for CertificateTemplate and IssuedCertificate...");

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "CertificateType" AS ENUM ('BONAFIDE', 'TRANSFER_CERTIFICATE', 'CHARACTER', 'COURSE_COMPLETION', 'DEGREE', 'PROVISIONAL_DEGREE', 'TRANSCRIPT', 'CUSTOM');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "IssuedCertificateStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'SUPERSEDED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "CertificateApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'GENERATED', 'DISPATCHED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CertificateTemplate" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "institutionId" UUID NOT NULL,
      "name" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "type" "CertificateType" NOT NULL DEFAULT 'BONAFIDE',
      "description" TEXT,
      "templateBody" TEXT NOT NULL DEFAULT 'This is to certify that {{studentName}} has successfully completed...',
      "headerHtml" TEXT,
      "footerHtml" TEXT,
      "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
      "validityMonths" INTEGER,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IssuedCertificate" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "institutionId" UUID NOT NULL,
      "applicationId" UUID,
      "templateId" UUID NOT NULL,
      "studentId" UUID NOT NULL,
      "certificateNumber" TEXT NOT NULL DEFAULT '',
      "verificationCode" TEXT NOT NULL UNIQUE,
      "certificateType" "CertificateType" NOT NULL DEFAULT 'BONAFIDE',
      "title" TEXT NOT NULL DEFAULT 'Bonafide Certificate',
      "contentSnapshot" TEXT NOT NULL DEFAULT '',
      "status" "IssuedCertificateStatus" NOT NULL DEFAULT 'ACTIVE',
      "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3),
      "issuedByUserId" UUID,
      "isRevoked" BOOLEAN NOT NULL DEFAULT false,
      "revokedAt" TIMESTAMP(3),
      "revokedByUserId" UUID,
      "revocationReason" TEXT,
      "reissuedFromId" UUID,
      "reissueReason" TEXT,
      "qrCodePayload" TEXT,
      "pdfUrl" TEXT,
      "remarks" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Safe additive certificate tables created successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  });
