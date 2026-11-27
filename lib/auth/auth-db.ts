import "server-only";
import { createLazyRoleDbProxy, getRoleDb, type RolePrismaClient } from "@/lib/db/role-pools";

/**
 * Dedicated Prisma client for pre-tenant authentication lookups (`erp_auth_login`).
 * Never falls back to DATABASE_URL.
 */
export const authDb: RolePrismaClient = createLazyRoleDbProxy("AUTH");

export function getAuthDb(): RolePrismaClient {
  return getRoleDb("AUTH");
}
