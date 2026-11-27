import assert from "node:assert/strict";
import {
  isNonDatabasePrismaCommand,
  resolvePrismaDatasourceUrl,
} from "../lib/db/prisma-migration-url";

const SECRET_SENTINEL = "SuperSecretMigrationPass_9988";
const REMOTE_HOST = "aws-0-ap-south-1.pooler.supabase.com";
const VALID_DIRECT_URL = `postgresql://postgres.proj:${SECRET_SENTINEL}@db.proj.supabase.co:5432/postgres?sslmode=require`;
const LOCAL_DEV_URL = "postgresql://postgres:localdev@localhost:5432/sst_erp?schema=public";
const REMOTE_POOLER_6543 = `postgresql://postgres.proj:${SECRET_SENTINEL}@${REMOTE_HOST}:6543/postgres?pgbouncer=true`;

function assertNoSecretLeak(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  assert.ok(!msg.includes(SECRET_SENTINEL), "Error must never leak password/secret");
  assert.ok(!msg.includes("postgresql://"), "Error must never leak full connection string");
  assert.ok(!msg.includes(REMOTE_HOST), "Error must never leak database hostname");
}

// 1. Direct migration URL present and valid
{
  const url = resolvePrismaDatasourceUrl(
    { DIRECT_MIGRATION_URL: VALID_DIRECT_URL, DATABASE_URL: REMOTE_POOLER_6543, NODE_ENV: "production" },
    ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]
  );
  assert.equal(url, VALID_DIRECT_URL);
}

// 2. Direct URL missing in production
{
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DATABASE_URL: LOCAL_DEV_URL, NODE_ENV: "production" },
        ["node", "prisma", "migrate", "deploy"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /DIRECT_MIGRATION_URL is required/i.test(err.message);
    }
  );
}

// 3. Direct URL missing in staging
{
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DATABASE_URL: LOCAL_DEV_URL, APP_ENV: "staging" },
        ["node", "prisma", "migrate", "status"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /DIRECT_MIGRATION_URL is required/i.test(err.message);
    }
  );
}

// 4. DATABASE_URL present (remote) with direct URL missing -> fail closed
{
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DATABASE_URL: `postgresql://postgres:${SECRET_SENTINEL}@db.proj.supabase.co:5432/postgres` },
        ["node", "prisma", "db", "push"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /remote DATABASE_URL/i.test(err.message);
    }
  );
}

// 5. Safe localhost development fallback
{
  const url = resolvePrismaDatasourceUrl(
    { DATABASE_URL: LOCAL_DEV_URL, NODE_ENV: "development" },
    ["node", "prisma", "db", "push"]
  );
  assert.equal(url, LOCAL_DEV_URL);
}

// 6. Rejection of port 6543 on DIRECT_MIGRATION_URL
{
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DIRECT_MIGRATION_URL: `postgresql://postgres:${SECRET_SENTINEL}@${REMOTE_HOST}:6543/postgres` },
        ["node", "prisma", "migrate", "deploy"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /6543/.test(err.message);
    }
  );
}

// 7. Rejection of pgbouncer=true on DIRECT_MIGRATION_URL
{
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DIRECT_MIGRATION_URL: `postgresql://postgres:${SECRET_SENTINEL}@${REMOTE_HOST}:5432/postgres?pgbouncer=true` },
        ["node", "prisma", "migrate", "dev"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /pgbouncer=true/i.test(err.message);
    }
  );
}

// 8. Rejection of restricted runtime identities
for (const role of [
  "erp_app_login",
  "erp_auth_login",
  "erp_worker_login",
  "erp_super_admin_login",
]) {
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DIRECT_MIGRATION_URL: `postgresql://${role}:${SECRET_SENTINEL}@db.proj.supabase.co:5432/postgres` },
        ["node", "prisma", "db", "pull"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /restricted runtime login/i.test(err.message);
    }
  );
}

// 9. Rejection of remote postgres superuser via DATABASE_URL
{
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DATABASE_URL: REMOTE_POOLER_6543, NODE_ENV: "development" },
        ["node", "prisma", "migrate", "status"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /DIRECT_MIGRATION_URL is required/i.test(err.message);
    }
  );
}

// 10. Malformed URL handling (no secret leak)
{
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DIRECT_MIGRATION_URL: `not-a-valid-url-${SECRET_SENTINEL}` },
        ["node", "prisma", "migrate", "deploy"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /not a valid PostgreSQL/i.test(err.message);
    }
  );
}

// 11. Non-database commands working without a database URL (including package.json `prisma generate`)
for (const argv of [
  ["node", "node_modules/prisma/build/index.js", "generate"],
  ["node", "prisma.cmd", "validate"],
  ["node", "prisma", "format"],
  ["node", "prisma", "--version"],
]) {
  assert.equal(isNonDatabasePrismaCommand(argv), true);
  const url = resolvePrismaDatasourceUrl({ NODE_ENV: "production" }, argv);
  assert.ok(url.startsWith("postgresql://"));
}

// 12. Unrecognized Prisma command fails closed
{
  assert.equal(isNonDatabasePrismaCommand(["node", "prisma", "studio"]), false);
  assert.throws(
    () => resolvePrismaDatasourceUrl({ NODE_ENV: "production" }, ["node", "prisma", "studio"]),
    (err: unknown) => err instanceof Error && /DIRECT_MIGRATION_URL is required/i.test(err.message)
  );
}

// 13. Gate 0.5.4 (M1): Supabase-qualified restricted runtime identities (<role>.<project_ref>)
for (const role of [
  "erp_app_login.projref123",
  "erp_auth_login.projref123",
  "erp_worker_login.projref123",
  "erp_super_admin_login.projref123",
  "erp_app_login%2Eprojref123",
  "%65rp_app_login.projref123",
]) {
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DIRECT_MIGRATION_URL: `postgresql://${role}:${SECRET_SENTINEL}@db.proj.supabase.co:5432/postgres` },
        ["node", "prisma", "migrate", "deploy"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /restricted runtime login/i.test(err.message);
    }
  );
}

// 14. Gate 0.5.4 (M1): Unrelated username containing restricted role name as substring is NOT falsely rejected
{
  const unrelatedDirect = `postgresql://my_erp_app_login_migrator:${SECRET_SENTINEL}@db.proj.supabase.co:5432/postgres?sslmode=require`;
  const url = resolvePrismaDatasourceUrl(
    { DIRECT_MIGRATION_URL: unrelatedDirect },
    ["node", "prisma", "migrate", "deploy"]
  );
  assert.equal(url, unrelatedDirect);
}

// 15. Gate 0.5.4 (L1): Case-insensitive and duplicate pgbouncer query parameter rejection
for (const query of [
  "PGBOUNCER=true",
  "PgBouncer=true",
  "pgbouncer=false&pgbouncer=true",
  "pgbouncer=true&pgbouncer=false",
]) {
  assert.throws(
    () =>
      resolvePrismaDatasourceUrl(
        { DIRECT_MIGRATION_URL: `postgresql://postgres.proj:${SECRET_SENTINEL}@db.proj.supabase.co:5432/postgres?${query}` },
        ["node", "prisma", "migrate", "deploy"]
      ),
    (err: unknown) => {
      assertNoSecretLeak(err);
      return err instanceof Error && /pgbouncer=true/i.test(err.message);
    }
  );
}

console.log("PASS: All Gate 0.5.2 / 0.5.4 Prisma migration connection safety tests passed.");
