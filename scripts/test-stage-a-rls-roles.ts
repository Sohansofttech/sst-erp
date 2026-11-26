/**
 * Phase P0.5 Stage A — Role Foundation Security & Static Contract Tests
 *
 * Modes:
 *   1. Default (offline/sandbox): validates migration SQL invariants (no secrets,
 *      NOINHERIT NOBYPASSRLS, idempotent ALTER ROLE normalization, defensive REVOKEs,
 *      exact login-to-functional-role grants, zero worker/auth direct table/sequence DML,
 *      default privileges, and no destructive DDL).
 *   2. Live PostgreSQL (`STAGE_A_LIVE_PG=true`): executes real catalog, SET ROLE,
 *      session_user/current_user, and negative privilege-escalation checks against
 *      staging PostgreSQL inside read-only/rolled-back transactions.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  "prisma/migrations/11_rls_roles_foundation/migration.sql"
);

async function runStaticChecks() {
  assert.ok(fs.existsSync(MIGRATION_PATH), "Stage A migration.sql must exist");
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");

  // 1. No hardcoded passwords or secrets
  assert.ok(!/\bPASSWORD\s+'/i.test(sql), "Migration must not contain hardcoded PASSWORD literals");

  // 2. All 8 roles defined and normalized with NOLOGIN/LOGIN + NOINHERIT NOBYPASSRLS
  const functionalRoles = [
    "erp_app_user",
    "erp_auth_resolver",
    "erp_super_admin",
    "erp_system_worker",
  ];
  const loginRoles = [
    "erp_app_login",
    "erp_auth_login",
    "erp_super_admin_login",
    "erp_worker_login",
  ];
  for (const role of functionalRoles) {
    assert.ok(
      new RegExp(`CREATE ROLE ${role}\\s+NOLOGIN\\s+NOINHERIT\\s+NOBYPASSRLS`, "i").test(sql),
      `Functional role ${role} must be created with NOLOGIN NOINHERIT NOBYPASSRLS`
    );
    assert.ok(
      new RegExp(`ALTER ROLE ${role}\\s+NOLOGIN\\s+NOINHERIT\\s+NOBYPASSRLS`, "i").test(sql),
      `Functional role ${role} must be normalized with ALTER ROLE ... NOLOGIN NOINHERIT NOBYPASSRLS`
    );
  }
  for (const role of loginRoles) {
    assert.ok(
      new RegExp(`CREATE ROLE ${role}\\s+LOGIN\\s+NOINHERIT\\s+NOBYPASSRLS`, "i").test(sql),
      `Login role ${role} must be created with LOGIN NOINHERIT NOBYPASSRLS`
    );
    assert.ok(
      new RegExp(`ALTER ROLE ${role}\\s+LOGIN\\s+NOINHERIT\\s+NOBYPASSRLS`, "i").test(sql),
      `Login role ${role} must be normalized with ALTER ROLE ... LOGIN NOINHERIT NOBYPASSRLS`
    );
  }

  // 3. Do not alter postgres or migration owner attributes; no CREATEROLE or BYPASSRLS on runtime roles
  assert.ok(!/\bALTER ROLE\s+postgres\b/i.test(sql), "Migration must not alter postgres attributes");
  assert.ok(!/\bCREATEROLE\b/i.test(sql), "Runtime roles must not be granted CREATEROLE");
  assert.ok(!/\b(?<!NO)BYPASSRLS\b/i.test(sql), "Runtime roles must not be granted BYPASSRLS");

  // 4. Exact intended role memberships (4 login-to-functional edges only; worker isolated from erp_app_user)
  assert.ok(/GRANT\s+erp_app_user\s+TO\s+erp_app_login\s*;/i.test(sql));
  assert.ok(/GRANT\s+erp_auth_resolver\s+TO\s+erp_auth_login\s*;/i.test(sql));
  assert.ok(/GRANT\s+erp_super_admin\s+TO\s+erp_super_admin_login\s*;/i.test(sql));
  assert.ok(/GRANT\s+erp_system_worker\s+TO\s+erp_worker_login\s*;/i.test(sql));
  assert.ok(!/GRANT\s+erp_app_user\s+TO\s+erp_system_worker\s*;/i.test(sql), "Worker must not be a member of erp_app_user");
  assert.ok(!/GRANT\s+erp_app_user\s+TO\s+erp_worker_login\s*;/i.test(sql), "Worker login must not be a member of erp_app_user");
  assert.ok(!/SET\s+(?:LOCAL\s+)?ROLE\s+erp_app_user\b/i.test(sql), "Migration must not perform SET ROLE erp_app_user");

  // 4b. Graph check: verify no direct or indirect membership path from worker roles to erp_app_user/erp_super_admin/erp_auth_resolver
  const roleNames = new Set([...functionalRoles, ...loginRoles]);
  const memberGraph = new Map<string, string[]>();
  const grantMatches = sql.matchAll(/GRANT\s+([a-z0-9_,\s]+)\s+TO\s+([a-z0-9_,\s]+)\s*;/gi);
  for (const m of grantMatches) {
    const granted = m[1].split(",").map((s) => s.trim()).filter((s) => roleNames.has(s));
    const recipients = m[2].split(",").map((s) => s.trim()).filter((s) => roleNames.has(s));
    for (const r of recipients) {
      const list = memberGraph.get(r) ?? [];
      list.push(...granted);
      memberGraph.set(r, list);
    }
  }
  const canReach = (start: string, target: string): boolean => {
    const visited = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === target) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const next of memberGraph.get(cur) ?? []) queue.push(next);
    }
    return false;
  };
  for (const workerRole of ["erp_worker_login", "erp_system_worker"]) {
    assert.ok(!canReach(workerRole, "erp_app_user"), `${workerRole} must have no direct or indirect path to erp_app_user`);
    assert.ok(!canReach(workerRole, "erp_super_admin"), `${workerRole} must have no path to erp_super_admin`);
    assert.ok(!canReach(workerRole, "erp_auth_resolver"), `${workerRole} must have no path to erp_auth_resolver`);
  }

  // 5. Defensive REVOKEs & zero forbidden escalation grants
  assert.ok(/REVOKE\s+erp_auth_resolver,\s*erp_super_admin,\s*erp_system_worker\s+FROM\s+erp_app_login,\s*erp_app_user\s*;/i.test(sql));
  assert.ok(/REVOKE\s+erp_app_user,\s*erp_super_admin,\s*erp_system_worker\s+FROM\s+erp_auth_login,\s*erp_auth_resolver\s*;/i.test(sql));
  assert.ok(/REVOKE\s+erp_auth_resolver,\s*erp_super_admin\s+FROM\s+erp_worker_login,\s*erp_system_worker\s*;/i.test(sql));
  assert.ok(/REVOKE\s+erp_app_user\s+FROM\s+erp_worker_login,\s*erp_system_worker\s*;/i.test(sql));
  assert.ok(!/GRANT\s+erp_super_admin\s+TO\s+erp_app_(login|user)/i.test(sql));
  assert.ok(!/GRANT\s+erp_system_worker\s+TO\s+erp_app_(login|user)/i.test(sql));
  assert.ok(!/GRANT\s+(erp_app_user|erp_super_admin|erp_system_worker)\s+TO\s+erp_auth_(login|resolver)/i.test(sql));
  assert.ok(!/GRANT\s+erp_super_admin\s+TO\s+erp_(worker_login|system_worker)/i.test(sql));

  // 6. Zero direct table/sequence DML or default privileges for erp_auth_resolver and erp_system_worker
  for (const restricted of ["erp_auth_resolver", "erp_system_worker"]) {
    assert.ok(
      new RegExp(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${restricted}`, "i").test(sql),
      `${restricted} must have all table privileges revoked`
    );
    assert.ok(
      new RegExp(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${restricted}`, "i").test(sql),
      `${restricted} must have all sequence privileges revoked`
    );
    assert.ok(
      !new RegExp(`GRANT\\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\\b[^;]*TO\\s+${restricted}`, "i").test(sql),
      `${restricted} must not receive direct table/sequence DML`
    );
    assert.ok(
      !new RegExp(`ALTER DEFAULT PRIVILEGES[^;]*TO\\s+${restricted}`, "i").test(sql),
      `${restricted} must not receive default DML privileges`
    );
  }

  // 7. Default privileges configured for erp_app_user and erp_super_admin
  assert.ok(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app_user/i.test(sql));
  assert.ok(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_app_user/i.test(sql));
  assert.ok(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_super_admin/i.test(sql));
  assert.ok(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_super_admin/i.test(sql));

  // 8. No destructive DDL
  assert.ok(!/\b(DROP TABLE|TRUNCATE|ALTER TABLE\s+\S+\s+DISABLE ROW LEVEL SECURITY)\b/i.test(sql));

  console.log("PASS [Static Check 1]: Zero secrets; all 8 roles created & normalized with NOINHERIT NOBYPASSRLS");
  console.log("PASS [Static Check 2]: Migration owner (postgres) untouched");
  console.log("PASS [Static Check 3]: Exact 4 intended role memberships, graph isolation & defensive REVOKEs verified");
  console.log("PASS [Static Check 4]: Zero worker/auth direct table DML, sequence DML, or default privileges");
  console.log("PASS [Static Check 5]: App/SuperAdmin default privileges configured & no destructive DDL");
}

async function runLivePgChecks() {
  const { Pool } = await import("pg");
  const appUrl = process.env.DATABASE_URL;
  const authUrl = process.env.AUTH_DATABASE_URL;
  const superUrl = process.env.SUPER_ADMIN_DATABASE_URL;
  const workerUrl = process.env.WORKER_DATABASE_URL;

  assert.ok(appUrl && authUrl && superUrl && workerUrl, "All 4 runtime role URLs must be set for STAGE_A_LIVE_PG=true");

  const checkRoleAndSetRole = async (url: string, loginUser: string, targetRole: string) => {
    const pool = new Pool({ connectionString: url, max: 1, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const res = await client.query(
        "SELECT rolname, rolsuper, rolinherit, rolbypassrls FROM pg_roles WHERE rolname = $1",
        [loginUser]
      );
      assert.equal(res.rows.length, 1);
      assert.equal(res.rows[0].rolsuper, false, `${loginUser} must not be superuser`);
      assert.equal(res.rows[0].rolinherit, false, `${loginUser} must have NOINHERIT`);
      assert.equal(res.rows[0].rolbypassrls, false, `${loginUser} must have NOBYPASSRLS`);

      const preWho = await client.query("SELECT current_user, session_user");
      assert.equal(preWho.rows[0].session_user, loginUser);
      assert.equal(preWho.rows[0].current_user, loginUser);

      await client.query(`SET LOCAL ROLE ${targetRole}`);
      const postWho = await client.query("SELECT current_user, session_user");
      assert.equal(postWho.rows[0].session_user, loginUser);
      assert.equal(postWho.rows[0].current_user, targetRole);

      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  };

  await checkRoleAndSetRole(appUrl, "erp_app_login", "erp_app_user");
  await checkRoleAndSetRole(authUrl, "erp_auth_login", "erp_auth_resolver");
  await checkRoleAndSetRole(superUrl, "erp_super_admin_login", "erp_super_admin");
  await checkRoleAndSetRole(workerUrl, "erp_worker_login", "erp_system_worker");

  // Negative test: erp_app_login and erp_worker_login cannot SET LOCAL ROLE erp_super_admin
  for (const url of [appUrl, workerUrl]) {
    const pool = new Pool({ connectionString: url, max: 1, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assert.rejects(
        () => client.query("SET LOCAL ROLE erp_super_admin"),
        (err: any) => err?.code === "42501"
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  }

  // Negative test: erp_worker_login (including after SET LOCAL ROLE erp_system_worker) cannot SET LOCAL ROLE erp_app_user
  {
    const pool = new Pool({ connectionString: workerUrl, max: 1, ssl: workerUrl.includes("localhost") ? false : { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE erp_system_worker");
      await assert.rejects(
        () => client.query("SET LOCAL ROLE erp_app_user"),
        (err: any) => err?.code === "42501"
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  }

  // Negative test: erp_auth_login and erp_worker_login (as erp_system_worker) cannot SELECT directly from users
  for (const [url, role] of [[authUrl, "erp_auth_resolver"], [workerUrl, "erp_system_worker"]] as const) {
    const pool = new Pool({ connectionString: url, max: 1, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(
        () => client.query("SELECT id FROM users LIMIT 1"),
        (err: any) => err?.code === "42501"
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  }

  console.log("PASS [Live PG]: All Stage A role privilege, SET ROLE, and isolation checks passed");
}

async function main() {
  await runStaticChecks();
  if (process.env.STAGE_A_LIVE_PG === "true") {
    await runLivePgChecks();
  } else {
    console.log("INFO: STAGE_A_LIVE_PG not enabled; live PostgreSQL checks skipped (static contract checks passed).");
  }
}

main().catch((err) => {
  console.error("STAGE A TEST FAILED:", err);
  process.exit(1);
});
