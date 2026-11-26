import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getPromotionBatches,
  getPromotionPolicies,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const [batches, policies] = await Promise.all([
      getPromotionBatches(institutionId),
      getPromotionPolicies(institutionId),
    ]);

    return NextResponse.json({
      success: true,
      data: { batches, policies },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (!body.name || !body.policyId || !body.fromAcademicYearId || !body.toAcademicYearId || !body.fromCourseId) {
      return NextResponse.json(
        { success: false, error: "Missing required promotion batch fields." },
        { status: 400 }
      );
    }

    const batchNumber = body.batchNumber || `PB-${Date.now().toString().slice(-4)}`;

    let sourceClassId = body.sourceClassId || body.fromClassId;
    if (!sourceClassId) {
      const cls = await db.class.findFirst({
        where: { institutionId, courseId: body.fromCourseId || body.sourceCourseId },
      });
      sourceClassId = cls?.id;
      if (!sourceClassId) {
        const anyCls = await db.class.findFirst({ where: { institutionId } });
        if (anyCls) {
          sourceClassId = anyCls.id;
        } else {
          const newCls = await db.class.create({
            data: {
              institutionId,
              name: "Class 1",
              code: `CLS-1-${Date.now().toString().slice(-4)}`,
              academicYearId: body.fromAcademicYearId || body.sourceAcademicYearId,
              courseId: body.fromCourseId || body.sourceCourseId,
              semester: 1,
            },
          });
          sourceClassId = newCls.id;
        }
      }
    }
    const targetClassId = body.targetClassId || body.toClassId || sourceClassId;

    const batch = await db.promotionBatch.create({
      data: {
        institutionId,
        batchName: body.name || body.batchName || `Batch Promotion ${batchNumber}`,
        batchNumber,
        policyId: body.policyId,
        sourceAcademicYearId: body.fromAcademicYearId || body.sourceAcademicYearId,
        targetAcademicYearId: body.toAcademicYearId || body.targetAcademicYearId,
        sourceCourseId: body.fromCourseId || body.sourceCourseId,
        targetCourseId: body.toCourseId || body.targetCourseId || body.fromCourseId,
        sourceClassId,
        targetClassId,
        status: "DRAFT",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Promotion batch initialized.",
      data: batch,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { id, batchId, action, status, studentIds } = body;

    if (action === "UPDATE_POLICY" || body.policy) {
      const pol = body.policy || body;
      if (pol.id && !pol.id.startsWith("policy-new")) {
        await db.promotionPolicy.updateMany({
          where: { id: pol.id, institutionId },
          data: {
            name: pol.name,
            minCgpa: pol.minCgpa !== undefined ? pol.minCgpa : undefined,
            minSgpa: pol.minSgpa !== undefined ? pol.minSgpa : undefined,
            maxBacklogsAllowed: pol.maxAllowedBacklogs !== undefined ? pol.maxAllowedBacklogs : undefined,
          },
        });
      }
      return NextResponse.json({
        success: true,
        message: "Promotion policy updated successfully.",
      });
    }

    const targetBatchId = id || batchId;
    if (!targetBatchId) {
      return NextResponse.json({ success: false, error: "Promotion batch ID required." }, { status: 400 });
    }

    const batch = await db.promotionBatch.findFirst({
      where: { id: targetBatchId, institutionId },
    });

    if (!batch) {
      return NextResponse.json({ success: false, error: "Promotion batch not found or access denied." }, { status: 404 });
    }

    if (action === "EXECUTE" || status === "EXECUTED" || status === "Executed") {
      const ids: string[] = Array.isArray(studentIds) ? studentIds : [];
      let promotedCount = 0;

      await db.$transaction(async (tx) => {
        for (const sId of ids) {
          // Find existing active enrollment
          const currentEnrollment = await tx.enrollment.findFirst({
            where: {
              institutionId,
              studentId: sId,
              status: "ACTIVE",
            },
            orderBy: { enrolledDate: "desc" },
          });

          const currentSem = currentEnrollment?.semester || 1;
          const targetSem = currentSem + 1;

          if (currentEnrollment) {
            await tx.enrollment.update({
              where: { id: currentEnrollment.id },
              data: {
                status: "PROMOTED",
                completedDate: new Date(),
                promotionRemarks: `Promoted via batch ${batch.batchNumber}`,
              },
            });
          }

          // Check if already enrolled in target academic year to prevent duplicates
          const existingTarget = await tx.enrollment.findFirst({
            where: {
              institutionId,
              studentId: sId,
              academicYearId: batch.targetAcademicYearId,
            },
          });

          if (!existingTarget) {
            await tx.enrollment.create({
              data: {
                institutionId,
                studentId: sId,
                academicYearId: batch.targetAcademicYearId,
                courseId: batch.targetCourseId || batch.sourceCourseId,
                semester: targetSem,
                section: "A",
                status: "ACTIVE",
              },
            });
          }
          promotedCount++;
        }

        await tx.promotionBatch.update({
          where: { id: targetBatchId },
          data: {
            status: "EXECUTED",
          },
        });
      });

      return NextResponse.json({
        success: true,
        message: `Promotion batch ${batch.batchNumber} executed. ${promotedCount} students enrolled into new academic cycle.`,
      });
    }

    // Status transition (e.g. Under Review, Approved, Draft)
    const nextStatus = status || action || "APPROVED";
    const updated = await db.promotionBatch.updateMany({
      where: { id: targetBatchId, institutionId },
      data: { status: nextStatus.toUpperCase() },
    });

    return NextResponse.json({
      success: true,
      message: `Promotion batch status updated to ${nextStatus}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Batch ID required." }, { status: 400 });
    }

    const result = await db.promotionBatch.deleteMany({
      where: { id, institutionId, status: { not: "EXECUTED" } },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Batch not found, already executed, or access denied." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "Promotion batch deleted." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
