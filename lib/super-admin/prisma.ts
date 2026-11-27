import "server-only";
import { db } from "@/lib/db";
import { wrapWithMapping } from "@/lib/prisma";
import { hasRoleDatabaseConfig, getRoleDb, type RolePrismaClient } from "@/lib/db/role-pools";

/**
 * Super Admin database client.
 * Uses dedicated SUPER_ADMIN_DATABASE_URL pool if explicitly configured;
 * otherwise seamlessly uses the shared DATABASE_URL connection.
 */
export const prisma: RolePrismaClient = (
  hasRoleDatabaseConfig("SUPER_ADMIN")
    ? getRoleDb("SUPER_ADMIN")
    : wrapWithMapping(db)
) as RolePrismaClient;

export function getSuperAdminDb(): RolePrismaClient {
  return prisma;
}
