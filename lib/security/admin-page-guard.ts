import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import db from "@/lib/db";
import { prisma as platformDb } from "@/lib/super-admin/prisma";
import { getPortalAccessIssue } from "@/lib/super-admin/portal-access-message";
import { ForbiddenError, getSession } from "@/lib/auth/session";
import { computePasswordSignature } from "@/lib/auth/jwt";
import {
  PERMISSIONS,
  getRoleLandingRoute,
  hasPermission,
  isAdminPortalRole,
  isDepartmentalRole,
  isFullAdminRole,
} from "@/lib/security/rbac";
import { resolveUserPermissionsFromDb } from "@/lib/security/rbac-server";
import {
  resolveInstitutionBranding,
  type ResolvedInstitutionBranding,
} from "@/lib/services/institution-branding.service";
import {
  SUPPORT_ACCESS_COOKIE_NAME,
  verifySuperAdminSupportToken,
} from "@/lib/auth/jwt";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure route authorization check for admin portal pages.
 * The server layout enforces it using live DB permissions.
 */
export function isAdminPageAuthorized(
  pathname: string,
  role: string,
  permissions: string[]
): boolean {
  const cleanPath = (pathname || "/admin").split("?")[0];
  if (cleanPath === "/admin/login") return true;

  const roleUpper = (role || "").toUpperCase();
  if (!isAdminPortalRole(roleUpper)) return false;
  if (isFullAdminRole(roleUpper) || hasPermission(permissions, PERMISSIONS.ADMIN_ALL, roleUpper)) {
    return true;
  }

  // Departmental staff cannot access the full-admin root dashboard or admin governance pages
  if (cleanPath === "/admin" || cleanPath === "/admin/") return false;
  if (cleanPath.startsWith("/admin/admissions")) {
    return hasPermission(permissions, PERMISSIONS.ADMISSIONS_READ, roleUpper);
  }
  if (cleanPath.startsWith("/admin/fees")) {
    return hasPermission(permissions, PERMISSIONS.FEES_READ, roleUpper);
  }
  if (cleanPath.startsWith("/admin/hostel")) {
    return hasPermission(permissions, PERMISSIONS.HOSTEL_READ, roleUpper);
  }
  if (cleanPath.startsWith("/admin/transport")) {
    return hasPermission(permissions, PERMISSIONS.TRANSPORT_READ, roleUpper);
  }
  if (cleanPath === "/admin/students") {
    return hasPermission(permissions, PERMISSIONS.STUDENTS_READ, roleUpper);
  }
  if (cleanPath.startsWith("/admin/reports")) {
    return hasPermission(permissions, PERMISSIONS.REPORTS_FINANCE, roleUpper);
  }

  return false;
}

export function getAuthorizedAdminLandingRoute(role: string, permissions: string[]): string | null {
  const preferredRoute = getRoleLandingRoute(role);
  if (isAdminPageAuthorized(preferredRoute, role, permissions)) {
    return preferredRoute;
  }

  const availableRoutes = [
    "/admin/admissions",
    "/admin/fees",
    "/admin/hostel",
    "/admin/transport",
    "/admin/students",
    "/admin/reports",
  ];
  return availableRoutes.find((route) => isAdminPageAuthorized(route, role, permissions)) || null;
}

export interface VerifiedAdminPageAuth {
  userId: string;
  sessionIdentity: string;
  role: string;
  permissions: string[];
  fullName: string;
  email: string;
  institutionName?: string;
  branding?: ResolvedInstitutionBranding | null;
  supportAccess?: {
    institutionId: string;
    institutionName: string;
    expiresAt: string;
  };
}

/**
 * Server-side session, DB user, institution membership, and RBAC route guard for /admin/* pages.
 * Returns the server-verified identity so AdminLayout/AdminHeader/AdminSidebar render the exact role on frame 1.
 */
