import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getCertificateTemplates,
  getIssuedCertificates,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
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
    const { institutionId, userId } = await resolveAdminContext(req);
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
    if (!body.templateId || !body.studentId) {
      return NextResponse.json(
        { success: false, error: "Template ID and Student ID are required." },
        { status: 400 }
      );
    }

    const count = await db.issuedCertificate.count({ where: { institutionId } });
    const certNumber = `CERT-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const issued = await db.issuedCertificate.create({
      data: {
        institutionId,
        templateId: body.templateId,
        studentId: body.studentId,
        certificateNumber: certNumber,
        verificationCode: `VER-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: body.title || "Bonafide Certificate",
        certificateType: body.certificateType || "BONAFIDE",
        contentSnapshot: typeof body.contentSnapshot === "string" ? body.contentSnapshot : JSON.stringify(body.certificateData || {}),
        issuedByUserId: userId || "system",
        status: "ACTIVE",
      },
      include: { student: true, template: true },
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
