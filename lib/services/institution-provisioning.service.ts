import db from "@/lib/db";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/super-admin/prisma";
import { sendInstitutionInvitationEmail } from "@/lib/email/send-institution-email";
import { generateInvitationToken, hashInvitationToken, invitationBaseUrl } from "@/lib/services/institution-invitation.service";
import { syncInstitutionToAppDb } from "@/lib/services/institution-sync.service";

export { syncInstitutionToAppDb };

export interface ProvisionAdminInput {
  institutionId: string;
  adminName?: string;
  adminEmail?: string;
  adminPhone?: string;
  adminPassword?: string;
  password?: string;
  actorUserId?: string;
  resend?: boolean;
}

export interface ProvisionAdminResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status?: string;
    isActive?: boolean;
  };
  institution?: {
    id: string;
    name: string;
    code: string | null;
    slug: string;
  };
  invitationSent?: boolean;
  previewUrl?: string | false;
  invitationError?: string | null;
  invitation?: { status: string; expiresAt: Date; sent: boolean };
  error?: string;
}

export async function provisionInstitutionAdmin(
  input: ProvisionAdminInput,
  dependencies = { prisma, syncInstitutionToAppDb, sendInstitutionInvitationEmail, invitationBaseUrl },
): Promise<ProvisionAdminResult> {
  const { prisma, syncInstitutionToAppDb, sendInstitutionInvitationEmail, invitationBaseUrl } = dependencies;
  let invitationId = "";
  try {
    const institution = await prisma.platformInstitution.findUnique({
      where: { id: input.institutionId },
      select: { id: true, name: true, code: true, slug: true, email: true, phone: true, status: true, archivedAt: true },
    });
    if (!institution || institution.archivedAt) {
      return { success: false, error: "Institution not found or archived." };
    }
    if (institution.status === "SUSPENDED") {
      return { success: false, error: "Activate the institution before provisioning its administrator." };
    }

    const adminEmail = (input.adminEmail || institution.email || "").trim().toLowerCase();
    if (!adminEmail) return { success: false, error: "A primary administrator email is required." };
    const adminName = (input.adminName || `${institution.name} Administrator`).trim();
    const adminPhone = input.adminPhone?.trim() || null;
    if (!await syncInstitutionToAppDb(institution.id)) {
      throw new Error("Institution could not be synchronized into the application database.");
    }

    const adminPassword = input.adminPassword || input.password || crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const rawToken = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    let platformUserId = "";

    await prisma.$transaction(async (tx) => {
      await tx.platformInstitution.update({
        where: { id: institution.id },
        data: { provisioningStatus: "PROVISIONING" },
      });

      const existingPlatformUser = await tx.platformUser.findFirst({
        where: { email: { equals: adminEmail, mode: "insensitive" } },
      });
      if (existingPlatformUser) {
        const otherMembership = await tx.institutionMembership.findFirst({
          where: { userId: existingPlatformUser.id, institutionId: { not: institution.id } },
          select: { id: true },
        });
        if (otherMembership) throw new Error("This administrator email is already associated with another institution.");
        platformUserId = existingPlatformUser.id;
        await tx.platformUser.update({
          where: { id: platformUserId },
          data: { status: "ACTIVE" },
        });
      } else {
        platformUserId = crypto.randomUUID();
        await tx.platformUser.create({
          data: { id: platformUserId, name: adminName, email: adminEmail, phone: adminPhone, status: "ACTIVE", platformRole: "NONE" },
        });
      }

      let role = await tx.role.findUnique({
        where: { institutionId_code: { institutionId: institution.id, code: "INSTITUTION_ADMIN" } },
      });
      if (!role) {
        role = await tx.role.create({
          data: { institutionId: institution.id, name: "Institution Administrator", code: "INSTITUTION_ADMIN", description: "Primary administrator", isSystem: true },
        });
      }

      let membership = await tx.institutionMembership.findUnique({
        where: { userId_institutionId: { userId: platformUserId, institutionId: institution.id } },
      });
      if (membership) {
        membership = await tx.institutionMembership.update({
          where: { id: membership.id },
          data: { status: "ACTIVE", joinedAt: new Date() },
        });
      } else {
        membership = await tx.institutionMembership.create({
          data: { userId: platformUserId, institutionId: institution.id, status: "ACTIVE", joinedAt: new Date() },
        });
      }
      await tx.membershipRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
        create: { membershipId: membership.id, roleId: role.id, institutionId: institution.id },
        update: { institutionId: institution.id },
      });

      const existingAppUser = await tx.user.findFirst({
        where: { email: { equals: adminEmail, mode: "insensitive" } },
      });
      if (existingAppUser?.institutionId && existingAppUser.institutionId !== institution.id) {
        throw new Error("This administrator email is already associated with another institution.");
      }
      if (existingAppUser && existingAppUser.id !== platformUserId) {
        throw new Error("The administrator's platform and application accounts do not match.");
      }

      if (existingAppUser) {
        await tx.user.update({
          where: { id: existingAppUser.id },
          data: {
            institutionId: institution.id,
            name: existingAppUser.name ?? adminName,
            fullName: existingAppUser.fullName ?? adminName,
            phone: existingAppUser.phone ?? adminPhone,
            role: "ADMIN",
            status: "ACTIVE",
            isActive: true,
          },
        });
      } else {
        await tx.user.create({
          data: {
            id: platformUserId,
            institutionId: institution.id,
            email: adminEmail,
            name: adminName,
            fullName: adminName,
            phone: adminPhone,
            passwordHash: passwordHash,
            role: "ADMIN",
            status: "ACTIVE",
            isActive: true,
            platformRole: "NONE",
          },
        });
      }

      await tx.institutionAdminInvitation.updateMany({
        where: { institutionId: institution.id, status: { in: ["PENDING", "SENT"] } },
        data: { status: "REVOKED", revokedAt: new Date(), failedReason: "Superseded by direct provisioning." },
      });

      const invitation = await tx.institutionAdminInvitation.create({
        data: {
          institutionId: institution.id,
          platformUserId,
          email: adminEmail,
          tokenHash: hashInvitationToken(rawToken),
          status: "PENDING",
          expiresAt,
          attemptCount: 1,
          lastAttemptAt: new Date(),
        },
      });
      invitationId = invitation.id;

      await tx.platformInstitution.update({
        where: { id: institution.id },
        data: { primaryAdminUserId: platformUserId },
      });

      if (input.actorUserId) {
        await tx.platformAuditLog.create({
          data: {
            userId: input.actorUserId,
            institutionId: institution.id,
            action: "ADMIN_MEMBERSHIP_PROVISIONED",
            entity: "InstitutionAdminInvitation",
            entityId: invitation.id,
            result: "SUCCESS",
            metadata: { adminEmail, role: "INSTITUTION_ADMIN", activationRequired: false },
          },
        });
      }
    }, { maxWait: 15000, timeout: 20000 });

    const activationUrl = `${invitationBaseUrl()}/institution/activate?token=${encodeURIComponent(rawToken)}`;
    let emailSent = false;
    let emailReason: string | null = null;
    try {
      const emailResult = await sendInstitutionInvitationEmail({
        to: adminEmail,
        institutionId: institution.id,
        institutionName: institution.name,
        institutionCode: institution.code || institution.slug,
        administratorName: adminName,
        activationUrl,
        expiresAt,
      });
      emailSent = emailResult.sent;
      emailReason = emailResult.sent ? null : emailResult.reason;
    } catch (err: any) {
      console.warn("[InstitutionProvisioning] Invitation email error:", err?.message || err);
      emailReason = err?.message || "Email dispatch failed";
    }

    await prisma.$transaction(async (tx) => {
      await tx.institutionAdminInvitation.update({
        where: { id: invitationId },
        data: emailSent
          ? { status: "SENT", sentAt: new Date(), failedReason: null }
          : { status: "FAILED", failedReason: emailReason },
      });
      await tx.platformInstitution.update({
        where: { id: institution.id },
        data: { provisioningStatus: emailSent ? "INVITED" : "FAILED" },
      });
    });

    if (input.actorUserId) {
      try {
        await prisma.platformAuditLog.create({
          data: {
            userId: input.actorUserId,
            institutionId: institution.id,
            action: emailSent ? "ADMIN_INVITATION_SENT" : "ADMIN_INVITATION_FAILED",
            entity: "InstitutionAdminInvitation",
            entityId: invitationId,
            result: emailSent ? "SUCCESS" : "FAILED",
            metadata: emailSent ? { email: adminEmail } : { email: adminEmail, reason: emailReason },
          },
        });
      } catch {}
    }

    return {
      success: emailSent,
      user: {
        id: platformUserId,
        email: adminEmail,
        fullName: adminName,
        role: "ADMIN",
        status: "ACTIVE",
        isActive: true,
      },
      institution: {
        id: institution.id,
        name: institution.name,
        code: institution.code,
        slug: institution.slug,
      },
      invitationSent: emailSent,
      invitation: { status: emailSent ? "SENT" : "FAILED", expiresAt, sent: emailSent },
      invitationError: emailReason,
      ...(!emailSent ? { error: `Administrator account created, but invitation delivery failed: ${emailReason || "Email dispatch failed."}` } : {}),
    };
  } catch (error) {
    console.error("[InstitutionProvisioning] Failed:", error);
    if (invitationId) {
      try {
        await prisma.institutionAdminInvitation.updateMany({
          where: { id: invitationId, status: "PENDING" },
          data: { status: "FAILED", failedReason: "Provisioning did not complete; delivery status could not be confirmed." },
        });
      } catch {}
    }
    try {
      await prisma.platformInstitution.update({
        where: { id: input.institutionId },
        data: { provisioningStatus: "FAILED" },
      });
    } catch {}
    return { success: false, error: error instanceof Error ? error.message : "Failed to provision institution administrator." };
  }
}

