/**
 * SST-ERP Institutional Support & Helpdesk Service
 *
 * Provides bidirectional ticket management between Institution Admins and Platform Super Admin:
 * 1. Institution Admin: Raise tickets, view tickets, reply, close, reopen.
 * 2. Super Admin: Global overview, filter by institution/status/category, assign, reply, internal notes.
 * 3. Security: Tenant-isolated queries; internal notes NEVER exposed to Institution Admins.
 * 4. Notifications: In-app notifications & email dispatch on ticket events.
 */

import db from "@/lib/db";
import { sendEmail, getAppBaseUrl } from "@/lib/services/email.service";

export type TicketCategory =
  | "Login & Authentication"
  | "Student Management"
  | "Faculty Management"
  | "Academic Configuration"
  | "Attendance"
  | "Timetable"
  | "Examination & Results"
  | "Fees & Payments"
  | "Email & Notifications"
  | "Database & Technical Issues"
  | "Data Correction"
  | "Other";

export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_RESPONSE"
  | "RESOLVED"
  | "CLOSED";

export interface TicketMetadata {
  category: string;
  relatedModule?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  creatorName?: string;
  creatorEmail?: string;
  reopenedCount?: number;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorName: string;
  authorRole: "SUPER_ADMIN" | "INSTITUTION_ADMIN" | "SUPPORT_STAFF";
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface SupportTicketItem {
  id: string;
  ticketNumber: string;
  institutionId: string;
  institutionName?: string;
  institutionSlug?: string;
  subject: string;
  category: string;
  relatedModule?: string;
  priority: TicketPriority;
  status: TicketStatus;
  description: string;
  attachmentUrl?: string;
  attachmentName?: string;
  creatorName?: string;
  creatorEmail?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  messagesCount: number;
  lastReplyAt?: Date;
}

/**
 * Format description string with embedded JSON metadata for 100% database schema compatibility
 */
export function serializeTicketDescription(description: string, meta: TicketMetadata): string {
  const header = JSON.stringify({
    category: meta.category || "Other",
    relatedModule: meta.relatedModule || "General",
    attachmentUrl: meta.attachmentUrl || null,
    attachmentName: meta.attachmentName || null,
    creatorName: meta.creatorName || null,
    creatorEmail: meta.creatorEmail || null,
    reopenedCount: meta.reopenedCount || 0,
  });
  return `---META---\n${header}\n---BODY---\n${description.trim()}`;
}

/**
 * Parse structured metadata from description string
 */
export function parseTicketDescription(raw: string): { description: string; metadata: TicketMetadata } {
  if (raw && raw.startsWith("---META---\n")) {
    const metaEnd = raw.indexOf("\n---BODY---\n");
    if (metaEnd !== -1) {
      const jsonStr = raw.slice("---META---\n".length, metaEnd);
      const body = raw.slice(metaEnd + "\n---BODY---\n".length);
      try {
        const metadata = JSON.parse(jsonStr) as TicketMetadata;
        return { description: body, metadata };
      } catch {
        // Fallback on parse failure
      }
    }
  }
  return {
    description: raw || "",
    metadata: { category: "Other", relatedModule: "General" },
  };
}

/**
 * Generate a friendly unique ticket number: TKT-YYYY-XXXXX
 */
export function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(10000 + Math.random() * 90000);
  return `TKT-${year}-${random}`;
}

/**
 * 1. Create a new support ticket from Institution Admin
 */
