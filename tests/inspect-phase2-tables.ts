import "dotenv/config";
import db from "../lib/db";

async function inspectPhase2Tables() {
  console.log("=== INSPECTING ACTUAL POSTGRESQL TABLES FOR PHASE 2 ===");

  const allTables: any = await db.$queryRawUnsafe(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  const tableNames: string[] = allTables.map((t: any) => t.table_name);
  console.log(`Total public tables: ${tableNames.length}`);

  const academicKeywords = ["exam", "assessment", "ia", "mark", "result", "grade", "assign", "submission", "term"];
  const matchingTables = tableNames.filter((name) =>
    academicKeywords.some((kw) => name.toLowerCase().includes(kw))
  );

  console.log("\nMatching Academic Tables in PostgreSQL:");
  console.log(matchingTables);

  try {
    const assessments = await db.assessmentRecord.findMany({ take: 5 });
    console.log("Existing assessment_records:", assessments);
  } catch (err: any) {
    console.log("assessment_records error:", err.message);
  }

  const otherChecks = await db.$queryRawUnsafe(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name IN ('approval_requests', 'exam_results', 'exam_schedules', 'exam_slots', 'assignments', 'assignment_submissions', 'assessment_records')
  `);
  console.log("Verified existing physical tables:", otherChecks);

  const specificTables = [
    'exam_schedules',
    'assignment_submissions'
  ];

  for (const tbl of specificTables) {
    const cols: any = await db.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position;
    `, tbl);
    console.log(`\n================== Table '${tbl}' ==================`);
    console.table(cols);
  }

  await db.$disconnect();
}

inspectPhase2Tables()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Inspection failed:", err);
    process.exit(1);
  });
