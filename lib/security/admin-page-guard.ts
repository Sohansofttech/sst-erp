import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import db from "@/lib/db";
import { getSession } from "@/lib/auth/session";
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
  role: string;
  permissions: string[];
  fullName: string;
  email: string;
  institutionName?: string;
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

  const session = await getSession();
  if (!session || !session.userId) {
    redirect(`/admin/login?from=${encodeURIComponent(pathname)}`);
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

  const institutionId = session.institutionId || dbUser.institutionId;
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

  if (isDepartmentalRole(liveRole) && !isAdminPageAuthorized(pathname, liveRole, permissions)) {
    const landingRoute = getAuthorizedAdminLandingRoute(liveRole, permissions);
    redirect(landingRoute || "/admin/login?error=forbidden");
  }

  return {
    role: liveRole,
    permissions,
    fullName: dbUser.fullName || session.fullName || "",
    email: dbUser.email || session.email || "",
    institutionName: session.institutionName || undefined,
  };
}
