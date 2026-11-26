import "server-only";
import { createLazyRoleDbProxy, getRoleDb, type RolePrismaClient } from "@/lib/db/role-pools";

/**
 * Dedicated Prisma client for webhooks and background workers (`erp_worker_login`).
 * Never falls back to DATABASE_URL.
 */
export const workerDb: RolePrismaClient = createLazyRoleDbProxy("WORKER");

export function getWorkerDb(): RolePrismaClient {
  return getRoleDb("WORKER");
}
