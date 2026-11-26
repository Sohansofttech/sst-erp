import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { requireInstitutionAdminSession } from "@/lib/security/admin-auth";
import {
  BillingIntegrationError,
  fetchRazorpayPayment,
  verifyCheckoutSignature,
} from "@/lib/billing/razorpay";
import { settleCapturedSubscriptionPayment } from "@/lib/billing/subscription-settlement";

const requestSchema = z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  signature: z.string().regex(/^[\da-f]{64}$/i),
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
  console.error("[SubscriptionBilling] Payment verification failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json({ success: false, error: "Could not verify the subscription payment." }, { status: 500 });
}

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ success: false, error: "Invalid payment verification details." }, { status: 400 });
    }

    const payment = await db.payment.findUnique({
      where: { providerOrderId: input.data.orderId },
      include: { invoice: { select: { institutionId: true, total: true, currency: true } } },
    });
    if (!payment || payment.provider !== "RAZORPAY_TEST" || payment.invoice.institutionId !== institutionId.data) {
      return NextResponse.json({ success: false, error: "The payment order was not found." }, { status: 404 });
    }
    if (!verifyCheckoutSignature(input.data.orderId, input.data.paymentId, input.data.signature)) {
      return NextResponse.json({ success: false, error: "Razorpay payment signature is invalid." }, { status: 400 });
    }

    const providerPayment = await fetchRazorpayPayment(input.data.paymentId);
    const amount = Math.round(Number(payment.amount) * 100);
    if (
      providerPayment.id !== input.data.paymentId ||
      providerPayment.order_id !== input.data.orderId ||
      Number(providerPayment.amount) !== amount ||
      providerPayment.currency !== payment.currency ||
      payment.currency !== payment.invoice.currency
    ) {
      return NextResponse.json({ success: false, error: "The payment details do not match this invoice." }, { status: 409 });
    }
    if (providerPayment.status !== "captured" || providerPayment.captured !== true) {
      return NextResponse.json(
        { success: false, error: "Payment is not captured yet. It will be confirmed by Razorpay after capture." },
        { status: 409 },
      );
    }

    const result = await settleCapturedSubscriptionPayment({
      orderId: input.data.orderId,
      paymentId: input.data.paymentId,
      amount: Number(providerPayment.amount),
      currency: String(providerPayment.currency),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
