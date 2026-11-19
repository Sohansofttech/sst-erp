import nodemailer, { type Transporter } from "nodemailer";
import {
  renderAnnouncementEmail,
  renderPasswordSetupEmail,
  renderRoleCredentialInvitationEmail,
  renderDirectMessageEmail,
  AnnouncementTemplateOptions,
  PasswordSetupTemplateOptions,
  RoleCredentialInvitationTemplateOptions,
  DirectMessageTemplateOptions,
  RenderedEmail,
} from "../email/templates";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | false;
  simulated?: boolean;
  recipientCount?: number;
  error?: string;
}

// Global cached transporter instance to reuse across requests
let cachedTransporter: Transporter | null = null;
let cachedTransportMode: "smtp" | "ethereal" | "simulated" = "simulated";

/**
 * Resolve or initialize the active Nodemailer transporter.
 * Prioritizes SMTP env vars. Falls back to Ethereal, then simulated JSON transport.
 */
async function getTransporter(): Promise<{ transporter: Transporter; mode: "smtp" | "ethereal" | "simulated" }> {
  if (cachedTransporter) {
    return { transporter: cachedTransporter, mode: cachedTransportMode };
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

  // 1. SMTP Provider Configuration
  if (smtpHost) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: smtpUser ? { user: smtpUser, pass: smtpPass || "" } : undefined,
        // Timeout configurations to prevent blocking requests
        connectionTimeout: 10000,
        greetingTimeout: 5000,
        socketTimeout: 15000,
      });

      cachedTransporter = transporter;
      cachedTransportMode = "smtp";
      console.log(`[EmailService] Configured SMTP transporter: ${smtpHost}:${smtpPort}`);
      return { transporter, mode: "smtp" };
    } catch (err: any) {
      console.warn(`[EmailService] Failed to initialize SMTP transporter (${err.message}). Falling back to test transporter.`);
    }
  }

  // 2. Development Ethereal Transport for Demonstrations
  try {
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      tls: { rejectUnauthorized: false },
    });

    cachedTransporter = transporter;
    cachedTransportMode = "ethereal";
    console.log(`[EmailService] Configured Ethereal demonstration transporter (account: ${testAccount.user})`);
    return { transporter, mode: "ethereal" };
  } catch (etherealErr: any) {
    // 3. Fallback Simulated Transport (Offline / Sandbox Safe)
    console.info("[EmailService] Network preview unavailable. Initializing simulated JSON transport.");
    const transporter = nodemailer.createTransport({
      jsonTransport: true,
    });

    cachedTransporter = transporter;
    cachedTransportMode = "simulated";
    return { transporter, mode: "simulated" };
  }
}

/**
 * Returns active email service operational status without exposing secrets
 */
export async function getEmailServiceStatus(): Promise<{
  mode: "smtp" | "ethereal" | "simulated";
  configured: boolean;
  host?: string;
  from: string;
}> {
  const { mode } = await getTransporter();
  const defaultFrom = process.env.EMAIL_FROM || '"SST-ERP Notifications" <noreply@sst-erp.local>';
  return {
    mode,
    configured: mode === "smtp",
    host: mode === "smtp" ? process.env.SMTP_HOST : mode === "ethereal" ? "ethereal.email" : "simulated-local",
    from: defaultFrom,
  };
}

