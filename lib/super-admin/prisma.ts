import "server-only";
import { createLazyRoleDbProxy, getRoleDb, type RolePrismaClient } from "@/lib/db/role-pools";

/**
 * Server-only Prisma client for Super Admin operations. Uses SUPER_ADMIN_DATABASE_URL when set,
 * otherwise the single project DATABASE_URL, provided that role is privileged (checked on connect).
 */
export const prisma: RolePrismaClient = createLazyRoleDbProxy("SUPER_ADMIN");

export function getSuperAdminDb(): RolePrismaClient {
  return getRoleDb("SUPER_ADMIN");
}
