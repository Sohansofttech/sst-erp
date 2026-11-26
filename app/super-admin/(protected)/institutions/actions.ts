"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/super-admin/prisma";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { assertSupportAccess, SUPPORT_WRITE } from "@/lib/security/support-access";
import { provisionInstitutionAdmin, syncInstitutionToAppDb } from "@/lib/services/institution-provisioning.service";

import { createInitialInstitutionSubscription } from "@/lib/billing/initial-subscription";
import { assignInstitutionTrial, FREE_TRIAL_PLAN_CODE } from "@/lib/services/subscription.service";
import {
  createDivision,
  updateDivision,
  deleteDivision,
} from "@/lib/services/division.service";
import { DivisionType, DivisionStatus } from "@prisma/client";

const institutionInput = z.object({
  planId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().max(40).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens for the slug.").max(80),
  type: z.enum(["SCHOOL", "COLLEGE", "OTHER"]),
  email: z.union([z.email(), z.literal("")]).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().min(2).max(80),
  website: z.union([z.url().refine((value) => value.startsWith("https://") || value.startsWith("http://")), z.literal("")]).optional(),
  adminName: z.string().trim().min(2).max(160).optional(),
  adminEmail: z.email().optional(),
  adminPassword: z.string().min(6).optional(),
  adminPhone: z.string().trim().max(40).optional(),
});

export type InstitutionFormState = { error: string | null; success: string | null };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readInput(formData: FormData) {
  return institutionInput.safeParse(Object.fromEntries(formData.entries()));
}

export async function createInstitution(_previous: InstitutionFormState, formData: FormData): Promise<InstitutionFormState> {
  const actor = await requireSuperAdmin();
  const parsed = readInput(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the institution details.", success: null };
  const data = parsed.data;
  if (!data.adminName || !data.adminEmail) {
    return { error: "Administrator name and email are required.", success: null };
  }

  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  if (!actor.developmentMode && !auditUserId) {
    return { error: "A valid Super Admin UUID is required for platform audit attribution.", success: null };
  }

  // Ensure unique College Code is assigned (generate if empty)
  let collegeCode = data.code?.trim().toUpperCase();
  if (!collegeCode) {
    const slugPrefix = data.slug.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "CC";
    const randNum = Math.floor(1000 + Math.random() * 9000);
    collegeCode = `CC-${slugPrefix}-${randNum}`;
  }

  let newSubscriptionStatus: string | null = null;
  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const institution = await tx.platformInstitution.create({
          data: {
            name: data.name,
            code: collegeCode,
            slug: data.slug,
            type: data.type,
            status: "ACTIVE",
            email: data.email || null,
            phone: data.phone || null,
            address: data.address || null,
            city: data.city || null,
            state: data.state || null,
            postalCode: data.postalCode || null,
            country: data.country,
            website: data.website || null,
          },
        });
        const selectedPlan = await tx.subscriptionPlan.findFirst({
          where: { id: data.planId, isActive: true, archivedAt: null },
          select: { id: true, code: true },
        });
        if (!selectedPlan) throw new Error("Select an active subscription plan.");

        let subscriptionAssignment: { planId: string; status: string };
        if (selectedPlan.code === FREE_TRIAL_PLAN_CODE) {
          const trialAssignment = await assignInstitutionTrial(tx, {
            institutionId: institution.id,
            createdById: auditUserId,
            startsAt: institution.createdAt,
          });
          subscriptionAssignment = {
            planId: trialAssignment.subscription.planId,
            status: trialAssignment.subscription.status,
          };
        } else {
          subscriptionAssignment = await createInitialInstitutionSubscription(tx, {
            institutionId: institution.id,
            planId: selectedPlan.id,
            actorId: auditUserId,
          });
        }

        // Initialize primary institution settings on first creation only.
        // If a primary is already configured (by a previous creation or an explicit
        // setPrimaryInstitution call), do not overwrite it — that would silently
        // reset a Super Admin's deliberate choice every time a new institution is added.
        const existingPrimaryId = await tx.platformSetting.findUnique({
          where: { key: "primary_institution_id" },
          select: { key: true },
        });
        if (!existingPrimaryId) {
          await tx.platformSetting.createMany({
            data: [
              {
                key: "primary_institution_id",
                value: institution.id,
                description: "Default active institution ID for public portal",
                updatedById: auditUserId,
              },
              {
                key: "primary_institution_name",
                value: institution.name,
                description: "Default active institution name for public portal",
                updatedById: auditUserId,
              },
            ],
            skipDuplicates: true,
          });
        }

        // Preserved transactional audit logging - failure here rolls back the transaction
        if (auditUserId) {
          await tx.platformAuditLog.create({
            data: {
              userId: auditUserId,
              institutionId: institution.id,
              action: "INSTITUTION_CREATED",
              entity: "Institution",
              entityId: institution.id,
              result: "SUCCESS",
              metadata: {
                slug: institution.slug,
                code: collegeCode,
                planId: subscriptionAssignment.planId,
                subscriptionStatus: subscriptionAssignment.status,
              },
            },
          });
        }
        return { institutionId: institution.id, status: subscriptionAssignment.status };
      },
      { maxWait: 15000, timeout: 20000 }
    );
    newSubscriptionStatus = created.status;

    if (created.institutionId) {
      await syncInstitutionToAppDb(created.institutionId);
      const adminName = data.adminName || formData.get("adminName")?.toString().trim() || `${data.name} Administrator`;
      const adminEmail = data.adminEmail || formData.get("adminEmail")?.toString().trim() || data.email || undefined;
      const adminPhone = data.adminPhone;
      const adminPassword = data.adminPassword || "Password@123";

      const provisionResult = await provisionInstitutionAdmin({
        institutionId: created.institutionId,
        adminName,
        adminEmail,
        adminPassword,
        adminPhone,
        actorUserId: auditUserId ?? undefined,
      });

      if (!provisionResult.success) {
        console.error("[SuperAdmin:createInstitution] Administrator provisioning failed:", provisionResult.error);
        return {
          error: `Institution created, but administrator provisioning failed: ${provisionResult.error || "Unknown error"}`,
          success: null,
        };
      }
    }
  } catch (error) {
    console.error("[SuperAdmin:createInstitution] Error creating institution:", error);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { error: "That institution code or slug is already in use.", success: null };
    }
    const message = error instanceof Error ? error.message : "The institution could not be saved. Check database connection and try again.";
    return { error: message, success: null };
  }
  try {
    revalidatePath("/super-admin");
    revalidatePath("/super-admin/institutions");
    revalidatePath("/subscriptions");
    revalidatePath("/subscriptions/institutions");
    revalidatePath("/login");
    revalidatePath("/");
  } catch {}
  const planNotice =
    newSubscriptionStatus === "TRIALING"
      ? "The 14-day free trial is active."
      : newSubscriptionStatus === "ACTIVE"
        ? "The selected free plan is active."
        : "The selected paid plan remains pending verified payment.";
  return { error: null, success: `Institution created successfully (College Code: ${collegeCode}) and administrator provisioned. ${planNotice}` };
}

