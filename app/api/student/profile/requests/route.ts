import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { submitRequest } from "@/lib/services/approval.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(req, ["STUDENT", "PARENT"]);

    const requests = await db.approvalRequest.findMany({
      where: {
        userId: session.userId,
        institutionId: session.institutionId,
        requestType: "PROFILE_CORRECTION",
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: requests,
    });
  } catch (err: any) {
    const status = err instanceof UnauthorizedError ? 401 : err instanceof ForbiddenError ? 403 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(req, ["STUDENT", "PARENT"]);

    const body = await req.json();
    const { title, details } = body;

    if (!title || !details) {
      return NextResponse.json(
        { success: false, error: "Title and details are required." },
        { status: 400 }
      );
    }

    const request = await submitRequest({
      institutionId: session.institutionId,
      userId: session.userId,
      requestType: "PROFILE_CORRECTION",
      title,
      data: details,
    });

    return NextResponse.json({
      success: true,
      message: "Profile correction request submitted for admin review.",
      data: request,
    });
  } catch (err: any) {
    const status = err instanceof UnauthorizedError ? 401 : err instanceof ForbiddenError ? 403 : 500;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to submit profile correction request" },
      { status }
    );
  }
}
