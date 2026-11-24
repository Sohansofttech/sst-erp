import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

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

// Safe connection pool configuration for Supabase session mode:
// - max: 2 in production (prevents serverless lambdas from monopolizing Supabase's 15-session limit)
// - idleTimeoutMillis: 1500ms (reclaims idle connections quickly to prevent EMAXCONNSESSION)
// - connectionTimeoutMillis: 10000ms (generous queue wait time under concurrent load)
// - allowExitOnIdle: true (allows clean process exit on idle)
const pool =
  global.pgPool ||
  new Pool({
    connectionString,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
    max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : (process.env.NODE_ENV === "production" ? 2 : 5),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1500,
    allowExitOnIdle: true,
  });

if (process.env.NODE_ENV !== "production") {
  global.pgPool = pool;
}

const adapter = new PrismaPg(pool);

export interface BiometricPrismaModels {
  biometricDevice: any;
  studentBiometricCredential: any;
  biometricEventReceipt: any;
  biometricUnknownScan: any;
}

export const db = (global.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })) as PrismaClient & BiometricPrismaModels;

global.prisma = db;

export default db;