/**
 * Scoped compensation for a failed administrator-provisioning operation.
 *
 * Removes ONLY the exact newly created institution and its app-database mirror so
 * a partial failure never leaves an unusable, half-provisioned institution behind.
 * It never touches any other institution, administrator, membership, or unrelated
 * record. Each step is independent and reports its own outcome so the caller can
 * surface incomplete cleanup instead of hiding it.
 *
 * Returns a structured result; it does not throw, so callers can report precisely
 * what was and was not cleaned up.
 */
export async function compensateFailedProvisioning(
  institutionId: string
): Promise<{ appRowRemoved: boolean; platformRemoved: boolean; errors: string[] }> {
  const errors: string[] = [];
  let appRowRemoved = false;
  let platformRemoved = false;

  // 1. Remove the app-database institution mirror (scoped to the exact id).
  try {
    await db.$executeRaw`DELETE FROM institutions WHERE id = ${institutionId}`;
    appRowRemoved = true;
  } catch (err: any) {
    errors.push(`app-db institution cleanup failed: ${err?.message || "unknown error"}`);
  }

  // 2. Remove the platform institution and its dependent records (scoped id).
  //    Cascades defined on the schema remove memberships/roles/subscriptions.
  try {
    await prisma.platformInstitution.delete({ where: { id: institutionId } });
    platformRemoved = true;
  } catch (err: any) {
    errors.push(`platform institution cleanup failed: ${err?.message || "unknown error"}`);
  }

  return { appRowRemoved, platformRemoved, errors };
}