export async function verifyAdminPageAccess(): Promise<VerifiedAdminPageAuth | null> {
  await connection();
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || "/admin";
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return null;
  }

  let session;
  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/admin/login?error=institution_inactive");
    throw error;
  }
  if (!session || !session.userId) {
    redirect(`/admin/login?from=${encodeURIComponent(pathname)}`);
  }

  if (session.supportSessionId && session.supportInstitutionId) {
    const supportInstitution = await platformDb.platformInstitution.findUnique({
      where: { id: session.supportInstitutionId },
      select: { id: true, name: true, status: true, archivedAt: true },
    });
    const supportIssue = getPortalAccessIssue(supportInstitution);
    if (!supportInstitution || supportIssue) {
      redirect(`/super-admin/institutions?portalIssue=${supportIssue ?? "not_found"}&portalInstitution=${session.supportInstitutionId}`);
    }
    return {
      userId: session.userId,
      sessionIdentity: `${session.userId}:${supportInstitution.id}:SUPPORT`,
      role: "ADMIN",
      permissions: ["ADMIN_ALL"],
      fullName: session.fullName,
      email: session.email,
      institutionName: supportInstitution.name,
      supportAccess: {
        institutionId: supportInstitution.id,
        institutionName: supportInstitution.name,
        expiresAt: session.supportExpiresAt || new Date().toISOString(),
      },
    };
  }

  const dbUser = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      isActive: true,
      status: true,
      role: true,
      institutionId: true,
      passwordHash: true,
    },
  });

  if (!dbUser || !dbUser.isActive || dbUser.status !== "ACTIVE") {
    redirect("/admin/login?error=account_inactive");
  }

  if (session.passwordSig && dbUser.passwordHash) {
    const currentSig = computePasswordSignature(dbUser.passwordHash);
    if (session.passwordSig !== currentSig) {
      redirect("/admin/login?error=session_expired");
    }
  }

  const liveRole = (dbUser.role || "").toUpperCase();
  if (!isAdminPortalRole(liveRole)) {
    redirect("/login?error=forbidden");
  }
  if (liveRole === "SUPER_ADMIN") {
    redirect(getRoleLandingRoute(liveRole));
  }

  const institutionId = dbUser.institutionId || session.institutionId;
  if (!institutionId) {
    redirect("/admin/login?error=no_institution");
  }

  // Verify InstitutionMembership for standard Institution Admin roles
  if (isFullAdminRole(liveRole) && liveRole !== "SUPER_ADMIN" && UUID_REGEX.test(institutionId)) {
    const membership = await db.institutionMembership.findFirst({
      where: {
        userId: dbUser.id,
        institutionId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!membership) {
      redirect("/admin/login?error=membership_revoked");
    }
  }

  const { permissions } = await resolveUserPermissionsFromDb(dbUser.id, institutionId, liveRole);
  let branding: ResolvedInstitutionBranding | null = null;
  try {
    branding = await resolveInstitutionBranding(institutionId);
  } catch (err) {
    console.warn("[AdminPageGuard] Branding resolution fallback:", err);
  }
  const sessionClaims = session as typeof session & {
    jti?: string;
    iat?: number;
    exp?: number;
  };
  const sessionIdentity = JSON.stringify([
    dbUser.id,
    sessionClaims.jti || null,
    sessionClaims.iat ?? null,
    sessionClaims.exp ?? null,
    branding?.institutionId || institutionId,
    liveRole,
    [...permissions].sort(),
  ]);

  if (isDepartmentalRole(liveRole) && !isAdminPageAuthorized(pathname, liveRole, permissions)) {
    const landingRoute = getAuthorizedAdminLandingRoute(liveRole, permissions);
    redirect(landingRoute || "/admin/login?error=forbidden");
  }

  let supportAccess: VerifiedAdminPageAuth["supportAccess"];
  try {
    const supportCookie = (await cookies()).get(SUPPORT_ACCESS_COOKIE_NAME)?.value;
    if (supportCookie) {
      const supportToken = await verifySuperAdminSupportToken(supportCookie);
      if (supportToken && supportToken.expiresAt > Date.now() && supportToken.superAdminId === dbUser.id) {
        const [superAdmin, supportSession, institution] = await Promise.all([
          db.user.findUnique({
            where: { id: supportToken.superAdminId },
            select: { id: true, role: true, platformRole: true, isActive: true, status: true },
          }),
          db.supportAccessSession.findUnique({
            where: { id: supportToken.supportSessionId },
            select: { id: true, institutionId: true, requestedById: true, status: true, expiresAt: true },
          }),
          db.platformInstitution.findUnique({
            where: { id: institutionId },
            select: { id: true, name: true },
          }),
        ]);
        if (
          superAdmin &&
          superAdmin.isActive &&
          superAdmin.status === "ACTIVE" &&
          (superAdmin.role === "SUPER_ADMIN" || superAdmin.platformRole === "SUPER_ADMIN") &&
          supportSession &&
          supportSession.status === "ACTIVE" &&
          supportSession.requestedById === supportToken.superAdminId &&
          supportSession.institutionId === institutionId &&
          supportSession.institutionId === supportToken.institutionId &&
          supportSession.expiresAt > new Date() &&
          institution
        ) {
          supportAccess = {
            institutionId: institution.id,
            institutionName: institution.name,
            expiresAt: supportSession.expiresAt.toISOString(),
          };
        }
      }
    }
  } catch (error) {
    console.warn("[AdminSupportAccess] Support context could not be verified:", error);
  }

  return {
    userId: dbUser.id,
    sessionIdentity,
    role: liveRole,
    permissions,
    fullName: dbUser.fullName || session.fullName || "",
    email: dbUser.email || session.email || "",
    institutionName: session.institutionName || undefined,
    branding,
    supportAccess,
  };
}