export async function provisionAdminForInstitution(formData: FormData) {
  const actor = await requireSuperAdmin();
  const id = z.uuid().safeParse(formData.get("institutionId"));
  if (!id.success) throw new Error("Invalid institution ID.");
  await assertSupportAccess({ actorId: actor.id, institutionId: id.data, requiredAction: SUPPORT_WRITE, developmentMode: actor.developmentMode });

  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  const adminName = formData.get("adminName")?.toString().trim() || undefined;
  const adminEmail = formData.get("adminEmail")?.toString().trim() || undefined;
  const adminPhone = formData.get("adminPhone")?.toString().trim() || undefined;
  const adminPassword = formData.get("adminPassword")?.toString().trim() || undefined;

  const result = await provisionInstitutionAdmin({
    institutionId: id.data,
    adminName,
    adminEmail,
    adminPassword,
    adminPhone,
    actorUserId: auditUserId ?? undefined,
    resend: true,
  });

  if (!result.success) {
    throw new Error(result.error || "Failed to provision administrator.");
  }

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/institutions");
  revalidatePath(`/super-admin/institutions/${id.data}`);
}

export async function revokeInstitutionInvitation(formData: FormData) {
  const actor = await requireSuperAdmin();
  const id = z.uuid().safeParse(formData.get("institutionId"));
  if (!id.success) throw new Error("Invalid institution ID.");
  await assertSupportAccess({ actorId: actor.id, institutionId: id.data, requiredAction: SUPPORT_WRITE, developmentMode: actor.developmentMode });
  await prisma.$transaction(async (tx) => {
    await tx.institutionAdminInvitation.updateMany({
      where: { institutionId: id.data, status: { in: ["PENDING", "SENT", "FAILED"] } },
      data: { status: "REVOKED", revokedAt: new Date(), failedReason: "Revoked by Super Admin." },
    });
    await tx.platformInstitution.update({
      where: { id: id.data },
      data: { provisioningStatus: "FAILED" },
    });
    if (actor.id) {
      await tx.platformAuditLog.create({
        data: {
          userId: actor.id,
          institutionId: id.data,
          action: "INVITATION_REVOKED",
          entity: "InstitutionAdminInvitation",
          entityId: id.data,
          result: "SUCCESS",
        },
      });
    }
  });
  revalidatePath(`/super-admin/institutions/${id.data}`);
}

