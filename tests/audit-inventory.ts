import { db } from "../lib/db";

async function main() {
  console.log("=== ERP Database Audit ===");
  
  // 1. LMS course materials columns
  const lmsCols: any[] = await db.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'lms_course_materials'
    ORDER BY ordinal_position;
  `);
  console.log("lms_course_materials columns:", lmsCols.map(c => c.column_name).join(', '));

  // 2. Resource booking resource types
  const rTypes: any[] = await db.$queryRawUnsafe(`
    SELECT DISTINCT "resourceType" FROM resource_bookings;
  `);
  console.log("resource_bookings types:", rTypes);

  // 3. Approval request types
  const appTypes: any[] = await db.$queryRawUnsafe(`
    SELECT DISTINCT "requestType" FROM approval_requests;
  `);
  console.log("approval_requests requestTypes:", appTypes);

  // 4. Role & Permissions tables
  const roles: any[] = await db.$queryRawUnsafe(`
    SELECT id, name, "institutionId" FROM "Role" LIMIT 10;
  `);
  console.log("Roles count:", roles.length);

  // 5. Institution settings & branding
  const insts: any[] = await db.$queryRawUnsafe(`
    SELECT id, name, slug, code FROM institutions LIMIT 5;
  `);
  console.log("Institutions:", insts);
}

main().catch(console.error).finally(() => process.exit(0));
