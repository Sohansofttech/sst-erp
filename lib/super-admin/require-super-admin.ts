import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSuperAdminRole } from "@/lib/super-admin/authorization";
import { isDevelopmentBypassEnabled } from "@/lib/super-admin/development-access";
import { getSession } from "@/lib/auth/session";
import { computePasswordSignature } from "@/lib/auth/jwt";
import { emailsMatch } from "@/lib/auth/email";
import { prisma } from "@/lib/super-admin/prisma";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SuperAdminActor {
  id: string | null;
  email: string | null;
  developmentMode: boolean;
}

/**
 * Resolves the authenticated Super Admin actor (strictly read-only).
 *
 * Security Requirements:
 * 1. Requires independently verified database authorization (never trusts session JWT alone).
 * 2. Rejects any session where `users` is inactive (`!isActive` or `status !== "ACTIVE"`),
 *    lacks `SUPER_ADMIN`, or has a mismatched `passwordSig`.
 * 3. Requires exact `PlatformUser.id === dbUser.id` correspondence with matching email,
 *    `platformRole === "SUPER_ADMIN"`, and `status === "ACTIVE"`.
 * 4. Never auto-provisions, repairs, or creates `PlatformUser` records.
 */
export async function requireSuperAdmin(): Promise<SuperAdminActor> {
  if (isDevelopmentBypassEnabled()) return { id: null, email: null, developmentMode: true as const };

  // 1. Check ERP JWT Session (unified login / cookie auth)
  const session = await getSession();
  if (session) {
    if (!session.userId || session.role !== "SUPER_ADMIN" || !session.passwordSig) {
      throw new Error("Super Admin access is required.");
    }

    if (!UUID_REGEX.test(session.userId)) {
      throw new Error("Super Admin access is required: invalid user UUID.");
    }

    // Independent database authorization check
    const isAuthorized = await hasSuperAdminRole(session.userId);
    if (!isAuthorized) {
      throw new Error("Super Admin access is required: independent database authorization failed.");
    }

    // Fetch the verified database record from table "users"
    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        role: true,
        platformRole: true,
        isActive: true,
        status: true,
        passwordHash: true,
      },
    });

    if (
      !dbUser ||
      dbUser.id !== session.userId ||
      !dbUser.isActive ||
      dbUser.status !== "ACTIVE" ||
      (dbUser.role !== "SUPER_ADMIN" && dbUser.platformRole !== "SUPER_ADMIN")
    ) {
      throw new Error("Super Admin access is required: database account is inactive or unauthorized.");
    }

    const currentSig = computePasswordSignature(dbUser.passwordHash || "");
    if (session.passwordSig !== currentSig) {
      throw new Error("Super Admin access is required: session signature is invalid or revoked.");
    }

    // Require exact PlatformUser.id === dbUser.id correspondence (no email fallback, no auto-provisioning)
    const platformUser = await prisma.platformUser.findUnique({
      where: { id: dbUser.id },
      select: { id: true, email: true, platformRole: true, status: true },
    });

    if (
      !platformUser ||
      !emailsMatch(platformUser.email, dbUser.email) ||
      platformUser.platformRole !== "SUPER_ADMIN" ||
      platformUser.status !== "ACTIVE"
    ) {
      throw new Error("Super Admin access is required: platform account not found or unauthorized.");
    }

    return { id: platformUser.id, email: platformUser.email, developmentMode: false };
  }

  // 2. Check Supabase Auth
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  if (!(await hasSuperAdminRole(user.id))) {
    throw new Error("Super Admin access is required: independent database authorization failed.");
  }

  const platformUser = await prisma.platformUser.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, platformRole: true, status: true },
  });

  if (!platformUser || platformUser.platformRole !== "SUPER_ADMIN" || platformUser.status !== "ACTIVE") {
    throw new Error("Super Admin access is required.");
  }

  return { id: platformUser.id, email: platformUser.email ?? user.email ?? null, developmentMode: false };
}
