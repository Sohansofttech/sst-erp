import "dotenv/config";
import db from "../lib/db";

async function main() {
  const migrations: any = await db.$queryRawUnsafe(`
    SELECT migration_name, finished_at 
    FROM _prisma_migrations 
    ORDER BY finished_at DESC 
    LIMIT 10;
  `);
  console.log("LAST 10 MIGRATIONS:", migrations);

  const checkExam: any = await db.$queryRawUnsafe(`
    SELECT 
      to_regclass('public."Examination"')::text as exam1, 
      to_regclass('public.examinations')::text as exam2,
      to_regclass('public."ExamSchedule"')::text as sched1,
      to_regclass('public.exam_schedules')::text as sched2;
  `);
  console.log("EXAM REGCLASS:", checkExam);

  const checkCert: any = await db.$queryRawUnsafe(`
    SELECT 
      to_regclass('public."CertificateTemplate"')::text as tmpl1, 
      to_regclass('public.certificate_templates')::text as tmpl2,
      to_regclass('public."IssuedCertificate"')::text as issued1,
      to_regclass('public.issued_certificates')::text as issued2;
  `);
  console.log("CERT REGCLASS:", checkCert);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
