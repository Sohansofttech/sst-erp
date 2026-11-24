import "dotenv/config";
import db from "../lib/db";

async function main() {
  const getCols = async (tbl: string) => {
    const cols: any = await db.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, tbl);
    console.log(`\n=== COLUMNS OF ${tbl} (${cols.length}) ===`);
    console.log(cols.map((c: any) => `${c.column_name} (${c.data_type}, nullable:${c.is_nullable})`).join("\n"));
  };

  await getCols("subjects");
  await getCols("attendance_records");
  await getCols("enrollments");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
