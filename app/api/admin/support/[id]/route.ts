import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getInstitutionTicketDetails,
  replyToSupportTicketFromInstitution,
  closeInstitutionTicket,
  reopenInstitutionTicket,
} from "@/lib/services/support-ticket.service";
import db from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id: ticketId } = await params;

    const data = await getInstitutionTicketDetails({
      institutionId,
      ticketId,
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const { id: ticketId } = await params;
    const body = await req.json();

    const action = body.action || "REPLY"; // REPLY | CLOSE | REOPEN

    let senderName = "Institution Administrator";
    if (userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { fullName: true, name: true },
      });
      if (user) {
        senderName = user.fullName || user.name || senderName;
      }
    }

    if (action === "REPLY") {
      const { message, attachmentUrl, attachmentName } = body;
      if (!message?.trim()) {
        return NextResponse.json(
          { success: false, error: "Reply message cannot be empty." },
          { status: 400 }
        );
      }

      const note = await replyToSupportTicketFromInstitution({
        institutionId,
        ticketId,
        senderName,
        message: message.trim(),
        attachmentUrl: attachmentUrl?.trim() || undefined,
        attachmentName: attachmentName?.trim() || undefined,
      });

      return NextResponse.json({
        success: true,
        message: "Reply sent successfully.",
        data: note,
      });
    }

    if (action === "CLOSE") {
      await closeInstitutionTicket({
        institutionId,
        ticketId,
        actorName: senderName,
      });

      return NextResponse.json({
        success: true,
        message: "Support ticket closed successfully.",
      });
    }

    if (action === "REOPEN") {
      const { reason } = body;
      if (!reason?.trim()) {
        return NextResponse.json(
          { success: false, error: "Please provide a reason for reopening the ticket." },
          { status: 400 }
        );
      }

      await reopenInstitutionTicket({
        institutionId,
        ticketId,
        actorName: senderName,
        reason: reason.trim(),
      });

      return NextResponse.json({
        success: true,
        message: "Support ticket reopened successfully.",
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action '${action}'.` },
      { status: 400 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
