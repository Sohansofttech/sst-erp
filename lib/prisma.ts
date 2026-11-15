import "dotenv/config"
import { Pool } from "pg"
import { PrismaClient, Prisma } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

/**
 * Creates a cached or new PrismaClient singleton instance for Next.js.
 * Uses PrismaPg driver adapter with a managed connection pool to connect
 * to Supabase/PostgreSQL safely across development fast-refresh and production.
 *
 * Pool size is capped at 5 to safely operate within Supabase Session Pooler
 * limits (max 15 clients) without throwing EMAXCONNSESSION.
 */
const globalForPrisma = globalThis as unknown as {
  __sst_prisma: PrismaClient | undefined
  __sst_pg_pool: Pool | undefined
}

function getOrCreatePool(connectionString: string): Pool {
  if (!globalForPrisma.__sst_pg_pool) {
    // When connecting through Supabase pooler, use port 6543 (Transaction Mode)
    // to multiplex connections efficiently and prevent EMAXCONNSESSION errors.
    const normalizedUrl = connectionString.includes("pooler.supabase.com:5432")
      ? connectionString.replace(":5432", ":6543")
      : connectionString

    globalForPrisma.__sst_pg_pool = new Pool({
      connectionString: normalizedUrl,
      max: 10,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 10000,
    })
  }
  return globalForPrisma.__sst_pg_pool
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not defined in the environment. Please ensure it is present in .env."
    )
  }

  const pool = getOrCreatePool(connectionString)
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
  })
}

export const prisma = globalForPrisma.__sst_prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__sst_prisma = prisma
}

export { Prisma, PrismaClient }
export default prisma