export async function createSupportTicket(params: {
  institutionId: string;
  creatorUserId: string;
  creatorName?: string;
  creatorEmail?: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  description: string;
  relatedModule?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}): Promise<SupportTicketItem> {
  const {
    institutionId,
    creatorUserId,
    creatorName,
    creatorEmail,
    subject,
    category,
    priority,
    description,
    relatedModule,
    attachmentUrl,
    attachmentName,
  } = params;

  if (!subject?.trim()) throw new Error("Ticket subject is required.");
  if (!description?.trim()) throw new Error("Detailed ticket description is required.");

  // Check if institution exists
  const inst = await db.platformInstitution.findUnique({
    where: { id: institutionId },
    select: { id: true, name: true, slug: true },
  });

  if (!inst) {
    throw new Error("Institution not found or invalid tenant context.");
  }

  // Resolve platform user if creator belongs to platform users table
  let openedById: string | null = null;
  const platformUser = await db.platformUser.findUnique({
    where: { id: creatorUserId },
    select: { id: true },
  });
  if (platformUser) {
    openedById = platformUser.id;
  }

  // Generate unique ticket number with retry safeguard
  let ticketNumber = generateTicketNumber();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await db.supportTicket.findUnique({
      where: { ticketNumber },
      select: { id: true },
    });
    if (!existing) break;
    ticketNumber = generateTicketNumber();
    attempts++;
  }

  const serializedDesc = serializeTicketDescription(description, {
    category,
    relatedModule,
    attachmentUrl,
    attachmentName,
    creatorName,
    creatorEmail,
  });

  const ticket = await db.supportTicket.create({
    data: {
      ticketNumber,
      institutionId,
      openedById,
      subject: subject.trim(),
      description: serializedDesc,
      status: "OPEN",
      priority: priority || "NORMAL",
    },
    include: {
      institution: { select: { name: true, slug: true } },
    },
  });

  // Create initial message in SupportTicketNote for full timeline transparency
  await db.supportTicketNote.create({
    data: {
      ticketId: ticket.id,
      body: `[Ticket Opened by ${creatorName || "Institution Administrator"}]\n${description.trim()}`,
      isInternal: false,
    },
  });

  // Non-blocking notification to Super Admins
  try {
    const appUrl = getAppBaseUrl();
    const superAdminSupportUrl = `${appUrl}/super-admin/support`;

    // 1. Create Platform Notification for Super Admins
    await db.platformNotification.create({
      data: {
        title: `New Support Ticket: ${ticket.ticketNumber} — ${inst.name}`,
        body: `[${category}] ${subject.trim()} (Priority: ${priority})`,
        status: "PUBLISHED",
        targetAll: true,
        publishedAt: new Date(),
      },
    });

    // 2. Dispatch transactional email alert to platform support
    await sendEmail({
      to: process.env.SUPPORT_NOTIFICATION_EMAIL || "support@sohansofttech.com",
      subject: `[${ticket.ticketNumber}] New Ticket: ${subject.trim()} — ${inst.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; color: #1e293b;">
          <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 24px;">
            <h2 style="margin: 0 0 16px 0; color: #123b5a;">New Institution Support Ticket</h2>
            <p style="margin: 0 0 12px 0;"><strong>Ticket Number:</strong> ${ticket.ticketNumber}</p>
            <p style="margin: 0 0 12px 0;"><strong>Institution:</strong> ${inst.name}</p>
            <p style="margin: 0 0 12px 0;"><strong>Category:</strong> ${category}</p>
            <p style="margin: 0 0 12px 0;"><strong>Priority:</strong> <span style="font-weight: 700; color: ${priority === 'URGENT' || priority === 'HIGH' ? '#dc2626' : '#2563eb'};">${priority}</span></p>
            <p style="margin: 0 0 12px 0;"><strong>Related Module:</strong> ${relatedModule || 'General'}</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
            <h3 style="margin: 0 0 8px 0; font-size: 15px;">Description:</h3>
            <p style="white-space: pre-wrap; background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 13px; line-height: 1.5;">${description.trim()}</p>
            ${attachmentUrl ? `<p style="margin: 12px 0;"><strong>Attachment:</strong> <a href="${attachmentUrl}">${attachmentName || 'View Attachment'}</a></p>` : ''}
            <div style="margin-top: 24px; text-align: center;">
              <a href="${superAdminSupportUrl}" style="background-color: #f5a000; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 700; display: inline-block;">View in Super Admin Portal &rarr;</a>
            </div>
          </div>
        </div>
      `,
    });
  } catch (notifErr: any) {
    console.warn("[createSupportTicket] Super Admin notification notice (non-blocking):", notifErr.message);
  }

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    institutionId: ticket.institutionId,
    institutionName: inst.name,
    institutionSlug: inst.slug || undefined,
    subject: ticket.subject,
    category,
    relatedModule,
    priority: ticket.priority as TicketPriority,
    status: ticket.status as TicketStatus,
    description,
    attachmentUrl,
    attachmentName,
    creatorName,
    creatorEmail,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    messagesCount: 1,
  };
}

/**
 * 2. Get tickets for an Institution (strictly institution-isolated)
 */