export async function syncAllPlatformInstitutions(): Promise<{ synced: number; provisioned: number }> {
  let synced = 0;
  let provisioned = 0;
  const institutions = await prisma.platformInstitution.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, code: true, slug: true, email: true },
  });
  for (const institution of institutions) {
    if (await syncInstitutionToAppDb(institution.id)) synced++;
    const appAdmin = await prisma.user.findFirst({
      where: { institutionId: institution.id, role: "ADMIN" },
      select: { id: true },
    });
    if (!appAdmin) {
      const result = await provisionInstitutionAdmin({
        institutionId: institution.id,
        adminEmail: institution.email || undefined,
        adminName: `${institution.name} Administrator`,
      });
      if (result.success) provisioned++;
    }
  }
  return { synced, provisioned };
}

/**
 * Resends an account setup invitation to an Institution Administrator.
 * Generates a fresh single-use password setup token and dispatches an invitation email.
 */
export async function resendInstitutionAdminInvitation(
  institutionId: string,
  adminUserId?: string,
  actorUserId?: string
): Promise<{
  success: boolean;
  message: string;
  previewUrl?: string | false;
  email?: string;
}> {
  try {
    const instRows: any = await db.$queryRaw`
      SELECT id, name, slug FROM "Institution" WHERE id::text = ${institutionId} LIMIT 1
    `;
    const inst = instRows?.[0];

    const adminUser = await db.user.findFirst({
      where: {
        institutionId,
        role: "ADMIN",
        ...(adminUserId ? { id: adminUserId } : {}),
      },
      select: { id: true, email: true, fullName: true, name: true, passwordHash: true },
    });

    if (!adminUser) {
      return { success: false, message: "No institution admin found for this institution." };
    }

    const { signPasswordSetupToken } = await import("@/lib/auth/jwt");
    const { sendPasswordSetupInvitation } = await import("@/lib/services/email.service");

    const setupToken = await signPasswordSetupToken({
      userId: adminUser.id,
      email: adminUser.email,
      institutionId,
      passwordHash: adminUser.passwordHash || null,
    });

    const { getAppBaseUrl } = await import("@/lib/services/email.service");
    const appUrl = getAppBaseUrl();
    const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;

    const emailRes = await sendPasswordSetupInvitation(
      { email: adminUser.email, name: adminUser.fullName || adminUser.name || "Administrator" },
      {
        setupUrl,
        institutionName: inst?.name || "Campus Administration",
        expiresIn: "24 hours",
        loginUrl: `${appUrl}/admin`,
      }
    );

    try {
      const auditId = crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO audit_logs (
          "id", "institutionId", "userId", "actorUserId", "action", "entityType", "entityId", "newValuesJson", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        auditId,
        institutionId,
        adminUser.id,
        actorUserId || null,
        emailRes.success ? "INVITATION_RESENT" : "INVITATION_FAILED",
        "ADMIN_CREDENTIALS",
        adminUser.id,
        JSON.stringify({
          recipient: adminUser.email,
          previewUrl: emailRes.previewUrl || undefined,
          error: emailRes.error || undefined,
        })
      );
    } catch {}

    return {
      success: emailRes.success,
      message: emailRes.success
        ? `Invitation sent successfully to ${adminUser.email}.`
        : `Email delivery failed: ${emailRes.error || "Transport failure"}`,
      previewUrl: emailRes.previewUrl,
      email: adminUser.email,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to resend invitation." };
  }
}
