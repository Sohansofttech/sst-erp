import "dotenv/config";
import db from "../lib/db";

async function main() {
  console.log("Fixing Course enums and constraints...");

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "DegreeType" AS ENUM ('UNDERGRADUATE', 'POSTGRADUATE', 'DIPLOMA', 'DOCTORAL', 'CERTIFICATE');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "CourseStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    ALTER TABLE courses ALTER COLUMN department DROP NOT NULL;
  `);

  await db.$executeRawUnsafe(`
    ALTER TABLE courses ALTER COLUMN department SET DEFAULT 'General';
  `);

  console.log("Course enums and constraints fixed successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });
