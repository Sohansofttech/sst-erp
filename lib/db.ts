import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

const adapter = new PrismaPg({
  connectionString,
  max: process.env.NODE_ENV === "production" ? 1 : 2,
});

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
