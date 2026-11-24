"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/super-admin/prisma";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { provisionInstitutionAdmin, syncInstitutionToAppDb } from "@/lib/services/institution-provisioning.service";
import { assignInstitutionTrial } from "@/lib/services/subscription.service";

const institutionInput = z.object({
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

  let newInstitutionId = "";
  try {
    await prisma.$transaction(
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
        newInstitutionId = institution.id;

        // Automatically assign 14-day complimentary free trial atomically with institution creation
        await assignInstitutionTrial(tx, {
          institutionId: institution.id,
          createdById: auditUserId,
          startsAt: institution.createdAt,
        });

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
              metadata: { slug: institution.slug, code: collegeCode },
            },
          });
        }
      },
      { maxWait: 15000, timeout: 20000 }
    );

    if (newInstitutionId) {
      await syncInstitutionToAppDb(newInstitutionId);
      const adminName = data.adminName || formData.get("adminName")?.toString().trim() || `${data.name} Administrator`;
      const adminEmail = data.adminEmail || formData.get("adminEmail")?.toString().trim() || data.email || undefined;
      const adminPhone = data.adminPhone;
      const adminPassword = data.adminPassword || "Password@123";

      const provisionResult = await provisionInstitutionAdmin({
        institutionId: newInstitutionId,
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
  } catch {}
  return { error: null, success: `Institution created successfully (College Code: ${collegeCode}) and administrator provisioned.` };
}

export async function provisionAdminForInstitution(formData: FormData) {
  const actor = await requireSuperAdmin();
  const id = z.uuid().safeParse(formData.get("institutionId"));
  if (!id.success) throw new Error("Invalid institution ID.");

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
  return { error: null, success: "Institution details updated." };
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

  const auditUserId = actor.id && UUID_REGEX.test(actor.id) ? actor.id : null;
  await prisma.$transaction(async (tx) => {
    await tx.institutionFeatureOverride.upsert({ where: { institutionId_featureId: { institutionId: input.data.institutionId, featureId: input.data.featureId } }, create: { institutionId: input.data.institutionId, featureId: input.data.featureId, enabled: input.data.enabled === "true", reason: input.data.reason, expiresAt }, update: { enabled: input.data.enabled === "true", reason: input.data.reason, expiresAt } });
    await tx.platformAuditLog.create({ data: { userId: auditUserId, institutionId: input.data.institutionId, action: "INSTITUTION_FEATURE_OVERRIDE_CHANGED", entity: "InstitutionFeatureOverride", entityId: input.data.featureId, result: "SUCCESS", metadata: { enabled: input.data.enabled === "true", expiresAt: expiresAt?.toISOString() ?? null, reason: input.data.reason } } });
  });
  revalidatePath(`/super-admin/institutions/${input.data.institutionId}`);
  revalidatePath("/super-admin/modules");
}
