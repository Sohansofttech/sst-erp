import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthErrorStatus } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import { PaymentGatewayService } from "@/lib/services/payment-gateway.service";
import { RazorpayAdapter } from "@/lib/services/payments/razorpay.adapter";
import { CashfreeAdapter } from "@/lib/services/payments/cashfree.adapter";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const body = await req.json();
    const { studentId: reqStudentId, invoiceId, amount: requestedAmount } = body;

    const targetStudentId = reqStudentId || session.studentId || session.activeChildId;
    if (!targetStudentId) {
      return NextResponse.json({ success: false, error: "Missing student ID" }, { status: 400 });
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, targetStudentId);

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: "Missing invoice ID" }, { status: 400 });
    }

    // 1. Fetch invoice and verify tenant
    const invoice = await db.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: { student: { include: { user: true } } },
    });

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Fee invoice not found." }, { status: 404 });
    }

    if (invoice.institutionId !== session.institutionId) {
      return NextResponse.json({ success: false, error: "Tenant mismatch on invoice." }, { status: 403 });
    }

    if (invoice.studentId !== studentId) {
      return NextResponse.json({ success: false, error: "Unauthorized access to invoice." }, { status: 403 });
    }

    if (invoice.outstandingAmount <= 0) {
      return NextResponse.json({ success: false, error: "This invoice is already fully settled." }, { status: 400 });
    }

    const payAmount = requestedAmount ? Number(requestedAmount) : invoice.outstandingAmount;
    if (payAmount <= 0 || payAmount > invoice.outstandingAmount) {
      return NextResponse.json(
        { success: false, error: `Invalid payment amount (₹${payAmount}). Outstanding is ₹${invoice.outstandingAmount}` },
        { status: 400 }
      );
    }

    // 2. Resolve institution's active default payment gateway
    const defaultGateway = await PaymentGatewayService.getDecryptedDefaultGateway(session.institutionId);

    if (!defaultGateway) {
      return NextResponse.json(
        {
          success: false,
          error: "Online payment is currently disabled or not configured for this institution. Please pay via the campus accounts counter.",
        },
        { status: 400 }
      );
    }

    // 3. Create order with gateway provider
    const creds = defaultGateway.credentials as any;

    if (defaultGateway.provider === "RAZORPAY") {
      const order = await RazorpayAdapter.createOrder(creds.keyId, creds.keySecret, {
        amount: payAmount,
        currency: "INR",
        receipt: invoice.invoiceNumber,
        notes: {
          invoiceId: invoice.id,
          studentId,
          institutionId: session.institutionId,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          provider: "RAZORPAY",
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          publicKey: creds.keyId,
          environment: defaultGateway.environment,
          invoiceTitle: invoice.title,
          studentName: invoice.student?.user?.name || "Student",
          studentEmail: invoice.student?.user?.email || "",
        },
      });
    } else {
      // Cashfree
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const order = await CashfreeAdapter.createOrder(
        creds.appId,
        creds.secretKey,
        defaultGateway.environment,
        {
          orderId,
          amount: payAmount,
          currency: "INR",
          customerId: invoice.studentId,
          customerName: invoice.student?.user?.name || "Student",
          customerEmail: invoice.student?.user?.email || "student@institution.edu",
        }
      );

      return NextResponse.json({
        success: true,
        data: {
          provider: "CASHFREE",
          orderId: order.orderId,
          paymentSessionId: order.paymentSessionId,
          amount: payAmount,
          currency: "INR",
          publicKey: creds.appId,
          environment: defaultGateway.environment,
          invoiceTitle: invoice.title,
          studentName: invoice.student?.user?.name || "Student",
          studentEmail: invoice.student?.user?.email || "",
        },
      });
    }
  } catch (err: any) {
    console.error("Order creation failed:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create payment order" },
      { status: getAuthErrorStatus(err) ?? 500 }
    );
  }
}
