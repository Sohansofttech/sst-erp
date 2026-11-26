import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
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

function getConnectionString(role: PrivilegedDbRole): string {
  const { envVar } = ROLE_ENV_CONFIG[role];
  const raw = process.env[envVar];
  if (!raw || raw.trim() === "") {
    throw new DatabaseConfigurationError(role, envVar);
  }
  return raw.trim();
}

export function hasRoleDatabaseConfig(role: PrivilegedDbRole): boolean {
  const { envVar } = ROLE_ENV_CONFIG[role];
  const raw = process.env[envVar];
  return Boolean(raw && raw.trim() !== "");
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
