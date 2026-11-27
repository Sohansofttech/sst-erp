import "server-only";
import { cookies } from "next/headers";
import { prisma as db } from "@/lib/super-admin/prisma";
import type { SessionUser } from "@/types";
import {
  AUTH_COOKIE_NAME,
  SUPPORT_ACCESS_COOKIE_NAME,
  computePasswordSignature,
  verifySuperAdminSupportToken,
  verifyToken,
} from "@/lib/auth/jwt";

export type SupportBaseSession = { userId?: string | null; role?: string | null } | null;

/**
 * A support cookie is honoured only while the browser still holds the same Super Admin's own
 * ERP session. Any other login (e.g. an Institution Admin) makes the cookie stale and inert.
 */
export function isSupportContextAllowed(
  base: SupportBaseSession,
  tokenSuperAdminId: string
): boolean {
  return !!base && base.role === "SUPER_ADMIN" && base.userId === tokenSuperAdminId;
}

export async function resolveSuperAdminSupportSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const supportCookie = cookieStore.get(SUPPORT_ACCESS_COOKIE_NAME)?.value;
  if (!supportCookie) return null;

  const token = await verifySuperAdminSupportToken(supportCookie);
  if (!token || token.expiresAt <= Date.now()) return null;

  const baseToken = cookieStore.get(AUTH_COOKIE_NAME)?.value || cookieStore.get("sst_session")?.value;
  const base = baseToken ? await verifyToken(baseToken) : null;
  if (!isSupportContextAllowed(base, token.superAdminId)) return null;

  const [superAdmin, supportSession, institution] = await Promise.all([
    db.user.findUnique({
      where: { id: token.superAdminId },
      select: {
        id: true,
        email: true,
        fullName: true,
        name: true,
        role: true,
        platformRole: true,
        isActive: true,
        status: true,
        passwordHash: true,
      },
    }),
    db.supportAccessSession.findUnique({
      where: { id: token.supportSessionId },
      select: {
        id: true,
        institutionId: true,
        requestedById: true,
        status: true,
        expiresAt: true,
      },
    }),
    db.platformInstitution.findUnique({
      where: { id: token.institutionId },
      select: { id: true, name: true, code: true, slug: true, status: true },
    }),
  ]);

  if (
    !superAdmin ||
    !superAdmin.isActive ||
    superAdmin.status !== "ACTIVE" ||
    (superAdmin.role !== "SUPER_ADMIN" && superAdmin.platformRole !== "SUPER_ADMIN") ||
    !supportSession ||
    supportSession.status !== "ACTIVE" ||
    supportSession.requestedById !== token.superAdminId ||
    supportSession.institutionId !== token.institutionId ||
    supportSession.expiresAt <= new Date() ||
    !institution ||
    institution.status === "ARCHIVED" ||
    institution.status === "SUSPENDED" ||
    institution.status === "PENDING"
  ) return null;

  return {
    userId: superAdmin.id,
    email: superAdmin.email,
    fullName: superAdmin.fullName || superAdmin.name || "Super Admin",
    name: superAdmin.fullName || superAdmin.name || "Super Admin",
    role: "ADMIN",
    institutionId: institution.id,
    institutionName: institution.name,
    institutionCode: institution.code,
    institutionSlug: institution.slug,
    institution: {
      id: institution.id,
      name: institution.name,
      code: institution.code,
      slug: institution.slug,
    },
    permissions: ["ADMIN_ALL"],
    assignedRoles: ["INSTITUTION_ADMIN"],
    passwordSig: computePasswordSignature(superAdmin.passwordHash || ""),
    mustChangePassword: false,
    supportInstitutionId: institution.id,
    supportSessionId: supportSession.id,
    supportExpiresAt: supportSession.expiresAt.toISOString(),
  };
}
