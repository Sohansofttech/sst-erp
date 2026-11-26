import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, requireActiveSubscription, handleAdminApiError } from "@/lib/security/admin-auth";
import { ForbiddenError } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/security/rbac";
import {
  getFeeInvoices,
  createFeeInvoice,
  recordFeePayment,
  assignFeeStructure,
  applyFeeConcession,
  getFeeStructures,
  saveFeeStructure,
  getFeeRefunds,
  processFeeRefund,
} from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.FEES_READ,
    });
    const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
    const statusFilter = req.nextUrl.searchParams.get("status") || undefined;

    let invoices = await getFeeInvoices(institutionId, studentId);

    const now = new Date();
    // Summary metrics across all institution invoices
    const totalBilled = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
    const totalCollected = invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
    const totalOutstanding = invoices.reduce((acc, inv) => acc + inv.outstandingAmount, 0);
    const totalOverdue = invoices.reduce((acc, inv) => {
      const isOverdue = inv.outstandingAmount > 0 && new Date(inv.dueDate) < now;
      return isOverdue ? acc + inv.outstandingAmount : acc;
    }, 0);

    // Apply status filtering if specified
    if (statusFilter && statusFilter !== "ALL") {
      if (statusFilter === "OVERDUE") {
        invoices = invoices.filter((inv) => inv.outstandingAmount > 0 && new Date(inv.dueDate) < now);
      } else {
        invoices = invoices.filter((inv) => inv.status === statusFilter);
      }
    }

    const [structures, refunds] = await Promise.all([
      getFeeStructures(institutionId),
      getFeeRefunds(institutionId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        invoices,
        structures,
        refunds,
        summary: {
          totalInvoices: invoices.length,
          totalBilled,
          totalCollected,
          totalOutstanding,
          totalOverdue,
          totalRefunded: refunds.reduce((acc: number, r: any) => acc + Number(r.amount || 0), 0),
          collectionRate: totalBilled > 0 ? Number(((totalCollected / totalBilled) * 100).toFixed(1)) : 0,
        },
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId, permissions, userRole } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.FEES_WRITE,
    });
    const body = await req.json();

    // 1. Bulk Assign Fee Structure
    if (body.type === "ASSIGN_STRUCTURE" || body.type === "BULK_ASSIGN") {
      if (!body.title || !body.totalAmount || !body.dueDate) {
        return NextResponse.json(
          { success: false, error: "Fee structure title, total amount, and due date are required." },
          { status: 400 }
        );
      }

      const result = await assignFeeStructure(institutionId, {
        title: body.title,
        totalAmount: parseFloat(body.totalAmount),
        dueDate: new Date(body.dueDate),
        courseId: body.courseId,
        semester: body.semester !== undefined ? parseInt(body.semester, 10) : undefined,
        sectionId: body.sectionId,
        academicYearId: body.academicYearId,
        studentIds: body.studentIds,
        items: body.items,
        adminUserId: userId,
      });

      return NextResponse.json({
        success: true,
        message: `Successfully assigned fee structure to ${result.assignedCount} students.`,
        data: result,
      });
    }

    // 2. Apply Fee Concession / Waiver
    if (body.type === "CONCESSION" || body.type === "ADJUSTMENT") {
      if (!hasPermission(permissions, PERMISSIONS.FEES_CONCESSION, userRole)) {
        throw new ForbiddenError("Forbidden: Fee concessions require fees:concession permission.");
      }
      if (!body.invoiceId || !body.concessionAmount || !body.reason) {
        return NextResponse.json(
          { success: false, error: "Invoice ID, concession amount, and reason are required." },
          { status: 400 }
        );
      }

      const updated = await applyFeeConcession(institutionId, {
        invoiceId: body.invoiceId,
        concessionAmount: parseFloat(body.concessionAmount),
        reason: body.reason,
        adminUserId: userId,
      });

      return NextResponse.json({
        success: true,
        message: `Concession of ₹${body.concessionAmount} applied to invoice ${updated.invoiceNumber}.`,
        data: updated,
      });
    }

    // 2B. Save Reusable Fee Structure
    if (body.type === "SAVE_STRUCTURE") {
      const saved = await saveFeeStructure(institutionId, {
        id: body.id,
        name: body.name,
        courseId: body.courseId,
        academicYearId: body.academicYearId,
        semester: body.semester !== undefined ? Number(body.semester) : undefined,
        amount: parseFloat(body.amount),
        items: body.items,
        actorUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message: `Fee structure "${saved.name}" saved.`,
        data: saved,
      });
    }

    // 2C. Process Fee Refund (Requires fees:refund permission)
    if (body.type === "REFUND") {
      if (!hasPermission(permissions, PERMISSIONS.FEES_REFUND, userRole)) {
        throw new ForbiddenError("Forbidden: Processing fee refunds requires fees:refund permission.");
      }
      if (!body.paymentId || !body.amount || !body.reason) {
        return NextResponse.json(
          { success: false, error: "Payment ID, refund amount, and reason are required." },
          { status: 400 }
        );
      }
      const refund = await processFeeRefund(institutionId, {
        paymentId: body.paymentId,
        amount: parseFloat(body.amount),
        reason: body.reason,
        refundMode: body.refundMode,
        actorUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message: `Refund of ₹${refund.amount.toLocaleString()} processed.`,
        data: refund,
      });
    }

    // 3. Record Offline / Authorized Payment
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

    // 4. Create Single Invoice
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
