import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { submitQuery, getQueries, respondToQuery, QueryStatus } from "@/lib/services/query-management.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
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
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "TEACHER") {
      return NextResponse.json({ success: false, error: "Only faculty members may submit faculty queries." }, { status: 403 });
    }

    const body = await req.json();
    const { category, subject, description, priority } = body;

    if (!category || !subject || !description) {
      return NextResponse.json(
        { success: false, error: "Category, subject, and description are required." },
        { status: 400 }
      );
    }

    const query = await submitQuery({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "FACULTY",
      category,
      subject,
      description,
      priority: priority || "NORMAL",
    });

    return NextResponse.json({
      success: true,
      message: "Faculty query submitted successfully to institution admin.",
      data: query,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "TEACHER") {
      return NextResponse.json(
        { success: false, error: "Only authorized faculty members may respond to assigned grievances." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, status, remarks } = body;

    if (!id || !status || !remarks) {
      return NextResponse.json(
        { success: false, error: "Query ID, decision status, and remarks are required." },
        { status: 400 }
      );
    }

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

    // Permitted status transitions for faculty: IN_PROGRESS or RESOLVED
    if (status !== "IN_PROGRESS" && status !== "RESOLVED") {
      return NextResponse.json(
        { success: false, error: "Faculty members may only update status to IN_PROGRESS or RESOLVED." },
        { status: 400 }
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
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}
