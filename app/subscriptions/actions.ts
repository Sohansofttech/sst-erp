"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/super-admin/prisma";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { getSubscriptionEnd } from "@/lib/billing/subscription-period";
import { hasBillingDocumentColumns, hasStudentLimitColumn } from "@/lib/subscriptions/management-data";
import type { ActionResult } from "@/lib/subscriptions/management-types";
import { describeInstitutionType, isPlanCompatible } from "@/lib/institution-type-config";

const optionalLimit = z.number().int().min(1).max(100000000).nullable();
const planSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500),
  price: z.number().min(0).max(100000000).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, "Price must have at most two decimal places."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  customCycleDays: z.number().int().min(1).max(3650).nullable(),
  studentLimit: optionalLimit,
  storageLimitMb: optionalLimit,
  institutionTypes: z.array(z.enum(["COLLEGE", "SCHOOL", "ACADEMY"])).max(3),
  isActive: z.boolean(),
  features: z.array(z.object({ featureId: z.string().uuid(), enabled: z.boolean(), limitValue: z.number().int().min(0).max(100000000).nullable() })).max(500),
}).refine((plan) => plan.billingCycle !== "CUSTOM" || plan.customCycleDays !== null, { message: "Custom billing requires a duration in days." })
  .refine((plan) => new Set(plan.features.map((feature) => feature.featureId)).size === plan.features.length, { message: "Features must not be duplicated." });

function failure(error: unknown): ActionResult {
  if (error instanceof z.ZodError) return { success: false, message: error.issues[0]?.message ?? "Invalid input." };
  if (error instanceof Error && error.message.startsWith("Super Admin access is required")) return { success: false, message: "Super Admin access is required." };
  if (error instanceof ManagementError) return { success: false, message: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { success: false, message: "A record with that code already exists." };
  console.error("[SubscriptionCenter] Management action failed", error);
  return { success: false, message: "The operation could not be completed. Please try again or contact an administrator." };
}

class ManagementError extends Error {}

function refresh() {
  revalidatePath("/subscriptions", "layout");
  revalidatePath("/super-admin");
  revalidatePath("/admin/subscriptions");
}

export async function saveSubscriptionPlan(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    const plan = planSchema.parse(input);
    const studentLimitAvailable = await hasStudentLimitColumn();
    if (!studentLimitAvailable && plan.studentLimit !== null) throw new ManagementError("The student limit database migration must be applied first.");
    await prisma.$transaction(async (tx) => {
      if (plan.id) {
        await tx.$queryRaw`SELECT id FROM "SubscriptionPlan" WHERE id = ${plan.id}::uuid FOR UPDATE`;
      }
      const featureCount = await tx.platformFeature.count({ where: { id: { in: plan.features.map((feature) => feature.featureId) } } });
      if (featureCount !== plan.features.length) throw new ManagementError("One or more selected features no longer exist.");
      const previous = plan.id ? await tx.subscriptionPlan.findFirst({
        where: { id: plan.id, archivedAt: null },
        select: { id: true, price: true, currency: true, billingCycle: true, customCycleDays: true, storageLimitMb: true,
          ...(studentLimitAvailable ? { studentLimit: true } : {}), _count: { select: { subscriptions: true } } },
      }) : null;
      if (plan.id && !previous) throw new ManagementError("Plan not found or archived.");
      const previousStudentLimit = previous && "studentLimit" in previous ? previous.studentLimit : null;
      if (previous && previous._count.subscriptions > 0 && (
        Number(previous.price) !== plan.price || previous.currency !== plan.currency ||
        previous.billingCycle !== plan.billingCycle || previous.customCycleDays !== (plan.billingCycle === "CUSTOM" ? plan.customCycleDays : null) ||
        Number(previous.storageLimitMb ?? 0) !== (plan.storageLimitMb ?? 0) ||
        (studentLimitAvailable && previousStudentLimit !== plan.studentLimit)
      )) throw new ManagementError("This plan has subscriptions. Create a new plan to change its price, duration or limits.");
      if (previous && !plan.isActive) {
        const now = new Date();
        const inUse = await tx.institutionSubscription.findFirst({ where: {
          planId: previous.id, status: { in: ["ACTIVE", "TRIALING"] },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        }, select: { id: true } });
        if (inUse) throw new ManagementError("This plan has active subscriptions and cannot be disabled.");
      }
      const data = {
        code: plan.code, name: plan.name, description: plan.description || null, price: plan.price, currency: plan.currency,
        billingCycle: plan.billingCycle, customCycleDays: plan.billingCycle === "CUSTOM" ? plan.customCycleDays : null,
        institutionTypes: plan.institutionTypes,
        storageLimitMb: plan.storageLimitMb === null ? null : BigInt(plan.storageLimitMb),
        ...(studentLimitAvailable ? { studentLimit: plan.studentLimit } : {}), isActive: plan.isActive,
      };
      const saved = plan.id
        ? await tx.subscriptionPlan.update({ where: { id: plan.id }, data, select: { id: true } })
        : await tx.subscriptionPlan.create({ data: { ...data, createdById: actor.id }, select: { id: true } });
      await tx.planFeature.deleteMany({ where: { planId: saved.id } });
      if (plan.features.length) await tx.planFeature.createMany({ data: plan.features.map((feature) => ({ ...feature, planId: saved.id })) });
      await tx.platformAuditLog.create({ data: { userId: actor.id, action: plan.id ? "SUBSCRIPTION_PLAN_UPDATED" : "SUBSCRIPTION_PLAN_CREATED", entity: "SubscriptionPlan", entityId: saved.id, result: "SUCCESS" } });
    });
    refresh();
    return { success: true, message: "Plan saved." };
  } catch (error) { return failure(error); }
}