export async function getInstitutionTickets(params: {
  institutionId: string;
  status?: string;
  category?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  tickets: SupportTicketItem[];
  total: number;
  counts: {
    all: number;
    open: number;
    inProgress: number;
    waitingForInstitution: number;
    resolved: number;
    closed: number;
  };
}> {
  const { institutionId, status, category, priority, search, page = 1, limit = 50 } = params;

  // Build where clause
  const baseWhere: any = { institutionId };

  if (status && status !== "ALL") {
    if (status === "WAITING_FOR_RESPONSE") {
      baseWhere.status = "WAITING_FOR_RESPONSE";
    } else {
      baseWhere.status = status;
    }
  }

  if (priority && priority !== "ALL") {
    baseWhere.priority = priority;
  }

  if (search?.trim()) {
    baseWhere.OR = [
      { ticketNumber: { contains: search.trim(), mode: "insensitive" } },
      { subject: { contains: search.trim(), mode: "insensitive" } },
      { description: { contains: search.trim(), mode: "insensitive" } },
    ];
  }

  const [rawTickets, total, allCount, openCount, inProgCount, waitingCount, resolvedCount, closedCount] =
    await Promise.all([
      db.supportTicket.findMany({
        where: baseWhere,
        include: {
          institution: { select: { name: true, slug: true } },
          assignedTo: { select: { name: true, email: true } },
          _count: {
            select: {
              notes: {
                where: { isInternal: false }, // Only count public notes for institution
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.supportTicket.count({ where: baseWhere }),
      db.supportTicket.count({ where: { institutionId } }),
      db.supportTicket.count({ where: { institutionId, status: "OPEN" } }),
      db.supportTicket.count({ where: { institutionId, status: "IN_PROGRESS" } }),
      db.supportTicket.count({ where: { institutionId, status: "WAITING_FOR_RESPONSE" } }),
      db.supportTicket.count({ where: { institutionId, status: "RESOLVED" } }),
      db.supportTicket.count({ where: { institutionId, status: "CLOSED" } }),
    ]);

  const tickets: SupportTicketItem[] = [];

  for (const t of rawTickets) {
    const { description, metadata } = parseTicketDescription(t.description);

    // Apply category filter in-memory if requested
    if (category && category !== "ALL" && metadata.category !== category) {
      continue;
    }

    tickets.push({
      id: t.id,
      ticketNumber: t.ticketNumber,
      institutionId: t.institutionId,
      institutionName: t.institution.name,
      institutionSlug: t.institution.slug || undefined,
      subject: t.subject,
      category: metadata.category || "Other",
      relatedModule: metadata.relatedModule,
      priority: t.priority as TicketPriority,
      status: t.status as TicketStatus,
      description,
      attachmentUrl: metadata.attachmentUrl,
      attachmentName: metadata.attachmentName,
      creatorName: metadata.creatorName,
      creatorEmail: metadata.creatorEmail,
      assignedToName: t.assignedTo?.name || undefined,
      assignedToEmail: t.assignedTo?.email || undefined,
      resolvedAt: t.resolvedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messagesCount: t._count.notes,
    });
  }

  return {
    tickets,
    total,
    counts: {
      all: allCount,
      open: openCount,
      inProgress: inProgCount,
      waitingForInstitution: waitingCount,
      resolved: resolvedCount,
      closed: closedCount,
    },
  };
}

/**
 * 3. Get Ticket Details for Institution Admin (NEVER exposes internal notes)
 */
export async function getInstitutionTicketDetails(params: {
  institutionId: string;
  ticketId: string;
}): Promise<{
  ticket: SupportTicketItem;
  messages: SupportTicketMessage[];
}> {
  const { institutionId, ticketId } = params;

  const ticket = await db.supportTicket.findFirst({
    where: {
      id: ticketId,
      institutionId, // Strict tenant-isolation check
    },
    include: {
      institution: { select: { name: true, slug: true } },
      assignedTo: { select: { name: true, email: true } },
      notes: {
        where: { isInternal: false }, // Enforce exclusion of internal notes
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { name: true, email: true, platformRole: true } },
        },
      },
    },
  });

  if (!ticket) {
    throw new Error("Support ticket not found or access denied.");
  }

  const { description, metadata } = parseTicketDescription(ticket.description);

  const messages: SupportTicketMessage[] = ticket.notes.map((n) => {
    let authorRole: "SUPER_ADMIN" | "INSTITUTION_ADMIN" | "SUPPORT_STAFF" = "SUPPORT_STAFF";
    let authorName = n.author?.name || "Support Staff";

    if (n.author?.platformRole === "SUPER_ADMIN") {
      authorRole = "SUPER_ADMIN";
      authorName = n.author.name || "SST-ERP Platform Support";
    } else if (n.body.startsWith("[Ticket Opened by") || n.body.startsWith("[Institution Reply")) {
      authorRole = "INSTITUTION_ADMIN";
      const match = n.body.match(/^\[(?:Ticket Opened by|Institution Reply from)\s+([^\]]+)\]/);
      if (match && match[1]) authorName = match[1];
    }

    // Clean body prefix for cleaner UI display
    let cleanedBody = n.body;
    if (cleanedBody.startsWith("[Ticket Opened by") || cleanedBody.startsWith("[Institution Reply")) {
      const idx = cleanedBody.indexOf("]\n");
      if (idx !== -1) cleanedBody = cleanedBody.slice(idx + 2);
    }

    return {
      id: n.id,
      ticketId: n.ticketId,
      authorId: n.authorId,
      authorName,
      authorRole,
      body: cleanedBody,
      isInternal: false,
      createdAt: n.createdAt,
    };
  });

  return {
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      institutionId: ticket.institutionId,
      institutionName: ticket.institution.name,
      institutionSlug: ticket.institution.slug || undefined,
      subject: ticket.subject,
      category: metadata.category || "Other",
      relatedModule: metadata.relatedModule,
      priority: ticket.priority as TicketPriority,
      status: ticket.status as TicketStatus,
      description,
      attachmentUrl: metadata.attachmentUrl,
      attachmentName: metadata.attachmentName,
      creatorName: metadata.creatorName,
      creatorEmail: metadata.creatorEmail,
      assignedToName: ticket.assignedTo?.name || undefined,
      assignedToEmail: ticket.assignedTo?.email || undefined,
      resolvedAt: ticket.resolvedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messagesCount: messages.length,
    },
    messages,
  };
}

/**
 * 4. Reply to Ticket from Institution Admin
 */
export async function replyToSupportTicketFromInstitution(params: {
  institutionId: string;
  ticketId: string;
  senderName: string;
  message: string;
  attachmentUrl?: string;
  attachmentName?: string;
}): Promise<SupportTicketMessage> {
  const { institutionId, ticketId, senderName, message, attachmentUrl, attachmentName } = params;

  if (!message?.trim()) throw new Error("Reply message cannot be empty.");

  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, institutionId },
    include: {
      institution: { select: { name: true } },
      assignedTo: { select: { email: true, name: true } },
    },
  });

  if (!ticket) {
    throw new Error("Support ticket not found or access denied.");
  }

  let fullBody = `[Institution Reply from ${senderName || "Administrator"}]\n${message.trim()}`;
  if (attachmentUrl) {
    fullBody += `\n\n[Attachment: ${attachmentName || "Supporting File"}](${attachmentUrl})`;
  }

  // Create public note
  const note = await db.supportTicketNote.create({
    data: {
      ticketId,
      body: fullBody,
      isInternal: false,
    },
  });

  // If status was WAITING_FOR_RESPONSE or RESOLVED, move back to IN_PROGRESS
  let newStatus: TicketStatus = ticket.status as TicketStatus;
  if (ticket.status === "WAITING_FOR_RESPONSE" || ticket.status === "RESOLVED") {
    newStatus = "IN_PROGRESS";
  }

  await db.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: newStatus,
      updatedAt: new Date(),
    },
  });

  // Notify assigned Super Admin
  try {
    const notifyEmail = ticket.assignedTo?.email || process.env.SUPPORT_NOTIFICATION_EMAIL || "support@sohansofttech.com";
    await sendEmail({
      to: notifyEmail,
      subject: `[${ticket.ticketNumber}] New Reply from ${ticket.institution.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; color: #1e293b;">
          <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 24px;">
            <h2 style="margin: 0 0 16px 0; color: #123b5a;">Institution Replied to Support Ticket</h2>
            <p><strong>Ticket:</strong> ${ticket.ticketNumber} — ${ticket.subject}</p>
            <p><strong>From:</strong> ${senderName} (${ticket.institution.name})</p>
            <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; margin: 16px 0; font-size: 13px; line-height: 1.5;">
              ${message.trim()}
            </div>
          </div>
        </div>
      `,
    });
  } catch (err: any) {
    console.warn("[replyToSupportTicketFromInstitution] Notify error:", err.message);
  }

  return {
    id: note.id,
    ticketId: note.ticketId,
    authorId: null,
    authorName: senderName,
    authorRole: "INSTITUTION_ADMIN",
    body: message.trim(),
    isInternal: false,
    createdAt: note.createdAt,
  };
}

