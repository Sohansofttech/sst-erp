import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getActiveTenantTx } from "@/lib/security/tenant-als";

declare global {
  // eslint-disable-next-line no-var
  var prisma: (PrismaClient & BiometricPrismaModels) | undefined;
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

const isLocalhost = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

// Safe connection pool configuration for Supabase session mode (pool_size: 15):
// - max: 2 by default in both dev and prod so multiple Next.js workers/processes stay well under 15 total connections
// - connectionTimeoutMillis: 15000ms (queues concurrent requests cleanly instead of failing)
// - idleTimeoutMillis: 3000ms (reclaims idle connections quickly to prevent EMAXCONNSESSION)
// - allowExitOnIdle: true (allows clean process exit on idle)
const pool =
  global.pgPool ||
  new Pool({
    connectionString,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
    max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 2,
    connectionTimeoutMillis: 15000,
    query_timeout: 15000,
    idleTimeoutMillis: 3000,
    allowExitOnIdle: true,
  });

if (!global.pgPool) {
  pool.on("error", (err: Error) => {
    console.warn("[db] Idle pg pool error:", err?.message || err);
  });
  global.pgPool = pool;
}

const adapter = new PrismaPg(pool);

export interface BiometricPrismaModels {
  biometricDevice: any;
  studentBiometricCredential: any;
  biometricEventReceipt: any;
  biometricUnknownScan: any;
}

const rootDb = (global.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })) as PrismaClient & BiometricPrismaModels;

global.prisma = rootDb;

const ROOT_ONLY_PROPS = new Set<string | symbol>([
  "$connect",
  "$disconnect",
  "$on",
  "$extends",
]);

/**
 * Non-breaking ALS-aware proxy:
 * - When no verified tenant ALS transaction is active, behaves identically to `rootDb`.
 * - When an active ALS transaction exists, routes model operations, `$queryRaw`, `$executeRaw`,
 *   and `$transaction` through that single active transaction connection.
 */
export const db = new Proxy(rootDb, {
  get(target, prop, receiver) {
    const activeTx = getActiveTenantTx();
    if (!activeTx || ROOT_ONLY_PROPS.has(prop)) {
      const val = Reflect.get(target, prop, receiver);
      return typeof val === "function" ? val.bind(target) : val;
    }

    if (prop === "$transaction") {
      return async (arg: any, _options?: any) => {
        if (typeof arg === "function") {
          return arg(activeTx);
        }
        if (Array.isArray(arg)) {
          const results: any[] = [];
          for (const op of arg) {
            results.push(await op);
          }
          return results;
        }
        throw new TypeError("Unsupported $transaction argument inside active tenant context.");
      };
    }

    const txVal = activeTx[prop];
    return typeof txVal === "function" ? txVal.bind(activeTx) : txVal;
  },
}) as PrismaClient & BiometricPrismaModels;

export default db;
