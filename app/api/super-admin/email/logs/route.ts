import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { getEmailDeliveryLogs } from "@/lib/services/email-config.service";
import { EmailDeliveryStatus, EmailPurpose } from "@/types/email-infrastructure";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const { searchParams } = new URL(req.url);

    const institutionId = searchParams.get("institutionId") || undefined;
    const status = (searchParams.get("status") as EmailDeliveryStatus) || undefined;
    const purpose = (searchParams.get("purpose") as EmailPurpose) || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await getEmailDeliveryLogs({
      institutionId,
      status,
      purpose,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.logs,
      total: result.total,
      limit,
      offset,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Unauthorized" },
      { status: err.status || 401 }
    );
  }
}
