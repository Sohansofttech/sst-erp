import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, requireActiveSubscription, handleAdminApiError } from "@/lib/security/admin-auth";
import { isFullAdminRole, PERMISSIONS } from "@/lib/security/rbac";
import {
  getStudents,
  createStudent,
  updateStudent,
  archiveOrDeleteStudent,
  restoreStudent,
  projectStudentDirectoryItem,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId, userRole } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.STUDENTS_READ,
    });
    await requireReadReq(req, institutionId);
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const take = parseInt(req.nextUrl.searchParams.get("take") || "100", 10);
    const scope = req.nextUrl.searchParams.get("scope");

    const students = await getStudents(institutionId, { search, status, take });

    // Departmental staff receive a sanitized read-only directory projection without sensitive personal data
    if (!isFullAdminRole(userRole) || scope === "directory") {
      const directory = students.map(projectStudentDirectoryItem);
      return NextResponse.json({
        success: true,
        readOnly: true,
        data: directory,
      });
    }

    return NextResponse.json({
      success: true,
      data: students,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await requireActiveSubscription(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (!body.fullName || !body.email || !body.rollNumber) {
      return NextResponse.json(
        { success: false, error: "Full name, email, and roll number are mandatory." },
        { status: 400 }
      );
    }

    const student = await createStudent(institutionId, {
      fullName: body.fullName,
      email: body.email,
      rollNumber: body.rollNumber,
      admissionNumber: body.admissionNumber,
      usn: body.usn,
      phone: body.phone,
      gender: body.gender,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      courseId: body.courseId,
      academicYearId: body.academicYearId,
      classId: body.classId,
      sectionId: body.sectionId,
      departmentId: body.departmentId,
      bloodGroup: body.bloodGroup,
      category: body.category,
      addressLine: body.addressLine,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      admissionDate: body.admissionDate ? new Date(body.admissionDate) : undefined,
      batch: body.batch,
      status: body.status,
    });

    return NextResponse.json({
      success: true,
      message: "Student record and login account provisioned successfully.",
      data: student,
      invitationSent: student.invitationSent,
      previewUrl: student.previewUrl,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await requireActiveSubscription(req);
    await requireWriteReq(req, institutionId);
    const { id, ...data } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Student ID is required." },
        { status: 400 }
      );
    }

    const updated = await updateStudent(institutionId, id, data);
    return NextResponse.json({
      success: true,
      message: "Student record updated.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await requireActiveSubscription(req);
    await requireWriteReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");
    const mode = (req.nextUrl.searchParams.get("mode") || "ARCHIVE").toUpperCase() as "ARCHIVE" | "DELETE" | "RESTORE";

    if (!id) {
      return NextResponse.json({ success: false, error: "Student ID required." }, { status: 400 });
    }

    if (mode === "RESTORE") {
      const result = await restoreStudent(institutionId, id, actorUserId);
      return NextResponse.json({
        success: true,
        message: result.message,
        data: (result as any).data,
      });
    }

    const updated = await archiveOrDeleteStudent(institutionId, id, mode);

    return NextResponse.json({
      success: true,
      message: `Student status transitioned to ${updated.status}. Historical records safely preserved.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await requireActiveSubscription(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Student ID required." }, { status: 400 });
    }

    if (action === "RESTORE") {
      const result = await restoreStudent(institutionId, id, actorUserId);
      return NextResponse.json({
        success: true,
        message: result.message,
        data: (result as any).data,
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
