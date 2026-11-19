import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function checkCourseCols() {
  const db = (await import("../lib/db")).default;
  try {
    const cols: any = await db.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'courses'
      ORDER BY ordinal_position;
    `);
    console.log("Columns of courses table:");
    console.table(cols);
  } catch (err: any) {
    console.error("Failed to query columns:", err);
  } finally {
    await db.$disconnect();
  }
}

checkCourseCols();
