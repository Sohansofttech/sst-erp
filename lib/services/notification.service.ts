import db from "../db";
import { sendAnnouncementNotification } from "./email.service";

export interface CreateNotificationParams {
  institutionId: string;
  title: string;
  message: string;
  category: "ACADEMIC" | "EXAMINATION" | "FEE" | "ANNOUNCEMENT" | "SYSTEM";
  audienceRole?: "ALL" | "STUDENT" | "PARENT" | "TEACHER";
  recipientUserIds?: string[];
}

/**
 * Reusable Notification Service
 * Section 25: Implement notifications for academic information, examinations, fees, and institution announcements.
 */
export async function sendNotification(params: CreateNotificationParams) {
  const notif = await db.notification.create({
    data: {
      institutionId: params.institutionId,
      title: params.title,
      message: params.message,
      category: params.category,
      audienceRole: params.audienceRole || "ALL",
    },
  });

  let userIds = params.recipientUserIds;
  let targetUsers: Array<{ id: string; email: string | null; name: string | null }> = [];

  if (!userIds || userIds.length === 0) {
    // If not specified, broadcast to relevant roles in this institution
    targetUsers = await db.user.findMany({
      where: {
        institutionId: params.institutionId,
        ...(params.audienceRole && params.audienceRole !== "ALL"
          ? { role: params.audienceRole }
          : {}),
      },
      select: { id: true, email: true, name: true },
    });
    userIds = targetUsers.map((u) => u.id);
  } else {
    targetUsers = await db.user.findMany({
      where: {
        id: { in: userIds },
        institutionId: params.institutionId,
      },
      select: { id: true, email: true, name: true },
    });
  }

  if (userIds.length > 0) {
    await db.notificationRecipient.createMany({
      data: userIds.map((uid) => ({
        notificationId: notif.id,
        userId: uid,
        isRead: false,
      })),
      skipDuplicates: true,
    });

    // Trigger non-blocking background email notification
    const emailRecipients = targetUsers
      .filter((u) => Boolean(u.email))
      .map((u) => ({ email: u.email!, name: u.name || undefined }));

    if (emailRecipients.length > 0) {
      db.institution
        .findUnique({
          where: { id: params.institutionId },
          select: { name: true },
        })
        .then((inst) => {
          sendAnnouncementNotification(emailRecipients, {
            title: params.title,
            message: params.message,
            category: params.category,
            institutionName: inst?.name || "Campus Administration",
          }).catch((err) => {
            console.warn("[sendNotification] Background email warning:", err.message);
          });
        })
        .catch(() => {});
    }
  }

  return notif;
}

export async function getUserNotifications(
  userIdOrOptions: string | { userId: string; institutionId?: string },
  institutionIdParam?: string
) {
  let userId: string;
  let institutionId: string | undefined;

  if (typeof userIdOrOptions === "object" && userIdOrOptions !== null) {
    userId = userIdOrOptions.userId;
    institutionId = userIdOrOptions.institutionId;
  } else {
    userId = userIdOrOptions;
    institutionId = institutionIdParam;
  }

  return await db.notificationRecipient.findMany({
    where: {
      userId,
      ...(institutionId
        ? {
            notification: {
              institutionId,
            },
          }
        : {}),
    },
    include: {
      notification: true,
    },
    orderBy: {
      notification: {
        createdAt: "desc",
      },
    },
    take: 50,
  });
}

export async function markNotificationAsRead(recipientId: string, userId: string) {
  return await db.notificationRecipient.updateMany({
    where: {
      id: recipientId,
      userId,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

export async function markAllNotificationsAsRead(userId: string, institutionId?: string) {
  return await db.notificationRecipient.updateMany({
    where: {
      userId,
      ...(institutionId
        ? {
            notification: {
              institutionId,
            },
          }
        : {}),
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}
