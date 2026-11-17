import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getPromotionBatches,
  getPromotionPolicies,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
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
    const body = await req.json();

    if (!body.name || !body.policyId || !body.fromAcademicYearId || !body.toAcademicYearId || !body.fromCourseId) {
      return NextResponse.json(
        { success: false, error: "Missing required promotion batch fields." },
        { status: 400 }
      );
    }

    const batchNumber = body.batchNumber || `PB-${Date.now().toString().slice(-4)}`;
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
        sourceClassId: body.sourceClassId || body.fromClassId,
        targetClassId: body.targetClassId || body.toClassId || body.sourceClassId,
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
