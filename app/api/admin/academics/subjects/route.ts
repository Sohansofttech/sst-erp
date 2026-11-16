import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getSubjects, createSubject } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const courseId = req.nextUrl.searchParams.get("courseId") || undefined;
    const subjects = await getSubjects(institutionId, courseId);

    return NextResponse.json({
      success: true,
      data: subjects,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.name || !body.code || !body.courseId) {
      return NextResponse.json(
        { success: false, error: "Subject name, code, and course are required." },
        { status: 400 }
      );
    }

    const subject = await createSubject(institutionId, {
      name: body.name,
      code: body.code,
      courseId: body.courseId,
      semester: parseInt(body.semester || "1", 10),
      credits: parseInt(body.credits || "3", 10),
      isElective: body.isElective,
      syllabus: body.syllabus,
    });

    return NextResponse.json({
      success: true,
      message: "Subject created successfully.",
      data: subject,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Subject ID required." }, { status: 400 });
    }

    await db.subject.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Subject removed." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
