import { db } from "../lib/db";

async function main() {
  console.log("=================================================");
  console.log("   LIVE DATABASE CONNECTIVITY & SCHEMA AUDIT     ");
  console.log("=================================================");

  try {
    const rawTables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name ASC;
    `);

    console.log(`\n✔ Successfully connected to Database!`);
    console.log(`Total public tables: ${rawTables.length}`);

    const tableNames = rawTables.map(t => t.table_name);
    console.log("Tables in DB:\n" + tableNames.map(t => "  - " + t).join("\n"));

    // Check institutions count
    if (tableNames.includes("institutions")) {
      const instCount = await db.$queryRawUnsafe<Array<{ count: string | number }>>(`SELECT COUNT(*) as count FROM institutions;`);
      console.log(`\nInstitutions count in 'institutions': ${instCount[0]?.count}`);
    }

    if (tableNames.includes("platform_institutions")) {
      const pInstCount = await db.$queryRawUnsafe<Array<{ count: string | number }>>(`SELECT COUNT(*) as count FROM platform_institutions;`);
      console.log(`Platform institutions count in 'platform_institutions': ${pInstCount[0]?.count}`);
    }

    if (tableNames.includes("users")) {
      const usersCount = await db.$queryRawUnsafe<Array<{ count: string | number }>>(`SELECT COUNT(*) as count FROM users;`);
      console.log(`Users count in 'users': ${usersCount[0]?.count}`);
    }

    if (tableNames.includes("students")) {
      const studentCount = await db.$queryRawUnsafe<Array<{ count: string | number }>>(`SELECT COUNT(*) as count FROM students;`);
      console.log(`Students count in 'students': ${studentCount[0]?.count}`);
    }

    if (tableNames.includes("teachers")) {
      const teacherCount = await db.$queryRawUnsafe<Array<{ count: string | number }>>(`SELECT COUNT(*) as count FROM teachers;`);
      console.log(`Teachers count in 'teachers': ${teacherCount[0]?.count}`);
    }

    // Check if support ticket tables exist
    const supportTables = tableNames.filter(t => t.includes("ticket") || t.includes("support"));
    console.log(`\nExisting Support/Ticket tables:`, supportTables.length > 0 ? supportTables : "None found");

    // Check _prisma_migrations
    if (tableNames.includes("_prisma_migrations")) {
      const migrations = await db.$queryRawUnsafe<Array<{ migration_name: string; finished_at: any }>>(`
        SELECT migration_name, finished_at 
        FROM _prisma_migrations 
        ORDER BY started_at ASC;
      `);
      console.log(`\nApplied Prisma Migrations (${migrations.length}):`);
      migrations.forEach(m => console.log(`  - ${m.migration_name} (${m.finished_at ? 'Applied' : 'Pending'})`));
    }
  } catch (err: any) {
    console.error("Database Connection Failure:", err.message);
  } finally {
    process.exit(0);
  }
}

main();
