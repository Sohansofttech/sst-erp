import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getStaff,
  createStaff,
  archiveTeacher,
  restoreTeacher,
  getTeacherDependencies,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

const ALLOWED_STAFF_ROLES = ["TEACHER", "ADMIN", "STAFF", "HOD"] as const;

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const id = req.nextUrl.searchParams.get("id");
    const checkDependencies = req.nextUrl.searchParams.get("dependencies") === "true";

    if (id && checkDependencies) {
      const deps = await getTeacherDependencies(institutionId, id);
      return NextResponse.json({
        success: true,
        data: deps,
      });
    }

    const staff = await getStaff(institutionId);

    return NextResponse.json({
      success: true,
      data: staff,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.fullName || !body.email || !body.role) {
      return NextResponse.json(
        { success: false, error: "Full name, email, and role (TEACHER | ADMIN | STAFF | HOD) are required." },
        { status: 400 }
      );
    }

    if (!ALLOWED_STAFF_ROLES.includes(body.role)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized role assignment. Permitted roles: TEACHER, ADMIN, STAFF, HOD." },
        { status: 403 }
      );
    }

    const staffMember = await createStaff(institutionId, body);
    return NextResponse.json({
      success: true,
      message: "Staff member and login account provisioned successfully.",
      data: staffMember,
      invitationSent: (staffMember as any).invitationSent,
      previewUrl: (staffMember as any).previewUrl,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id, fullName, phone, role, designation, departmentId, department, employeeId } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "User ID is required." }, { status: 400 });
    }

    // Verify tenant ownership before updating
    const targetUser = await db.user.findFirst({
      where: { id, institutionId },
      include: { teacherProfile: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: "Staff member not found or access denied." },
        { status: 404 }
      );
    }

    // Block modifying Super Admin accounts
    if (targetUser.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Cannot modify a Super Admin user." },
        { status: 403 }
      );
    }

    // If role change requested, enforce allowed staff roles
    if (role !== undefined) {
      if (!ALLOWED_STAFF_ROLES.includes(role)) {
        return NextResponse.json(
          { success: false, error: "Unauthorized role assignment. Permitted roles: TEACHER, ADMIN, STAFF, HOD." },
          { status: 403 }
        );
      }
    }

    const effectiveRole = role || targetUser.role;
    const isFaculty = effectiveRole === "TEACHER" || effectiveRole === "HOD";

    const result = await db.user.updateMany({
      where: {
        id,
        institutionId,
        role: { not: "SUPER_ADMIN" },
      },
      data: {
        ...(fullName ? { fullName: String(fullName).trim() } : {}),
        ...(phone ? { phone: String(phone).trim() } : {}),
        ...(role ? { role } : {}),
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Staff member not found or access denied." },
        { status: 404 }
      );
    }

    // Synchronize or create Teacher profile if faculty role or designation/department is provided
    if (isFaculty || designation || departmentId || department) {
      const existingTeacher = targetUser.teacherProfile || await db.teacher.findFirst({
        where: { userId: id, institutionId },
      });

      const effectiveDepartment = department?.trim() || departmentId?.trim() || "Computer Science and Engineering";
      const effectiveDesignation = designation?.trim() || "Assistant Professor";
      const effectiveEmployeeId = employeeId?.trim() || `EMP-${id.slice(0, 8)}`;

      if (existingTeacher) {
        await db.teacher.update({
          where: { id: existingTeacher.id },
          data: {
            ...(designation ? { designation: effectiveDesignation } : {}),
            ...(department || departmentId ? { department: effectiveDepartment } : {}),
            ...(employeeId ? { employeeId: effectiveEmployeeId } : {}),
          },
        }).catch((err) => console.warn("[PUT /api/admin/staff] Non-fatal teacher update error:", err.message));
      } else if (isFaculty) {
        await db.teacher.create({
          data: {
            institutionId,
            userId: id,
            employeeId: effectiveEmployeeId,
            designation: effectiveDesignation,
            department: effectiveDepartment,
          },
        }).catch((err) => console.warn("[PUT /api/admin/staff] Non-fatal teacher create error:", err.message));
      }
    }

    const updated = await db.user.findFirst({
      where: { id, institutionId },
      include: { teacherProfile: true },
    });

    return NextResponse.json({
      success: true,
      message: "Staff member details updated.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req);
    const id = req.nextUrl.searchParams.get("id");
    const force = req.nextUrl.searchParams.get("force") === "true";

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Staff member ID is required." },
        { status: 400 }
      );
    }

    const result = await archiveTeacher(institutionId, id, actorUserId, force);
    return NextResponse.json({
      success: true,
      message: result.message,
      data: (result as any).data,
      alreadyArchived: (result as any).alreadyArchived,
    });
  } catch (error: any) {
    if (error.statusCode === 409) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          hasActiveAssignments: error.hasActiveAssignments,
          activeSlots: error.activeSlots,
        },
        { status: 409 }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req);
    const body = await req.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Staff member ID is required." },
        { status: 400 }
      );
    }

    if (action === "RESTORE") {
      const result = await restoreTeacher(institutionId, id, actorUserId);
      return NextResponse.json({
        success: true,
        message: result.message,
        notArchived: (result as any).notArchived,
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action: ${action}. Expected RESTORE.` },
      { status: 400 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
