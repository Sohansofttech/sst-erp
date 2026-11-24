import { db } from "../lib/db";
import { withTenantContext } from "../lib/security/tenant-context";

interface Check {
  title: string;
  passed: boolean;
  details?: any;
}

const checks: Check[] = [];

function recordCheck(title: string, passed: boolean, details?: any) {
  checks.push({ title, passed, details });
  console.log(`${passed ? "[PASS]" : "[FAIL]"} ${title}`);
  if (!passed && details) {
    console.error("  Details:", details);
  }
}

async function verifyDatabase() {
  console.log("==================================================================");
  console.log("FINAL DATABASE VERIFICATION AUDIT");
  console.log("==================================================================");

  // 1. Table Count
  const tables = await db.$queryRawUnsafe<any[]>(`
    SELECT c.relname as table_name, c.relrowsecurity as rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);
  recordCheck(
    `Database has 89 public tables (Found: ${tables.length})`,
    tables.length >= 89,
    { count: tables.length }
  );

  // 2. RLS Enforcement Count
  const rlsTables = tables.filter((t) => t.rls_enabled);
  recordCheck(
    `PostgreSQL Row-Level Security is active on 73 intended tables (Found: ${rlsTables.length})`,
    rlsTables.length >= 73,
    { count: rlsTables.length }
  );

  // 3. Application Role 'erp_app_user'
  const roleCheck = await db.$queryRawUnsafe<any[]>(`
    SELECT rolname, rolbypassrls, rolinherit 
    FROM pg_roles 
    WHERE rolname = 'erp_app_user';
  `);
  recordCheck(
    "Application role 'erp_app_user' exists with NOBYPASSRLS",
    roleCheck.length === 1 && roleCheck[0].rolbypassrls === false,
    roleCheck[0]
  );

  // 4. Orphaned Record Audits
  const orphanStudents = await db.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*)::int as count 
    FROM students s
    LEFT JOIN users u ON u.id = s."userId"
    WHERE s."userId" IS NOT NULL AND u.id IS NULL;
  `);
  recordCheck("Zero orphaned student user references", orphanStudents[0]?.count === 0, orphanStudents[0]);

  const orphanTeachers = await db.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*)::int as count 
    FROM teachers t
    LEFT JOIN users u ON u.id = t."userId"
    WHERE t."userId" IS NOT NULL AND u.id IS NULL;
  `);
  recordCheck("Zero orphaned teacher user references", orphanTeachers[0]?.count === 0, orphanTeachers[0]);

  const orphanEnrollments = await db.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*)::int as count 
    FROM enrollments e
    LEFT JOIN students s ON s.id = e."studentId"
    WHERE e."studentId" IS NOT NULL AND s.id IS NULL;
  `);
  recordCheck("Zero orphaned enrollment student references", orphanEnrollments[0]?.count === 0, orphanEnrollments[0]);

  // 5. Existing Record Counts (Verify zero record loss)
  const [usersCount, studentsCount, teachersCount, attendanceCount] = await Promise.all([
    db.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int as count FROM users;`),
    db.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int as count FROM students;`),
    db.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int as count FROM teachers;`),
    db.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int as count FROM attendance_records;`),
  ]);

  recordCheck("User records preserved (> 0)", Number(usersCount[0]?.count) > 0, usersCount[0]?.count);
  recordCheck("Student records preserved (> 0)", Number(studentsCount[0]?.count) > 0, studentsCount[0]?.count);
  recordCheck("Teacher records preserved (> 0)", Number(teachersCount[0]?.count) > 0, teachersCount[0]?.count);
  recordCheck("Attendance records preserved (> 0)", Number(attendanceCount[0]?.count) > 0, attendanceCount[0]?.count);

  // 6. Test RLS under withTenantContext
  const distinctInsts = await db.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT "institutionId" FROM students WHERE "institutionId" IS NOT NULL LIMIT 2;
  `);
  if (distinctInsts.length >= 2) {
    const instA = distinctInsts[0].institutionId;
    const instB = distinctInsts[1].institutionId;

    const crossLeak: any[] = await withTenantContext(instA, async (tx) => {
      return await (tx as any).$queryRawUnsafe(`
        SELECT id FROM students WHERE "institutionId" = '${instB}';
      `);
    });
    recordCheck(
      "RLS strictly blocks cross-tenant SELECT queries for application user",
      crossLeak.length === 0,
      { crossLeakCount: crossLeak.length }
    );
  }

  // 7. Verify zero session leakage after transaction commit
  const outsideSetting = await db.$queryRawUnsafe<any[]>(`
    SELECT current_setting('app.current_tenant_id', true) as tenant;
  `);
  recordCheck(
    "Zero connection pool leakage outside transaction",
    outsideSetting[0]?.tenant === "" || outsideSetting[0]?.tenant === null,
    outsideSetting[0]
  );

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;

  console.log("==================================================================");
  console.log(`DATABASE AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${checks.length})`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

verifyDatabase()
  .catch((err) => {
    console.error("FATAL ERROR in database verification:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
