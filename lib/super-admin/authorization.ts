import "server-only";
import { prisma } from "@/lib/super-admin/prisma";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SuperAdminIdentity = string | { userId: string; email?: string | null };

export function isDatabaseUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function hasSuperAdminRole(identity: SuperAdminIdentity) {
  const userId = typeof identity === "string" ? identity : identity.userId;
  const email = typeof identity === "string" ? null : identity.email?.trim().toLowerCase();

  if (isDatabaseUuid(userId)) {
    const platformUser = await prisma.platformUser.findUnique({
      where: { id: userId },
      select: { platformRole: true, status: true },
    });

    if (platformUser?.platformRole === "SUPER_ADMIN" && platformUser.status === "ACTIVE") {
      return true;
    }
  }

  const erpUser = isDatabaseUuid(userId)
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, platformRole: true, isActive: true },
      })
    : email
      ? await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { role: true, platformRole: true, isActive: true },
        })
      : null;

  if (
    erpUser?.isActive &&
    (erpUser.role === "SUPER_ADMIN" || erpUser.platformRole === "SUPER_ADMIN")
  ) {
    return true;
  }

  return false;
}
