import { redirect } from "next/navigation";
import { connection } from "next/server";
import db from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { computePasswordSignature } from "@/lib/auth/jwt";
import { getRoleLandingRoute, isAdminPortalRole } from "@/lib/security/rbac";

export type PortalRole = "STUDENT" | "PARENT";

export interface PortalAuthContext {
  userId: string;
  role: PortalRole;
  institutionId: string;
  fullName: string;
  email: string;
}

function getPortalLoginPath(requiredRole: PortalRole): string {
  return requiredRole === "STUDENT" ? "/login?role=student" : "/login";
}

/**
 * Pure redirect-target resolver for Student and Parent portal pages.
 * Returns null if the live role matches requiredRole, or a safe redirect path otherwise.
 */
export function getPortalRedirectTarget(
  role: string | null | undefined,
  requiredRole: PortalRole
): string | null {
  const roleUpper = (role || "").toUpperCase();
  if (!roleUpper) {
    return getPortalLoginPath(requiredRole);
  }
  if (roleUpper === requiredRole) {
    return null;
  }
  if (roleUpper === "STUDENT") {
    return "/student/dashboard";
  }
  if (roleUpper === "PARENT") {
    return "/parent/dashboard";
  }
  if (roleUpper === "TEACHER") {
    return "/dashboard";
  }
  if (isAdminPortalRole(roleUpper)) {
    return getRoleLandingRoute(roleUpper);
  }
  return "/login?error=forbidden";
}

/**
 * Server-side session, live DB account, password signature, and role guard
 * for dedicated /student/* and /parent/* portals.
 */
export async function verifyPortalPageAccess(
  requiredRole: PortalRole
): Promise<PortalAuthContext | null> {
  await connection();

  const loginPath = getPortalLoginPath(requiredRole);
  const session = await getSession();
  if (!session || !session.userId || !session.passwordSig) {
    redirect(loginPath);
  }

  const dbUser = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      institutionId: true,
      isActive: true,
      status: true,
      passwordHash: true,
    },
  });

  if (!dbUser || !dbUser.isActive || dbUser.status !== "ACTIVE" || !dbUser.institutionId) {
    redirect(loginPath);
  }

  const currentSig = computePasswordSignature(dbUser.passwordHash || "");
  if (session.passwordSig !== currentSig) {
    redirect(loginPath);
  }

  const liveRole = (dbUser.role || session.role || "").toUpperCase();
  const redirectTarget = getPortalRedirectTarget(liveRole, requiredRole);
  if (redirectTarget) {
    redirect(redirectTarget);
  }

  return {
    userId: dbUser.id,
    role: requiredRole,
    institutionId: dbUser.institutionId,
    fullName: dbUser.fullName || session.fullName || "",
    email: dbUser.email || session.email || "",
  };
}
