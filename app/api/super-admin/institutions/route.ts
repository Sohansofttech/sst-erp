// Super Admin Institution List API
// GET: Returns paginated list of institutions with optional search.
// Authentication: Super Admin only via requireSuperAdmin.

import { connection, NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { prisma } from "@/lib/super-admin/prisma";

/**
 * Safely parse a pagination parameter.
 * Returns the default value when the input is missing, empty, non‑numeric,
 * NaN, a decimal, or outside the allowed range.
 */
function parsePaginationParam(
  raw: string | null,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (!raw) return defaultValue;
  // Trim whitespace and reject empty strings early
  const trimmed = raw.trim();
  if (trimmed === "") return defaultValue;
  // Parse as integer – floor to drop decimals
  const parsed = Math.floor(Number(trimmed));
  if (Number.isNaN(parsed)) return defaultValue;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

export async function GET(req: NextRequest) {
  await connection();
  try {
    await requireSuperAdmin();

    const { searchParams } = new URL(req.url);

    // Pagination – defaults: page 1, pageSize 20; enforce bounds
    const page = parsePaginationParam(searchParams.get("page"), 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePaginationParam(searchParams.get("pageSize"), 20, 1, 100);
    const search = (searchParams.get("search") ?? "").trim();

    // Build Prisma where clause (search by name, case‑insensitive)
    const where: any = {};
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    // Total count for pagination meta
    const total = await prisma.institution.count({ where });

    // Fetch institutions – never pass NaN because page and pageSize are validated above
    const institutions = await prisma.institution.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        // Additional fields are harmless for the selector but kept for consistency
        status: true,
        type: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: institutions,
      meta: { page, pageSize, total },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    const isRedirect =
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof err.digest === "string" &&
      err.digest.startsWith("NEXT_REDIRECT");
    const isForbidden = message.includes("Super Admin access is required");
    const errorStatus =
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      typeof err.status === "number"
        ? err.status
        : 500;
    const status = isForbidden ? 403 : isRedirect ? 401 : errorStatus;

    if (status >= 500) {
      console.error("[institutions API] Unexpected error:", err);
    }

    const safeMessage = status === 401
      ? "Unauthenticated"
      : status === 403
        ? "Forbidden"
        : "Internal server error";
    return NextResponse.json({ success: false, error: safeMessage }, { status });
  }
}