/**
 * 5. Close Ticket from Institution Admin
 */
export async function closeInstitutionTicket(params: {
  institutionId: string;
  ticketId: string;
  actorName: string;
}): Promise<boolean> {
  const { institutionId, ticketId, actorName } = params;

  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, institutionId },
  });

  if (!ticket) throw new Error("Ticket not found or access denied.");

  await db.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: "CLOSED",
        resolvedAt: ticket.resolvedAt || new Date(),
        updatedAt: new Date(),
      },
    });

    await tx.supportTicketNote.create({
      data: {
        ticketId,
        body: `[Ticket Closed by ${actorName || "Institution Administrator"}]`,
        isInternal: false,
      },
    });
  });

  return true;
}

/**
 * 6. Reopen Ticket from Institution Admin
 */
export async function reopenInstitutionTicket(params: {
  institutionId: string;
  ticketId: string;
  actorName: string;
  reason: string;
}): Promise<boolean> {
  const { institutionId, ticketId, actorName, reason } = params;

  if (!reason?.trim()) throw new Error("Please provide a reason for reopening the ticket.");

  const ticket = await db.supportTicket.findFirst({
    where: { id: ticketId, institutionId },
  });

  if (!ticket) throw new Error("Ticket not found or access denied.");
  if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
    throw new Error("Only resolved or closed tickets can be reopened.");
  }

  const { description, metadata } = parseTicketDescription(ticket.description);
  const updatedMeta: TicketMetadata = {
    ...metadata,
    reopenedCount: (metadata.reopenedCount || 0) + 1,
  };

  await db.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: "IN_PROGRESS",
        description: serializeTicketDescription(description, updatedMeta),
        resolvedAt: null,
        updatedAt: new Date(),
      },
    });

    await tx.supportTicketNote.create({
      data: {
        ticketId,
        body: `[Ticket Reopened by ${actorName || "Institution Administrator"}]\nReason: ${reason.trim()}`,
        isInternal: false,
      },
    });
  });

  return true;
}

