import { db } from "../lib/db";

async function main() {
  console.log("Starting PostgreSQL Row-Level Security (RLS) setup...");

  // 1. Create erp_app_user role if not exists
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app_user') THEN
        CREATE ROLE erp_app_user NOINHERIT NOBYPASSRLS;
      END IF;
    END
    $$;

    GRANT erp_app_user TO postgres;
    GRANT USAGE ON SCHEMA public TO erp_app_user;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO erp_app_user;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO erp_app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO erp_app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO erp_app_user;
  `);
  console.log("Created & configured role 'erp_app_user'.");

  // 2. Fetch all tables and columns
  const tables = await db.$queryRawUnsafe<any[]>(`
    SELECT c.relname as table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);

  const cols = await db.$queryRawUnsafe<any[]>(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  const tableColsMap = new Map<string, any[]>();
  for (const c of cols) {
    if (!tableColsMap.has(c.table_name)) {
      tableColsMap.set(c.table_name, []);
    }
    tableColsMap.get(c.table_name)!.push(c);
  }

  let enabledCount = 0;

  // 3. Apply RLS on all direct tenant tables
  for (const t of tables) {
    const tableName = t.table_name;
    const tCols = tableColsMap.get(tableName) || [];
    const tenantCol = tCols.find(c => c.column_name === 'institutionId' || c.column_name === 'institution_id');

    if (tenantCol) {
      const colName = tenantCol.column_name;
      await db.$executeRawUnsafe(`
        ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_erp_user ON "${tableName}";
        CREATE POLICY tenant_isolation_erp_user ON "${tableName}"
          FOR ALL TO erp_app_user
          USING ("${colName}"::text = current_setting('app.current_tenant_id', true))
          WITH CHECK ("${colName}"::text = current_setting('app.current_tenant_id', true));
      `);
      enabledCount++;
      console.log(`Enabled RLS on ${tableName} (via "${colName}")`);
    }
  }

  // 4. Apply RLS on indirect / child tables
  const indirectPolicies = [
    {
      table: "notification_recipients",
      parent: "notifications",
      fk: "notificationId",
      parentCol: "id",
      tenantCol: "institutionId",
    },
    {
      table: "quiz_questions",
      parent: "quizzes",
      fk: "quizId",
      parentCol: "id",
      tenantCol: "institutionId",
    },
    {
      table: "student_documents",
      parent: "students",
      fk: "studentId",
      parentCol: "id",
      tenantCol: "institutionId",
    },
    {
      table: "fee_invoice_items",
      parent: "fee_invoices",
      fk: "invoiceId",
      parentCol: "id",
      tenantCol: "institutionId",
    },
    {
      table: "exam_slots",
      parent: "exam_schedules",
      fk: "examScheduleId",
      parentCol: "id",
      tenantCol: "institutionId",
    },
    {
      table: "RolePermission",
      parent: "Role",
      fk: "roleId",
      parentCol: "id",
      tenantCol: "institutionId",
    },
  ];

  for (const p of indirectPolicies) {
    try {
      await db.$executeRawUnsafe(`
        ALTER TABLE "${p.table}" ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation_erp_user ON "${p.table}";
        CREATE POLICY tenant_isolation_erp_user ON "${p.table}"
          FOR ALL TO erp_app_user
          USING (EXISTS (
            SELECT 1 FROM "${p.parent}" p 
            WHERE p."${p.parentCol}" = "${p.table}"."${p.fk}" 
              AND p."${p.tenantCol}"::text = current_setting('app.current_tenant_id', true)
          ))
          WITH CHECK (EXISTS (
            SELECT 1 FROM "${p.parent}" p 
            WHERE p."${p.parentCol}" = "${p.table}"."${p.fk}" 
              AND p."${p.tenantCol}"::text = current_setting('app.current_tenant_id', true)
          ));
      `);
      enabledCount++;
      console.log(`Enabled indirect RLS on ${p.table} (via parent ${p.parent})`);
    } catch (err: any) {
      console.warn(`Warning enabling indirect RLS on ${p.table}:`, err.message);
    }
  }

  console.log(`\nSuccessfully enabled RLS on ${enabledCount} tables in PostgreSQL!`);
}

main().catch(console.error).finally(() => db.$disconnect());
