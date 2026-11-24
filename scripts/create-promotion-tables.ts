import "dotenv/config";
import db from "../lib/db";

async function main() {
  console.log("Applying safe additive tables for PromotionPolicy, PromotionBatch, and PromotionStudentRecord...");

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "PromotionBatchStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "PromotionDecision" AS ENUM ('ELIGIBLE', 'CONDITIONALLY_ELIGIBLE', 'DETAINED', 'ON_HOLD', 'EXEMPTED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "PromotionRecordStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'OVERRIDDEN');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PromotionPolicy" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "institutionId" UUID NOT NULL,
      "courseId" UUID,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "minCgpa" DECIMAL(4, 2),
      "minSgpa" DECIMAL(4, 2),
      "maxBacklogsAllowed" INTEGER NOT NULL DEFAULT 0,
      "maxConditionalBacklogs" INTEGER DEFAULT 2,
      "minCreditsPercentage" DECIMAL(5, 2),
      "minAttendancePercentage" DECIMAL(5, 2),
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PromotionBatch" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "institutionId" UUID NOT NULL,
      "policyId" UUID,
      "batchName" TEXT NOT NULL,
      "batchNumber" TEXT NOT NULL,
      "sourceAcademicYearId" UUID NOT NULL,
      "sourceCourseId" UUID NOT NULL,
      "sourceClassId" UUID,
      "sourceSectionId" UUID,
      "targetAcademicYearId" UUID NOT NULL,
      "targetCourseId" UUID NOT NULL,
      "targetClassId" UUID,
      "targetSectionId" UUID,
      "status" "PromotionBatchStatus" NOT NULL DEFAULT 'DRAFT',
      "totalStudents" INTEGER NOT NULL DEFAULT 0,
      "promotedCount" INTEGER NOT NULL DEFAULT 0,
      "conditionallyPromotedCount" INTEGER NOT NULL DEFAULT 0,
      "detainedCount" INTEGER NOT NULL DEFAULT 0,
      "heldCount" INTEGER NOT NULL DEFAULT 0,
      "processedAt" TIMESTAMP(3),
      "approvedByUserId" UUID,
      "approvedAt" TIMESTAMP(3),
      "executedByUserId" UUID,
      "executedAt" TIMESTAMP(3),
      "remarks" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PromotionStudentRecord" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "institutionId" UUID NOT NULL,
      "promotionBatchId" UUID NOT NULL,
      "studentId" UUID NOT NULL,
      "enrollmentId" UUID NOT NULL,
      "currentSemester" INTEGER NOT NULL DEFAULT 1,
      "currentCgpa" DECIMAL(4, 2),
      "currentSgpa" DECIMAL(4, 2),
      "backlogCount" INTEGER NOT NULL DEFAULT 0,
      "earnedCredits" INTEGER,
      "totalCredits" INTEGER,
      "attendancePercentage" DECIMAL(5, 2),
      "systemRecommendation" "PromotionDecision" NOT NULL DEFAULT 'ELIGIBLE',
      "finalDecision" "PromotionDecision" NOT NULL DEFAULT 'ELIGIBLE',
      "status" "PromotionRecordStatus" NOT NULL DEFAULT 'PENDING',
      "isOverridden" BOOLEAN NOT NULL DEFAULT false,
      "overriddenByUserId" UUID,
      "overrideReason" TEXT,
      "targetClassId" UUID,
      "targetSectionId" UUID,
      "remarks" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Safe additive promotion tables created successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  });