/**
 * 7. Super Admin: List Cross-Institution Support Tickets
 */
export async function getSuperAdminSupportTickets(params: {
  institutionId?: string;
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  tickets: SupportTicketItem[];
  total: number;
  counts: Record<string, number>;
}> {
  const { institutionId, status, priority, category, search, page = 1, limit = 50 } = params;

  const where: any = {};
  if (institutionId && institutionId !== "ALL") where.institutionId = institutionId;
  if (status && status !== "ALL") where.status = status;
  if (priority && priority !== "ALL") where.priority = priority;

  if (search?.trim()) {
    where.OR = [
      { ticketNumber: { contains: search.trim(), mode: "insensitive" } },
      { subject: { contains: search.trim(), mode: "insensitive" } },
      { description: { contains: search.trim(), mode: "insensitive" } },
      { institution: { name: { contains: search.trim(), mode: "insensitive" } } },
    ];
  }

  const [rawTickets, total, openC, inProgC, waitingC, resolvedC, closedC] = await Promise.all([
    db.supportTicket.findMany({
      where,
      include: {
        institution: { select: { name: true, slug: true } },
        assignedTo: { select: { name: true, email: true } },
        _count: { select: { notes: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.supportTicket.count({ where }),
    db.supportTicket.count({ where: { status: "OPEN" } }),
    db.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
    db.supportTicket.count({ where: { status: "WAITING_FOR_RESPONSE" } }),
    db.supportTicket.count({ where: { status: "RESOLVED" } }),
    db.supportTicket.count({ where: { status: "CLOSED" } }),
  ]);

  const tickets: SupportTicketItem[] = [];

  for (const t of rawTickets) {
    const { description, metadata } = parseTicketDescription(t.description);

    if (category && category !== "ALL" && metadata.category !== category) {
      continue;
    }

    tickets.push({
      id: t.id,
      ticketNumber: t.ticketNumber,
      institutionId: t.institutionId,
      institutionName: t.institution.name,
      institutionSlug: t.institution.slug || undefined,
      subject: t.subject,
      category: metadata.category || "Other",
      relatedModule: metadata.relatedModule,
      priority: t.priority as TicketPriority,
      status: t.status as TicketStatus,
      description,
      attachmentUrl: metadata.attachmentUrl,
      attachmentName: metadata.attachmentName,
      creatorName: metadata.creatorName,
      creatorEmail: metadata.creatorEmail,
      assignedToName: t.assignedTo?.name || undefined,
      assignedToEmail: t.assignedTo?.email || undefined,
      resolvedAt: t.resolvedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messagesCount: t._count.notes,
    });
  }

  return {
    tickets,
    total,
    counts: {
      ALL: total,
      OPEN: openC,
      IN_PROGRESS: inProgC,
      WAITING_FOR_RESPONSE: waitingC,
      RESOLVED: resolvedC,
      CLOSED: closedC,
    },
  };
}

/**
 * 8. Super Admin: Get Ticket Details (Includes both Public and Internal Notes)
 */
export async function getSuperAdminTicketDetails(ticketId: string): Promise<{
  ticket: SupportTicketItem;
  messages: SupportTicketMessage[];
}> {
  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      institution: { select: { id: true, name: true, slug: true, email: true, phone: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      openedBy: { select: { id: true, name: true, email: true } },
      notes: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { name: true, email: true, platformRole: true } },
        },
      },
    },
  });

  if (!ticket) throw new Error("Ticket not found.");

  const { description, metadata } = parseTicketDescription(ticket.description);

  const messages: SupportTicketMessage[] = ticket.notes.map((n) => {
    let authorRole: "SUPER_ADMIN" | "INSTITUTION_ADMIN" | "SUPPORT_STAFF" = "SUPPORT_STAFF";
    let authorName = n.author?.name || "Support Staff";

    if (n.author?.platformRole === "SUPER_ADMIN") {
      authorRole = "SUPER_ADMIN";
      authorName = n.author.name || "Super Admin";
    } else if (n.body.startsWith("[Ticket Opened by") || n.body.startsWith("[Institution Reply")) {
      authorRole = "INSTITUTION_ADMIN";
      const match = n.body.match(/^\[(?:Ticket Opened by|Institution Reply from)\s+([^\]]+)\]/);
      if (match && match[1]) authorName = match[1];
    }

    let cleanedBody = n.body;
    if (cleanedBody.startsWith("[Ticket Opened by") || cleanedBody.startsWith("[Institution Reply")) {
      const idx = cleanedBody.indexOf("]\n");
      if (idx !== -1) cleanedBody = cleanedBody.slice(idx + 2);
    }

    return {
      id: n.id,
      ticketId: n.ticketId,
      authorId: n.authorId,
      authorName,
      authorRole,
      body: cleanedBody,
      isInternal: n.isInternal,
      createdAt: n.createdAt,
    };
  });

  return {
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      institutionId: ticket.institutionId,
      institutionName: ticket.institution.name,
      institutionSlug: ticket.institution.slug || undefined,
      subject: ticket.subject,
      category: metadata.category || "Other",
      relatedModule: metadata.relatedModule,
      priority: ticket.priority as TicketPriority,
      status: ticket.status as TicketStatus,
      description,
      attachmentUrl: metadata.attachmentUrl,
      attachmentName: metadata.attachmentName,
      creatorName: metadata.creatorName || ticket.openedBy?.name,
      creatorEmail: metadata.creatorEmail || ticket.openedBy?.email,
      assignedToName: ticket.assignedTo?.name || undefined,
      assignedToEmail: ticket.assignedTo?.email || undefined,
      resolvedAt: ticket.resolvedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messagesCount: messages.length,
    },
    messages,
  };
}