/**
 * Core transactional email sender
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  const defaultFrom = process.env.EMAIL_FROM || '"SST-ERP Notifications" <noreply@sst-erp.local>';
  const from = options.from || defaultFrom;
  const toList = Array.isArray(options.to) ? options.to : [options.to];

  if (toList.length === 0) {
    return { success: false, error: "No recipients provided" };
  }

  try {
    const { transporter, mode } = await getTransporter();

    const mailOptions = {
      from,
      to: toList.join(", "),
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    };

    let info;
    try {
      info = await transporter.sendMail(mailOptions);
    } catch (sendErr: any) {
      if (/timeout|connection|handshake|econnreset|etimedout/i.test(sendErr.message || "")) {
        console.warn(`[EmailService] Retrying sendMail once after transient connection error: ${sendErr.message}`);
        info = await transporter.sendMail(mailOptions);
      } else {
        throw sendErr;
      }
    }

    let previewUrl: string | false = false;
    if (mode === "ethereal") {
      previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[EmailService] 📧 Ethereal Preview URL: ${previewUrl}`);
      }
    } else if (mode === "simulated") {
      console.log(`[EmailService] 📨 [Simulated Delivery] Subject: "${options.subject}" to ${toList.length} recipient(s)`);
    } else {
      console.log(`[EmailService] ✉️ SMTP Dispatched: "${options.subject}" to ${toList.length} recipient(s) [ID: ${info.messageId}]`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl,
      simulated: mode === "simulated",
      recipientCount: toList.length,
    };
  } catch (error: any) {
    console.error(`[EmailService] Delivery failure for "${options.subject}":`, error.message);
    return {
      success: false,
      error: error.message || "Email transport failure",
      recipientCount: toList.length,
    };
  }
}

/**
 * Dispatches announcement emails to a list of recipients using the branded template
 */
export async function sendAnnouncementNotification(
  recipients: Array<{ email: string; name?: string }>,
  options: AnnouncementTemplateOptions
): Promise<EmailSendResult> {
  const validEmails = recipients
    .map((r) => r.email?.trim())
    .filter((e): e is string => Boolean(e && e.includes("@")));

  if (validEmails.length === 0) {
    return { success: true, recipientCount: 0, simulated: true };
  }

  const { subject, html, text } = renderAnnouncementEmail(options);

  return await sendEmail({
    to: validEmails,
    subject,
    html,
    text,
  });
}

/**
 * Dispatches an account invitation and password setup link
 * SECURITY GUARANTEE: Never transmits or logs plaintext passwords.
 */
export async function sendPasswordSetupInvitation(
  recipient: { email: string; name?: string },
  options: PasswordSetupTemplateOptions
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, error: "Invalid recipient email address" };
  }

  const { subject, html, text } = renderPasswordSetupEmail({
    ...options,
    name: recipient.name || options.name,
  });

  return await sendEmail({
    to: recipient.email,
    subject,
    html,
    text,
  });
}

/**
 * Dispatches a direct message or custom notification to a specific recipient
 */
export async function sendDirectEmail(
  recipient: { email: string; name?: string },
  options: DirectMessageTemplateOptions
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, error: "Invalid recipient email address" };
  }

  const { subject, html, text } = renderDirectMessageEmail({
    ...options,
    recipientName: recipient.name || options.recipientName,
  });

  return await sendEmail({
    to: recipient.email,
    subject,
    html,
    text,
  });
}

/**
 * Dispatches a role-specific account setup invitation with portal login URL
 */
export async function sendRoleCredentialInvitation(
  recipient: { email: string; name?: string },
  options: RoleCredentialInvitationTemplateOptions
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, error: "Invalid recipient email address" };
  }

  const { subject, html, text } = renderRoleCredentialInvitationEmail({
    ...options,
    name: recipient.name || options.name,
  });

  return await sendEmail({
    to: recipient.email,
    subject,
    html,
    text,
  });
}

/**
 * Previews rendered email content before sending (without dispatching)
 */
export function previewEmail(
  type: "ANNOUNCEMENT" | "INVITATION" | "DIRECT",
  options: any
): RenderedEmail {
  switch (type) {
    case "ANNOUNCEMENT":
      return renderAnnouncementEmail(options);
    case "INVITATION":
      return options.role
        ? renderRoleCredentialInvitationEmail(options)
        : renderPasswordSetupEmail(options);
    case "DIRECT":
      return renderDirectMessageEmail(options);
    default:
      return renderAnnouncementEmail(options);
  }
}
