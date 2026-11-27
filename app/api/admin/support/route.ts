import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  createSupportTicket,
  getInstitutionTickets,
  TicketCategory,
  TicketPriority,
} from "@/lib/services/support-ticket.service";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const searchParams = req.nextUrl.searchParams;

    const status = searchParams.get("status") || undefined;
    const category = searchParams.get("category") || undefined;
    const priority = searchParams.get("priority") || undefined;
    const search = searchParams.get("q") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const result = await getInstitutionTickets({
      institutionId,
      status,
      category,
      priority,
      search,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result.tickets,
      counts: result.counts,
      total: result.total,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    const { subject, category, priority, description, relatedModule, attachmentUrl, attachmentName } = body;

    if (!subject?.trim() || !description?.trim()) {
      return NextResponse.json(
        { success: false, error: "Ticket subject and detailed description are required." },
        { status: 400 }
      );
    }

    // Resolve creator details
    let creatorName = "Institution Administrator";
    let creatorEmail: string | undefined = undefined;

    if (userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { fullName: true, name: true, email: true },
      });
      if (user) {
        creatorName = user.fullName || user.name || creatorName;
        creatorEmail = user.email || undefined;
      }
    }

    const ticket = await createSupportTicket({
      institutionId,
      creatorUserId: userId || "admin",
      creatorName,
      creatorEmail,
      subject: subject.trim(),
      category: (category || "Other") as TicketCategory,
      priority: (priority || "NORMAL") as TicketPriority,
      description: description.trim(),
      relatedModule: relatedModule?.trim() || undefined,
      attachmentUrl: attachmentUrl?.trim() || undefined,
      attachmentName: attachmentName?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Support ticket raised successfully. Super Admin has been notified.",
      data: ticket,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
