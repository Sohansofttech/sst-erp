import { Prisma } from "@prisma/client";
import { getSubscriptionEnd } from "@/lib/billing/subscription-period";
import { getInitialSubscriptionStatus } from "@/lib/billing/subscription-plan";

export async function createInitialInstitutionSubscription(
  tx: Prisma.TransactionClient,
  input: { institutionId: string; planId: string; actorId: string | null },
) {
  const plan = await tx.subscriptionPlan.findFirst({
    where: { id: input.planId, isActive: true, archivedAt: null },
    select: { id: true, price: true, billingCycle: true, customCycleDays: true },
  });
  if (!plan) throw new Error("Select an active subscription plan.");

  const startsAt = new Date();
  const status = getInitialSubscriptionStatus(Number(plan.price));
  const endsAt = status === "ACTIVE" ? getSubscriptionEnd(startsAt, plan) : null;
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
