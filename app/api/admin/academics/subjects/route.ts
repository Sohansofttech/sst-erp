import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getSubjects,
  createSubject,
  updateSubject,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

const normalizeSubjectType = (val?: string) => {
  if (!val) return "CORE_THEORY";
  const upper = val.toUpperCase().trim();
  if (upper === "PRACTICAL / LAB" || upper === "PRACTICAL_LAB") return "PRACTICAL_LAB";
  if (upper === "DEPARTMENT ELECTIVE" || upper === "DEPARTMENT_ELECTIVE") return "DEPARTMENT_ELECTIVE";
  if (upper === "OPEN ELECTIVE" || upper === "OPEN_ELECTIVE") return "OPEN_ELECTIVE";
  if (upper === "PROJECT / SEMINAR" || upper === "PROJECT_SEMINAR") return "PROJECT_SEMINAR";
  return "CORE_THEORY";
};

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
      name: body.name.trim(),
      code: body.code.trim().toUpperCase(),
      courseId: body.courseId,
      semester: parseInt(body.semester || "1", 10),
      credits: parseInt(body.credits || "3", 10),
      hoursPerWeek: body.hoursPerWeek ? parseInt(body.hoursPerWeek, 10) : 3,
      type: normalizeSubjectType(body.type),
      isElective: !!body.isElective,
      syllabus: body.syllabus,
      description: body.description,
      allocatedTeacherName: body.allocatedTeacherName,
    });

    return NextResponse.json({
      success: true,
      message: "Subject created successfully.",
      data: subject,
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
    const {
      id,
      name,
      code,
      courseId,
      semester,
      credits,
      hoursPerWeek,
      type,
      isElective,
      syllabus,
      description,
      allocatedTeacherName,
      status,
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Subject ID required." },
        { status: 400 }
      );
    }

    const updated = await updateSubject(institutionId, id, {
      name: name?.trim(),
      code: code ? code.trim().toUpperCase() : undefined,
      courseId: courseId || undefined,
      semester: semester !== undefined ? parseInt(semester, 10) : undefined,
      credits: credits !== undefined ? parseInt(credits, 10) : undefined,
      hoursPerWeek: hoursPerWeek !== undefined ? parseInt(hoursPerWeek, 10) : undefined,
      type: type ? normalizeSubjectType(type) : undefined,
      isElective: typeof isElective === "boolean" ? isElective : undefined,
      syllabus: syllabus !== undefined ? syllabus : undefined,
      description: description !== undefined ? description : undefined,
      allocatedTeacherName: allocatedTeacherName !== undefined ? allocatedTeacherName : undefined,
      status: status ? (status.toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE") : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Subject updated successfully.",
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
      return NextResponse.json({ success: false, error: "Subject ID required." }, { status: 400 });
    }

    const result = await db.subject.deleteMany({
      where: { id, institutionId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Subject not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Subject removed." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
