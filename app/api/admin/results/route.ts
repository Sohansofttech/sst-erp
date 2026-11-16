import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { getResultBatches, publishResultBatch } from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const batches = await getResultBatches(institutionId);

    return NextResponse.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.name || !body.academicYearId || !body.courseId || !body.semester) {
      return NextResponse.json(
        { success: false, error: "Result batch name, academic year, course, and semester are required." },
        { status: 400 }
      );
    }

    const batchNumber = body.batchNumber || `RB-${Date.now().toString().slice(-4)}`;
    const batch = await db.resultBatch.create({
      data: {
        institutionId,
        batchName: body.name || body.batchName || `Semester ${body.semester} Results`,
        batchNumber,
        academicYearId: body.academicYearId,
        courseId: body.courseId,
        classId: body.classId,
        status: "DRAFT",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Result batch created.",
      data: batch,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id, action } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "Batch ID required." }, { status: 400 });
    }

    if (action === "PUBLISH") {
      const updated = await publishResultBatch(institutionId, id);
      return NextResponse.json({
        success: true,
        message: "Result batch published to students and parents.",
        data: updated,
      });
    }

    const updated = await db.resultBatch.update({
      where: { id },
      data: { status: action || "APPROVED" },
    });

    return NextResponse.json({
      success: true,
      message: `Result batch status updated to ${action}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
