import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getCourses,
  createCourse,
  updateCourse,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

const normalizeDegreeType = (val?: string) => {
  if (!val) return "UNDERGRADUATE";
  const upper = val.toUpperCase().trim();
  const valid = ["UNDERGRADUATE", "POSTGRADUATE", "DIPLOMA", "DOCTORAL", "CERTIFICATE"];
  return valid.includes(upper) ? upper : "UNDERGRADUATE";
};

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

    if (!body.name || !body.code) {
      return NextResponse.json(
        { success: false, error: "Course name and course code are required." },
        { status: 400 }
      );
    }

    const course = await createCourse(institutionId, {
      name: body.name.trim(),
      code: body.code.trim().toUpperCase(),
      departmentId: body.departmentId || null,
      department: body.departmentName || body.department || undefined,
      degreeType: normalizeDegreeType(body.degreeType),
      durationYears: parseInt(body.durationYears || "4", 10),
      totalSemesters: parseInt(body.totalSemesters || "8", 10),
      totalCredits: body.totalCredits ? parseInt(body.totalCredits, 10) : 160,
      description: body.description,
      status: body.status?.toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });

    return NextResponse.json({
      success: true,
      message: "Course created successfully.",
      data: course,
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();
    const { id, name, code, departmentId, departmentName, degreeType, durationYears, totalSemesters, totalCredits, description, status } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Course ID required." },
        { status: 400 }
      );
    }

    const updated = await updateCourse(institutionId, id, {
      name: name?.trim(),
      code: code ? code.trim().toUpperCase() : undefined,
      departmentId: departmentId !== undefined ? departmentId : undefined,
      department: departmentName !== undefined ? departmentName : undefined,
      degreeType: degreeType ? normalizeDegreeType(degreeType) : undefined,
      durationYears: durationYears !== undefined ? parseInt(durationYears, 10) : undefined,
      totalSemesters: totalSemesters !== undefined ? parseInt(totalSemesters, 10) : undefined,
      totalCredits: totalCredits !== undefined ? parseInt(totalCredits, 10) : undefined,
      description: description !== undefined ? description : undefined,
      status: status ? (status.toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE") : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Course updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
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

    const result = await db.course.deleteMany({
      where: { id, institutionId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Course not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Course removed." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