export async function editInstitution(_previous: InstitutionFormState, formData: FormData): Promise<InstitutionFormState> {
  const actor = await requireSuperAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = readInput(formData);
  if (!id.success) return { error: "Invalid institution.", success: null };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the institution details.", success: null };

  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  if (!actor.developmentMode && !auditUserId) {
    return { error: "A valid Super Admin UUID is required for platform audit attribution.", success: null };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.platformInstitution.update({ where: { id: id.data, archivedAt: null }, data: {
        name: parsed.data.name, code: parsed.data.code || null, slug: parsed.data.slug,
        type: parsed.data.type, email: parsed.data.email || null, phone: parsed.data.phone || null,
        address: parsed.data.address || null, city: parsed.data.city || null, state: parsed.data.state || null,
        postalCode: parsed.data.postalCode || null, country: parsed.data.country, website: parsed.data.website || null,
      } });
      try {
        await tx.institution.updateMany({
          where: { OR: [{ id: id.data }, { slug: parsed.data.slug }] },
          data: { name: parsed.data.name, slug: parsed.data.slug },
        });
      } catch {}

      // Keep platform setting name in sync if this institution is the primary active institution
      try {
        const currentPrimary = await tx.platformSetting.findUnique({
          where: { key: "primary_institution_id" },
        });
        if (currentPrimary?.value === id.data) {
          await tx.platformSetting.upsert({
            where: { key: "primary_institution_name" },
            create: {
              key: "primary_institution_name",
              value: parsed.data.name,
              description: "Default active institution name for public portal",
              updatedById: auditUserId,
            },
            update: {
              value: parsed.data.name,
              description: "Default active institution name for public portal",
              updatedById: auditUserId,
            },
          });
        }
      } catch {}
      await tx.platformAuditLog.create({ data: { userId: auditUserId, institutionId: id.data, action: "INSTITUTION_UPDATED", entity: "Institution", entityId: id.data, result: "SUCCESS" } });
    });
  } catch (error) {
    console.error("[SuperAdmin:editInstitution] Error updating institution:", error);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: "That institution code or slug is already in use.", success: null };
    const message = error instanceof Error ? error.message : "The institution could not be updated. Check the database and try again.";
    return { error: message, success: null };
  }
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/institutions");
  revalidatePath(`/super-admin/institutions/${id.data}`);
  revalidatePath("/login");
  revalidatePath("/");
  return { error: null, success: "Institution details updated." };
}

export async function setPrimaryInstitution(formData: FormData) {
  const actor = await requireSuperAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) throw new Error("Invalid institution ID.");

  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  const institution = await prisma.platformInstitution.findUnique({
    where: { id: id.data },
    select: { id: true, name: true, code: true, slug: true, status: true, archivedAt: true },
  });
  if (!institution || institution.archivedAt) throw new Error("Institution not found or archived.");

  await prisma.$transaction(async (tx) => {
    await tx.platformSetting.upsert({
      where: { key: "primary_institution_id" },
      create: {
        key: "primary_institution_id",
        value: institution.id,
        description: "Default active institution ID for public portal",
        updatedById: auditUserId,
      },
      update: {
        value: institution.id,
        description: "Default active institution ID for public portal",
        updatedById: auditUserId,
      },
    });
    await tx.platformSetting.upsert({
      where: { key: "primary_institution_name" },
      create: {
        key: "primary_institution_name",
        value: institution.name,
        description: "Default active institution name for public portal",
        updatedById: auditUserId,
      },
      update: {
        value: institution.name,
        description: "Default active institution name for public portal",
        updatedById: auditUserId,
      },
    });
    if (auditUserId) {
      await tx.platformAuditLog.create({
        data: {
          userId: auditUserId,
          institutionId: institution.id,
          action: "PRIMARY_INSTITUTION_SET",
          entity: "Institution",
          entityId: institution.id,
          result: "SUCCESS",
          metadata: { name: institution.name, code: institution.code },
        },
      });
    }
  });

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/institutions");
  revalidatePath(`/super-admin/institutions/${institution.id}`);
  revalidatePath("/login");
  revalidatePath("/");
}

