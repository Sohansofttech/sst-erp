import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getNotifications,
  broadcastNotification,
  updateNotification,
  deleteNotification,
} from "@/lib/services/institution-admin.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
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
    await requireWriteReq(req, institutionId);
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
      category: body.category || "ANNOUNCEMENT",
      targetRole: body.targetRole || "ALL",
      targetCourseId: body.targetCourseId,
      targetSemester: body.targetSemester !== undefined ? parseInt(body.targetSemester, 10) : undefined,
      targetSectionId: body.targetSectionId,
      priority: body.priority,
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

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ success: false, error: "Notification ID is required." }, { status: 400 });
    }

    const updated = await updateNotification(institutionId, body.id, {
      title: body.title,
      message: body.message,
      category: body.category,
    });

    return NextResponse.json({
      success: true,
      message: "Announcement updated successfully.",
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
      return NextResponse.json({ success: false, error: "Notification ID is required." }, { status: 400 });
    }

    await deleteNotification(institutionId, id);

    return NextResponse.json({
      success: true,
      message: "Announcement deactivated and deleted.",
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
