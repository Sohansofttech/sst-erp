import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SUPPORT_ACCESS_COOKIE_NAME, verifySuperAdminSupportToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/super-admin/prisma";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = await verifySuperAdminSupportToken(
    cookieStore.get(SUPPORT_ACCESS_COOKIE_NAME)?.value || ""
  );
  if (token) {
    const superAdmin = await prisma.user.findUnique({
      where: { id: token.superAdminId },
      select: { id: true, role: true, platformRole: true, isActive: true, status: true },
    });
    if (
      !superAdmin ||
      !superAdmin.isActive ||
      superAdmin.status !== "ACTIVE" ||
      (superAdmin.role !== "SUPER_ADMIN" && superAdmin.platformRole !== "SUPER_ADMIN")
    ) {
      cookieStore.set(SUPPORT_ACCESS_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(0),
      });
      return NextResponse.redirect(new URL("/super-admin/institutions", req.url));
    }
    await prisma.$transaction(async (tx) => {
      const session = await tx.supportAccessSession.findUnique({
        where: { id: token.supportSessionId },
        select: { institutionId: true, requestedById: true, status: true },
      });
      if (
        session &&
        session.status === "ACTIVE" &&
        session.requestedById === superAdmin.id &&
        session.institutionId === token.institutionId
      ) {
        await tx.supportAccessSession.update({
          where: { id: token.supportSessionId },
          data: { status: "REVOKED", endedAt: new Date() },
        });
        await tx.platformAuditLog.create({
          data: {
            userId: superAdmin.id,
            institutionId: token.institutionId,
            action: "SUPER_ADMIN_SUPPORT_ACCESS_EXITED",
            entity: "SupportAccessSession",
            entityId: token.supportSessionId,
            result: "SUCCESS",
          },
        });
      }
    });
  }
  cookieStore.set(SUPPORT_ACCESS_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return NextResponse.redirect(new URL("/super-admin/institutions", req.url));
}
