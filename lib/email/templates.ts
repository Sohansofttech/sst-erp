/**
 * SST-ERP Professional Email Templates
 *
 * Provides responsive, inline-styled HTML and plaintext templates for:
 * 1. Campus Announcements & Circulars
 * 2. Secure Account Setup & Password Invitation
 */

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface AnnouncementTemplateOptions {
  title: string;
  message: string;
  category?: string;
  institutionName?: string;
  actionUrl?: string;
  date?: string;
}

export interface PasswordSetupTemplateOptions {
  name?: string;
  setupUrl: string;
  institutionName?: string;
  expiresIn?: string;
  loginUrl?: string;
}

export type SupportedRole =
  | "STUDENT"
  | "TEACHER"
  | "FACULTY"
  | "PARENT"
  | "GUARDIAN"
  | "HOD"
  | "ADMIN"
  | "INSTITUTION_ADMIN"
  | "STAFF"
  | "SUPER_ADMIN"
  | string;

export interface RoleCredentialInvitationTemplateOptions {
  name?: string;
  role: SupportedRole;
  setupUrl: string;
  loginUrl?: string;
  username?: string;
  institutionName?: string;
  expiresIn?: string;
  departmentName?: string;
}

export interface DirectMessageTemplateOptions {
  recipientName?: string;
  subject: string;
  message: string;
  senderName?: string;
  institutionName?: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Category styling configurations for announcements
 */
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  ACADEMIC: { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", label: "Academic" },
  EXAMINATION: { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE", label: "Examination" },
  FEE: { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", label: "Fee Notice" },
  ALERT: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA", label: "Important Alert" },
  GENERAL: { bg: "#EEF2FF", text: "#4338CA", border: "#C7D2FE", label: "Announcement" },
  ANNOUNCEMENT: { bg: "#EEF2FF", text: "#4338CA", border: "#C7D2FE", label: "Announcement" },
  EVENT: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0", label: "Campus Event" },
};

export function renderAnnouncementEmail(options: AnnouncementTemplateOptions): RenderedEmail {
  const institution = options.institutionName || "SST-ERP Campus";
  const catKey = (options.category || "GENERAL").toUpperCase();
  const catStyle = CATEGORY_COLORS[catKey] || CATEGORY_COLORS.GENERAL;
  const safeTitle = escapeHtml(options.title);
  const safeMessage = escapeHtml(options.message).replace(/\n/g, "<br />");
  const safeInstitution = escapeHtml(institution);
  const dateStr = options.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const subject = `[${catStyle.label}] ${options.title} — ${institution}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #1E293B; padding: 24px 32px; border-bottom: 3px solid #F5A000;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <h2 style="margin: 0; color: #FFFFFF; font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">
                      ${safeInstitution}
                    </h2>
                    <span style="color: #94A3B8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; display: inline-block; margin-top: 4px;">
                      Campus Notification Network
                    </span>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="background-color: ${catStyle.bg}; color: ${catStyle.text}; border: 1px solid ${catStyle.border}; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase;">
                      ${catStyle.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <div style="font-size: 12px; color: #64748B; margin-bottom: 8px; font-weight: 500;">
                Published on ${dateStr}
              </div>
              <h1 style="margin: 0 0 16px 0; color: #0F172A; font-size: 20px; font-weight: 700; line-height: 1.3;">
                ${safeTitle}
              </h1>
              <div style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                ${safeMessage}
              </div>

              ${options.actionUrl ? `
              <div style="margin: 28px 0 12px 0;">
                <a href="${escapeHtml(options.actionUrl)}" style="background-color: #123B5A; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; display: inline-block;">
                  View Notice in Portal &rarr;
                </a>
              </div>
              ` : ""}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; color: #64748B; font-size: 11px; line-height: 1.5;">
                You are receiving this communication as a registered member of ${safeInstitution}.<br />
                To manage your notification preferences, visit your account settings in the campus portal.
              </p>
              <p style="margin: 8px 0 0 0; color: #94A3B8; font-size: 10px;">
                &copy; ${new Date().getFullYear()} SST-ERP. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${institution.toUpperCase()} — ${catStyle.label.toUpperCase()}
==================================================
Date: ${dateStr}
Subject: ${options.title}

${options.message}

${options.actionUrl ? `View Notice in Portal: ${options.actionUrl}\n\n` : ""}
--
You are receiving this notification as a member of ${institution}.
SST-ERP Campus Management System.`;

  return { subject, html, text };
}

export function renderPasswordSetupEmail(options: PasswordSetupTemplateOptions): RenderedEmail {
  const institution = options.institutionName || "SST-ERP Campus";
  const safeName = escapeHtml(options.name || "Member");
  const safeInstitution = escapeHtml(institution);
  const safeUrl = escapeHtml(options.setupUrl);
  const safeExpires = escapeHtml(options.expiresIn || "24 hours");
  const subject = `Action Required: Set Up Your Password — ${institution}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Set Up Your Account Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #123B5A; padding: 24px 32px; border-bottom: 3px solid #F5A000;">
              <h2 style="margin: 0; color: #FFFFFF; font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">
                ${safeInstitution}
              </h2>
              <span style="color: #94A3B8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; display: inline-block; margin-top: 4px;">
                Secure Credential Onboarding
              </span>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px 0; color: #0F172A; font-size: 20px; font-weight: 700;">
                Welcome, ${safeName}
              </h1>
              <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
                Your account for the <strong>${safeInstitution}</strong> portal has been provisioned. To access your portal dashboard, please set up your password using the secure link below:
              </p>

              <!-- CTA Button -->
              <div style="margin: 28px 0; text-align: center;">
                <a href="${safeUrl}" style="background-color: #F5A000; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; display: inline-block; box-shadow: 0 2px 4px rgba(245, 160, 0, 0.2);">
                  Set Up Password &rarr;
                </a>
              </div>

              ${options.loginUrl ? `
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 16px; margin: 16px 0; text-align: center;">
                <span style="color: #64748B; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">
                  Portal Destination
                </span>
                <a href="${escapeHtml(options.loginUrl)}" style="color: #123B5A; font-size: 13px; font-weight: 600; text-decoration: none;">
                  ${escapeHtml(options.loginUrl)} &rarr;
                </a>
              </div>
              ` : ""}

              <!-- Security Information Card -->
              <table role="presentation" width="100%" style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 14px 16px; margin-top: 20px;">
                <tr>
                  <td>
                    <div style="color: #92400E; font-size: 12px; font-weight: 700; margin-bottom: 4px;">
                      SECURITY NOTICE
                    </div>
                    <div style="color: #B45309; font-size: 12px; line-height: 1.5;">
                      &bull; This link expires in <strong>${safeExpires}</strong> and can only be used once.<br />
                      &bull; <strong>SST-ERP never sends plaintext passwords over email.</strong><br />
                      &bull; If you did not request this invitation, please notify your institution administrator.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="color: #64748B; font-size: 12px; margin-top: 24px; line-height: 1.5;">
                If the button above does not work, copy and paste this URL into your browser:<br />
                <span style="color: #123B5A; word-break: break-all;">${safeUrl}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; color: #64748B; font-size: 11px;">
                This is an automated system notification from ${safeInstitution}. Please do not reply directly to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #94A3B8; font-size: 10px;">
                &copy; ${new Date().getFullYear()} SST-ERP. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `WELCOME TO ${institution.toUpperCase()}
==================================================
Hello ${options.name || "Member"},

Your account has been provisioned on the campus portal.
To set up your password, please visit the following secure link:

${options.setupUrl}

${options.loginUrl ? `Portal Destination: ${options.loginUrl}\n` : ""}SECURITY NOTICE:
- This link is valid for ${options.expiresIn || "24 hours"}.
- Plaintext passwords are never sent via email for security.
- If you did not request this account, please contact your institution administrator.

--
SST-ERP Campus Management System.`;

  return { subject, html, text };
}

export function renderRoleCredentialInvitationEmail(options: RoleCredentialInvitationTemplateOptions): RenderedEmail {
  const institution = options.institutionName || "SST-ERP Campus";
  const safeName = escapeHtml(options.name || "Member");
  const safeInstitution = escapeHtml(institution);
  const safeUsername = escapeHtml(options.username || options.name || "Your registered email address");
  const safeSetupUrl = escapeHtml(options.setupUrl);
  const safeLoginUrl = options.loginUrl ? escapeHtml(options.loginUrl) : "";
  const safeExpires = escapeHtml(options.expiresIn || "24 hours");

  const roleUpper = (options.role || "STAFF").toString().toUpperCase();

  const roleLabels: Record<string, string> = {
    STUDENT: "Student Portal Access",
    TEACHER: "Teaching Faculty Portal Access",
    FACULTY: "Teaching Faculty Portal Access",
    HOD: "Head of Department (HOD) Portal Access",
    PARENT: "Parent & Guardian Portal Access",
    GUARDIAN: "Parent & Guardian Portal Access",
    ADMIN: "Institution Administrator Access",
    INSTITUTION_ADMIN: "Institution Administrator Access",
    STAFF: "Administrative Staff Access",
    SUPER_ADMIN: "Platform Super Administrator Access",
  };
  const roleLabel = roleLabels[roleUpper] || `${options.role} Portal Access`;

  const roleDescriptions: Record<string, string> = {
    STUDENT: "Your Student Portal grants you secure access to your dynamic lecture timetable, real-time attendance tracking, examination admit cards, semester results, fee payment receipts, and digital course study materials.",
    TEACHER: "Your Faculty Workspace enables you to record daily class attendance, plan curriculum deliveries, administer internal assessments, grade student submissions, and view your teaching timetable.",
    FACULTY: "Your Faculty Workspace enables you to record daily class attendance, plan curriculum deliveries, administer internal assessments, grade student submissions, and view your teaching timetable.",
    HOD: "Your Departmental Leadership Workspace enables you to oversee departmental academic planning, review and lock internal assessment (IA) marks, manage faculty workload allocations, review leave requests, and assign timetable substitutions.",
    PARENT: "Your Parent & Guardian Portal allows you to monitor your ward's daily attendance records, track academic progress and assessment results, view fee payment schedules and receipts, and receive direct campus notices.",
    GUARDIAN: "Your Parent & Guardian Portal allows you to monitor your ward's daily attendance records, track academic progress and assessment results, view fee payment schedules and receipts, and receive direct campus notices.",
    ADMIN: "Your Institutional Administration Portal grants you comprehensive access to student admissions, academic structure, timetable matrices, faculty appointments, fee management, statutory reports, and institutional governance.",
    INSTITUTION_ADMIN: "Your Institutional Administration Portal grants you comprehensive access to student admissions, academic structure, timetable matrices, faculty appointments, fee management, statutory reports, and institutional governance.",
    STAFF: "Your Administrative Staff Portal allows you to manage campus records, student inquiries, logistical operations, and administrative workflows.",
    SUPER_ADMIN: "Your Platform Administration Console provides global multi-tenant governance, institution provisioning, tenant security oversight, and comprehensive platform audit logs.",
  };
  const roleDescription = roleDescriptions[roleUpper] || "Your portal grants you authenticated access to institutional campus workflows, records, and services.";

  const subject = `Welcome to ${institution} — Set Up Your ${roleLabel}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #123B5A; padding: 24px 32px; border-bottom: 3px solid #F5A000;">
              <h2 style="margin: 0; color: #FFFFFF; font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">
                ${safeInstitution}
              </h2>
              <span style="color: #94A3B8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; display: inline-block; margin-top: 4px;">
                ${roleLabel}
              </span>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px 0; color: #0F172A; font-size: 20px; font-weight: 700;">
                Hello, ${safeName}
              </h1>
              <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
                Your account for <strong>${safeInstitution}</strong> has been provisioned with <strong>${roleLabel}</strong>. To complete your onboarding and choose your private password, please follow the steps below:
              </p>
              <div style="background-color: #F8FAFC; border-left: 3px solid #123B5A; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.6;">
                  ${escapeHtml(roleDescription)}
                </p>
              </div>

              <!-- Account Credentials Box -->
              <table role="presentation" width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 8px;">
                      Your Account Credentials & Access
                    </div>
                    <table role="presentation" width="100%" style="font-size: 13px; line-height: 1.6;">
                      <tr>
                        <td style="width: 130px; color: #64748B; font-weight: 600;">Username / Login ID:</td>
                        <td style="color: #0F172A; font-weight: 700; font-family: monospace;">${safeUsername}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748B; font-weight: 600;">Assigned Role:</td>
                        <td style="color: #123B5A; font-weight: 600;">${roleLabel}</td>
                      </tr>
                      ${safeLoginUrl ? `
                      <tr>
                        <td style="color: #64748B; font-weight: 600;">Portal Login URL:</td>
                        <td><a href="${safeLoginUrl}" style="color: #123B5A; font-weight: 600; text-decoration: underline;">${safeLoginUrl}</a></td>
                      </tr>
                      ` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <div style="margin: 24px 0; text-align: center;">
                <a href="${safeSetupUrl}" style="background-color: #F5A000; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; display: inline-block; box-shadow: 0 2px 4px rgba(245, 160, 0, 0.2);">
                  Set Up Your Password &rarr;
                </a>
              </div>

              <!-- First-Time Login Instructions -->
              <table role="presentation" width="100%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <tr>
                  <td>
                    <div style="color: #166534; font-size: 12px; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
                      First-Time Login Instructions
                    </div>
                    <ol style="margin: 0; padding-left: 20px; color: #15803D; font-size: 13px; line-height: 1.6;">
                      <li>Click the <strong>Set Up Your Password</strong> button above (valid for <strong>${safeExpires}</strong>).</li>
                      <li>Create and confirm your strong personal password.</li>
                      <li>Visit your portal login URL (${safeLoginUrl ? `<a href="${safeLoginUrl}" style="color: #166534; text-decoration: underline;">${safeLoginUrl}</a>` : "the campus login page"}) and sign in using your Login ID <strong>${safeUsername}</strong>.</li>
                    </ol>
                  </td>
                </tr>
              </table>

              <!-- Security Information Card -->
              <table role="presentation" width="100%" style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 14px 16px; margin-top: 16px;">
                <tr>
                  <td>
                    <div style="color: #92400E; font-size: 12px; font-weight: 700; margin-bottom: 4px;">
                      SECURITY NOTICE
                    </div>
                    <div style="color: #B45309; font-size: 12px; line-height: 1.5;">
                      &bull; This link is cryptographically signed and expires in <strong>${safeExpires}</strong>.<br />
                      &bull; <strong>SST-ERP never sends plaintext passwords over email.</strong><br />
                      &bull; Once you choose your password, this setup link is immediately invalidated.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="color: #64748B; font-size: 12px; margin-top: 24px; line-height: 1.5;">
                If the button above does not work, copy and paste this URL into your browser:<br />
                <span style="color: #123B5A; word-break: break-all;">${safeSetupUrl}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; color: #64748B; font-size: 11px;">
                This invitation was issued by an authorized administrator at ${safeInstitution}.
              </p>
              <p style="margin: 8px 0 0 0; color: #94A3B8; font-size: 10px;">
                &copy; ${new Date().getFullYear()} SST-ERP. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `WELCOME TO ${institution.toUpperCase()} — ${roleLabel.toUpperCase()}
==================================================
Hello ${options.name || "Member"},

Your account for ${institution} has been provisioned with ${roleLabel}.

${roleDescription}

ACCOUNT CREDENTIALS:
- Username / Login ID: ${options.username || options.name || "Your registered email"}
- Assigned Role: ${roleLabel}
${options.loginUrl ? `- Portal Login URL: ${options.loginUrl}\n` : ""}
PASSWORD SETUP LINK:
${options.setupUrl}

FIRST-TIME LOGIN INSTRUCTIONS:
1. Open the secure password setup link above (valid for ${options.expiresIn || "24 hours"}).
2. Create and confirm your strong personal password.
3. Sign in at ${options.loginUrl || "the campus portal login page"} using your Login ID (${options.username || "your email"}) and new password.

SECURITY NOTICE:
- This link is cryptographically signed and single-use only.
- SST-ERP never sends plaintext passwords over email for security.
- If you did not request this invitation, please contact your institution administrator immediately.

--
SST-ERP Campus Management System.`;

  return { subject, html, text };
}

export function renderDirectMessageEmail(options: DirectMessageTemplateOptions): RenderedEmail {
  const institution = options.institutionName || "SST-ERP Campus";
  const safeRecipient = escapeHtml(options.recipientName || "Member");
  const safeSender = escapeHtml(options.senderName || "Institution Administration");
  const safeInstitution = escapeHtml(institution);
  const safeMessage = escapeHtml(options.message).replace(/\n/g, "<br />");
  const safeSubject = escapeHtml(options.subject);
  const subject = `${options.subject} — ${institution}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #123B5A; padding: 24px 32px; border-bottom: 3px solid #F5A000;">
              <h2 style="margin: 0; color: #FFFFFF; font-size: 18px; font-weight: 700; letter-spacing: -0.02em;">
                ${safeInstitution}
              </h2>
              <span style="color: #94A3B8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; display: inline-block; margin-top: 4px;">
                Direct Communication &middot; From: ${safeSender}
              </span>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <div style="font-size: 13px; color: #64748B; margin-bottom: 8px;">
                Dear ${safeRecipient},
              </div>
              <h1 style="margin: 0 0 16px 0; color: #0F172A; font-size: 20px; font-weight: 700;">
                ${safeSubject}
              </h1>
              <div style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                ${safeMessage}
              </div>

              ${options.actionUrl ? `
              <div style="margin: 28px 0 12px 0;">
                <a href="${escapeHtml(options.actionUrl)}" style="background-color: #123B5A; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; display: inline-block;">
                  ${escapeHtml(options.actionLabel || "View Details in Portal")} &rarr;
                </a>
              </div>
              ` : ""}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; color: #64748B; font-size: 11px;">
                Sent by ${safeSender} via SST-ERP for ${safeInstitution}.
              </p>
              <p style="margin: 8px 0 0 0; color: #94A3B8; font-size: 10px;">
                &copy; ${new Date().getFullYear()} SST-ERP. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${institution.toUpperCase()} — DIRECT COMMUNICATION
==================================================
From: ${options.senderName || "Institution Administration"}
To: ${options.recipientName || "Member"}
Subject: ${options.subject}

${options.message}

${options.actionUrl ? `${options.actionLabel || "View Details"}: ${options.actionUrl}\n\n` : ""}
--
SST-ERP Campus Management System.`;

  return { subject, html, text };
}
