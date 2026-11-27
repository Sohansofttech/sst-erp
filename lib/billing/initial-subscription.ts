import { Prisma } from "@prisma/client";
import {
  FREE_TRIAL_PLAN_CODE,
  getFreeTrialEnd,
  getSubscriptionEnd,
} from "@/lib/billing/subscription-period";
import { getInitialSubscriptionStatus } from "@/lib/billing/subscription-plan";

export async function createInitialInstitutionSubscription(
  tx: Prisma.TransactionClient,
  input: { institutionId: string; planId: string; actorId: string | null },
) {
  const plan = await tx.subscriptionPlan.findFirst({
    where: { id: input.planId, isActive: true, archivedAt: null },
    select: { id: true, code: true, price: true, billingCycle: true, customCycleDays: true },
  });
  if (!plan) throw new Error("Select an active subscription plan.");

  const existingSubscription = await tx.institutionSubscription.findFirst({
    where: {
      institutionId: input.institutionId,
      status: { in: ["ACTIVE", "TRIALING"] },
    },
    select: { id: true, planId: true, status: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (existingSubscription) {
    return {
      planId: existingSubscription.planId,
      status: existingSubscription.status,
      subscriptionId: existingSubscription.id,
    };
  }

  if (plan.code === FREE_TRIAL_PLAN_CODE) {
    const previousTrial = await tx.institutionSubscription.findFirst({
      where: {
        institutionId: input.institutionId,
        plan: { is: { code: FREE_TRIAL_PLAN_CODE } },
      },
      select: { id: true, planId: true, status: true },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    if (previousTrial) {
      return {
        planId: previousTrial.planId,
        status: previousTrial.status,
        subscriptionId: previousTrial.id,
      };
    }
  }

  const startsAt = new Date();
  const status = getInitialSubscriptionStatus(Number(plan.price));
  const endsAt =
    status === "ACTIVE"
      ? plan.code === FREE_TRIAL_PLAN_CODE
        ? getFreeTrialEnd(startsAt)
        : getSubscriptionEnd(startsAt, plan)
      : null;
  const subscription = await tx.institutionSubscription.create({
    data: {
      institutionId: input.institutionId,
      planId: plan.id,
      createdById: input.actorId,
      status,
      startsAt,
      endsAt,
      renewsAt: endsAt,
    },
  });
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      actorId: input.actorId,
      action: status === "ACTIVE" ? "ASSIGNED_FREE" : "ASSIGNED_PENDING_PAYMENT",
      details: { planId: plan.id, status },
    },
  });

  return { planId: plan.id, status, subscriptionId: subscription.id };
}
