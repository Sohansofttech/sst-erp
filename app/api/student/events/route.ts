import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(req, ["STUDENT"]);

    const events = await db.event.findMany({
      where: {
        institutionId: session.institutionId,
      },
      orderBy: { eventDate: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: events,
    }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    const status = err instanceof UnauthorizedError ? 401 : err instanceof ForbiddenError ? 403 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
