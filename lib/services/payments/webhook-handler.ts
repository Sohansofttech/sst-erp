import { NextRequest, NextResponse } from "next/server";
import { PaymentGatewayService } from "@/lib/services/payment-gateway.service";
import { RazorpayAdapter } from "@/lib/services/payments/razorpay.adapter";
import { CashfreeAdapter } from "@/lib/services/payments/cashfree.adapter";
import db from "@/lib/db";
import { recordAudit } from "@/lib/services/audit.service";

export async function handlePaymentWebhook(req: NextRequest, token: string) {
  try {
    if (!token) {
      return NextResponse.json({ error: "Missing webhook token" }, { status: 400 });
    }

    // 1. Resolve institution and gateway config
    const resolved = await PaymentGatewayService.resolveGatewayByWebhookToken(token);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid webhook token or unknown gateway" }, { status: 404 });
    }

    const { institutionId, provider, config } = resolved;

    if (!config.isEnabled) {
      return NextResponse.json({ error: "Payment gateway is disabled" }, { status: 403 });
    }

    // 2. Read raw request body
    const rawBody = await req.text();
    if (!rawBody) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    // 3. Cryptographic signature verification
    const webhookSecret = config.webhookSecret;
    if (webhookSecret) {
      let isSignatureValid = false;

      if (provider === "RAZORPAY") {
        const signature = req.headers.get("x-razorpay-signature") || "";
        isSignatureValid = RazorpayAdapter.verifyWebhookSignature(rawBody, signature, webhookSecret);
      } else {
        const signature = req.headers.get("x-webhook-signature") || "";
        const timestamp = req.headers.get("x-webhook-timestamp") || "";
        isSignatureValid = CashfreeAdapter.verifyWebhookSignature(rawBody, signature, timestamp, webhookSecret);
      }

      if (!isSignatureValid) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    // 4. Parse payload
    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // 5. Extract event metadata & enforce idempotency
    let eventId = "";
    let eventType = "";
    let paymentId = "";
    let orderId = "";
    let amount = 0;
    let notes: Record<string, string> = {};

    if (provider === "RAZORPAY") {
      eventId = payload.event_id || `${payload.event}_${payload.created_at || Date.now()}`;
      eventType = payload.event || "";
      const paymentEntity = payload.payload?.payment?.entity;
      paymentId = paymentEntity?.id || "";
      orderId = paymentEntity?.order_id || "";
      amount = (paymentEntity?.amount || 0) / 100;
      notes = paymentEntity?.notes || {};
    } else {
      // Cashfree
      eventId = req.headers.get("x-request-id") || payload.data?.order?.order_id || `${payload.type}_${Date.now()}`;
      eventType = payload.type || "";
      paymentId = payload.data?.payment?.cf_payment_id || "";
      orderId = payload.data?.order?.order_id || "";
      amount = payload.data?.order?.order_amount || 0;
      notes = payload.data?.customer_details || {};
    }

    // Check idempotency
    const isNewEvent = await PaymentGatewayService.recordWebhookEvent(eventId, institutionId, provider);
    if (!isNewEvent) {
      return NextResponse.json({ status: "duplicate_ignored", eventId }, { status: 200 });
    }

    // 6. Process payment event
    const isSuccessEvent =
      eventType === "payment.captured" ||
      eventType === "order.paid" ||
      eventType === "PAYMENT_SUCCESS_WEBHOOK";

    if (isSuccessEvent && orderId) {
      // Find matching invoice by ID or transaction
      const invoiceId = notes.invoiceId;
      if (invoiceId) {
        const invoice = await db.feeInvoice.findUnique({
          where: { id: invoiceId },
        });

        if (invoice && invoice.institutionId === institutionId && invoice.outstandingAmount > 0) {
          const paymentAmount = Math.min(amount || invoice.outstandingAmount, invoice.outstandingAmount);
          const receiptNumber = `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

          await db.$transaction(async (tx) => {
            const existingPayment = await tx.feePayment.findFirst({
              where: {
                institutionId,
                transactionRef: paymentId || orderId,
              },
            });

            let paymentRecord = existingPayment;
            if (!paymentRecord) {
              paymentRecord = await tx.feePayment.create({
                data: {
                  institutionId,
                  invoiceId: invoice.id,
                  studentId: invoice.studentId,
                  amount: paymentAmount,
                  paymentMethod: provider,
                  transactionRef: paymentId || orderId,
                  gatewayOrderId: orderId,
                  gatewaySignature: "WEBHOOK_VERIFIED",
                  status: "SUCCESS",
                  backendVerified: true,
                  verifiedAt: new Date(),
                },
              });
            } else {
              paymentRecord = await tx.feePayment.update({
                where: { id: existingPayment!.id },
                data: {
                  status: "SUCCESS",
                  backendVerified: true,
                  verifiedAt: new Date(),
                },
              });
            }

            const newPaid = invoice.paidAmount + paymentAmount;
            const newOutstanding = Math.max(0, invoice.totalAmount - newPaid);
            await tx.feeInvoice.update({
              where: { id: invoice.id },
              data: {
                paidAmount: newPaid,
                outstandingAmount: newOutstanding,
                status: newOutstanding <= 0 ? "PAID" : "PARTIAL",
              },
            });

            await tx.feeReceipt.create({
              data: {
                institutionId,
                feePaymentId: paymentRecord.id,
                receiptNumber,
                amountPaid: paymentAmount,
                paymentMode: provider,
                pdfUrl: `/receipts/${receiptNumber}.pdf`,
              },
            }).catch(() => {});
          });

          await recordAudit({
            institutionId,
            entityId: invoiceId,
            entityType: "FEE_PAYMENT",
            actorUserId: "webhook_service",
            action: "FEE_PAYMENT_PROCESSED_VIA_WEBHOOK",
            metadata: {
              provider,
              orderId,
              paymentId,
              amount: paymentAmount,
              invoiceId,
            },
          }).catch(() => {});
        }
      }
    }

    return NextResponse.json({
      status: "processed",
      eventId,
      eventType,
      provider,
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json(
      { error: "Webhook internal error", message: err.message },
      { status: 500 }
    );
  }
}
