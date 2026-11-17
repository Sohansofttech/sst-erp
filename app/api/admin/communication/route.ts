import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getNotifications,
  broadcastNotification,
} from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const notifications = await getNotifications(institutionId);

    return NextResponse.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.title || !body.message) {
      return NextResponse.json(
        { success: false, error: "Notification title and message body are required." },
        { status: 400 }
      );
    }

    const broadcast = await broadcastNotification(institutionId, {
      title: body.title,
      message: body.message,
      category: body.category || "GENERAL",
      targetRole: body.targetRole || "ALL",
    });

    return NextResponse.json({
      success: true,
      message: "Notification broadcast dispatched across recipient channels.",
      data: broadcast,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
