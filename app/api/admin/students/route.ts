import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getStudents,
  createStudent,
  updateStudent,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const take = parseInt(req.nextUrl.searchParams.get("take") || "100", 10);

    const students = await getStudents(institutionId, { search, status, take });
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
    const { institutionId } = await resolveAdminContext(req);
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
      usn: body.usn,
      phone: body.phone,
      gender: body.gender,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      courseId: body.courseId,
      academicYearId: body.academicYearId,
      classId: body.classId,
      sectionId: body.sectionId,
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
    const { institutionId } = await resolveAdminContext(req);
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
    const { institutionId } = await resolveAdminContext(req);
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Student ID required." }, { status: 400 });
    }

    // Atomic soft delete / archive scoped to institutionId
    const result = await db.student.updateMany({
      where: { id, institutionId },
      data: { status: "ARCHIVED" as any },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Student not found or access denied." },
        { status: 404 }
      );
    }

    const updated = await db.student.findFirst({
      where: { id, institutionId },
    });

    return NextResponse.json({
      success: true,
      message: "Student status transitioned to ARCHIVED.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
