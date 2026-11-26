import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { computePasswordSignature } from "@/lib/auth/jwt";
import { assertInstitutionAdminMembership } from "@/lib/security/institution-admin";
import db from "@/lib/db";
import { assertActiveSubscription, SubscriptionExpiredError } from "./subscription-guard";
import { hasPermission, isAdminPortalRole, isFullAdminRole } from "./rbac";
import { resolveUserPermissionsFromDb } from "./rbac-server";
import { isTemporaryPasswordActive } from "@/lib/services/credential-management.service";

export interface ResolvedAdminContext {
  institutionId: string;
  institutionName?: string;
  userId?: string;
  userRole: string;
  assignedRoles?: string[];
  permissions?: string[];
  isDevFallback: boolean;
}

export interface AdminContextOptions {
  /** If true, explicitly bypasses active subscription requirement even on mutations */
  allowExpired?: boolean;
  /** Explicit override to enforce active subscription */
  enforceSubscription?: boolean;
  /** Explicit roles permitted to access this route (in addition to full admins) */
  allowedRoles?: string[];
  /** Explicit permission code required for departmental staff */
  requiredPermission?: string;
}

export async function resolveAdminContext(
  req: NextRequest,
  options?: AdminContextOptions
): Promise<ResolvedAdminContext> {
  const session = await getSession(req);

  if (!session) {
    throw new UnauthorizedError("Authentication required. Please log in to access Institution Admin.");
  }

  const roleUpper = (session.role || "").toUpperCase();
  if (!isAdminPortalRole(roleUpper)) {
    throw new ForbiddenError("Forbidden: Account does not have Institution Admin or Departmental Staff privileges.");
  }

  // Reject legacy or malformed tokens without password signature before querying DB
  if (!session.passwordSig) {
    throw new UnauthorizedError("Session has expired or lacks required security signature. Please log in again.");
  }

  if (!session.userId) {
    throw new UnauthorizedError("Session is missing a user identity. Please log in again.");
  }

  // Live account verification and password revocation verification
  const dbUser = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      status: true,
      passwordHash: true,
      institutionId: true,
      role: true,
      platformRole: true,
    },
  });

  if (!dbUser || !dbUser.isActive || dbUser.status !== "ACTIVE") {
    throw new UnauthorizedError("Account has been deactivated, suspended, or locked.");
  }

  const currentSig = computePasswordSignature(dbUser.passwordHash || "");
  if (session.passwordSig !== currentSig) {
    throw new UnauthorizedError("Session has been invalidated due to a password reset or change. Please log in with your current credentials.");
  }

  const dbRole = (dbUser.role || "").toUpperCase();
  if (roleUpper === "SUPER_ADMIN") {
    if (dbRole !== "SUPER_ADMIN" && dbUser.platformRole !== "SUPER_ADMIN") {
      throw new ForbiddenError("Access denied: Account is no longer authorized as Super Admin.");
    }
  } else if (dbRole !== "ADMIN" && dbRole !== "INSTITUTION_ADMIN") {
    throw new ForbiddenError("Access denied: Institution Admin account is no longer authorized.");
  }

  // Server-side mandatory password change enforcement (authoritative DB check prevents stale-JWT traps)
  if (session.mustChangePassword) {
    const stillTemporary = session.userId ? await isTemporaryPasswordActive(session.userId) : true;
    if (stillTemporary) {
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
  }

  const liveRoleUpper = ((dbUser?.role || roleUpper) as string).toUpperCase();
  if (!isAdminPortalRole(liveRoleUpper)) {
    throw new ForbiddenError("Forbidden: Account role is no longer authorized for administrative access.");
  }

  // Determine institution boundary
  let institutionId = session.institutionId || dbUser.institutionId || undefined;

  // Super Admin may optionally inspect or operate on behalf of a specific institution
  if (liveRoleUpper === "SUPER_ADMIN") {
    const requested = req.headers.get("x-institution-id") || req.nextUrl.searchParams.get("institutionId");
    if (requested) {
      institutionId = requested;
    }
    if (!institutionId) {
      throw new ForbiddenError("Institution ID is required for Super Admin operational context.");
    }
  } else {
    if (!dbUser.institutionId || session.institutionId !== dbUser.institutionId) {
      throw new ForbiddenError("Forbidden: Administrator has no associated institution.");
    }
    institutionId = dbUser.institutionId;

    // For standard ADMIN and departmental staff, tenant is strictly bound to live account (anti-spoofing)
    const headerInstId = req.headers.get("x-institution-id");
    if (headerInstId && headerInstId !== institutionId) {
      throw new ForbiddenError("Tenant violation: Cross-institution administrative access is forbidden.");
    }

    if (!institutionId) {
      throw new ForbiddenError("Forbidden: Account has no associated institution.");
    }

    // Verify active InstitutionMembership ONLY for full-admin roles (ADMIN / INSTITUTION_ADMIN);
    // departmental staff are provisioned in `users` and authorized via `UserRoleAssignment`.
    if (isFullAdminRole(liveRoleUpper)) {
      await assertInstitutionAdminMembership(
        { email: dbUser.email || session.email, userInstitutionId: dbUser.institutionId },
        institutionId
      );
    }
  }

  const { assignedRoles, permissions } = await resolveUserPermissionsFromDb(
    session.userId,
    institutionId,
    liveRoleUpper
  );

  // Departmental RBAC enforcement: full admins pass; departmental roles require explicit permission or role match
  if (!isFullAdminRole(liveRoleUpper)) {
    const roleAllowed = options?.allowedRoles
      ? options.allowedRoles.some((r) => assignedRoles.includes(r.toUpperCase()))
      : false;
    const permAllowed = options?.requiredPermission
      ? hasPermission(permissions, options.requiredPermission, liveRoleUpper)
      : false;

    if (!roleAllowed && !permAllowed) {
      throw new ForbiddenError(
        "Forbidden: Your departmental role does not have permission to access this resource."
      );
    }
  }

  const resolvedContext: ResolvedAdminContext = {
    institutionId,
    institutionName: session.institutionName,
    userId: session.userId,
    userRole: liveRoleUpper,
    assignedRoles,
    permissions,
    isDevFallback: false,
  };

  if (shouldEnforceActiveSubscription(req, options)) {
    await assertActiveSubscription(resolvedContext.institutionId, resolvedContext.userRole);
  }

  return resolvedContext;
}

