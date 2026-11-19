import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { authorizeStudentOrParentAccess } from "@/lib/security/authorize";
import { submitQuery, getQueries } from "@/lib/services/query-management.service";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "PARENT") {
      return NextResponse.json({ success: false, error: "Unauthorized: Parent access required." }, { status: 403 });
    }

    const studentId = req.nextUrl.searchParams.get("studentId") || undefined;

    const queries = await getQueries({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "PARENT",
      studentId,
    });

    return NextResponse.json({
      success: true,
      data: queries,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    if (session.role !== "PARENT") {
      return NextResponse.json({ success: false, error: "Only parents can submit parent requests." }, { status: 403 });
    }

    const { studentId, requestType, category, title, message } = await req.json();

    if (!studentId || !title || !message) {
      return NextResponse.json({ success: false, error: "Missing required fields: child, title, and message." }, { status: 400 });
    }

    // Verify parent is authorized for this child
    await authorizeStudentOrParentAccess(session, studentId);

    const query = await submitQuery({
      institutionId: session.institutionId,
      userId: session.userId,
      role: "PARENT",
      category: category || requestType || "GENERAL_INQUIRY",
      subject: title.trim(),
      description: message.trim(),
      studentId,
    });

    return NextResponse.json({
      success: true,
      message: "Parent request submitted to institution admin workflow.",
      data: query,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.name === "ForbiddenError" || /unauthorized|forbidden|not linked/i.test(err.message) ? 403 : 500 }
    );
  }
}
