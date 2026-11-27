import assert from "node:assert/strict";
import dotenv from "dotenv";
import { hasSuperAdminRole } from "../lib/super-admin/authorization";
import { prisma } from "../lib/super-admin/prisma";
import { signSuperAdminSupportToken, verifySuperAdminSupportToken } from "../lib/auth/jwt";

dotenv.config();

const ROLLBACK = "ROLLBACK_TEST";

async function main() {
  const admin = await prisma.user.findFirst({
    where: { email: { equals: "kiran@junkitout.in", mode: "insensitive" } },
    select: { id: true, email: true },
  });
  assert(admin, "Super Admin account must exist");
  assert(await hasSuperAdminRole({ userId: admin.id, email: admin.email }), "Super Admin role must resolve from DB");

  const institution = await prisma.platformInstitution.findFirst({ where: { archivedAt: null }, select: { id: true } });
  assert(institution, "An institution is required");

  try {
    await prisma.$transaction(async (tx) => {
      const session = await tx.supportAccessSession.create({
        data: {
          institutionId: institution.id,
          requestedById: admin.id,
          reason: "support access test",
          allowedActions: ["READ_SUPPORT_CONTEXT"],
          status: "ACTIVE",
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await tx.platformAuditLog.create({
        data: {
          userId: admin.id,
          institutionId: institution.id,
          action: "SUPER_ADMIN_INSTITUTION_PORTAL_OPENED",
          entity: "SupportAccessSession",
          entityId: session.id,
          result: "SUCCESS",
        },
      });
      await tx.supportAccessSession.update({ where: { id: session.id }, data: { status: "REVOKED", endedAt: new Date() } });
      await tx.platformAuditLog.create({
        data: {
          userId: admin.id,
          institutionId: institution.id,
          action: "SUPER_ADMIN_SUPPORT_ACCESS_EXITED",
          entity: "SupportAccessSession",
          entityId: session.id,
          result: "SUCCESS",
        },
      });
      const revoked = await tx.supportAccessSession.findUnique({ where: { id: session.id } });
      assert.equal(revoked?.status, "REVOKED");
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
  }

  const expired = await signSuperAdminSupportToken({
    superAdminId: admin.id,
    institutionId: institution.id,
    supportSessionId: "00000000-0000-4000-8000-000000000000",
    expiresAt: Date.now() - 1000,
  });
  const decoded = await verifySuperAdminSupportToken(expired);
  assert(!decoded || decoded.expiresAt <= Date.now(), "Expired support tokens must not be usable");
  assert.equal(await verifySuperAdminSupportToken(expired + "x"), null, "Tampered tokens must be rejected");

  console.log("Super Admin support access checks passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