/**
 * 9. Super Admin: Update Ticket (Assign, Change Priority/Status, Add Public Reply or Internal Note)
 */
export async function updateSuperAdminTicket(params: {
  ticketId: string;
  actorUserId: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToId?: string | null;
  replyMessage?: string;
  internalNote?: string;
}): Promise<boolean> {
  const { ticketId, actorUserId, status, priority, assignedToId, replyMessage, internalNote } = params;

  const ticket = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      institution: { select: { id: true, name: true, email: true } },
    },
  });

  if (!ticket) throw new Error("Ticket not found.");

  const { metadata } = parseTicketDescription(ticket.description);

  await db.$transaction(async (tx) => {
    // 1. Update ticket attributes
    const updateData: any = { updatedAt: new Date() };
    if (status) {
      updateData.status = status;
      if (status === "RESOLVED") {
        updateData.resolvedAt = new Date();
      } else if (status === "CLOSED") {
        updateData.resolvedAt = ticket.resolvedAt || new Date();
      } else {
        updateData.resolvedAt = null;
      }
    }
    if (priority) updateData.priority = priority;
    if (assignedToId !== undefined) updateData.assignedToId = assignedToId;

    await tx.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });

    // 2. Add public reply if provided
    if (replyMessage?.trim()) {
      await tx.supportTicketNote.create({
        data: {
          ticketId,
          authorId: actorUserId,
          body: replyMessage.trim(),
          isInternal: false,
        },
      });
    }

    // 3. Add private internal note if provided
    if (internalNote?.trim()) {
      await tx.supportTicketNote.create({
        data: {
          ticketId,
          authorId: actorUserId,
          body: `[Internal Staff Note]\n${internalNote.trim()}`,
          isInternal: true,
        },
      });
    }

    // 4. Audit log in platform audit log
    await tx.platformAuditLog.create({
      data: {
        userId: actorUserId,
        institutionId: ticket.institutionId,
        action: "SUPPORT_TICKET_UPDATED",
        entity: "SupportTicket",
        entityId: ticket.id,
        result: "SUCCESS",
        metadata: {
          ticketNumber: ticket.ticketNumber,
          status: status || ticket.status,
          priority: priority || ticket.priority,
          hasReply: !!replyMessage,
          hasInternalNote: !!internalNote,
        },
      },
    });
  });

  // 5. Notify Institution Admin if there's a reply or status change
  try {
    const targetEmail = metadata.creatorEmail || ticket.institution.email;
    const hasStatusChanged = status && status !== ticket.status;

    if ((replyMessage || hasStatusChanged) && targetEmail) {
      const appUrl = getAppBaseUrl();
      const institutionTicketUrl = `${appUrl}/admin/support`;

      // In-app notification for the institution
      await db.notification.create({
        data: {
          institutionId: ticket.institutionId,
          title: `Update on Ticket ${ticket.ticketNumber}`,
          message: replyMessage
            ? `Super Admin replied to your ticket: "${ticket.subject}"`
            : `Ticket status updated to ${status}.`,
          category: "ALERT",
          audienceRole: "ADMIN",
        },
      });

      // Email notification to Institution Admin
      await sendEmail({
        to: targetEmail,
        subject: `Update on Support Ticket [${ticket.ticketNumber}] — ${ticket.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; color: #1e293b;">
            <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 24px;">
              <h2 style="margin: 0 0 16px 0; color: #123b5a;">Support Ticket Update</h2>
              <p><strong>Ticket Number:</strong> ${ticket.ticketNumber}</p>
              <p><strong>Subject:</strong> ${ticket.subject}</p>
              <p><strong>Current Status:</strong> <span style="font-weight: 700; color: #f5a000;">${status || ticket.status}</span></p>
              ${
                replyMessage
                  ? `
                <div style="margin: 16px 0;">
                  <h3 style="font-size: 14px; margin: 0 0 6px 0;">Response from Platform Support:</h3>
                  <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 13px; line-height: 1.5;">
                    ${replyMessage.trim()}
                  </div>
                </div>
              `
                  : ""
              }
              <div style="margin-top: 24px; text-align: center;">
                <a href="${institutionTicketUrl}" style="background-color: #f5a000; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 700; display: inline-block;">View in Institution Portal &rarr;</a>
              </div>
            </div>
          </div>
        `,
      });
    }
  } catch (notifyErr: any) {
    console.warn("[updateSuperAdminTicket] Institution notification warning:", notifyErr.message);
  }

  return true;
}
