import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getCourses, createCourse } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const courses = await getCourses(institutionId);

    return NextResponse.json({
      success: true,
      data: courses,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.name || !body.code || !body.departmentId) {
      return NextResponse.json(
        { success: false, error: "Course name, code, and department ID are required." },
        { status: 400 }
      );
    }

    const course = await createCourse(institutionId, {
      name: body.name,
      code: body.code,
      departmentId: body.departmentId,
      durationYears: parseInt(body.durationYears || "4", 10),
      totalSemesters: parseInt(body.totalSemesters || "8", 10),
      description: body.description,
    });

    return NextResponse.json({
      success: true,
      message: "Course created successfully.",
      data: course,
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
      return NextResponse.json({ success: false, error: "Course ID required." }, { status: 400 });
    }

    await db.course.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Course removed." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
