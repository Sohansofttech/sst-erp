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

  if (session) {
    if (session.role === "ADMIN" || session.role === "SUPER_ADMIN") {
      // Live account verification and password revocation verification
      if (session.userId) {
        const user = await db.user.findUnique({
          where: { id: session.userId },
          select: { id: true, isActive: true, status: true, passwordHash: true },
        });

        if (!user || !user.isActive || user.status !== "ACTIVE") {
          throw new UnauthorizedError("Account has been deactivated, suspended, or locked.");
        }

        // Reject legacy tokens without password signature
        if (!session.passwordSig) {
          throw new UnauthorizedError("Session has expired or lacks required security signature. Please log in again.");
        }

        // Invalidate session if database password hash changed
        const currentSig = computePasswordSignature(user.passwordHash || "");
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

      // For standard ADMIN, tenant is strictly bound to session.institutionId (spoof prevention)
      let institutionId = session.institutionId;
      // Super Admin may optionally inspect or operate on behalf of a specific institution
      if (session.role === "SUPER_ADMIN") {
        const requested = req.headers.get("x-institution-id") || req.nextUrl.searchParams.get("institutionId");
        if (requested) {
          institutionId = requested;
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
    throw new ForbiddenError("Forbidden: Account does not have Institution Admin privileges.");
  }

  // Enforce mandatory authentication in production or when STRICT_ADMIN_AUTH is enabled
  if (process.env.NODE_ENV === "production" || process.env.STRICT_ADMIN_AUTH === "true") {
    throw new UnauthorizedError("Authentication required. Please log in to access Institution Admin.");
  }

  // Developer / Direct access fallback (Development mode only)
  const requestedInstId = req.headers.get("x-institution-id");
  if (requestedInstId) {
    return {
      institutionId: requestedInstId,
      userRole: "ADMIN",
      isDevFallback: true,
    };
  }

  // Find first institution in database or default to apex
  let defaultInstId = "inst_apex";
  try {
    const firstInst = await db.institution.findFirst({ select: { id: true } });
    if (firstInst) {
      defaultInstId = firstInst.id;
    } else {
      const platformRows: any = await db.$queryRaw`
        SELECT id FROM "Institution" WHERE "archivedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1
      `;
      if (platformRows && platformRows.length > 0) {
        defaultInstId = platformRows[0].id;
      }
    }
  } catch {
    // DB might be offline or initializing
  }

  return {
    institutionId: defaultInstId,
    userRole: "ADMIN",
    isDevFallback: true,
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
