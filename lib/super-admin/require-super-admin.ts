import "server-only";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { hasSuperAdminRole } from "@/lib/super-admin/authorization";
import { isDevelopmentBypassEnabled } from "@/lib/super-admin/development-access";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/super-admin/prisma";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SuperAdminActor {
  id: string | null;
  email: string | null;
  developmentMode: boolean;
}

/**
 * Resolves the authenticated Super Admin actor.
 *
 * Security Requirements:
 * 1. Requires independently verified database authorization (never trusts session JWT alone).
 * 2. Rejects any session where the underlying database user does not have an active SUPER_ADMIN role.
 * 3. Never auto-provisions or promotes a PlatformUser unless the user is independently verified as
 *    an active SUPER_ADMIN in the database (users table).
 * 4. Guarantees that the returned actor.id is a valid UUID referencing the platform User table.
 */
export async function requireSuperAdmin(): Promise<SuperAdminActor> {
  if (isDevelopmentBypassEnabled()) return { id: null, email: null, developmentMode: true as const };

  // 1. Check ERP JWT Session (unified login / cookie auth)
  const session = await getSession();
  if (session) {
    if (!session.userId || session.role !== "SUPER_ADMIN") {
      throw new Error("Super Admin access is required.");
    }

    // Independent database authorization check: verify the user in the database directly
    const isAuthorized = await hasSuperAdminRole(session.userId);
    if (!isAuthorized) {
      throw new Error("Super Admin access is required: independent database authorization failed.");
    }

    // Fetch the verified database record from table "users"
    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, role: true, platformRole: true, isActive: true, fullName: true },
    });

    if (!dbUser || !dbUser.isActive || (dbUser.role !== "SUPER_ADMIN" && dbUser.platformRole !== "SUPER_ADMIN")) {
      throw new Error("Super Admin access is required: database account is inactive or unauthorized.");
    }

    const verifiedEmail = dbUser.email.trim().toLowerCase();
    let platformUser: { id: string; email: string; platformRole: string; status: string } | null = null;

    // A. If session.userId is a valid UUID, attempt lookup by ID in platform User table
    if (UUID_REGEX.test(session.userId)) {
      try {
        platformUser = await prisma.platformUser.findUnique({
          where: { id: session.userId },
          select: { id: true, email: true, platformRole: true, status: true },
        });
      } catch (err) {
        console.warn("[requireSuperAdmin] Error looking up PlatformUser by ID:", err);
      }
    }

    // B. If not found by ID, lookup by verified database email in platform User table
    if (!platformUser) {
      try {
        platformUser = await prisma.platformUser.findFirst({
          where: { email: { equals: verifiedEmail, mode: "insensitive" } },
          select: { id: true, email: true, platformRole: true, status: true },
        });
      } catch (err) {
        console.warn("[requireSuperAdmin] Error looking up PlatformUser by email:", err);
      }
    }

    // C. If found in PlatformUser, verify SUPER_ADMIN platformRole & ACTIVE status
    if (platformUser) {
      if (platformUser.platformRole !== "SUPER_ADMIN" || platformUser.status !== "ACTIVE") {
        throw new Error("Super Admin access is required: platform account is not active or unauthorized.");
      }
      return { id: platformUser.id, email: platformUser.email, developmentMode: false };
    }

    // D. If no PlatformUser exists, only provision if the database user was independently
    // verified as an active SUPER_ADMIN. Use the database user's verified email (never untrusted session data).
    try {
      const newPlatformUserId = crypto.randomUUID();
      const created = await prisma.platformUser.create({
        data: {
          id: newPlatformUserId,
          name: dbUser.fullName || "Super Admin",
          email: verifiedEmail,
          platformRole: "SUPER_ADMIN",
          status: "ACTIVE",
        },
        select: { id: true, email: true, platformRole: true, status: true },
      });
      return { id: created.id, email: created.email, developmentMode: false };
    } catch (err) {
      console.error("[requireSuperAdmin] Failed to provision PlatformUser for verified Super Admin:", err);
      // Fallback: lookup once more in case of concurrent insert
      try {
        const fallback = await prisma.platformUser.findFirst({
          where: { email: { equals: verifiedEmail, mode: "insensitive" } },
          select: { id: true, email: true, platformRole: true, status: true },
        });
        if (fallback && fallback.platformRole === "SUPER_ADMIN" && fallback.status === "ACTIVE") {
          return { id: fallback.id, email: fallback.email, developmentMode: false };
        }
      } catch {}
    }

    throw new Error("Super Admin platform account could not be resolved.");
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
