import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, requireActiveSubscription, handleAdminApiError } from "@/lib/security/admin-auth";
import { ForbiddenError } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/security/rbac";
import db from "@/lib/db";
import {
  getAdmissions,
  createAdmissionApplication,
  updateAdmissionStatus,
  convertAdmissionApplicationToStudent,
  updateAdmissionApplication,
  getAdmissionMeta,
  getAdmissionFollowUps,
  createAdmissionFollowUp,
  updateAdmissionFollowUpStatus,
  verifyAdmissionDocuments,
  getAuditLogs,
} from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMISSIONS_READ,
    });
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const includeMeta = req.nextUrl.searchParams.get("includeMeta") === "true";
    const includeHistory = req.nextUrl.searchParams.get("includeHistory") === "true";

    const [applications, meta, followUps, auditLogs] = await Promise.all([
      getAdmissions(institutionId, status),
      includeMeta ? getAdmissionMeta(institutionId) : Promise.resolve(undefined),
      includeHistory ? getAdmissionFollowUps(institutionId) : Promise.resolve(undefined),
      includeHistory
        ? getAuditLogs(institutionId, 50).then((logs) =>
            logs.filter(
              (l: any) =>
                (l.entityType || "").toUpperCase().includes("ADMISSION") ||
                (l.action || "").toUpperCase().includes("ADMISSION")
            )
          )
        : Promise.resolve(undefined),
    ]);

    const summary = {
      total: applications.length,
      submitted: applications.filter((a: any) => a.status === "SUBMITTED").length,
      underReview: applications.filter((a: any) => a.status === "UNDER_REVIEW").length,
      approved: applications.filter((a: any) => a.status === "APPROVED").length,
      enrolled: applications.filter((a: any) => a.status === "ENROLLED" || a.convertedStudentId).length,
      rejected: applications.filter((a: any) => a.status === "REJECTED").length,
      pendingDocs: applications.filter((a: any) => a.documentStatus !== "VERIFIED").length,
    };

    return NextResponse.json({
      success: true,
      data: applications,
      summary,
      ...(meta ? { meta } : {}),
      ...(followUps ? { followUps } : {}),
      ...(auditLogs ? { auditLogs } : {}),
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.ADMISSIONS_WRITE,
    });
    const body = await req.json();

    if (body.type === "FOLLOWUP" || body.action === "FOLLOWUP") {
      if (!body.applicationId || !body.followUpDate || !body.notes?.trim()) {
        return NextResponse.json(
          { success: false, error: "Application ID, follow-up date, and notes are required." },
          { status: 400 }
        );
      }
      const followUp = await createAdmissionFollowUp(institutionId, {
        applicationId: body.applicationId,
        followUpDate: body.followUpDate,
        channel: body.channel || "PHONE",
        notes: body.notes,
        status: body.status || "PENDING",
        actorUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message: "Admission follow-up scheduled.",
        data: followUp,
      });
    }

    const name = body.applicantName || `${body.applicantFirstName || ""} ${body.applicantLastName || ""}`.trim();
    if (!name || !body.email || !body.phone || !body.courseId || !body.academicYearId) {
      return NextResponse.json(
        { success: false, error: "Missing required applicant details." },
        { status: 400 }
      );
    }

    const application = await createAdmissionApplication(institutionId, body);
    return NextResponse.json({
      success: true,
      message: "Admission application registered successfully.",
      data: application,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId, permissions, userRole } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.ADMISSIONS_WRITE,
    });
    const body = await req.json();
    const { status, remarks, action, classId, sectionId, rollNumber, ...details } = body;

    if (action === "UPDATE_FOLLOWUP" && body.followUpId) {
      const updated = await updateAdmissionFollowUpStatus(
        institutionId,
        body.followUpId,
        body.followUpStatus || "COMPLETED",
        userId
      );
      return NextResponse.json({
        success: true,
        message: "Follow-up status updated.",
        data: updated,
      });
    }

    const targetId = body.id || body.applicationId;

    if (!targetId) {
      return NextResponse.json(
        { success: false, error: "Application ID is required." },
        { status: 400 }
      );
    }

    const statusUpper = (status || "").toUpperCase();
    const requiresApprovalPermission =
      action === "CONVERT" || action === "APPROVE" || statusUpper === "APPROVED" || statusUpper === "ENROLLED";
    if (requiresApprovalPermission && !hasPermission(permissions, PERMISSIONS.ADMISSIONS_APPROVE, userRole)) {
      throw new ForbiddenError("Forbidden: Admission approval or enrollment requires admissions:approve permission.");
    }

    if (action === "VERIFY_DOCUMENTS") {
      const result = await verifyAdmissionDocuments(
        institutionId,
        targetId,
        Array.isArray(body.documents) ? body.documents : [],
        remarks,
        userId
      );
      return NextResponse.json({
        success: true,
        message: `Document verification updated (${result.documentStatus}).`,
        data: result,
      });
    }

    if (action === "CONVERT" || status === "ENROLLED" || status === "Enrolled") {
      const conversion = await convertAdmissionApplicationToStudent(institutionId, targetId, {
        classId,
        sectionId,
        rollNumber,
        actorUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message: conversion.message,
        data: conversion,
      });
    }

    // If only status change is requested
    if (status && Object.keys(details).length === 0) {
      const updated = await updateAdmissionStatus(institutionId, targetId, status, remarks, userId);
      return NextResponse.json({
        success: true,
        message: `Application status updated to ${status}.`,
        data: updated,
      });
    }

    // Full application edit / update
    const updated = await updateAdmissionApplication(institutionId, targetId, {
      ...details,
      ...(status ? { status } : {}),
      ...(remarks !== undefined ? { remarks } : {}),
    });

    return NextResponse.json({
      success: true,
      message: "Application details updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  return PUT(req);
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.ADMISSIONS_WRITE,
    });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Application ID is required." }, { status: 400 });
    }
    const result = await db.admissionApplication.deleteMany({
      where: { id, institutionId, convertedStudentId: null },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Application not found, already converted, or access denied." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: "Application deleted successfully." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
