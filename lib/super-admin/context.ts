import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { ForbiddenError, UnauthorizedError, getSession } from "@/lib/auth/session";
import { computePasswordSignature } from "@/lib/auth/jwt";
import { emailsMatch } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";
import { getSuperAdminDb } from "@/lib/super-admin/prisma";
import { wrapWithMapping } from "@/lib/prisma";
import type { RolePrismaClient } from "@/lib/db/role-pools";

export interface TrustedSuperAdminPrincipal {
  userId: string | null;
  email: string | null;
  passwordSig?: string | null;
  source: "jwt" | "supabase";
}

export interface SuperAdminIdentity {
  userId: string | null;
  platformUserId: string | null;
}

interface SuperAdminTxStore {
  tx: RolePrismaClient;
  userId: string | null;
  platformUserId: string | null;
}

const superAdminAls = new AsyncLocalStorage<SuperAdminTxStore>();

export interface SuperAdminContextDeps {
  verifyPrincipal?: () => Promise<TrustedSuperAdminPrincipal>;
  getDb?: () => RolePrismaClient;
}

async function resolveTrustedSuperAdminPrincipal(): Promise<TrustedSuperAdminPrincipal> {
  const session = await getSession();
  if (session) {
    if (!session.userId || session.role !== "SUPER_ADMIN" || !session.passwordSig) {
      throw new ForbiddenError("Super Admin access is required.");
    }
    return {
      userId: session.userId,
      email: session.email || null,
      passwordSig: session.passwordSig,
      source: "jwt",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError("Super Admin authentication is required.");
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    source: "supabase",
  };
}

/**
 * Resolves the PlatformUser record for a verified `users` Super Admin row.
 * Enforces strict exact-ID correspondence (`PlatformUser.id === dbUser.id`)
 * plus verified email, role, and active status. Never links accounts by email alone.
 */
async function resolveVerifiedPlatformUser(
  rawTx: any,
  dbUser: { id: string; email: string }
): Promise<{ id: string; email: string }> {
  const byId = await rawTx.platformUser.findUnique({
    where: { id: dbUser.id },
    select: { id: true, email: true, platformRole: true, status: true },
  });

  if (!byId) {
    throw new ForbiddenError(
      "Super Admin platform account not found for verified user ID."
    );
  }

  if (
    !emailsMatch(byId.email, dbUser.email) ||
    byId.platformRole !== "SUPER_ADMIN" ||
    byId.status !== "ACTIVE"
  ) {
    throw new ForbiddenError(
      "Super Admin platform account identity mismatch or inactive status."
    );
  }

  return { id: byId.id, email: byId.email };
}

export async function withSuperAdminContext<T>(
  fn: (tx: RolePrismaClient, identity: SuperAdminIdentity) => Promise<T>,
  deps?: SuperAdminContextDeps
): Promise<T> {
  const verifyPrincipal = deps?.verifyPrincipal ?? resolveTrustedSuperAdminPrincipal;
  const principal = await verifyPrincipal();

  if (!principal) {
    throw new ForbiddenError("Super Admin authentication is required.");
  }

  if (!principal.userId) {
    throw new ForbiddenError("Super Admin actor identity is required.");
  }

  const existing = superAdminAls.getStore();
  if (existing) {
    if (existing.userId !== (principal.userId ?? null)) {
      throw new ForbiddenError("Cross-actor Super Admin context switch is forbidden.");
    }
    return fn(existing.tx, {
      userId: existing.userId,
      platformUserId: existing.platformUserId,
    });
  }

  const superAdminDb = (deps?.getDb ?? getSuperAdminDb)();

  return await superAdminDb.$transaction(async (rawTx: any) => {
    try {
      await rawTx.$executeRaw`SET LOCAL ROLE erp_super_admin;`;
    } catch {
      // Ignored when running on shared database connection where postgres role does not permit role switching
    }

    let verifiedUserId: string | null = principal.userId;
    let verifiedPlatformUserId: string | null = null;

    if (principal.userId) {
      if (principal.source === "jwt") {
        const dbUser = await rawTx.user.findUnique({
          where: { id: principal.userId },
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
          dbUser.id !== principal.userId ||
          !dbUser.isActive ||
          dbUser.status !== "ACTIVE" ||
          (dbUser.role !== "SUPER_ADMIN" && dbUser.platformRole !== "SUPER_ADMIN")
        ) {
          throw new ForbiddenError(
            "Super Admin authorization failed or revoked during privileged transaction."
          );
        }

        const currentSig = computePasswordSignature(dbUser.passwordHash || "");
        if (!principal.passwordSig || principal.passwordSig !== currentSig) {
          throw new ForbiddenError("Super Admin session signature is invalid or revoked.");
        }

        const platformUser = await resolveVerifiedPlatformUser(rawTx, {
          id: dbUser.id,
          email: dbUser.email,
        });

        verifiedUserId = dbUser.id;
        verifiedPlatformUserId = platformUser.id;
      } else {
        const platformUser = await rawTx.platformUser.findUnique({
          where: { id: principal.userId },
          select: { id: true, email: true, platformRole: true, status: true },
        });

        if (
          !platformUser ||
          platformUser.id !== principal.userId ||
          platformUser.platformRole !== "SUPER_ADMIN" ||
          platformUser.status !== "ACTIVE"
        ) {
          throw new ForbiddenError(
            "Super Admin platform account is inactive or unauthorized."
          );
        }

        verifiedUserId = platformUser.id;
        verifiedPlatformUserId = platformUser.id;
      }
    }

    const mappedTx = wrapWithMapping(rawTx) as RolePrismaClient;
    const identity: SuperAdminIdentity = {
      userId: verifiedUserId,
      platformUserId: verifiedPlatformUserId,
    };

    return await superAdminAls.run(
      { tx: mappedTx, userId: verifiedUserId, platformUserId: verifiedPlatformUserId },
      () => fn(mappedTx, identity)
    );
  });
}

export function getActiveSuperAdminTx(): RolePrismaClient | null {
  return superAdminAls.getStore()?.tx ?? null;
}

export function getActiveSuperAdminIdentity(): SuperAdminIdentity | null {
  const store = superAdminAls.getStore();
  if (!store) return null;
  return { userId: store.userId, platformUserId: store.platformUserId };
}
