import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { submitQuery, getQueries, respondToQuery, QueryStatus } from "@/lib/services/query-management.service";
import db from "@/lib/db";

const postQuerySchema = z.object({
  category: z.string().trim().min(2, "Category must be at least 2 characters").max(50, "Category too long"),
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(200, "Subject too long"),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(2000, "Description too long"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"),
});

const putQuerySchema = z.object({
  id: z.string().trim().min(1, "Query ID is required"),
  status: z.enum(["IN_PROGRESS", "RESOLVED"], {
    error: "Faculty members may only update status to IN_PROGRESS or RESOLVED.",
  }),
  remarks: z.string().trim().min(3, "Remarks must be at least 3 characters").max(1000, "Remarks too long"),
});

function handleApiError(err: any, correlationId: string) {
  console.error(`[Teacher Queries API] [${correlationId}] error:`, err);
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, error: err.issues[0]?.message || "Invalid input payload.", correlationId },
      { status: 400 }
    );
  }
  const isForbidden = err?.name === "ForbiddenError" || err?.status === 403;
  return NextResponse.json(
    {
      success: false,
      error: isForbidden ? err.message : "An unexpected server error occurred while processing the faculty query.",
      correlationId,
    },
    { status: isForbidden ? 403 : 500 }
  );
}

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const session = await requireAuth(req);

    if (session.role !== "TEACHER") {
      return NextResponse.json({ success: false, error: "Only faculty members may access faculty queries." }, { status: 403 });
    }

    const assigned = req.nextUrl.searchParams.get("assigned") === "true";

    const queries = await getQueries({
      institutionId: session.institutionId,
      ...(assigned
        ? { assignedToUserId: session.userId }
        : { userId: session.userId, role: "FACULTY" }),
    });

    return NextResponse.json({
      success: true,
      data: queries,
    });
  } catch (err: any) {
    return handleApiError(err, correlationId);
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const session = await requireAuth(req);

    if (session.role !== "TEACHER") {
      return NextResponse.json({ success: false, error: "Only faculty members may submit faculty queries." }, { status: 403 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const validated = postQuerySchema.parse(rawBody);

    const query = await submitQuery({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "FACULTY",
      category: validated.category,
      subject: validated.subject,
      description: validated.description,
      priority: validated.priority,
    });

    return NextResponse.json({
      success: true,
      message: "Faculty query submitted successfully to institution admin.",
      data: query,
    });
  } catch (err: any) {
    return handleApiError(err, correlationId);
  }
}

export async function PUT(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const session = await requireAuth(req);

    if (session.role !== "TEACHER") {
      return NextResponse.json(
        { success: false, error: "Only authorized faculty members may respond to assigned grievances." },
        { status: 403 }
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const { id, status, remarks } = putQuerySchema.parse(rawBody);

    // Verify target grievance belongs to institution and is assigned to this teacher
    const existing = await db.approvalRequest.findFirst({
      where: { id, institutionId: session.institutionId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Grievance record not found or access denied." },
        { status: 404 }
      );
    }

    let payload: any = {};
    try {
      payload = JSON.parse(existing.requestedDataJson || "{}");
    } catch {
      payload = {};
    }

    if (payload.assignedToId !== session.userId && payload.assignedToUserId !== session.userId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You are only permitted to respond to grievances explicitly assigned to you." },
        { status: 403 }
      );
    }

    const updated = await respondToQuery({
      institutionId: session.institutionId,
      adminUserId: session.userId,
      queryId: id,
      status: status as QueryStatus,
      adminRemarks: remarks.trim(),
    });

    return NextResponse.json({
      success: true,
      message: `Grievance updated to ${status} and response recorded.`,
      data: updated,
    });
  } catch (err: any) {
    return handleApiError(err, correlationId);
  }
}
