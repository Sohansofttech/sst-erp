import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getDepartments, createDepartment } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const departments = await getDepartments(institutionId);

    return NextResponse.json({
      success: true,
      data: departments,
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
        { success: false, error: "Department name and code are required." },
        { status: 400 }
      );
    }

    const dept = await createDepartment(institutionId, body);
    return NextResponse.json({
      success: true,
      message: "Department created successfully.",
      data: dept,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();
    const { id, name, code, description } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Department ID required." }, { status: 400 });
    }

    const updated = await db.department.updateMany({
      where: { id, institutionId },
      data: {
        ...(name ? { name } : {}),
        ...(code ? { code: code.toUpperCase() } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Department updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const id = req.nextUrl.searchParams.get("id");
    const name = req.nextUrl.searchParams.get("name");

    if (!id && !name) {
      return NextResponse.json({ success: false, error: "Department ID or name required." }, { status: 400 });
    }

    const targetIdentifier = (name || id) as string;
    const [linkedCourses, linkedTeachers] = await Promise.all([
      db.course.count({
        where: {
          institutionId,
          OR: [
            { department: targetIdentifier },
            ...(id ? [{ departmentId: id }] : []),
          ],
        },
      }),
      db.teacher.count({
        where: {
          institutionId,
          department: targetIdentifier,
        },
      }),
    ]);

    if (linkedCourses > 0 || linkedTeachers > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete department: ${linkedCourses} course(s) and ${linkedTeachers} faculty member(s) are actively assigned.`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, message: "Department deleted successfully." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