export async function updateInstitutionStatus(formData: FormData) {
  const actor = await requireSuperAdmin();
  const parsed = z.object({ id: z.uuid(), status: z.enum(["ACTIVE", "SUSPENDED"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error("Invalid institution status request.");
  const institution = await prisma.platformInstitution.findUnique({ where: { id: parsed.data.id }, select: { id: true, status: true, archivedAt: true } });
  if (!institution || institution.archivedAt) throw new Error("Institution not found or archived.");

  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  await prisma.$transaction(async (tx) => {
    await tx.platformInstitution.update({ where: { id: institution.id }, data: { status: parsed.data.status } });
    await tx.platformAuditLog.create({ data: { userId: auditUserId, institutionId: institution.id, action: parsed.data.status === "ACTIVE" ? "INSTITUTION_ACTIVATED" : "INSTITUTION_SUSPENDED", entity: "Institution", entityId: institution.id, result: "SUCCESS", metadata: { previousStatus: institution.status, status: parsed.data.status } } });
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/institutions");
  revalidatePath(`/super-admin/institutions/${institution.id}`);
}

export async function archiveInstitution(formData: FormData) {
  const actor = await requireSuperAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) throw new Error("Invalid institution request.");
  const institution = await prisma.platformInstitution.findUnique({ where: { id: id.data }, select: { id: true, status: true, archivedAt: true } });
  if (!institution || institution.archivedAt) throw new Error("Institution not found or already archived.");

  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  await prisma.$transaction(async (tx) => {
    await tx.platformInstitution.update({ where: { id: institution.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await tx.platformAuditLog.create({ data: { userId: auditUserId, institutionId: institution.id, action: "INSTITUTION_ARCHIVED", entity: "Institution", entityId: institution.id, result: "SUCCESS", metadata: { previousStatus: institution.status } } });
  });
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/institutions");
}

export async function setInstitutionFeatureOverride(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = z.object({ institutionId: z.uuid(), featureId: z.uuid(), enabled: z.enum(["true", "false"]), reason: z.string().trim().min(5).max(500), expiresAt: z.string().optional() }).safeParse(Object.fromEntries(formData.entries()));
  if (!input.success) throw new Error("Provide a valid feature override and a reason.");
  const expiresAt = input.data.expiresAt ? new Date(`${input.data.expiresAt}T00:00:00.000Z`) : null;
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) throw new Error("Override expiry must be a future date.");
  await assertSupportAccess({ actorId: actor.id, institutionId: input.data.institutionId, requiredAction: SUPPORT_WRITE, developmentMode: actor.developmentMode });

  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  await prisma.$transaction(async (tx) => {
    await tx.institutionFeatureOverride.upsert({ where: { institutionId_featureId: { institutionId: input.data.institutionId, featureId: input.data.featureId } }, create: { institutionId: input.data.institutionId, featureId: input.data.featureId, enabled: input.data.enabled === "true", reason: input.data.reason, expiresAt }, update: { enabled: input.data.enabled === "true", reason: input.data.reason, expiresAt } });
    await tx.platformAuditLog.create({ data: { userId: auditUserId, institutionId: input.data.institutionId, action: "INSTITUTION_FEATURE_OVERRIDE_CHANGED", entity: "InstitutionFeatureOverride", entityId: input.data.featureId, result: "SUCCESS", metadata: { enabled: input.data.enabled === "true", expiresAt: expiresAt?.toISOString() ?? null, reason: input.data.reason } } });
  });
  revalidatePath(`/super-admin/institutions/${input.data.institutionId}`);
  revalidatePath("/super-admin/modules");
}

export async function createInstitutionDivision(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = z
    .object({
      institutionId: z.uuid(),
      name: z.string().trim().min(2).max(160),
      code: z.string().trim().max(40).optional(),
      slug: z.string().trim().toLowerCase().max(80).optional(),
      type: z.nativeEnum(DivisionType),
      description: z.string().trim().max(500).optional(),
      logoUrl: z.union([z.url(), z.literal("")]).optional(),
      brandColor: z.string().trim().max(20).optional(),
      isDefault: z.enum(["true", "false"]).optional(),
    })
    .safeParse(Object.fromEntries(formData.entries()));

  if (!input.success) {
    throw new Error(input.error.issues[0]?.message || "Invalid division data.");
  }

  const { institutionId, name, code, slug, type, description, logoUrl, brandColor, isDefault } = input.data;
  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  await assertSupportAccess({ actorId: actor.id, institutionId, requiredAction: SUPPORT_WRITE, developmentMode: actor.developmentMode });

  const division = await createDivision(institutionId, {
    name,
    code: code || undefined,
    slug: slug || undefined,
    type,
    description: description || null,
    logoUrl: logoUrl || null,
    academicSettings: brandColor ? { brandColor } : undefined,
    isDefault: isDefault === "true",
  });

  if (auditUserId) {
    await prisma.platformAuditLog.create({
      data: {
        userId: auditUserId,
        institutionId,
        action: "INSTITUTION_DIVISION_CREATED",
        entity: "InstitutionDivision",
        entityId: division.id,
        result: "SUCCESS",
        metadata: { name: division.name, code: division.code, type: division.type },
      },
    });
  }

  revalidatePath(`/super-admin/institutions/${institutionId}`);
}

export async function updateInstitutionDivisionStatus(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = z
    .object({
      institutionId: z.uuid(),
      divisionId: z.uuid(),
      status: z.nativeEnum(DivisionStatus),
    })
    .safeParse(Object.fromEntries(formData.entries()));

  if (!input.success) {
    throw new Error("Invalid division status update request.");
  }

  const { institutionId, divisionId, status } = input.data;
  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  await assertSupportAccess({ actorId: actor.id, institutionId, requiredAction: SUPPORT_WRITE, developmentMode: actor.developmentMode });

  const updated = await updateDivision(institutionId, divisionId, { status });

  if (auditUserId) {
    await prisma.platformAuditLog.create({
      data: {
        userId: auditUserId,
        institutionId,
        action: "INSTITUTION_DIVISION_STATUS_CHANGED",
        entity: "InstitutionDivision",
        entityId: divisionId,
        result: "SUCCESS",
        metadata: { status: updated.status, name: updated.name },
      },
    });
  }

  revalidatePath(`/super-admin/institutions/${institutionId}`);
}

export async function setDefaultInstitutionDivision(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = z
    .object({
      institutionId: z.uuid(),
      divisionId: z.uuid(),
    })
    .safeParse(Object.fromEntries(formData.entries()));

  if (!input.success) {
    throw new Error("Invalid default division request.");
  }

  const { institutionId, divisionId } = input.data;
  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  await assertSupportAccess({ actorId: actor.id, institutionId, requiredAction: SUPPORT_WRITE, developmentMode: actor.developmentMode });

  const updated = await updateDivision(institutionId, divisionId, { isDefault: true });

  if (auditUserId) {
    await prisma.platformAuditLog.create({
      data: {
        userId: auditUserId,
        institutionId,
        action: "INSTITUTION_DEFAULT_DIVISION_SET",
        entity: "InstitutionDivision",
        entityId: divisionId,
        result: "SUCCESS",
        metadata: { name: updated.name, code: updated.code },
      },
    });
  }

  revalidatePath(`/super-admin/institutions/${institutionId}`);
}

export async function archiveInstitutionDivision(formData: FormData) {
  const actor = await requireSuperAdmin();
  const input = z
    .object({
      institutionId: z.uuid(),
      divisionId: z.uuid(),
    })
    .safeParse(Object.fromEntries(formData.entries()));

  if (!input.success) {
    throw new Error("Invalid division archive request.");
  }

  const { institutionId, divisionId } = input.data;
  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  await assertSupportAccess({ actorId: actor.id, institutionId, requiredAction: SUPPORT_WRITE, developmentMode: actor.developmentMode });

  const result = await deleteDivision(institutionId, divisionId, { forceArchive: true });

  if (auditUserId) {
    await prisma.platformAuditLog.create({
      data: {
        userId: auditUserId,
        institutionId,
        action: "INSTITUTION_DIVISION_ARCHIVED",
        entity: "InstitutionDivision",
        entityId: divisionId,
        result: "SUCCESS",
        metadata: { resultAction: result.action },
      },
    });
  }

  revalidatePath(`/super-admin/institutions/${institutionId}`);
}
