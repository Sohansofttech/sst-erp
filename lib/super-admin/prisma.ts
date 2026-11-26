import "server-only";
import { createLazyRoleDbProxy, getRoleDb, type RolePrismaClient } from "@/lib/db/role-pools";

/**
 * Dedicated Prisma client for Super Admin operations (`erp_super_admin_login`).
 * Isolated from the normal tenant DATABASE_URL pool and never falls back to it.
 */
export const prisma: RolePrismaClient = createLazyRoleDbProxy("SUPER_ADMIN");

export function getSuperAdminDb(): RolePrismaClient {
  return getRoleDb("SUPER_ADMIN");
}
