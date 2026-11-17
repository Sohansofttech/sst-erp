import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || "";
  const prismaUrl = process.env.POSTGRES_PRISMA_URL || "";
  const postgresUrl = process.env.POSTGRES_URL || "";
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL || "";

  const sanitize = (raw: string) => {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      return {
        host: u.host,
        user: u.username,
        port: u.port,
        database: u.pathname,
      };
    } catch {
      return "invalid_url_format";
    }
  };

  let connected = false;
  let dbError: string | null = null;
  try {
    const result = await db.$queryRaw`SELECT 1 as connected`;
    connected = Array.isArray(result) && result.length > 0;
  } catch (err: unknown) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const activeRaw = dbUrl || prismaUrl || postgresUrl || supabaseUrl || "";

  return NextResponse.json({
    status: connected ? "healthy" : "unhealthy",
    database: {
      connected,
      error: dbError,
      environment: {
        has_DATABASE_URL: !!dbUrl,
        has_POSTGRES_PRISMA_URL: !!prismaUrl,
        has_POSTGRES_URL: !!postgresUrl,
        has_SUPABASE_DATABASE_URL: !!supabaseUrl,
        source: dbUrl
          ? "DATABASE_URL"
          : prismaUrl
          ? "POSTGRES_PRISMA_URL"
          : postgresUrl
          ? "POSTGRES_URL"
          : supabaseUrl
          ? "SUPABASE_DATABASE_URL"
          : "FALLBACK_DEFAULT (localhost:5432)",
        config: sanitize(activeRaw),
      },
    },
  });
}
