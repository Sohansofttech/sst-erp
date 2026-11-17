import "server-only";
import { prisma } from "@/lib/super-admin/prisma";

export async function hasSuperAdminRole(userId: string) {
  try {
    const platformUser = await prisma.platformUser.findUnique({
      where: { id: userId },
      select: { platformRole: true, status: true },
    });

    if (platformUser?.platformRole === "SUPER_ADMIN" && platformUser.status === "ACTIVE") {
      return true;
    }
  } catch {
    // Continue to check general User table
  }

  try {
    const erpUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, platformRole: true, isActive: true },
    });

    if (
      erpUser?.isActive &&
      (erpUser.role === "SUPER_ADMIN" || erpUser.platformRole === "SUPER_ADMIN")
    ) {
      return true;
    }
  } catch {
    // Ignore error
  }

  return false;
}
