import "dotenv/config";
import db from "../lib/db";

async function main() {
  console.log("Applying safe additive tables for Department, Class, and Section...");

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "SectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Department" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "institutionId" UUID NOT NULL,
      "name" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "description" TEXT,
      "email" TEXT,
      "phone" TEXT,
      "hodStaffId" UUID,
      "studentCapacity" INTEGER DEFAULT 0,
      "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Class" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "institutionId" UUID NOT NULL,
      "courseId" UUID NOT NULL,
      "academicYearId" UUID NOT NULL,
      "name" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "semester" INTEGER NOT NULL,
      "year" INTEGER,
      "stream" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Section" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "institutionId" UUID NOT NULL,
      "classId" UUID NOT NULL,
      "name" TEXT NOT NULL,
      "batchName" TEXT,
      "maxCapacity" INTEGER NOT NULL DEFAULT 60,
      "roomNumber" TEXT,
      "classTeacherStaffId" UUID,
      "status" "SectionStatus" NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Safe additive Department, Class, and Section tables created successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  });
