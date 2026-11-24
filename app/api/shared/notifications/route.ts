import { NextRequest, NextResponse } from "next/server";
import { requireAuth, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { getUserNotifications, markNotificationAsRead } from "@/lib/services/notification.service";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (!session || !session.userId) {
      return NextResponse.json({ success: true, data: [] });
    }
    const notifications = await getUserNotifications(session.userId, session.institutionId);

    return NextResponse.json({
      success: true,
      data: (notifications || []).map((n) => ({
        id: n.id,
        title: n.notification?.title || "",
        message: n.notification?.message || "",
        category: n.notification?.category || "SYSTEM",
        isRead: n.isRead,
        createdAt: n.notification?.createdAt,
      })),
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError || err?.name === "UnauthorizedError" || err?.status === 401) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError || err?.name === "ForbiddenError" || err?.status === 403) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 });
    }
    console.error("[Notifications GET] Error:", err?.message || err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const body = await req.json();
    const { notificationRecipientId, markAll } = body;

    if (markAll) {
      const db = (await import("@/lib/db")).default;
      await db.notificationRecipient.updateMany({
        where: {
          userId: session.userId,
          notification: { institutionId: session.institutionId },
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
      return NextResponse.json({
        success: true,
        message: "All notifications marked as read.",
      });
    }

    if (!notificationRecipientId) {
      return NextResponse.json({ success: false, error: "Recipient ID required" }, { status: 400 });
    }

    await markNotificationAsRead(notificationRecipientId, session.userId);

    return NextResponse.json({
      success: true,
      message: "Notification marked as read.",
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError || err?.name === "UnauthorizedError" || err?.status === 401) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError || err?.name === "ForbiddenError" || err?.status === 403) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 });
    }
    console.error("[Notifications POST] Error:", err?.message || err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
