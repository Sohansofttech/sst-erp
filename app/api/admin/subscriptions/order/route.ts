import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { requireInstitutionAdminSession } from "@/lib/security/admin-auth";
import { BillingIntegrationError, createRazorpayOrder } from "@/lib/billing/razorpay";
import { applySubscriptionPurchase } from "@/lib/billing/subscription-settlement";

const requestSchema = z.object({
  planId: z.uuid(),
  renewalSubscriptionId: z.uuid().nullable().optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof BillingIntegrationError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  console.error("[SubscriptionBilling] Order creation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json({ success: false, error: "Could not start the subscription checkout." }, { status: 500 });
}

export async function POST(req: NextRequest) {
  let created: { invoiceId: string; paymentId: string; invoiceNumber: string } | null = null;
  try {
    const session = await requireInstitutionAdminSession(req);
    const institutionId = z.uuid().safeParse(session.institutionId);
    if (!institutionId.success) {
      return NextResponse.json({ success: false, error: "Your institution account is not linked to billing." }, { status: 403 });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }
    const input = requestSchema.safeParse(rawBody);
    if (!input.success) {
      return NextResponse.json({ success: false, error: "Select a valid subscription plan." }, { status: 400 });
    }

    const institution = await db.platformInstitution.findFirst({
      where: { id: institutionId.data, archivedAt: null, status: { not: "SUSPENDED" } },
      select: { id: true },
    });
    if (!institution) {
      return NextResponse.json({ success: false, error: "This institution is unavailable for subscription billing." }, { status: 403 });
    }

    const plan = await db.subscriptionPlan.findFirst({
      where: { id: input.data.planId, isActive: true, archivedAt: null },
      select: {
        id: true,
        name: true,
        billingCycle: true,
        customCycleDays: true,
        price: true,
        currency: true,
      },
    });
    if (!plan) {
      return NextResponse.json({ success: false, error: "The selected plan is unavailable." }, { status: 404 });
    }

    const renewalSubscriptionId = input.data.renewalSubscriptionId ?? null;
    if (renewalSubscriptionId) {
      const renewable = await db.institutionSubscription.findFirst({
        where: {
          id: renewalSubscriptionId,
          institutionId: institution.id,
          planId: plan.id,
          status: { in: ["ACTIVE", "EXPIRED", "PAST_DUE"] },
          endsAt: { not: null },
        },
        select: { id: true },
      });
      if (!renewable) {
        return NextResponse.json({ success: false, error: "The selected subscription cannot be renewed." }, { status: 409 });
      }
    }

    const now = new Date();
    const activeSubscriptions = await db.institutionSubscription.findMany({
      where: {
        institutionId: institution.id,
        status: { in: ["ACTIVE", "TRIALING"] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true, planId: true, endsAt: true },
    });
    if (
      !renewalSubscriptionId &&
      activeSubscriptions.some((subscription) => subscription.planId === plan.id)
    ) {
      return NextResponse.json(
        { success: false, error: "This plan is already active. Use its Renew action to extend the subscription." },
        { status: 409 },
      );
    }
    if (
      !renewalSubscriptionId &&
      activeSubscriptions.some((subscription) => subscription.endsAt === null)
    ) {
      return NextResponse.json(
        { success: false, error: "An administrator must end the current no-expiry subscription before another plan can start." },
        { status: 409 },
      );
    }

    const price = Number(plan.price);
    const currency = plan.currency.toUpperCase();
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ success: false, error: "This plan has an invalid price." }, { status: 409 });
    }
    if (currency !== "INR") {
      return NextResponse.json({ success: false, error: "Razorpay subscription checkout currently supports INR plans only." }, { status: 400 });
    }

    const invoiceNumber = `SST-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const description = `${plan.name} subscription (${plan.billingCycle.toLowerCase()})`;

    if (price === 0) {
      const subscription = await db.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            institutionId: institution.id,
            subscriptionId: renewalSubscriptionId,
            description,
            currency,
            subtotal: 0,
            tax: 0,
            total: 0,
            status: "PAID",
            issuedAt: now,
            paidAt: now,
          },
          select: { id: true },
        });
        return applySubscriptionPurchase(tx, {
          institutionId: institution.id,
          invoiceId: invoice.id,
          planId: plan.id,
          renewalSubscriptionId,
          cycle: { billingCycle: plan.billingCycle, customCycleDays: plan.customCycleDays },
          paymentId: null,
          paidAt: now,
        });
      });
      return NextResponse.json({
        success: true,
        data: { free: true, invoiceNumber, subscriptionId: subscription.subscriptionId },
      });
    }

    const amount = Math.round(price * 100);
    if (!Number.isSafeInteger(amount) || amount < 100) {
      return NextResponse.json({ success: false, error: "Razorpay requires a minimum subscription payment of INR 1.00." }, { status: 400 });
    }

    const saved = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          institutionId: institution.id,
          subscriptionId: renewalSubscriptionId,
          description,
          currency,
          subtotal: price,
          tax: 0,
          total: price,
          status: "ISSUED",
          issuedAt: now,
        },
        select: { id: true },
      });
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: price,
          currency,
          provider: "RAZORPAY_TEST",
          status: "PENDING",
          metadata: {
            planId: plan.id,
            renewalSubscriptionId,
            billingCycle: plan.billingCycle,
            customCycleDays: plan.customCycleDays,
          } satisfies Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      return { invoiceId: invoice.id, paymentId: payment.id };
    });
    created = { ...saved, invoiceNumber };

    const order = await createRazorpayOrder({
      amount,
      currency,
      receipt: invoiceNumber,
      notes: { invoice_id: saved.invoiceId, institution_id: institution.id },
    });

    await db.payment.update({
      where: { id: saved.paymentId },
      data: { providerOrderId: order.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        free: false,
        keyId: order.keyId,
        orderId: order.id,
        amount,
        currency,
        invoiceNumber,
        description,
      },
    });
  } catch (error) {
    if (created) {
      await db.$transaction([
        db.payment.updateMany({
          where: { id: created.paymentId, status: "PENDING", providerOrderId: null },
          data: { status: "FAILED", failureReason: "Razorpay order creation failed." },
        }),
        db.invoice.updateMany({
          where: { id: created.invoiceId, status: "ISSUED" },
          data: { status: "VOID" },
        }),
      ]).catch((cleanupError) => {
        console.error("[SubscriptionBilling] Failed to close an incomplete invoice", {
          name: cleanupError instanceof Error ? cleanupError.name : "UnknownError",
        });
      });
    }
    return errorResponse(error);
  }
}
