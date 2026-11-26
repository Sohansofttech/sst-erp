import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BillingIntegrationError, verifyWebhookSignature } from "@/lib/billing/razorpay";
import {
  markSubscriptionPaymentFailed,
  settleCapturedSubscriptionPayment,
} from "@/lib/billing/subscription-settlement";

const paymentEntitySchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  error_description: z.string().nullish(),
});

const webhookHeaderSchema = z.object({ event: z.string(), payload: z.unknown() });
const paymentPayloadSchema = z.object({
  payment: z.object({ entity: paymentEntitySchema }),
});

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  try {
    if (!verifyWebhookSignature(rawBody, req.headers.get("x-razorpay-signature"))) {
      return NextResponse.json({ success: false, error: "Invalid webhook signature." }, { status: 400 });
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid webhook payload." }, { status: 400 });
    }
    const header = webhookHeaderSchema.safeParse(decoded);
    if (!header.success) {
      return NextResponse.json({ success: false, error: "Invalid webhook payload." }, { status: 400 });
    }
    if (!["payment.captured", "payment.failed"].includes(header.data.event)) {
      return NextResponse.json({ success: true, ignored: true });
    }
    const parsed = paymentPayloadSchema.safeParse(header.data.payload);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid payment webhook payload." }, { status: 400 });
    }
    const payment = parsed.data.payment.entity;

    if (header.data.event === "payment.captured") {
      await settleCapturedSubscriptionPayment({
        orderId: payment.order_id,
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
      });
    } else {
      await markSubscriptionPaymentFailed(payment.order_id, payment.error_description ?? null);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof BillingIntegrationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[RazorpayWebhook] Processing failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ success: false, error: "Could not process Razorpay webhook." }, { status: 500 });
  }
}
