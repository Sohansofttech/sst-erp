import "server-only";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { BillingIntegrationError } from "@/lib/billing/razorpay";
import {
  FREE_TRIAL_PLAN_CODE,
  getFreeTrialEnd,
  getSubscriptionEnd,
  InvalidBillingCycleError,
} from "@/lib/billing/subscription-period";
import type { SubscriptionPlanCycle } from "@/lib/billing/subscription-period";
export { getSubscriptionEnd } from "@/lib/billing/subscription-period";

export async function applySubscriptionPurchase(
  tx: Prisma.TransactionClient,
  input: {
    institutionId: string;
    invoiceId: string;
    planId: string;
    renewalSubscriptionId: string | null;
    cycle?: SubscriptionPlanCycle;
    paymentId: string | null;
    paidAt: Date;
  },
) {
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${input.institutionId}::uuid FOR UPDATE`;
  const plan = await tx.subscriptionPlan.findUnique({
    where: { id: input.planId },
    select: { id: true, name: true, code: true, billingCycle: true, customCycleDays: true },
  });
  if (!plan) {
    throw new BillingIntegrationError("The subscription plan no longer exists.", 409, "PLAN_NOT_FOUND");
  }
  const cycle = input.cycle ?? plan;
  const calculateEnd = (start: Date) =>
    plan.code === FREE_TRIAL_PLAN_CODE
      ? getFreeTrialEnd(start)
      : getSubscriptionEnd(start, cycle);

  let appliedPeriod: {
    subscriptionId: string;
    startsAt: Date;
    endsAt: Date;
    eventAction: string;
  } | null = null;
  if (input.renewalSubscriptionId) {
    const existing = await tx.institutionSubscription.findFirst({
      where: {
        id: input.renewalSubscriptionId,
        institutionId: input.institutionId,
        planId: input.planId,
      },
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (existing?.endsAt) {
      const startsAt = existing.endsAt > input.paidAt ? existing.endsAt : input.paidAt;
      let endsAt: Date;
      try {
        endsAt = calculateEnd(startsAt);
      } catch (error) {
        if (error instanceof InvalidBillingCycleError) {
          throw new BillingIntegrationError(error.message, 409, "INVALID_BILLING_CYCLE");
        }
        throw error;
      }
      const overlap = await tx.institutionSubscription.findFirst({
        where: {
          institutionId: input.institutionId, id: { not: existing.id }, status: { in: ["ACTIVE", "TRIALING"] },
          startsAt: { lt: endsAt }, OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
        },
        select: { id: true },
      });
      if (overlap) throw new BillingIntegrationError("The renewal overlaps another subscription.", 409, "SUBSCRIPTION_PERIOD_CONFLICT");
      await tx.institutionSubscription.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", endsAt, renewsAt: endsAt, cancelledAt: null },
      });
      appliedPeriod = {
        subscriptionId: existing.id,
        startsAt,
        endsAt,
        eventAction: "RENEWED",
      };
    }
  }

  if (!appliedPeriod) {
    const activeSubscriptions = await tx.institutionSubscription.findMany({
      where: {
        institutionId: input.institutionId,
        status: { in: ["ACTIVE", "TRIALING"] },
        OR: [{ endsAt: null }, { endsAt: { gt: input.paidAt } }],
      },
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (activeSubscriptions.some((subscription) => subscription.startsAt > input.paidAt && subscription.endsAt === null)) {
      throw new BillingIntegrationError("A scheduled subscription has no expiry and requires administrator review.", 409, "SUBSCRIPTION_PERIOD_CONFLICT");
    }
    for (const item of activeSubscriptions.filter((subscription) => subscription.endsAt === null)) {
      await tx.institutionSubscription.update({
        where: { id: item.id },
        data: { status: "CANCELED", cancelledAt: input.paidAt },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: item.id,
          action: "REPLACED_BY_PAID_PLAN",
          details: { replacementPlanId: input.planId, invoiceId: input.invoiceId },
        },
      });
    }
    const startsAt = activeSubscriptions.reduce(
      (latest, item) => item.endsAt && item.endsAt > latest ? item.endsAt : latest,
      input.paidAt,
    );
    let endsAt: Date;
    try {
      endsAt = calculateEnd(startsAt);
    } catch (error) {
      if (error instanceof InvalidBillingCycleError) {
        throw new BillingIntegrationError(error.message, 409, "INVALID_BILLING_CYCLE");
      }
      throw error;
    }
    const pending = await tx.institutionSubscription.findMany({
      where: { institutionId: input.institutionId, planId: input.planId, status: "PAST_DUE", endsAt: null },
      select: { id: true },
      take: 2,
    });
    if (pending.length > 1) {
      throw new BillingIntegrationError("Multiple pending assignments require administrator review.", 409, "DUPLICATE_PENDING_SUBSCRIPTIONS");
    }
    let subscription: { id: string };
    if (pending.length === 1) {
      const updated = await tx.institutionSubscription.updateMany({
        where: { id: pending[0].id, status: "PAST_DUE", endsAt: null },
        data: { status: "ACTIVE", startsAt, endsAt, renewsAt: endsAt, cancelledAt: null },
      });
      if (updated.count !== 1) throw new BillingIntegrationError("The pending assignment changed during payment settlement.", 409, "PENDING_SUBSCRIPTION_CONFLICT");
      subscription = pending[0];
    } else {
      subscription = await tx.institutionSubscription.create({
        data: {
          institutionId: input.institutionId,
          planId: input.planId,
          status: "ACTIVE",
          startsAt,
          endsAt,
          renewsAt: endsAt,
        },
        select: { id: true },
      });
    }
    appliedPeriod = {
      subscriptionId: subscription.id,
      startsAt,
      endsAt,
      eventAction: pending.length ? "ASSIGNMENT_PAID" : "PURCHASED",
    };
  }

  if (!appliedPeriod) {
    throw new BillingIntegrationError("The subscription period could not be calculated.", 409, "SUBSCRIPTION_PERIOD_FAILED");
  }
  const { subscriptionId, startsAt, endsAt, eventAction } = appliedPeriod;
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId,
      action: eventAction,
      details: {
        invoiceId: input.invoiceId,
        planId: input.planId,
        paymentId: input.paymentId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
    },
  });
  await tx.invoice.update({
    where: { id: input.invoiceId },
    data: { status: "PAID", paidAt: input.paidAt, subscriptionId },
  });

  return { subscriptionId, startsAt, endsAt };
}

export async function settleCapturedSubscriptionPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
}) {
  const payment = await tx.payment.findUnique({
    where: { providerOrderId: input.orderId },
    include: { invoice: true },
  });
  if (!payment || payment.provider !== "RAZORPAY_TEST") {
    throw new BillingIntegrationError("The payment order was not found.", 404, "PAYMENT_ORDER_NOT_FOUND");
  }
  if (payment.status === "SUCCEEDED") {
    if (payment.providerReference === input.paymentId) return { alreadyProcessed: true };
    throw new BillingIntegrationError("This order has already been settled with another payment.", 409, "ORDER_ALREADY_SETTLED");
  }
  if (
    Math.round(Number(payment.amount) * 100) !== input.amount ||
    payment.currency !== input.currency ||
    payment.invoice.currency !== input.currency ||
    Math.round(Number(payment.invoice.total) * 100) !== input.amount
  ) {
    throw new BillingIntegrationError("The payment amount or currency does not match the invoice.", 409, "PAYMENT_AMOUNT_MISMATCH");
  }

  const metadata = payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
    ? payment.metadata as Prisma.JsonObject
    : {};
  const planId = typeof metadata.planId === "string" ? metadata.planId : "";
  const billingCycle = (["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const).find(
    (cycle) => cycle === metadata.billingCycle,
  );
  const customCycleDays = typeof metadata.customCycleDays === "number" && Number.isInteger(metadata.customCycleDays)
    ? metadata.customCycleDays
    : null;
  const renewalSubscriptionId = typeof metadata.renewalSubscriptionId === "string"
    ? metadata.renewalSubscriptionId
    : null;
  if (!planId) {
    throw new BillingIntegrationError("The payment is missing its subscription plan reference.", 409, "PAYMENT_PLAN_MISSING");
  }

  const paidAt = new Date();
  const updated = await tx.payment.updateMany({
    where: { id: payment.id, status: { not: "SUCCEEDED" }, providerReference: null },
    data: {
      status: "SUCCEEDED",
      providerReference: input.paymentId,
      failureReason: null,
      paidAt,
    },
  });
  if (updated.count !== 1) {
    const current = await tx.payment.findUnique({ where: { id: payment.id }, select: { status: true, providerReference: true } });
    if (current?.status === "SUCCEEDED" && current.providerReference === input.paymentId) {
      return { alreadyProcessed: true };
    }
    throw new BillingIntegrationError("The payment order could not be settled.", 409, "PAYMENT_SETTLEMENT_CONFLICT");
  }

  const purchase = await applySubscriptionPurchase(tx, {
    institutionId: payment.invoice.institutionId,
    invoiceId: payment.invoiceId,
    planId,
    renewalSubscriptionId,
    ...(billingCycle ? { cycle: { billingCycle, customCycleDays } } : {}),
    paymentId: input.paymentId,
    paidAt,
  });
  return { alreadyProcessed: false, ...purchase };
}

export async function settleCapturedSubscriptionPayment(input: {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
}) {
  return db.$transaction((tx) => settleCapturedSubscriptionPaymentInTransaction(tx, input));
}

export async function markSubscriptionPaymentFailedInTransaction(
  tx: Prisma.TransactionClient,
  orderId: string,
  reason: string | null,
) {
  const result = await tx.payment.updateMany({
    where: { providerOrderId: orderId, provider: "RAZORPAY_TEST", status: "PENDING", providerReference: null },
    data: {
      status: "FAILED",
      failureReason: (reason || "Payment failed").slice(0, 300),
    },
  });
  return result.count;
}

export async function markSubscriptionPaymentFailed(orderId: string, reason: string | null) {
  return db.$transaction((tx) =>
    markSubscriptionPaymentFailedInTransaction(tx, orderId, reason),
  );
}
