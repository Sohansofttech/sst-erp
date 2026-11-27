import { NextRequest, NextResponse } from "next/server";
import { resolveDivisionContext } from "@/lib/security/division-context";
import { handleAdminApiError } from "@/lib/security/admin-auth";
import { getClasses, createClass } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    await requireReadReq(req, context.institutionId);
    const institutionId = context.institutionId;
    const requestedDiv = context.activeDivisionId;

    const classes = await getClasses(institutionId, requestedDiv);

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
    const context = await resolveDivisionContext(req);
    await requireWriteReq(req, context.institutionId);
    const institutionId = context.institutionId;
    const body = await req.json();

    const divisionType = context.activeDivisionType || (body.divisionType as string) || "COLLEGE";
    const isNonCollege =
      divisionType === "SCHOOL" ||
      divisionType === "HIGHER_SECONDARY" ||
      divisionType === "MONTESSORI";

    if (isNonCollege) {
      if (!body.name || !body.academicYearId) {
        return NextResponse.json(
          { success: false, error: "Class name and academic year are required." },
          { status: 400 }
        );
      }
    } else {
      // Legacy College validation
      if (!body.name || !body.courseId || !body.academicYearId) {
        return NextResponse.json(
          { success: false, error: "Class name, course, and academic year are required." },
          { status: 400 }
        );
      }
    }

    const newClass = await createClass(institutionId, {
      name: body.name,
      code: body.code,
      courseId: body.courseId || null,
      academicYearId: body.academicYearId,
      semester: body.semester ? parseInt(String(body.semester), 10) : (isNonCollege ? null : 1),
      gradeLevel: body.gradeLevel || null,
      stream: body.stream || null,
      divisionId: context.activeDivisionId || body.divisionId || null,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Class created successfully.",
        data: newClass,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req);
    await requireWriteReq(req, context.institutionId);
    const institutionId = context.institutionId;
    const body = await req.json();
    const { id, name, courseId, academicYearId, semester, gradeLevel, stream, divisionId } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Class ID required." }, { status: 400 });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (courseId !== undefined) updateData.courseId = courseId || null;
    if (academicYearId) updateData.academicYearId = academicYearId;
    if (semester !== undefined) updateData.semester = semester ? parseInt(String(semester), 10) : null;
    if (gradeLevel !== undefined) updateData.gradeLevel = gradeLevel;
    if (stream !== undefined) updateData.stream = stream;
    if (divisionId !== undefined) updateData.divisionId = divisionId;

    const updated = await db.class.updateMany({
      where: { id, institutionId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "Class updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req);
    await requireWriteReq(req, context.institutionId);
    const institutionId = context.institutionId;
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Class ID required." }, { status: 400 });
    }

    // Safety guard: Check if active students are enrolled in this class
    const studentCount = await db.student.count({
      where: {
        institutionId,
        currentClassId: id,
        status: "ACTIVE",
      },
    });

    if (studentCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete class with ${studentCount} active student enrollment(s).`,
        },
        { status: 400 }
      );
    }

    await db.class.deleteMany({
      where: { id, institutionId },
    });

    return NextResponse.json({ success: true, message: "Class removed successfully." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
