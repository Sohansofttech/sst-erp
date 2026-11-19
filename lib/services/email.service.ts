import nodemailer, { type Transporter } from "nodemailer";
import crypto from "crypto";
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

export interface EmailServiceStatus {
  mode: "resend" | "smtp" | "ethereal" | "simulated";
  configured: boolean;
  host?: string;
  from: string;
}

/**
 * Returns the public application base URL for links, redirects, and invitation emails.
 * Prioritizes NEXT_PUBLIC_APP_URL, then NEXT_PUBLIC_SITE_URL, falling back to localhost.
 */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
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
 * Helper to resolve the default sender email address.
 * Prioritizes INSTITUTION_INVITATION_FROM_EMAIL, then EMAIL_FROM, then system fallback.
 */
function resolveDefaultSender(): string {
  return (
    process.env.INSTITUTION_INVITATION_FROM_EMAIL ||
    process.env.EMAIL_FROM ||
    '"SST-ERP Notifications" <noreply@sst-erp.local>'
  );
}

/**
 * REST API client for Resend transactional email service.
 * Uses native fetch without external dependencies.
 * Implements transient retry logic with an Idempotency-Key to prevent duplicate emails.
 * Failures report real errors without falling back to mock transports.
 */
async function sendViaResend(
  apiKey: string,
  from: string,
  toList: string[],
  options: SendEmailOptions,
  idempotencyKey: string = crypto.randomUUID()
): Promise<EmailSendResult> {
  const payload: Record<string, any> = {
    from,
    to: toList,
    subject: options.subject,
    html: options.html,
  };
  if (options.text) {
    payload.text = options.text;
  }
  if (options.replyTo) {
    payload.reply_to = options.replyTo;
  }

  const makeRequest = async () => {
    return await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
  };

  let response: Response;
  try {
    response = await makeRequest();
  } catch (netErr: any) {
    // Transient network failure on first attempt - retry once with identical idempotency key
    console.warn(`[EmailService/Resend] Transient network issue (${netErr.message}). Retrying once with Idempotency-Key...`);
    try {
      response = await makeRequest();
    } catch (retryErr: any) {
      console.error(`[EmailService/Resend] Resend retry failed: ${retryErr.message}`);
      return {
        success: false,
        error: `Resend transport network failure: ${retryErr.message}`,
        recipientCount: toList.length,
      };
    }
  }

  // Handle transient 5xx server errors with 1 retry
  if (response.status >= 500) {
    console.warn(`[EmailService/Resend] Server returned HTTP ${response.status}. Retrying once with Idempotency-Key...`);
    try {
      response = await makeRequest();
    } catch (retryErr: any) {
      return {
        success: false,
        error: `Resend server error (${response.status}) and retry failure: ${retryErr.message}`,
        recipientCount: toList.length,
      };
    }
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response
  }

  if (!response.ok) {
    const errorDetail = body?.message || body?.error || `HTTP ${response.status} ${response.statusText}`;
    console.error(`[EmailService/Resend] Resend API Error (${response.status}):`, errorDetail);
    return {
      success: false,
      error: `Resend API Error: ${errorDetail}`,
      recipientCount: toList.length,
    };
  }

  const messageId = body?.id || `resend_${Date.now()}`;
  console.log(`[EmailService/Resend] ✉️ Dispatched via Resend: "${options.subject}" to ${toList.length} recipient(s) [ID: ${messageId}]`);
  return {
    success: true,
    messageId,
    recipientCount: toList.length,
  };
}

/**
 * Returns active email service operational status without exposing secrets
 */
export async function getEmailServiceStatus(): Promise<EmailServiceStatus> {
  const defaultFrom = resolveDefaultSender();

  if (process.env.RESEND_API_KEY) {
    return {
      mode: "resend",
      configured: true,
      host: "api.resend.com",
      from: defaultFrom,
    };
  }

  const { mode } = await getTransporter();
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
  const from = options.from || resolveDefaultSender();
  const toList = Array.isArray(options.to) ? options.to : [options.to];

  if (toList.length === 0) {
    return { success: false, error: "No recipients provided" };
  }

  // 1. Production Resend Delivery (if RESEND_API_KEY is configured)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    return await sendViaResend(resendApiKey, from, toList, options);
  }

  // 2. Fallback to Nodemailer (SMTP / Ethereal / Simulated)
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
    username: options.username || recipient.email,
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
