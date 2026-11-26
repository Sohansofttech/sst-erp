import { NextRequest, NextResponse } from "next/server";
import { requireActiveSubscription, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import {
  createImportJob,
  finalizeImportJob,
  pauseImportJob,
  processStudentImportBatch,
  resumeImportJob,
} from "@/lib/services/student-import.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const actorUserId = userId || "system";
    const body = await req.json();
    const action = body.action as string;

    if (action === "start") {
      const totalRows = Number(body.totalRows || 0);
      if (!body.fileName || !Number.isInteger(totalRows) || totalRows <= 0) {
        return NextResponse.json(
          { success: false, error: "fileName and positive totalRows are required to start an import job." },
          { status: 400 }
        );
      }
      const job = await createImportJob({
        institutionId,
        actorUserId,
        fileName: String(body.fileName),
        fileType: body.fileType === "XLSX" ? "XLSX" : "CSV",
        totalRows,
      });
      return NextResponse.json({ success: true, data: job });
    }

    if (action === "batch") {
      if (!body.jobId || !Array.isArray(body.rows)) {
        return NextResponse.json(
          { success: false, error: "jobId and rows array are required for batch execution." },
          { status: 400 }
        );
      }
      const result = await processStudentImportBatch({
        institutionId,
        jobId: String(body.jobId),
        rows: body.rows,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "pause") {
      if (!body.jobId) {
        return NextResponse.json({ success: false, error: "jobId is required." }, { status: 400 });
      }
      const paused = await pauseImportJob({ institutionId, jobId: String(body.jobId) });
      return NextResponse.json({ success: true, data: paused });
    }

    if (action === "resume") {
      if (!body.jobId) {
        return NextResponse.json({ success: false, error: "jobId is required." }, { status: 400 });
      }
      const resumed = await resumeImportJob({ institutionId, jobId: String(body.jobId) });
      return NextResponse.json({ success: true, data: resumed });
    }

    if (action === "finalize") {
      if (!body.jobId) {
        return NextResponse.json({ success: false, error: "jobId is required." }, { status: 400 });
      }
      const finalized = await finalizeImportJob({
        institutionId,
        jobId: String(body.jobId),
        actorUserId,
        failedFatal: Boolean(body.failedFatal),
      });
      return NextResponse.json({ success: true, data: finalized });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Expected 'start', 'batch', 'pause', 'resume', or 'finalize'." },
      { status: 400 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
