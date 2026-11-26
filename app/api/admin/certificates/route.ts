import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import {
  getCertificateTemplates,
  getIssuedCertificates,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireReadReq(req, institutionId);
    const query =
      req.nextUrl.searchParams.get("query") ||
      req.nextUrl.searchParams.get("code") ||
      req.nextUrl.searchParams.get("cert");

    if (query && query.trim()) {
      const q = query.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      const cert = await db.issuedCertificate.findFirst({
        where: {
          institutionId,
          OR: [
            { certificateNumber: { equals: q, mode: "insensitive" } },
            { verificationCode: { equals: q, mode: "insensitive" } },
            ...(isUuid ? [{ id: q }] : []),
          ],
        },
        include: {
          student: { select: { firstName: true, lastName: true, rollNumber: true } },
          template: true,
        },
      });

      if (!cert) {
        return NextResponse.json(
          { success: false, error: "Certificate not found or access denied." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          certificate: {
            id: cert.id,
            certificateNumber: cert.certificateNumber,
            verificationCode: cert.verificationCode,
            certificateType: cert.certificateType,
            title: cert.title,
            studentId: cert.studentId,
            studentName: cert.student ? `${cert.student.firstName} ${cert.student.lastName}`.trim() : "Student",
            studentRoll: cert.student?.rollNumber || "",
            issuedDate: cert.issuedAt ? cert.issuedAt.toISOString() : new Date().toISOString(),
            status: cert.status,
          },
          certificateNumber: cert.certificateNumber,
          verified: cert.status === "ACTIVE",
        },
      });
    }

    const [templates, issued] = await Promise.all([
      getCertificateTemplates(institutionId),
      getIssuedCertificates(institutionId),
    ]);

    return NextResponse.json({
      success: true,
      data: { templates, issued },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (body.type === "TEMPLATE") {
      if (!body.name || !body.certificateType) {
        return NextResponse.json(
          { success: false, error: "Template name and certificate type required." },
          { status: 400 }
        );
      }
      const template = await db.certificateTemplate.create({
        data: {
          institutionId,
          name: body.name,
          code: body.code || `TMPL-${Date.now().toString().slice(-4)}`,
          type: body.certificateType || "BONAFIDE",
          templateBody: body.templateBody || "This is to certify that {{studentName}} has successfully completed...",
          isActive: true,
        },
      });
      return NextResponse.json({
        success: true,
        message: "Certificate template created.",
        data: template,
      });
    }

    // Direct Issuance
    if (!body.studentId) {
      return NextResponse.json(
        { success: false, error: "Student ID is required." },
        { status: 400 }
      );
    }

    let templateId = body.templateId;
    if (!templateId) {
      let tmpl = await db.certificateTemplate.findFirst({
        where: { institutionId, isActive: true },
      });
      if (!tmpl) {
        tmpl = await db.certificateTemplate.create({
          data: {
            institutionId,
            name: `${body.certificateType || "General"} Certificate Template`,
            code: `TMPL-${Date.now().toString().slice(-4)}`,
            type: body.certificateType || "BONAFIDE",
            templateBody: "This is to certify that {{studentName}} has...",
            isActive: true,
          },
        });
      }
      templateId = tmpl.id;
    }

    const count = await db.issuedCertificate.count({ where: { institutionId } });
    const certNumber = `CERT-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const issued = await db.issuedCertificate.create({
      data: {
        institutionId,
        templateId,
        studentId: body.studentId,
        certificateNumber: certNumber,
        verificationCode: `VER-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: body.title || "Bonafide Certificate",
        certificateType: body.certificateType || "BONAFIDE",
        contentSnapshot: typeof body.contentSnapshot === "string" ? body.contentSnapshot : JSON.stringify(body.certificateData || {}),
        issuedByUserId: userId || "system",
        status: "ACTIVE",
      },
      include: { template: true },
    });

    return NextResponse.json({
      success: true,
      message: `Certificate ${certNumber} issued successfully.`,
      data: issued,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.ADMIN_ALL,
    });
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { id, status, remarks } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Certificate ID and status are required." },
        { status: 400 }
      );
    }

    const updated = await db.issuedCertificate.updateMany({
      where: { id, institutionId },
      data: {
        status: status.toUpperCase(),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: "Certificate not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Certificate status updated to ${status}.`,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
