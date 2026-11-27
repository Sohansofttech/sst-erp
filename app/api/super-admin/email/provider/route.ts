import { connection, NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import {
  getCentralEmailConfig,
  saveCentralEmailConfig,
  toMaskedCentralConfig,
} from "@/lib/services/email-config.service";
import nodemailer from "nodemailer";

export async function GET(req: NextRequest) {
  await connection();
  try {
    await requireSuperAdmin();
    const config = await getCentralEmailConfig();
    return NextResponse.json({
      success: true,
      data: toMaskedCentralConfig(config),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Unauthorized" },
      { status: err.status || 401 }
    );
  }
}

export async function POST(req: NextRequest) {
  await connection();
  try {
    const admin = await requireSuperAdmin();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    // Action: Test Connection
    if (action === "test") {
      const config = await getCentralEmailConfig();

      if (config.provider === "SMTP") {
        const creds = config.credentials as any;
        if (!creds?.host) {
          return NextResponse.json(
            { success: false, error: "SMTP host is required to test central connection." },
            { status: 400 }
          );
        }

        try {
          const transporter = nodemailer.createTransport({
            host: creds.host,
            port: creds.port || 587,
            secure: Boolean(creds.secure),
            auth: creds.username ? { user: creds.username, pass: creds.password || "" } : undefined,
            connectionTimeout: 8000,
          });
          await transporter.verify();
          return NextResponse.json({
            success: true,
            message: `Central SMTP connection to ${creds.host}:${creds.port} verified successfully.`,
          });
        } catch (smtpErr: any) {
          return NextResponse.json(
            { success: false, error: `Central SMTP verification failed: ${smtpErr.message}` },
            { status: 502 }
          );
        }
      } else {
        // Resend API Key check
        const apiKey = (config.credentials as any)?.apiKey || process.env.RESEND_API_KEY || "";
        if (!apiKey) {
          return NextResponse.json(
            { success: false, error: "Central Resend API key is not configured." },
            { status: 400 }
          );
        }

        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${config.senderName} <${config.senderEmail}>`,
              to: "delivered@resend.dev",
              subject: "SST-ERP — Central Super Admin Provider Connection Probe",
              html: "<p>Central verification probe</p>",
            }),
          });

          if (res.ok) {
            return NextResponse.json({
              success: true,
              message: "Central Resend provider verified successfully.",
            });
          } else {
            const body: any = await res.json().catch(() => ({}));
            return NextResponse.json(
              { success: false, error: `Resend verification error: ${body.message || res.statusText}` },
              { status: 502 }
            );
          }
        } catch (netErr: any) {
          return NextResponse.json(
            { success: false, error: `Network error contacting Resend API: ${netErr.message}` },
            { status: 502 }
          );
        }
      }
    }

    // Default: Save configuration
    const body = await req.json();
    const updated = await saveCentralEmailConfig(body, (admin as any)?.id);

    return NextResponse.json({
      success: true,
      message: "Central email provider configuration saved securely.",
      data: toMaskedCentralConfig(updated),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save central configuration" },
      { status: err.status || 500 }
    );
  }
}
