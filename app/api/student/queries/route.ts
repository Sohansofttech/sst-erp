import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { submitQuery, getQueries } from "@/lib/services/query-management.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "STUDENT") {
      return NextResponse.json({ success: false, error: "Only students may access student queries." }, { status: 403 });
    }

    const queries = await getQueries({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "STUDENT",
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

    if (session.role !== "STUDENT") {
      return NextResponse.json({ success: false, error: "Only students may submit student queries." }, { status: 403 });
    }

    const body = await req.json();
    const { category, subject, description, priority } = body;

    if (!category || !subject || !description) {
      return NextResponse.json(
        { success: false, error: "Category, subject, and description are required." },
        { status: 400 }
      );
    }

    // Resolve student record
    let studentId = session.studentId;
    if (!studentId) {
      const student = await db.student.findFirst({
        where: { userId: session.userId, institutionId: session.institutionId },
        select: { id: true },
      });
      studentId = student?.id;
    }

    const query = await submitQuery({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "STUDENT",
      category,
      subject,
      description,
      studentId,
      priority: priority || "NORMAL",
    });

    return NextResponse.json({
      success: true,
      message: "Query submitted successfully to campus administration.",
      data: query,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.name === "ForbiddenError" ? 403 : 500 }
    );
  }
}
