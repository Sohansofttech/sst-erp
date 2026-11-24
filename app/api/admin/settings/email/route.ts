import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getInstitutionEmailConfig,
  saveInstitutionEmailConfig,
  testInstitutionEmailConnection,
  toMaskedInstitutionConfig,
} from "@/lib/services/email-config.service";

/**
 * Institution Admin Email Configuration API
 * Option C Architecture: Institution-Specific Email Configuration with Central Sohan Softech Fallback
 */
export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const config = await getInstitutionEmailConfig(institutionId);

    return NextResponse.json({
      success: true,
      data: toMaskedInstitutionConfig(config),
    });
  } catch (err: any) {
    return handleAdminApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    // Action 1: Test Connection & Verify Sender
    if (action === "test") {
      const result = await testInstitutionEmailConnection(institutionId);
      const updatedConfig = await getInstitutionEmailConfig(institutionId);

      return NextResponse.json({
        success: result.success,
        message: result.message,
        details: result.details,
        data: toMaskedInstitutionConfig(updatedConfig),
      });
    }

    // Action 2: Enable / Disable Provider Toggle
    if (action === "toggle") {
      const body = await req.json();
      const current = await getInstitutionEmailConfig(institutionId);

      // Security check: cannot enable unverified provider
      if (body.isEnabled && current.status !== "VERIFIED") {
        return NextResponse.json(
          {
            success: false,
            error: "Cannot enable unverified email provider. Please perform a successful connection test first.",
          },
          { status: 400 }
        );
      }

      const updated = await saveInstitutionEmailConfig(
        institutionId,
        {
          provider: current.provider,
          senderEmail: current.senderEmail,
          senderName: current.senderName,
          replyToEmail: current.replyToEmail,
          isEnabled: Boolean(body.isEnabled),
        },
        userId
      );

      return NextResponse.json({
        success: true,
        message: updated.isEnabled ? "Institution email delivery enabled." : "Institution email delivery disabled. System will use central Sohan Softech sender.",
        data: toMaskedInstitutionConfig(updated),
      });
    }

    // Action 3: Save Configuration
    const body = await req.json();

    if (!body.senderEmail || !body.senderEmail.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid official sender email address is required." },
        { status: 400 }
      );
    }

    const updated = await saveInstitutionEmailConfig(
      institutionId,
      {
        provider: body.provider || "SMTP",
        senderEmail: body.senderEmail,
        senderName: body.senderName || "",
        replyToEmail: body.replyToEmail || undefined,
        isEnabled: body.isEnabled !== undefined ? body.isEnabled : false,
        credentials: body.credentials || undefined,
      },
      userId
    );

    return NextResponse.json({
      success: true,
      message: "Institution email settings saved securely. Please test connection to verify sender authorization.",
      data: toMaskedInstitutionConfig(updated),
    });
  } catch (err: any) {
    return handleAdminApiError(err);
  }
}
