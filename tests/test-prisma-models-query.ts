import "dotenv/config";
import db from "../lib/db";

async function testPrismaModels() {
  console.log("=== TESTING PRISMA CLIENT QUERIES FOR PHASE 2 MODELS ===");

  try {
    const assessments = await db.assessmentRecord.findMany({ take: 1 });
    console.log("db.assessmentRecord.findMany(): OK, count:", assessments.length);
  } catch (err: any) {
    console.error("db.assessmentRecord failed:", err.message);
  }

  try {
    const exams = await db.examSchedule.findMany({ take: 1 });
    console.log("db.examSchedule.findMany(): OK, count:", exams.length);
  } catch (err: any) {
    console.error("db.examSchedule failed:", err.message);
  }

  try {
    const examSlots = await db.examSlot.findMany({ take: 1 });
    console.log("db.examSlot.findMany(): OK, count:", examSlots.length);
  } catch (err: any) {
    console.error("db.examSlot failed:", err.message);
  }

  try {
    const results = await db.examResult.findMany({ take: 1 });
    console.log("db.examResult.findMany(): OK, count:", results.length);
  } catch (err: any) {
    console.error("db.examResult failed:", err.message);
  }

  try {
    const assignments = await db.assignment.findMany({ take: 1 });
    console.log("db.assignment.findMany(): OK, count:", assignments.length);
  } catch (err: any) {
    console.error("db.assignment failed:", err.message);
  }

  try {
    const submissions = await db.assignmentSubmission.findMany({ take: 1 });
    console.log("db.assignmentSubmission.findMany(): OK, count:", submissions.length);
  } catch (err: any) {
    console.error("db.assignmentSubmission failed:", err.message);
  }

  await db.$disconnect();
}

testPrismaModels()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
