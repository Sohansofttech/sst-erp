import "dotenv/config";
import db from "../lib/db";

async function main() {
  const tablesToCheck = ['exam_results', 'exam_schedules', 'exam_slots', 'assessment_records', 'assignments', 'assignment_submissions', 'approval_requests'];
  
  const allMatchingTables: any = await db.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name ILIKE '%exam%' OR table_name ILIKE '%result%' OR table_name ILIKE '%assessment%' OR table_name ILIKE '%hall%');
  `);
  console.log('All matching tables in public schema:', allMatchingTables);
  
  const fks: any = await db.$queryRawUnsafe(`
    SELECT
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name IN ('exam_results', 'exam_schedules', 'exam_slots', 'assessment_records', 'assignments', 'assignment_submissions', 'approval_requests');
  `);
  console.log("Foreign keys:", JSON.stringify(fks, null, 2));

  for (const t of tablesToCheck) {
    const cols: any = await db.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = '${t}'
      ORDER BY ordinal_position;
    `);
    console.log(`\n=== Table: ${t} ===`);
    console.log(cols.map((c: any) => `${c.column_name} (${c.data_type}, nullable: ${c.is_nullable})`).join(", "));
  }
}

main().catch(console.error).finally(() => db.$disconnect());