const subscriptionSchema = z.object({
  institutionId: z.string().uuid(),
  subscriptionId: z.string().uuid().nullable(),
  action: z.enum(["assign", "renew", "extend", "activate", "suspend", "cancel"]),
  planId: z.string().uuid().optional(),
  days: z.number().int().min(1).max(3650).optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function manageInstitutionSubscription(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    const command = subscriptionSchema.parse(input);
    await prisma.$transaction(async (tx) => {
      const institutions = await tx.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>`
        SELECT id, "archivedAt" FROM "Institution" WHERE id = ${command.institutionId}::uuid FOR UPDATE
      `;
      if (!institutions.length || institutions[0].archivedAt) throw new ManagementError("Institution not found or archived.");
      const now = new Date();
      const current = command.subscriptionId ? await tx.institutionSubscription.findFirst({
        where: { id: command.subscriptionId, institutionId: command.institutionId },
        include: { plan: { select: { price: true, billingCycle: true, customCycleDays: true } } },
      }) : null;
      if (command.action !== "assign" && !current) throw new ManagementError("Subscription not found. Refresh the page.");
      if (command.action === "assign") {
        if (!command.planId) throw new ManagementError("Select an active plan.");
        await tx.$queryRaw`SELECT id FROM "SubscriptionPlan" WHERE id = ${command.planId}::uuid FOR UPDATE`;
        const plan = await tx.subscriptionPlan.findFirst({
          where: { id: command.planId, isActive: true, archivedAt: null },
          select: { id: true, name: true, price: true, currency: true, billingCycle: true, customCycleDays: true, institutionTypes: true },
        });
        if (!plan) throw new ManagementError("Select an active plan.");
        const institution = await tx.platformInstitution.findUnique({
          where: { id: command.institutionId },
          select: { id: true, name: true, type: true },
        });
        if (!institution) throw new ManagementError("Institution not found.");
        if (!isPlanCompatible(plan.institutionTypes, institution.type)) {
          throw new ManagementError(`This plan is not available for ${describeInstitutionType(institution.type)} institutions.`);
        }
        const legacyInstitution = await tx.institution.findUnique({
          where: { id: command.institutionId },
          select: { id: true },
        });
        if (!legacyInstitution) {
          throw new ManagementError("This institution is not linked to the ERP tenant records. Reconcile it before assigning a plan.");
        }
        const open = await tx.institutionSubscription.findMany({
          where: { institutionId: command.institutionId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "SUSPENDED"] },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          select: { id: true, status: true, planId: true },
        });
        if (open.some((item) => item.status === "PAST_DUE")) throw new ManagementError("This institution already has a pending subscription. Resolve it before assigning another.");
        if (open.some((item) => item.planId === plan.id && ["ACTIVE", "TRIALING"].includes(item.status))) throw new ManagementError("This plan is already assigned. Use renew or extend instead.");
        if (Number(plan.price) === 0 && open.length) {
          if (open.length !== 1 || open[0].id !== command.subscriptionId) throw new ManagementError("This institution has multiple or changed subscriptions. Refresh and resolve them before changing plans.");
          await tx.institutionSubscription.update({ where: { id: open[0].id }, data: { status: "CANCELED", cancelledAt: now } });
          await tx.subscriptionEvent.create({ data: { subscriptionId: open[0].id, actorId: actor.id, action: "REPLACED_BY_FREE_PLAN", details: { replacementPlanId: plan.id } } });
        }
        const status = Number(plan.price) === 0 ? "ACTIVE" : "PAST_DUE";
        const startsAt = command.startsAt ? new Date(`${command.startsAt}T00:00:00.000Z`) : now;
        if (Number.isNaN(startsAt.getTime())) throw new ManagementError("Enter a valid subscription start date.");
        if (startsAt < new Date(now.getTime() - 86400000)) throw new ManagementError("The subscription start date cannot be in the past.");
        let endsAt: Date | null = null;
        if (status === "ACTIVE") {
          endsAt = command.endsAt ? new Date(`${command.endsAt}T23:59:59.999Z`) : getSubscriptionEnd(startsAt, plan);
          if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
            throw new ManagementError("Expiry date must be after the subscription start date.");
          }
        }
        const created = await tx.institutionSubscription.create({ data: { institutionId: command.institutionId, planId: plan.id, createdById: actor.id, status, startsAt, endsAt, renewsAt: endsAt }, select: { id: true } });
        await tx.subscriptionEvent.create({ data: { subscriptionId: created.id, actorId: actor.id, action: status === "ACTIVE" ? "ASSIGNED_FREE" : "ASSIGNED_PENDING_PAYMENT", details: { planId: plan.id, status } } });
        await tx.platformAuditLog.create({ data: { userId: actor.id, institutionId: command.institutionId, action: "SUBSCRIPTION_ASSIGNED", entity: "InstitutionSubscription", entityId: created.id, result: "SUCCESS", metadata: { status } } });
        const recipients = await tx.user.findMany({
          where: {
            institutionId: command.institutionId,
            role: { in: ["ADMIN", "INSTITUTION_ADMIN"] },
            isActive: true,
          },
          select: { id: true },
        });
        if (!recipients.length) {
          throw new ManagementError("No active Institution Admin is linked to this institution. Provision or activate an administrator before assigning the plan.");
        }
        const notification = await tx.notification.create({
          data: {
            institutionId: command.institutionId,
            title: "New Subscription Plan Assigned",
            message: `Your institution (${institution.name}) has been assigned the ${plan.name} subscription plan by the Super Admin. Status: ${status}. Start date: ${startsAt.toISOString().slice(0, 10)}. Expiry date: ${endsAt?.toISOString().slice(0, 10) ?? "Set after verified payment"}. Price: ${plan.currency} ${Number(plan.price).toFixed(2)}. Please review your subscription details.`,
            category: "SYSTEM",
            audienceRole: "ALL",
          },
          select: { id: true },
        });
        await tx.notificationRecipient.createMany({
          data: recipients.map((recipient) => ({
            notificationId: notification.id,
            userId: recipient.id,
            isRead: false,
          })),
        });
        return;
      }
      if (!current) throw new ManagementError("Subscription not found.");
      await tx.$queryRaw`SELECT id FROM "SubscriptionPlan" WHERE id = ${current.planId}::uuid FOR UPDATE`;
      const currentPlan = await tx.subscriptionPlan.findUnique({
        where: { id: current.planId }, select: { isActive: true, archivedAt: true },
      });
      const ensureNoOverlap = async (startsAt: Date, endsAt: Date) => {
        const other = await tx.institutionSubscription.findFirst({ where: {
          institutionId: command.institutionId, id: { not: current.id }, status: { in: ["ACTIVE", "TRIALING"] },
          startsAt: { lt: endsAt }, OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
        }, select: { id: true } });
        if (other) throw new ManagementError("This period overlaps another active or scheduled subscription.");
      };
      let data: Prisma.InstitutionSubscriptionUpdateInput;
      if (command.action === "renew") {
        if (!currentPlan?.isActive || currentPlan.archivedAt) throw new ManagementError("The assigned plan is unavailable. Select an active plan instead.");
        if (Number(current.plan.price) > 0) throw new ManagementError("Paid plans must be renewed through the institution checkout after verified payment.");
        if (current.status === "CANCELED" || current.status === "SUSPENDED") throw new ManagementError("Canceled or suspended subscriptions cannot be renewed.");
        const base = current.endsAt && current.endsAt > now ? current.endsAt : now;
        const endsAt = getSubscriptionEnd(base, current.plan);
        await ensureNoOverlap(now, endsAt);
        data = { status: "ACTIVE", endsAt, renewsAt: endsAt, cancelledAt: null };
      } else if (command.action === "extend") {
        if (!command.days || !current.endsAt || current.endsAt <= now || !["ACTIVE", "TRIALING", "SUSPENDED"].includes(current.status)) throw new ManagementError("Only a current subscription with an expiry date can be extended.");
        const endsAt = new Date(current.endsAt.getTime() + command.days * 86400000);
        await ensureNoOverlap(now, endsAt);
        data = { endsAt, renewsAt: endsAt };
      } else if (command.action === "activate") {
        if (!currentPlan?.isActive || currentPlan.archivedAt) throw new ManagementError("The assigned plan is unavailable. Select an active plan instead.");
        if (current.status === "CANCELED" || current.status === "ACTIVE" || !current.endsAt || current.endsAt <= now || current.startsAt > now) throw new ManagementError("This subscription cannot be activated. Check its status and dates.");
        await ensureNoOverlap(now, current.endsAt);
        if (Number(current.plan.price) > 0) {
          const paid = await tx.invoice.findFirst({ where: { subscriptionId: current.id, status: "PAID", payments: { some: { status: "SUCCEEDED" } } }, select: { id: true } });
          if (!paid) throw new ManagementError("Paid subscriptions require a verified payment before activation.");
        }
        data = { status: "ACTIVE", cancelledAt: null };
      } else if (command.action === "suspend") {
        if (!["ACTIVE", "TRIALING"].includes(current.status)) throw new ManagementError("Only active or trial subscriptions can be suspended.");
        data = { status: "SUSPENDED" };
      } else {
        if (current.status === "CANCELED") throw new ManagementError("This subscription is already canceled.");
        data = { status: "CANCELED", cancelledAt: now };
      }
      const updated = await tx.institutionSubscription.update({ where: { id: current.id }, data, select: { endsAt: true, status: true } });
      const details = { previousStatus: current.status, status: updated.status, previousEnd: current.endsAt?.toISOString() ?? null, endsAt: updated.endsAt?.toISOString() ?? null };
      await tx.subscriptionEvent.create({ data: { subscriptionId: current.id, actorId: actor.id, action: command.action.toUpperCase(), details } });
      await tx.platformAuditLog.create({ data: { userId: actor.id, institutionId: command.institutionId, action: `SUBSCRIPTION_${command.action.toUpperCase()}`, entity: "InstitutionSubscription", entityId: current.id, result: "SUCCESS", metadata: details } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    refresh();
    return { success: true, message: command.action === "assign" ? "Plan assigned. Paid plans remain pending until payment is verified." : "Subscription updated." };
  } catch (error) { return failure(error); }
}

export async function reconcileLegacyInstitution(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    const institutionId = z.object({ institutionId: z.string().uuid() }).parse(input).institutionId;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM institutions WHERE id = ${institutionId}::uuid FOR UPDATE`;
      const legacy = await tx.institution.findUnique({
        where: { id: institutionId },
        select: {
          id: true, name: true, code: true, slug: true, type: true, status: true,
          email: true, phone: true, address: true, city: true, state: true,
          country: true, website: true,
        },
      });
      if (!legacy) throw new ManagementError("ERP institution not found. Refresh the page.");
      const existing = await tx.platformInstitution.findUnique({ where: { id: institutionId }, select: { id: true } });
      if (existing) return;
      if (!legacy.slug) {
        throw new ManagementError("This ERP institution has no slug. Add a stable slug to the institution record before linking billing.");
      }
      const conflicts = await tx.platformInstitution.findFirst({
        where: {
          id: { not: institutionId },
          OR: [
            { slug: legacy.slug },
            ...(legacy.code ? [{ code: legacy.code }] : []),
          ],
        },
        select: { id: true },
      });
      if (conflicts) {
        throw new ManagementError("A different platform institution already uses this institution's code or slug. Reconcile the records manually before linking.");
      }
      await tx.platformInstitution.create({
        data: {
          id: legacy.id,
          name: legacy.name,
          code: legacy.code,
          slug: legacy.slug,
          type: legacy.type,
          status: legacy.status,
          email: legacy.email,
          phone: legacy.phone,
          address: legacy.address,
          city: legacy.city,
          state: legacy.state,
          country: legacy.country,
          website: legacy.website,
        },
      });
      await tx.platformAuditLog.create({
        data: {
          userId: actor.id,
          institutionId,
          action: "INSTITUTION_BILLING_LINKED",
          entity: "Institution",
          entityId: institutionId,
          result: "SUCCESS",
          metadata: { source: "ERP_IDENTITY", slug: legacy.slug },
        },
      });
    });
    refresh();
    return { success: true, message: "Institution billing profile linked using the existing ERP institution ID." };
  } catch (error) { return failure(error); }
}

export async function getInstitutionHistory(institutionId: string) {
  await requireSuperAdmin();
  const id = z.string().uuid().parse(institutionId);
  const [subscriptions, invoices, documentsAvailable] = await Promise.all([
    prisma.institutionSubscription.findMany({ where: { institutionId: id }, orderBy: { createdAt: "desc" },
      select: { id: true, status: true, startsAt: true, endsAt: true, plan: { select: { name: true } },
        events: { orderBy: { createdAt: "desc" }, select: { id: true, action: true, createdAt: true } } } }),
    prisma.invoice.findMany({ where: { institutionId: id }, orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true, status: true, total: true, currency: true, issuedAt: true,
        payments: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, amount: true, currency: true, paidAt: true, createdAt: true, providerReference: true } } } }),
    hasBillingDocumentColumns(),
  ]);
  return {
    documentsAvailable,
    subscriptions: subscriptions.map((item) => ({ ...item, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt?.toISOString() ?? null, events: item.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })) })),
    invoices: invoices.map((item) => ({ ...item, total: Number(item.total), issuedAt: item.issuedAt?.toISOString() ?? null, payments: item.payments.map((payment) => ({ ...payment, amount: Number(payment.amount), paidAt: payment.paidAt?.toISOString() ?? null, createdAt: payment.createdAt.toISOString() })) })),
  };
}
