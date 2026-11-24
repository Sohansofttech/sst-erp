import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const url = new URL(req.url);
    const receiptNumber = url.searchParams.get("receiptNumber");
    const paymentId = url.searchParams.get("paymentId");
    const requestedStudentId = url.searchParams.get("studentId") || session.studentId || session.activeChildId;

    if (!requestedStudentId) {
      return NextResponse.json({ success: false, error: "Missing student ID" }, { status: 400 });
    }

    const { studentId } = await authorizeStudentOrParentAccess(session, requestedStudentId);

    if (!receiptNumber && !paymentId) {
      return NextResponse.json(
        { success: false, error: "Receipt number or payment ID is required." },
        { status: 400 }
      );
    }

    const receipt = await db.feeReceipt.findFirst({
      where: {
        institutionId: session.institutionId,
        ...(receiptNumber ? { receiptNumber } : {}),
        ...(paymentId ? { feePaymentId: paymentId } : {}),
      },
      include: {
        feePayment: {
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                title: true,
                totalAmount: true,
                paidAmount: true,
                outstandingAmount: true,
                dueDate: true,
              },
            },
            student: {
              select: {
                id: true,
                fullName: true,
                rollNumber: true,
                admissionNumber: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) {
      return NextResponse.json({ success: false, error: "Receipt not found." }, { status: 404 });
    }

    // Security: Student must own the receipt
    if (receipt.feePayment.studentId !== studentId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access to payment receipt." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        receiptNumber: receipt.receiptNumber,
        issuedDate: receipt.issuedDate,
        amountPaid: receipt.amountPaid,
        paymentMode: receipt.paymentMode,
        pdfUrl: receipt.pdfUrl,
        invoiceNumber: receipt.feePayment.invoice.invoiceNumber,
        invoiceTitle: receipt.feePayment.invoice.title,
        transactionRef: receipt.feePayment.transactionRef,
        verifiedAt: receipt.feePayment.verifiedAt,
        student: {
          fullName: receipt.feePayment.student.fullName,
          rollNumber: receipt.feePayment.student.rollNumber,
          admissionNumber: receipt.feePayment.student.admissionNumber,
        },
        institutionName: session.institutionName || "Institution Administration",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve receipt." },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}
