import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getFeeInvoices,
  createFeeInvoice,
  recordFeePayment,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
    const invoices = await getFeeInvoices(institutionId, studentId);

    // Summary metrics
    const totalBilled = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
    const totalCollected = invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
    const totalOutstanding = invoices.reduce((acc, inv) => acc + inv.outstandingAmount, 0);

    return NextResponse.json({
      success: true,
      data: {
        invoices,
        summary: {
          totalInvoices: invoices.length,
          totalBilled,
          totalCollected,
          totalOutstanding,
        },
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (body.type === "PAYMENT") {
      if (!body.invoiceId || !body.studentId || !body.amount || !body.paymentMethod) {
        return NextResponse.json(
          { success: false, error: "Invoice ID, student ID, amount, and payment method required." },
          { status: 400 }
        );
      }

      const txRef = body.transactionRef || `OFFLINE-PAY-${Date.now()}`;
      const paymentResult = await recordFeePayment(institutionId, {
        invoiceId: body.invoiceId,
        studentId: body.studentId,
        amount: parseFloat(body.amount),
        paymentMethod: body.paymentMethod,
        transactionRef: txRef,
      });

      return NextResponse.json({
        success: true,
        message: "Payment successfully recorded and receipt generated.",
        data: paymentResult,
      });
    }

    // Create Invoice
    if (!body.studentId || !body.title || !body.totalAmount || !body.dueDate) {
      return NextResponse.json(
        { success: false, error: "Student ID, title, total amount, and due date are required." },
        { status: 400 }
      );
    }

    const invoice = await createFeeInvoice(institutionId, {
      studentId: body.studentId,
      title: body.title,
      totalAmount: parseFloat(body.totalAmount),
      dueDate: new Date(body.dueDate),
      items: body.items || [{ description: body.title, amount: parseFloat(body.totalAmount) }],
    });

    return NextResponse.json({
      success: true,
      message: `Fee invoice ${invoice.invoiceNumber} created.`,
      data: invoice,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
