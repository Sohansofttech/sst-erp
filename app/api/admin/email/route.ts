import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import db from "@/lib/db";
import {
  sendDirectEmail,
  sendRoleCredentialInvitation,
  sendAnnouncementNotification,
  previewEmail,
  getEmailServiceStatus,
} from "@/lib/services/email.service";
import { signPasswordSetupToken } from "@/lib/auth/jwt";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action") || "recipients";

    // 1. Service Status
    if (action === "status") {
      const status = await getEmailServiceStatus();
      return NextResponse.json({ success: true, data: status });
    }

    // 2. Email Preview Generator
    if (action === "preview") {
      const type = (searchParams.get("type") || "DIRECT") as "ANNOUNCEMENT" | "INVITATION" | "DIRECT";
      const title = searchParams.get("title") || "Notice";
      const message = searchParams.get("message") || "Message body preview.";
      const category = searchParams.get("category") || "GENERAL";
      const role = (searchParams.get("role") || "STUDENT") as any;
      const recipientName = searchParams.get("recipientName") || "Sample Recipient";

      const inst = await db.institution.findUnique({
        where: { id: institutionId },
        select: { name: true, slug: true },
      });
      const institutionName = inst?.name || "Campus Administration";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      let loginUrl = `${appUrl}/login`;
      if (role === "TEACHER") loginUrl = `${appUrl}/campus/${inst?.slug || "demo"}/teacher`;
      else if (role === "PARENT") loginUrl = `${appUrl}/login`;
      else if (role === "STUDENT") loginUrl = `${appUrl}/login`;

      const preview = previewEmail(type, {
        title,
        subject: title,
        message,
        category,
        role,
        recipientName,
        name: recipientName,
        username: "user.credentials@campus.edu",
        institutionName,
        setupUrl: `${appUrl}/auth/setup-password?token=PREVIEW_TOKEN_SAMPLE_ONLY`,
        loginUrl,
        expiresIn: "24 hours",
        actionUrl: `${appUrl}/dashboard`,
        actionLabel: "View Notice in Portal",
      });

      return NextResponse.json({ success: true, data: preview });
    }

    // 3. Recipient Directory Search (Strictly scoped to institutionId)
    const roleParam = searchParams.get("role") || "ALL";
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    // Determine target roles
    let roleFilterClause: any = { role: { in: ["STUDENT", "TEACHER", "STAFF", "PARENT", "GUARDIAN"] } };
    if (roleParam === "STUDENT") {
      roleFilterClause = { role: "STUDENT" };
    } else if (roleParam === "TEACHER") {
      roleFilterClause = { role: "TEACHER" };
    } else if (roleParam === "PARENT" || roleParam === "GUARDIAN") {
      roleFilterClause = { role: { in: ["PARENT", "GUARDIAN"] } };
    } else if (roleParam === "STAFF") {
      roleFilterClause = { role: { in: ["STAFF", "ADMIN"] } };
    }

    // Build search conditions
    const orConditions: any[] = [];
    if (q) {
      orConditions.push(
        { fullName: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } }
      );

      // Student identifiers
      orConditions.push({
        studentProfile: {
          OR: [
            { rollNumber: { contains: q, mode: "insensitive" } },
            { admissionNumber: { contains: q, mode: "insensitive" } },
          ],
        },
      });

      // Teacher identifiers
      orConditions.push({
        teacherProfile: {
          OR: [
            { employeeId: { contains: q, mode: "insensitive" } },
            { department: { contains: q, mode: "insensitive" } },
          ],
        },
      });

      // Guardian & Linked Children identifiers
      orConditions.push({
        guardianAccount: {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            {
              guardianLinks: {
                some: {
                  student: {
                    OR: [
                      { fullName: { contains: q, mode: "insensitive" } },
                      { rollNumber: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              },
            },
          ],
        },
      });
    }

    const users = await db.user.findMany({
      where: {
        institutionId,
        email: { not: "" },
        ...roleFilterClause,
        ...(orConditions.length > 0 ? { OR: orConditions } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        name: true,
        role: true,
        phone: true,
        studentProfile: {
          select: { rollNumber: true, admissionNumber: true },
        },
        teacherProfile: {
          select: { employeeId: true, department: true, designation: true },
        },
        guardianAccount: {
          select: {
            fullName: true,
            phone: true,
            guardianLinks: {
              where: {
                isVerified: true,
                canAccessPortal: true,
              },
              select: {
                isVerified: true,
                canAccessPortal: true,
                relationship: true,
                student: {
                  select: { fullName: true, rollNumber: true },
                },
              },
            },
          },
        },
      },
      take: 100,
      orderBy: { fullName: "asc" },
    });

    // Post-filter: For guardians, require at least one verified & portal-accessible relationship
    const authorizedUsers = users.filter((u) => {
      if (u.role === "PARENT" || u.role === "GUARDIAN") {
        return !!(u.guardianAccount?.guardianLinks && u.guardianAccount.guardianLinks.length > 0);
      }
      return true;
    });

    const formattedRecipients = authorizedUsers.map((u) => {
      let identifier: string = u.role || "Member";
      if (u.role === "STUDENT") {
        identifier = u.studentProfile?.rollNumber || u.studentProfile?.admissionNumber || "Student";
      } else if (u.role === "TEACHER") {
        identifier = u.teacherProfile?.employeeId || "Faculty";
      } else if (u.role === "PARENT" || u.role === "GUARDIAN") {
        const studentNames = (u.guardianAccount?.guardianLinks || [])
          .map((l) => `${l.student.fullName}${l.student.rollNumber ? ` (${l.student.rollNumber})` : ""}`)
          .join(", ");
        identifier = studentNames ? `Student: ${studentNames}` : (u.guardianAccount?.phone || "Guardian");
      }

      return {
        id: u.id,
        email: u.email,
        name: u.fullName || u.guardianAccount?.fullName || u.name || "Member",
        role: (u.role === "GUARDIAN" ? "PARENT" : u.role) || "MEMBER",
        identifier,
        department: u.teacherProfile?.department || undefined,
        designation: u.teacherProfile?.designation || undefined,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedRecipients,
      count: formattedRecipients.length,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req);
    const body = await req.json();
    const { action, recipientIds, title, message, category } = body;

    if (!action || !recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Action and non-empty recipientIds array are required." },
        { status: 400 }
      );
    }

    // 1. Fetch institution details
    const institution = await db.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true, slug: true },
    });
    if (!institution) {
      return NextResponse.json({ success: false, error: "Institution not found." }, { status: 404 });
    }

    // 2. Strict Tenant Scoping: Verify all recipient IDs belong exclusively to this institution
    const targetUsers = await db.user.findMany({
      where: {
        id: { in: recipientIds },
        institutionId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        name: true,
        role: true,
        passwordHash: true,
      },
    });

    if (targetUsers.length !== recipientIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "One or more selected recipients do not belong to your institution or are deactivated.",
        },
        { status: 403 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const results: Array<{ id: string; email: string; success: boolean; previewUrl?: string | false; error?: string }> = [];

    // ACTION A: DIRECT MESSAGE TO SELECTED USERS
    if (action === "SEND_DIRECT") {
      if (!title || !message) {
        return NextResponse.json(
          { success: false, error: "Subject title and message content are required." },
          { status: 400 }
        );
      }

      for (const user of targetUsers) {
        const sendRes = await sendDirectEmail(
          { email: user.email, name: user.fullName || user.name || undefined },
          {
            subject: title,
            message,
            senderName: `${institution.name} Administration`,
            institutionName: institution.name,
            actionUrl: `${appUrl}/dashboard`,
            actionLabel: "View in Campus Portal",
          }
        );

        results.push({
          id: user.id,
          email: user.email,
          success: sendRes.success,
          previewUrl: sendRes.previewUrl,
          error: sendRes.error,
        });
      }
    }

    // ACTION B: SEND ANNOUNCEMENT TO SELECTED RECIPIENTS (With in-app sync)
    else if (action === "SEND_ANNOUNCEMENT") {
      if (!title || !message) {
        return NextResponse.json(
          { success: false, error: "Announcement title and message are required." },
          { status: 400 }
        );
      }

      // 1. Create in-app Notification record in DB
      const notif = await db.notification.create({
        data: {
          institutionId,
          title,
          message,
          category: category || "GENERAL",
          audienceRole: "ALL",
        },
      });

      // 2. Link in-app recipients in DB
      await db.notificationRecipient.createMany({
        data: targetUsers.map((u) => ({
          notificationId: notif.id,
          userId: u.id,
          isRead: false,
        })),
        skipDuplicates: true,
      });

      // 3. Dispatch emails
      const emailList = targetUsers.map((u) => ({
        email: u.email,
        name: u.fullName || u.name || undefined,
      }));

      const sendRes = await sendAnnouncementNotification(emailList, {
        title,
        message,
        category: category || "GENERAL",
        institutionName: institution.name,
        actionUrl: `${appUrl}/dashboard`,
      });

      for (const u of targetUsers) {
        results.push({
          id: u.id,
          email: u.email,
          success: sendRes.success,
          previewUrl: sendRes.previewUrl,
          error: sendRes.error,
        });
      }
    }

    // ACTION C: ACCOUNT INVITATION & PASSWORD SETUP
    else if (action === "SEND_INVITATION") {
      for (const user of targetUsers) {
        const setupToken = await signPasswordSetupToken({
          userId: user.id,
          email: user.email,
          institutionId,
          passwordHash: user.passwordHash || null,
        });

        const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;
        let loginUrl = `${appUrl}/login`;
        if (user.role === "TEACHER") loginUrl = `${appUrl}/campus/${institution.slug || "demo"}/teacher`;
        else if (user.role === "PARENT" || user.role === "GUARDIAN") loginUrl = `${appUrl}/login`;
        else if (user.role === "ADMIN") loginUrl = `${appUrl}/admin/dashboard`;
        else if (user.role === "STUDENT") loginUrl = `${appUrl}/login`;

        const sendRes = await sendRoleCredentialInvitation(
          { email: user.email, name: user.fullName || user.name || undefined },
          {
            role: (user.role === "GUARDIAN" ? "PARENT" : user.role as any) || "STUDENT",
            setupUrl,
            loginUrl,
            username: user.email,
            institutionName: institution.name,
            expiresIn: "24 hours",
          }
        );

        results.push({
          id: user.id,
          email: user.email,
          success: sendRes.success,
          previewUrl: sendRes.previewUrl,
          error: sendRes.error,
        });
      }
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported email action '${action}'.` },
        { status: 400 }
      );
    }

    const dispatchedCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;
    const samplePreviewUrl = results.find((r) => r.previewUrl)?.previewUrl;

    return NextResponse.json({
      success: dispatchedCount > 0 || results.length === 0,
      message: `Dispatched ${dispatchedCount} email(s) successfully.${failedCount > 0 ? ` (${failedCount} failed)` : ""}`,
      dispatchedCount,
      failedCount,
      previewUrl: samplePreviewUrl || undefined,
      results,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
