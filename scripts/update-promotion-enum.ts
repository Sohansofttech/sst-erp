import "dotenv/config";
import db from "../lib/db";

async function main() {
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TYPE "PromotionBatchStatus" ADD VALUE IF NOT EXISTS 'EXECUTED';
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TYPE "PromotionBatchStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  console.log("PromotionBatchStatus enum updated in PostgreSQL.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });
