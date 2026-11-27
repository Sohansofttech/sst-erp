-- Stage A: Least-Privilege PostgreSQL Roles Foundation (Non-Breaking, Idempotent)
-- IMPORTANT:
--   1. No passwords or secrets are stored in this migration.
--   2. Login role passwords must be provisioned out-of-band (Supabase / Vault / DB Admin)
--      before Stage B/F runtime cutover.
--   3. Existing `postgres` / migration owner attributes and runtime behavior are NOT altered.

DO $$
BEGIN
  -- 1. Functional NOLOGIN roles (all NOINHERIT NOBYPASSRLS)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app_user') THEN
    CREATE ROLE erp_app_user NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_auth_resolver') THEN
    CREATE ROLE erp_auth_resolver NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_super_admin') THEN
    CREATE ROLE erp_super_admin NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_system_worker') THEN
    CREATE ROLE erp_system_worker NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;

  -- 2. Dedicated runtime LOGIN roles (all NOINHERIT NOBYPASSRLS; passwords set out-of-band)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app_login') THEN
    CREATE ROLE erp_app_login LOGIN NOINHERIT NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_auth_login') THEN
    CREATE ROLE erp_auth_login LOGIN NOINHERIT NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_super_admin_login') THEN
    CREATE ROLE erp_super_admin_login LOGIN NOINHERIT NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_worker_login') THEN
    CREATE ROLE erp_worker_login LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

-- 3. Idempotent attribute normalization (handles pre-existing roles without altering migration owner)
ALTER ROLE erp_app_user NOLOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE erp_auth_resolver NOLOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE erp_super_admin NOLOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE erp_system_worker NOLOGIN NOINHERIT NOBYPASSRLS;

ALTER ROLE erp_app_login LOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE erp_auth_login LOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE erp_super_admin_login LOGIN NOINHERIT NOBYPASSRLS;
ALTER ROLE erp_worker_login LOGIN NOINHERIT NOBYPASSRLS;

-- 4. Clean any unintended memberships among Stage A roles before granting intended edges
REVOKE erp_auth_resolver, erp_super_admin, erp_system_worker FROM erp_app_login, erp_app_user;
REVOKE erp_app_user, erp_super_admin, erp_system_worker FROM erp_auth_login, erp_auth_resolver;
REVOKE erp_app_user, erp_auth_resolver, erp_system_worker FROM erp_super_admin_login, erp_super_admin;
REVOKE erp_auth_resolver, erp_super_admin FROM erp_worker_login, erp_system_worker;
REVOKE erp_app_user FROM erp_worker_login, erp_system_worker;

-- 5. Exact intended role memberships (NOINHERIT requires explicit SET LOCAL ROLE; worker stays isolated)
GRANT erp_app_user TO erp_app_login;
GRANT erp_auth_resolver TO erp_auth_login;
GRANT erp_super_admin TO erp_super_admin_login;
GRANT erp_system_worker TO erp_worker_login;

-- 6. Schema & DML privileges (NO DDL privileges for runtime roles)
GRANT USAGE ON SCHEMA public TO erp_app_user, erp_auth_resolver, erp_super_admin, erp_system_worker;

-- erp_app_user: DML on public tables & sequences (subject to RLS once enabled in Stage E)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_app_user;

-- erp_auth_resolver: ZERO direct table or sequence privileges (Stage B SECURITY DEFINER RPCs only)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM erp_auth_resolver;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM erp_auth_resolver;

-- erp_system_worker: ZERO direct table or sequence privileges in Stage A; remains isolated from erp_app_user
-- (narrow worker table grants + verified tenant RLS are added in Stage E)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM erp_system_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM erp_system_worker;

-- erp_super_admin: DML on public tables & sequences (isolated on SUPER_ADMIN_DATABASE_URL pool)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_super_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_super_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_super_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO erp_super_admin;
