import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getIAAssessments,
  createIAAssessment,
  saveIAAssessmentMarks,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const assessments = await getIAAssessments(institutionId);

    return NextResponse.json({
      success: true,
      data: assessments,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    const assessmentName = body.name || body.title;
    if (!assessmentName) {
      return NextResponse.json(
        { success: false, error: "Assessment name is required." },
        { status: 400 }
      );
    }

    let academicYearId = body.academicYearId;
    if (!academicYearId) {
      const activeAY = await db.academicYear.findFirst({
        where: { institutionId, status: "ACTIVE" },
        orderBy: { startDate: "desc" },
      });
      academicYearId = activeAY?.id || (await db.academicYear.findFirst({ where: { institutionId } }))?.id;
    }

    let courseId = body.courseId;
    if (!courseId) {
      const activeCourse = await db.course.findFirst({
        where: { institutionId },
        orderBy: { createdAt: "asc" },
      });
      courseId = activeCourse?.id || "";
    }

    const assessment = await createIAAssessment(institutionId, {
      name: assessmentName,
      courseId,
      academicYearId: academicYearId || "",
      academicTermId: body.academicTermId || academicYearId,
      classId: body.classId,
      sectionId: body.sectionId,
      subjectId: body.subjectId,
      maxMarks: parseFloat(body.maxMarks || "50"),
      weightagePercentage: parseFloat(body.weightagePercentage || body.weightage || "20"),
      assessmentDate: body.assessmentDate ? new Date(body.assessmentDate) : new Date(),
      components: body.components,
    });

    return NextResponse.json({
      success: true,
      message: "Internal Assessment configuration created successfully.",
      data: assessment,
    });
  } catch (error: any) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const body = await req.json();

    // 1. Marks entry / bulk update
    if (body.marks && Array.isArray(body.marks)) {
      let assessmentName = body.assessmentName || body.name;
      let subjectId = body.subjectId;
      let maxMarks = body.maxMarks !== undefined ? parseFloat(body.maxMarks) : undefined;

      const assessmentId = body.assessmentId || body.id;
      if (assessmentId && (!assessmentName || !subjectId || maxMarks === undefined)) {
        const record = await db.assessmentRecord.findFirst({
          where: { id: assessmentId, institutionId },
        });
        if (record) {
          if (!assessmentName) assessmentName = record.assessmentName;
          if (!subjectId) subjectId = record.subjectId;
          if (maxMarks === undefined) maxMarks = Number(record.maxMarks);
        } else {
          const apr = await db.approvalRequest.findFirst({
            where: { institutionId, requestType: "INTERNAL_ASSESSMENT", id: assessmentId },
          });
          if (apr) {
            const data = apr.requestedDataJson ? JSON.parse(apr.requestedDataJson) : {};
            if (!assessmentName) assessmentName = data.assessmentName || apr.title.replace(/^IA:\s*/, "");
            if (!subjectId) subjectId = data.subjectId;
            if (maxMarks === undefined) maxMarks = Number(data.maxMarks || 50);
          }
        }
      }

      if (!assessmentName || !subjectId) {
        return NextResponse.json(
          { success: false, error: "Assessment name and subject ID are required for marks entry." },
          { status: 400 }
        );
      }

      const normalizedMarks = body.marks.map((m: any) => ({
        studentId: m.studentId,
        marksObtained:
          m.marksObtained !== undefined
            ? m.marksObtained === null
              ? null
              : parseFloat(m.marksObtained)
            : m.score !== undefined
            ? parseFloat(m.score)
            : null,
        isAbsent: !!m.isAbsent,
        remarks: m.remarks,
      }));

      const result = await saveIAAssessmentMarks(institutionId, {
        assessmentName,
        subjectId,
        maxMarks: maxMarks ?? 50,
        marks: normalizedMarks,
      });

      return NextResponse.json({
        success: true,
        message: `Successfully saved marks for ${result.count} students.`,
        data: result,
      });
    }

    // 2. Status update (Publish / Approve / Moderate)
    const { id, name, status } = body;
    if (!status) {
      return NextResponse.json({ success: false, error: "Assessment status required." }, { status: 400 });
    }

    const targetName = name || id;
    const approvalStatus = status === "PUBLISHED" || status === "Published" ? "APPROVED" : status;

    await db.approvalRequest.updateMany({
      where: {
        institutionId,
        requestType: "INTERNAL_ASSESSMENT",
        title: { contains: targetName },
      },
      data: {
        status: approvalStatus,
        reviewedByUserId: userId,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Assessment status updated to ${status}.`,
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
      return NextResponse.json({ success: false, error: "Assessment ID required." }, { status: 400 });
    }

    const record = await db.assessmentRecord.findFirst({
      where: { id, institutionId },
    });

    let targetName: string | null = null;
    if (record) {
      targetName = record.assessmentName;
    } else {
      const apr = await db.approvalRequest.findFirst({
        where: { id, institutionId, requestType: "INTERNAL_ASSESSMENT" },
      });
      if (apr) {
        targetName = apr.title.replace(/^IA:\s*/, "");
      }
    }

    if (!targetName && !record) {
      return NextResponse.json({ success: false, error: "Assessment not found or access denied." }, { status: 404 });
    }

    if (targetName) {
      await db.assessmentRecord.deleteMany({
        where: { institutionId, assessmentName: targetName },
      });
      await db.approvalRequest.deleteMany({
        where: { institutionId, requestType: "INTERNAL_ASSESSMENT", title: { contains: targetName } },
      });
    } else if (record) {
      await db.assessmentRecord.deleteMany({ where: { id: record.id, institutionId } });
    }

    return NextResponse.json({ success: true, message: "Internal assessment deleted." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
