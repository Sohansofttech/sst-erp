import { db } from "../lib/db";

async function main() {
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudentStatus') THEN
        CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ALUMNI', 'WITHDRAWN');
      END IF;
    END
    $$;
  `);
  console.log("Created StudentStatus enum in PostgreSQL.");

  // Test if Prisma can query db.student.findFirst
  try {
    const st = await db.student.findFirst({ select: { id: true, firstName: true } });
    console.log("Successfully queried db.student.findFirst:", st);
  } catch (err: any) {
    console.log("findFirst error:", err.message);
    // If column type needs to be converted:
    if (err.message.includes("StudentStatus")) {
      console.log("Converting students.status to StudentStatus enum...");
      await db.$executeRawUnsafe(`
        ALTER TABLE students 
        ALTER COLUMN status DROP DEFAULT,
        ALTER COLUMN status TYPE "StudentStatus" USING status::"StudentStatus",
        ALTER COLUMN status SET DEFAULT 'ACTIVE'::"StudentStatus";
      `);
      const stRetry = await db.student.findFirst({ select: { id: true, firstName: true } });
      console.log("Retry after conversion succeeded:", stRetry);
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect());
