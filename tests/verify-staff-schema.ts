import "dotenv/config";
import db from "../lib/db";

async function verifyStaffSchema() {
  console.log("=== VERIFYING POSTGRESQL SCHEMA FOR STAFF & TEACHER ===");

  // 1. Check physical existence of Staff vs teachers tables
  const tables: any = await db.$queryRawUnsafe(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('Staff', 'staff', 'teachers', 'Teacher', 'users')
  `);
  console.log("Existing tables matching staff/teacher/user:", tables.map((t: any) => t.table_name));

  // 2. Inspect columns of teachers table
  const teacherCols: any = await db.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'teachers'
    ORDER BY ordinal_position
  `);
  console.log("\nColumns in 'teachers' table:");
  console.table(teacherCols);

  // 3. Inspect columns of users table
  const userCols: any = await db.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users'
    ORDER BY ordinal_position
  `);
  console.log("\nColumns in 'users' table:");
  console.table(userCols);

  // 4. Verify getStaff() execution
  const admin = await db.user.findFirst({
    where: { role: "ADMIN", isActive: true, institutionId: { not: null } },
  });

  if (admin?.institutionId) {
    const { getStaff } = await import("../lib/services/institution-admin.service");
    const staffList = await getStaff(admin.institutionId);
    console.log(`\nSuccessfully executed getStaff('${admin.institutionId}'): Retrieved ${staffList.length} staff records without DB errors.`);
  }

  await db.$disconnect();
}

verifyStaffSchema()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Staff Schema Verification Failed:", err);
    process.exit(1);
  });
