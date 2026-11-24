import { NextRequest, NextResponse } from "next/server";
import { getSession, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { computePasswordSignature } from "@/lib/auth/jwt";
import db from "@/lib/db";

export interface ResolvedAdminContext {
  institutionId: string;
  institutionName?: string;
  userId?: string;
  userRole: string;
  isDevFallback: boolean;
}

export async function resolveAdminContext(req: NextRequest): Promise<ResolvedAdminContext> {
  const session = await getSession(req);

  if (!session) {
    throw new UnauthorizedError("Authentication required. Please log in to access Institution Admin.");
  }

  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
    throw new ForbiddenError("Forbidden: Account does not have Institution Admin privileges.");
  }

  // Reject legacy or malformed tokens without password signature before querying DB
  if (!session.passwordSig) {
    throw new UnauthorizedError("Session has expired or lacks required security signature. Please log in again.");
  }

  // Anti-spoofing check: standard Admin can NEVER supply an x-institution-id header different from their session
  if (session.role !== "SUPER_ADMIN") {
    const headerInstId = req.headers.get("x-institution-id");
    if (headerInstId && headerInstId !== session.institutionId) {
      throw new ForbiddenError("Tenant violation: Cross-institution administrative access is forbidden.");
    }
  }

  // Live account verification and password revocation verification
  let dbUser: any = null;
  if (session.userId) {
    dbUser = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, isActive: true, status: true, passwordHash: true, institutionId: true, role: true },
    });

    if (!dbUser || !dbUser.isActive || dbUser.status !== "ACTIVE") {
      throw new UnauthorizedError("Account has been deactivated, suspended, or locked.");
    }

    // Invalidate session if database password hash changed
    const currentSig = computePasswordSignature(dbUser.passwordHash || "");
    if (session.passwordSig !== currentSig) {
      throw new UnauthorizedError("Session has been invalidated due to a password reset or change. Please log in with your current credentials.");
    }
  }

  // Server-side mandatory password change enforcement
  if (session.mustChangePassword) {
    const pathname = req.nextUrl?.pathname || "";
    const isAllowed =
      pathname.startsWith("/api/auth/change-password") ||
      pathname.startsWith("/api/auth/me") ||
      pathname.startsWith("/api/auth/logout");

    if (!isAllowed) {
      throw new ForbiddenError(
        "Password change required: You must change your temporary password before accessing admin features."
      );
    }
  }

  // Determine institution boundary
  let institutionId = session.institutionId || dbUser?.institutionId;

  // Super Admin may optionally inspect or operate on behalf of a specific institution
  if (session.role === "SUPER_ADMIN") {
    const requested = req.headers.get("x-institution-id") || req.nextUrl.searchParams.get("institutionId");
    if (requested) {
      institutionId = requested;
    }
    if (!institutionId) {
      throw new ForbiddenError("Institution ID is required for Super Admin operational context.");
    }
  } else {
    // For standard ADMIN, tenant is strictly bound to session.institutionId (anti-spoofing)
    const headerInstId = req.headers.get("x-institution-id");
    if (headerInstId && headerInstId !== institutionId) {
      throw new ForbiddenError("Tenant violation: Cross-institution administrative access is forbidden.");
    }

    if (!institutionId) {
      throw new ForbiddenError("Forbidden: Administrator has no associated institution.");
    }

    // Verify active institution membership if memberships are enforced for this institution
    try {
      const activeMemberships: any = await db.$queryRaw`
        SELECT m.id, m.status
        FROM "InstitutionMembership" m
        WHERE (m."userId"::text = ${session.userId} OR m."userId" IN (SELECT id FROM "User" WHERE LOWER(BTRIM(email)) = LOWER(BTRIM(${session.email}))))
          AND m."institutionId"::text = ${institutionId}
          AND m.status = 'ACTIVE'
        LIMIT 1
      `;

      if (activeMemberships.length === 0) {
        const totalMemberships = await db.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint as count FROM "InstitutionMembership" WHERE "institutionId"::text = ${institutionId}
        `;
        const hasMemberships = Number(totalMemberships[0]?.count ?? 0) > 0;

        if (hasMemberships) {
          throw new ForbiddenError("Access denied: Account does not have an active administrator membership for this institution.");
        }
      }
    } catch (err: any) {
      if (err instanceof ForbiddenError) throw err;
      // Membership check warning fallback
    }
  }

  return {
    institutionId,
    institutionName: session.institutionName,
    userId: session.userId,
    userRole: session.role,
    isDevFallback: false,
  };
}

export function handleAdminApiError(error: any) {
  if (error?.digest?.startsWith("NEXT_")) {
    throw error;
  }
  console.error("Admin API error:", error?.message || error);

  let status = error?.statusCode || error?.status || 500;
  const msg = error?.message || "";

  if (!error?.statusCode && !error?.status) {
    if (
      error instanceof UnauthorizedError ||
      error?.name === "UnauthorizedError" ||
      msg.includes("Authentication required") ||
      msg.includes("Unauthorized")
    ) {
      status = 401;
    } else if (
      error instanceof ForbiddenError ||
      error?.name === "ForbiddenError" ||
      msg.includes("Forbidden") ||
      msg.includes("Access denied")
    ) {
      status = 403;
    } else if (
      error?.name === "ValidationError" ||
      msg.includes("already") ||
      msg.includes("Invalid") ||
      msg.includes("exceeds") ||
      msg.includes("occupied") ||
      msg.includes("required") ||
      msg.includes("not found") ||
      msg.includes("greater") ||
      msg.includes("must be") ||
      msg.includes("Cannot") ||
      msg.includes("Only PENDING")
    ) {
      status = 400;
    }
  }

  return NextResponse.json(
    {
      success: false,
      error: msg || "An unexpected error occurred in Institution Admin portal.",
    },
    { status }
  );
}
