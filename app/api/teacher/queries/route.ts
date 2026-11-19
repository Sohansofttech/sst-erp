import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { submitQuery, getQueries } from "@/lib/services/query-management.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "TEACHER") {
      return NextResponse.json({ success: false, error: "Only faculty members may access faculty queries." }, { status: 403 });
    }

    const queries = await getQueries({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "FACULTY",
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

    // Resolve teacher record
    const teacher = await db.teacher.findFirst({
      where: { userId: session.userId, institutionId: session.institutionId },
      select: { id: true },
    });

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
