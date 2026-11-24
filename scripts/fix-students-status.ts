import { db } from '../lib/db';

async function main() {
  try {
    console.log('Dropping compatibility view Student...');
    await db.$executeRawUnsafe(`DROP VIEW IF EXISTS "Student" CASCADE;`);

    console.log('Altering students.status in PostgreSQL...');
    await db.$executeRawUnsafe(`ALTER TABLE students ALTER COLUMN status DROP DEFAULT;`);
    await db.$executeRawUnsafe(`ALTER TABLE students ALTER COLUMN status TYPE "StudentStatus" USING status::"StudentStatus";`);
    await db.$executeRawUnsafe(`ALTER TABLE students ALTER COLUMN status SET DEFAULT 'ACTIVE'::"StudentStatus";`);
    console.log('Altered type to StudentStatus and set default ACTIVE');

    console.log('Recreating compatibility view Student...');
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW "Student" AS 
      SELECT 
        id, "institutionId", "userId", "admissionNumber", "rollNumber",
        "firstName", "lastName", "dateOfBirth", gender, "bloodGroup",
        "emergencyContact", "addressLine", city, state, pincode,
        "admissionDate", "currentSemester", "currentSection", status,
        "createdAt", "updatedAt", "studentUniqueId", "fullName",
        dob, email, phone, "institutionalEmail", category,
        "emergencyPhone", "postalCode", "currentAcademicYearId",
        "currentCourseId", "currentDepartmentId", "currentClassId",
        "currentSectionId", batch
      FROM students;
    `);
    console.log('Recreated view Student');

    console.log('Testing db.student.findFirst({ where: { status: "ACTIVE" } })...');
    const s = await db.student.findFirst({ where: { status: 'ACTIVE' } });
    console.log('Success! Found student with enum status:', s ? s.id : 'None');
  } catch (err) {
    console.error('Failed to align status:', err);
  } finally {
    await db.$disconnect();
  }
}

main();
