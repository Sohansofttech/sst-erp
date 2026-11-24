import "dotenv/config";
import db from "../lib/db";

async function verifyDatabaseIntegrity() {
  console.log("=== CHECKING DATABASE RECORD COUNTS & INTEGRITY ===");

  const institutionsCount = await db.institution.count();
  const usersCount = await db.user.count();
  const teachersCount = await db.teacher.count();
  const studentsCount = await db.student.count();
  const coursesCount = await db.course.count();
  const subjectsCount = await db.subject.count();
  const enrollmentsCount = await db.enrollment.count();
  const attendanceRecordsCount = await db.attendanceRecord.count();
  const timetableSlotsCount = await db.timetableSlot.count();

  console.log({
    institutions: institutionsCount,
    users: usersCount,
    teachers: teachersCount,
    students: studentsCount,
    courses: coursesCount,
    subjects: subjectsCount,
    enrollments: enrollmentsCount,
    attendanceRecords: attendanceRecordsCount,
    timetableSlots: timetableSlotsCount,
  });

  // Verify core relations integrity
  const usersWithoutInstitution = await db.user.count({
    where: { role: { in: ["ADMIN", "TEACHER", "STUDENT"] }, institutionId: null },
  });
  console.log(`Scoped users without institutionId: ${usersWithoutInstitution}`);

  const teachersWithoutUser = await db.$queryRawUnsafe(`
    SELECT count(*)::int as count 
    FROM teachers t 
    LEFT JOIN users u ON t."userId" = u.id 
    WHERE u.id IS NULL
  `);
  console.log("Teachers orphaned without User:", teachersWithoutUser);

  const studentsWithoutUser = await db.$queryRawUnsafe(`
    SELECT count(*)::int as count 
    FROM students s 
    LEFT JOIN users u ON s."userId" = u.id 
    WHERE u.id IS NULL
  `);
  console.log("Students orphaned without User:", studentsWithoutUser);

  const enrollmentsWithoutStudent = await db.$queryRawUnsafe(`
    SELECT count(*)::int as count 
    FROM enrollments e 
    LEFT JOIN students s ON e."studentId" = s.id 
    WHERE s.id IS NULL
  `);
  console.log("Enrollments orphaned without Student:", enrollmentsWithoutStudent);

  // List existing institutions
  const institutions = await db.institution.findMany({
    select: { id: true, name: true, code: true, type: true, status: true },
  });
  console.log("\nExisting Institutions in DB:");
  console.table(institutions);

  // List existing admins
  const admins = await db.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true, fullName: true, institutionId: true, isActive: true },
  });
  console.log("\nExisting Admins in DB:");
  console.table(admins);

  await db.$disconnect();
}

verifyDatabaseIntegrity()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("DB Integrity Verification Failed:", err);
    process.exit(1);
  });
