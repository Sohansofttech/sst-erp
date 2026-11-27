import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type ClientBase } from "pg";
import type { BiometricPrismaModels } from "@/lib/db";
import { wrapWithMapping } from "@/lib/prisma";

export type RolePrismaClient = PrismaClient & BiometricPrismaModels;

export type PrivilegedDbRole = "AUTH" | "SUPER_ADMIN" | "WORKER";

export class DatabaseConfigurationError extends Error {
  readonly statusCode = 503;
  readonly role: PrivilegedDbRole;
  readonly envVar: string;

  constructor(role: PrivilegedDbRole, envVar: string) {
    super(
      `Database configuration error: ${envVar} is required for ${role} database access and cannot fall back to DATABASE_URL.`
    );
    this.name = "DatabaseConfigurationError";
    this.role = role;
    this.envVar = envVar;
  }
}

const ROLE_ENV_CONFIG: Record<PrivilegedDbRole, { envVar: string; defaultMax: number }> = {
  AUTH: { envVar: "AUTH_DATABASE_URL", defaultMax: 1 },
  SUPER_ADMIN: { envVar: "SUPER_ADMIN_DATABASE_URL", defaultMax: 1 },
  WORKER: { envVar: "WORKER_DATABASE_URL", defaultMax: 1 },
};

declare global {
  // eslint-disable-next-line no-var
  var rolePgPools: Partial<Record<PrivilegedDbRole, Pool>> | undefined;
  // eslint-disable-next-line no-var
  var rolePrismaClients: Partial<Record<PrivilegedDbRole, PrismaClient>> | undefined;
}

// The Super Admin pool may reuse the single project database URL when no dedicated
// login is configured; onConnect then verifies the role is actually privileged.
function resolveRoleUrl(role: PrivilegedDbRole): { url: string | undefined; shared: boolean } {
  const dedicated = process.env[ROLE_ENV_CONFIG[role].envVar]?.trim();
  if (dedicated) return { url: dedicated, shared: false };
  if (role === "SUPER_ADMIN") return { url: process.env.DATABASE_URL?.trim(), shared: true };
  return { url: undefined, shared: false };
}

function getConnectionString(role: PrivilegedDbRole): string {
  const { url } = resolveRoleUrl(role);
  if (!url) {
    throw new DatabaseConfigurationError(role, ROLE_ENV_CONFIG[role].envVar);
  }
  return url;
}

export function hasRoleDatabaseConfig(role: PrivilegedDbRole): boolean {
  return Boolean(resolveRoleUrl(role).url);
}

async function prepareSuperAdminConnection(client: ClientBase, shared: boolean) {
  if (!shared) {
    await client.query("SET ROLE erp_super_admin");
    return;
  }
  const { rows } = await client.query(
    `select r.rolsuper or r.rolbypassrls as bypass, pg_has_role(current_user, 'erp_super_admin', 'USAGE') as can_set
       from pg_roles r where r.rolname = current_user`
  );
  if (rows[0]?.can_set) {
    await client.query("SET ROLE erp_super_admin");
  } else if (!rows[0]?.bypass) {
    throw new Error(
      "DATABASE_URL role lacks Super Admin privileges (needs erp_super_admin membership or BYPASSRLS)."
    );
  }
}

export function getRoleDb(role: PrivilegedDbRole): RolePrismaClient {
  const connectionString = getConnectionString(role);
  const { defaultMax } = ROLE_ENV_CONFIG[role];

  if (!global.rolePgPools) global.rolePgPools = {};
  if (!global.rolePrismaClients) global.rolePrismaClients = {};

  let client = global.rolePrismaClients[role];
  if (!client) {
    const isLocalhost =
      connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

    const pool =
      global.rolePgPools[role] ||
      new Pool({
        connectionString,
        ssl: isLocalhost ? false : { rejectUnauthorized: false },
        max: defaultMax,
        connectionTimeoutMillis: 15000,
        query_timeout: 15000,
        idleTimeoutMillis: 3000,
        allowExitOnIdle: true,
        ...(role === "SUPER_ADMIN"
          ? { onConnect: async (client: ClientBase) => {
              await prepareSuperAdminConnection(client, resolveRoleUrl(role).shared);
            } }
          : {}),
      });

    if (!global.rolePgPools[role]) {
      pool.on("error", (err: Error) => {
        console.warn(`[db:${role}] Idle pg pool error:`, err?.message || err);
      });
      global.rolePgPools[role] = pool;
    }

    const adapter = new PrismaPg(pool);
    client = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    global.rolePrismaClients[role] = client;
  }

  return wrapWithMapping(client);
}

/**
 * Lazy proxy that avoids throwing during Next.js static build/import,
 * while strictly failing closed with DatabaseConfigurationError at query time
 * if the privileged role's env var is missing (never falling back to DATABASE_URL).
 */
export function createLazyRoleDbProxy(role: PrivilegedDbRole): RolePrismaClient {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined;
        const client = getRoleDb(role) as any;
        const value = client[prop];
        return typeof value === "function" ? value.bind(client) : value;
      },
    }
  ) as RolePrismaClient;
}
