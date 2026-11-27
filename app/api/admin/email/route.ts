import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import db from "@/lib/db";
import {
  sendDirectEmail,
  sendRoleCredentialInvitation,
  sendAnnouncementNotification,
  previewEmail,
  getEmailServiceStatus,
  getAppBaseUrl,
  getRolePortalLoginUrl,
} from "@/lib/services/email.service";
import { signPasswordSetupToken } from "@/lib/auth/jwt";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
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
      const appUrl = getAppBaseUrl();

      const loginUrl = getRolePortalLoginUrl(role, inst?.slug, appUrl);

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
        isActive: true,
        passwordHash: true,
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
                studentId: true,
                isVerified: true,
                canAccessPortal: true,
                relationship: true,
                student: {
                  select: { id: true, fullName: true, rollNumber: true },
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

    // Auto-heal guardians who have synthetic internal addresses if a real email was saved in AdmissionApplication
    for (const u of authorizedUsers) {
      if ((u.role === "PARENT" || u.role === "GUARDIAN") && (u.email.endsWith(".internal") || u.email.includes("@guardian.internal"))) {
        try {
          const studentIds = (u.guardianAccount?.guardianLinks || [])
            .map((gl: any) => gl.student?.id || gl.studentId)
            .filter(Boolean);

          if (studentIds.length > 0) {
            const appWithEmail = await db.admissionApplication.findFirst({
              where: {
                institutionId,
                convertedStudentId: { in: studentIds },
                guardianEmail: { not: null },
              },
              select: { guardianEmail: true },
            });
            if (
              appWithEmail?.guardianEmail &&
              !appWithEmail.guardianEmail.endsWith(".internal") &&
              /^[^\s@]+@[^\s@]+\.[a-zA-Z0-9._-]+$/.test(appWithEmail.guardianEmail.trim())
            ) {
              const healedEmail = appWithEmail.guardianEmail.trim().toLowerCase();
              u.email = healedEmail;
              await db.user.update({
                where: { id: u.id },
                data: { email: healedEmail },
              });
            }
          }
        } catch {
          // Non-blocking auto-heal fallback
        }
      }
    }

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

      const hasPassword = Boolean(u.passwordHash && u.passwordHash !== "UNPROVISIONED");
      const invitationStatus: "ACTIVE" | "PENDING_SETUP" | "DISABLED" =
        !u.isActive ? "DISABLED" : !hasPassword ? "PENDING_SETUP" : "ACTIVE";

      return {
        id: u.id,
        email: u.email,
        name: u.fullName || u.guardianAccount?.fullName || u.name || "Member",
        role: (u.role === "GUARDIAN" ? "PARENT" : u.role) || "MEMBER",
        identifier,
        department: u.teacherProfile?.department || undefined,
        designation: u.teacherProfile?.designation || undefined,
        invitationStatus,
        hasPassword,
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
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { action, recipientIds, title, message, category, cc } = body;

    if (!action || !recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Action and non-empty recipientIds array are required." },
        { status: 400 }
      );
    }

    // Parse and validate CC recipients (allows outside / external recipients)
    let validatedCc: string[] = [];
    if (cc) {
      const rawCcList = Array.isArray(cc) ? cc : String(cc).split(/[,;]+/);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const seenCc = new Set<string>();

      for (const raw of rawCcList) {
        const clean = String(raw).trim().toLowerCase();
        if (!clean) continue;
        if (!emailRegex.test(clean)) {
          return NextResponse.json(
            { success: false, error: `Invalid CC email format: '${clean}'. Please provide valid email addresses.` },
            { status: 400 }
          );
        }
        if (!seenCc.has(clean)) {
          seenCc.add(clean);
          validatedCc.push(clean);
        }
      }
    }

    // 1. Fetch institution details
    const institution = await db.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true, slug: true },
    });
    if (!institution) {
      return NextResponse.json({ success: false, error: "Institution not found." }, { status: 404 });
    }

    // 2. Strict Tenant Scoping: Resolve all recipient IDs (supports User.id, Student.id, Teacher.id, GuardianAccount.id)
    let targetUsers = await db.user.findMany({
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

    // If some IDs were not matched directly in User table, check if they are Student, Teacher, or Guardian IDs
    if (targetUsers.length < recipientIds.length) {
      const foundUserIds = new Set(targetUsers.map((u) => u.id));
      const unresolvedIds = recipientIds.filter((id) => !foundUserIds.has(id));

      // Check Students
      const studentUsers = await db.student.findMany({
        where: { id: { in: unresolvedIds }, institutionId, userId: { not: null } },
        select: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              name: true,
              role: true,
              passwordHash: true,
            },
          },
        },
      });
      studentUsers.forEach((s) => {
        if (s.user && !foundUserIds.has(s.user.id)) {
          targetUsers.push(s.user);
          foundUserIds.add(s.user.id);
        }
      });

      // Check Teachers
      const teachers = await db.teacher.findMany({
        where: { id: { in: unresolvedIds }, institutionId },
        select: { userId: true },
      });
      const teacherUserIds = teachers.map((t) => t.userId).filter((id) => !foundUserIds.has(id));
      if (teacherUserIds.length > 0) {
        const users = await db.user.findMany({
          where: { id: { in: teacherUserIds }, institutionId },
          select: {
            id: true,
            email: true,
            fullName: true,
            name: true,
            role: true,
            passwordHash: true,
          },
        });
        users.forEach((u) => {
          targetUsers.push(u);
          foundUserIds.add(u.id);
        });
      }

      // Check Guardian Accounts
      const guardians = await db.guardianAccount.findMany({
        where: { id: { in: unresolvedIds }, institutionId },
        select: { userId: true },
      });
      const guardianUserIds = guardians.map((g) => g.userId).filter((id) => !foundUserIds.has(id));
      if (guardianUserIds.length > 0) {
        const users = await db.user.findMany({
          where: { id: { in: guardianUserIds }, institutionId },
          select: {
            id: true,
            email: true,
            fullName: true,
            name: true,
            role: true,
            passwordHash: true,
          },
        });
        users.forEach((u) => {
          targetUsers.push(u);
          foundUserIds.add(u.id);
        });
      }
    }

    if (targetUsers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Selected recipients do not belong to your institution or are deactivated.",
        },
        { status: 403 }
      );
    }

    // Ensure no CC email duplicates any primary To recipient
    if (validatedCc.length > 0) {
      const toEmailSet = new Set(targetUsers.map((u) => u.email.trim().toLowerCase()));
      const duplicatesWithTo = validatedCc.filter((c) => toEmailSet.has(c));
      if (duplicatesWithTo.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Duplicate recipient detected: ${duplicatesWithTo.join(", ")} is already in the primary recipient list and cannot be in CC.`,
          },
          { status: 400 }
        );
      }
    }

    const isSyntheticInternal = (email: string) =>
      email.endsWith(".internal") || email.endsWith(".local") || email.includes("@guardian.internal");

    // Auto-heal target users who have synthetic internal addresses if a real email was saved in AdmissionApplication
    for (const u of targetUsers) {
      if ((u.role === "PARENT" || u.role === "GUARDIAN") && isSyntheticInternal(u.email)) {
        try {
          const ga = await db.guardianAccount.findUnique({
            where: { userId: u.id },
            include: { guardianLinks: { select: { studentId: true } } },
          });
          const studentIds = (ga?.guardianLinks || []).map((gl) => gl.studentId);
          if (studentIds.length > 0) {
            const appWithEmail = await db.admissionApplication.findFirst({
              where: {
                institutionId,
                convertedStudentId: { in: studentIds },
                guardianEmail: { not: null },
              },
              select: { guardianEmail: true },
            });
            if (
              appWithEmail?.guardianEmail &&
              !isSyntheticInternal(appWithEmail.guardianEmail) &&
              /^[^\s@]+@[^\s@]+\.[a-zA-Z0-9._-]+$/.test(appWithEmail.guardianEmail.trim())
            ) {
              const healedEmail = appWithEmail.guardianEmail.trim().toLowerCase();
              u.email = healedEmail;
              await db.user.update({
                where: { id: u.id },
                data: { email: healedEmail },
              });
            }
          }
        } catch {
          // Non-blocking auto-heal fallback
        }
      }
    }

    const appUrl = getAppBaseUrl();
    const results: Array<{
      id: string;
      email: string;
      success: boolean;
      status?: string;
      messageId?: string;
      previewUrl?: string | false;
      error?: string;
    }> = [];

    // ACTION A: DIRECT MESSAGE TO SELECTED USERS
    if (action === "SEND_DIRECT") {
      if (!title || !message) {
        return NextResponse.json(
          { success: false, error: "Subject title and message content are required." },
          { status: 400 }
        );
      }

      if (targetUsers.length === 1 && isSyntheticInternal(targetUsers[0].email)) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot dispatch email: Recipient "${targetUsers[0].fullName || targetUsers[0].name}" has an undeliverable placeholder address (${targetUsers[0].email}). Please update the contact email to a valid external address in Guardian Management.`,
          },
          { status: 400 }
        );
      }

      for (const user of targetUsers) {
        if (isSyntheticInternal(user.email)) {
          results.push({
            id: user.id,
            email: user.email,
            success: false,
            status: "DELIVERY_FAILED",
            error: `Cannot dispatch to synthetic internal address (${user.email}). Please update contact email in Guardian Management.`,
          });
          continue;
        }

        const sendRes = await sendDirectEmail(
          { email: user.email, name: user.fullName || user.name || undefined },
          {
            subject: title,
            message,
            senderName: `${institution.name} Administration`,
            institutionName: institution.name,
            actionUrl: `${appUrl}/dashboard`,
            actionLabel: "View in Campus Portal",
            cc: validatedCc.length > 0 ? validatedCc : undefined,
            institutionId,
          }
        );

        results.push({
          id: user.id,
          email: user.email,
          success: sendRes.success,
          status: sendRes.status,
          messageId: sendRes.messageId,
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

      const deliverableTargetUsers = targetUsers.filter((u) => !isSyntheticInternal(u.email));
      if (deliverableTargetUsers.length === 0 && targetUsers.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Cannot dispatch announcement: All selected recipients have synthetic internal addresses. Please update their contact emails in Guardian Management.",
          },
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
      const emailList = deliverableTargetUsers.map((u) => ({
        email: u.email,
        name: u.fullName || u.name || undefined,
      }));

      const sendRes = await sendAnnouncementNotification(emailList, {
        title,
        message,
        category: category || "GENERAL",
        institutionName: institution.name,
        actionUrl: `${appUrl}/dashboard`,
        cc: validatedCc.length > 0 ? validatedCc : undefined,
        institutionId,
      });

      for (const u of targetUsers) {
        const isSynthetic = isSyntheticInternal(u.email);
        results.push({
          id: u.id,
          email: u.email,
          success: isSynthetic ? false : sendRes.success,
          status: isSynthetic ? "DELIVERY_FAILED" : sendRes.status,
          messageId: sendRes.messageId,
          previewUrl: sendRes.previewUrl,
          error: isSynthetic ? "Skipped email dispatch due to synthetic internal address" : sendRes.error,
        });
      }
    }

    // ACTION C: ACCOUNT INVITATION & PASSWORD SETUP
    else if (action === "SEND_INVITATION") {
      for (const user of targetUsers) {
        if (isSyntheticInternal(user.email)) {
          results.push({
            id: user.id,
            email: user.email,
            success: false,
            status: "DELIVERY_FAILED",
            error: `Cannot issue invitation to synthetic internal address (${user.email}). Please update contact email in Guardian Management first.`,
          });
          continue;
        }

        // Enforce verified parent-child relationship check for Guardian accounts
        if (user.role === "PARENT" || user.role === "GUARDIAN") {
          const verifiedLink = await db.guardianLink.findFirst({
            where: {
              guardianAccount: { userId: user.id },
              student: { institutionId },
              isVerified: true,
            },
          });
          if (!verifiedLink) {
            results.push({
              id: user.id,
              email: user.email,
              success: false,
              status: "DELIVERY_FAILED",
              error: "Cannot issue invitation: Guardian has no verified student relationships in this institution.",
            });
            continue;
          }
        }

        const setupToken = await signPasswordSetupToken({
          userId: user.id,
          email: user.email,
          institutionId,
          passwordHash: user.passwordHash || null,
        });

        const setupUrl = `${appUrl}/auth/setup-password?token=${encodeURIComponent(setupToken)}`;
        const loginUrl = getRolePortalLoginUrl(user.role || "", institution.slug, appUrl);

        const sendRes = await sendRoleCredentialInvitation(
          { email: user.email, name: user.fullName || user.name || undefined },
          {
            role: (user.role === "GUARDIAN" ? "PARENT" : user.role as any) || "STUDENT",
            setupUrl,
            loginUrl,
            username: user.email,
            institutionName: institution.name,
            expiresIn: "24 hours",
            institutionId,
          }
        );

        results.push({
          id: user.id,
          email: user.email,
          success: sendRes.success,
          status: sendRes.status,
          messageId: sendRes.messageId,
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

    const emailStatus = await getEmailServiceStatus();

    // Provider failure handling: do NOT return HTTP 200 when delivery failed completely
    if (dispatchedCount === 0 && failedCount > 0) {
      const firstError = results.find((r) => r.error)?.error || "Email delivery failed.";
      return NextResponse.json(
        {
          success: false,
          status: "DELIVERY_FAILED",
          transportMode: emailStatus.mode,
          error: firstError,
          message: `Delivery failed for ${failedCount} recipient(s): ${firstError}`,
          dispatchedCount: 0,
          failedCount,
          results,
        },
        { status: 502 }
      );
    }

    const isPartial = failedCount > 0 && dispatchedCount > 0;
    const isEthereal = emailStatus.mode === "ethereal";
    const isSimulated = emailStatus.mode === "simulated";
    const isResend = emailStatus.mode === "resend";

    return NextResponse.json(
      {
        success: true,
        status: isPartial ? "PARTIAL_DELIVERY" : "PROVIDER_ACCEPTED",
        transportMode: emailStatus.mode,
        message: isResend
          ? `Dispatched via Resend transactional email provider for ${dispatchedCount} recipient(s).${isPartial ? ` (${failedCount} failed)` : ""}`
          : isEthereal
          ? `Generated Ethereal test preview for ${dispatchedCount} email(s). (Demonstration Mode — no external emails sent).`
          : isSimulated
          ? `Simulated dispatch for ${dispatchedCount} email(s) in sandbox mode.`
          : `Dispatched ${dispatchedCount} email(s) via live institutional SMTP.${isPartial ? ` (${failedCount} failed)` : ""}`,
        dispatchedCount,
        failedCount,
        previewUrl: samplePreviewUrl || undefined,
        results,
      },
      { status: isPartial ? 207 : 200 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