function shouldEnforceActiveSubscription(
  req: NextRequest,
  options?: AdminContextOptions
): boolean {
  if (options?.allowExpired) return false;
  if (options?.enforceSubscription) return true;

  const method = req.method?.toUpperCase() || "GET";
  const isMutation = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (!isMutation) return false;

  const pathname = req.nextUrl?.pathname || "";
  const isExemptPath =
    pathname.startsWith("/api/admin/subscription") ||
    pathname.startsWith("/api/subscription") ||
    pathname.startsWith("/api/admin/support") ||
    pathname.startsWith("/api/admin/settings/theme") ||
    pathname.startsWith("/api/auth/");

  return !isExemptPath;
}

/**
 * Resolves admin context and verifies active subscription / trial status.
 * Throws SubscriptionExpiredError (HTTP 402) if 14-day trial has elapsed.
 * Super Admin is always exempt.
 */
export async function requireActiveSubscription(
  req: NextRequest,
  options?: AdminContextOptions
): Promise<ResolvedAdminContext> {
  return await resolveAdminContext(req, { ...options, enforceSubscription: true });
}

export async function requireInstitutionAdminSession(req?: NextRequest) {
  const session = await requireRole(req, ["ADMIN", "INSTITUTION_ADMIN"]);
  if (!session.userId || !session.institutionId) {
    throw new ForbiddenError("Access denied: Institution Admin account is not linked to an institution.");
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { email: true, institutionId: true, role: true },
  });
  if (!user || (user.role !== "ADMIN" && user.role !== "INSTITUTION_ADMIN")) {
    throw new ForbiddenError("Access denied: Institution Admin account is no longer authorized.");
  }

  await assertInstitutionAdminMembership(
    { email: user.email, userInstitutionId: user.institutionId },
    session.institutionId,
  );
  return session;
}

export function handleAdminApiError(error: any) {
  if (error?.digest?.startsWith("NEXT_")) {
    throw error;
  }
  console.error("Admin API error:", error?.message || error);

  let status = error?.statusCode || error?.status || 500;
  const msg = error?.message || "";

  if (
    error instanceof SubscriptionExpiredError ||
    error?.name === "SubscriptionExpiredError" ||
    error?.code === "SUBSCRIPTION_EXPIRED" ||
    msg.includes("free trial has expired")
  ) {
    return NextResponse.json(
      {
        success: false,
        error: msg,
        code: "SUBSCRIPTION_EXPIRED",
        upgradeUrl: "/subscription",
      },
      { status: 402 }
    );
  }

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
