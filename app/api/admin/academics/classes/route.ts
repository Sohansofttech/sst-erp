import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getClasses, createClass } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const classes = await getClasses(institutionId);

    return NextResponse.json({
      success: true,
      data: classes,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.name || !body.courseId || !body.academicYearId) {
      return NextResponse.json(
        { success: false, error: "Class name, course, and academic year are required." },
        { status: 400 }
      );
    }

    const newClass = await createClass(institutionId, {
      name: body.name,
      courseId: body.courseId,
      academicYearId: body.academicYearId,
      semester: parseInt(body.semester || "1", 10),
    });

    return NextResponse.json({
      success: true,
      message: "Class created successfully.",
      data: newClass,
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
      return NextResponse.json({ success: false, error: "Class ID required." }, { status: 400 });
    }

    const result = await db.class.deleteMany({
      where: { id, institutionId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Class not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Class deleted." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
