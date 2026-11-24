import nodemailer, { type Transporter } from "nodemailer";
import crypto from "crypto";
import {
  renderAnnouncementEmail,
  renderPasswordSetupEmail,
  renderRoleCredentialInvitationEmail,
  renderDirectMessageEmail,
  renderPasswordResetEmail,
  renderFeeReceiptEmail,
  renderAttendanceAlertEmail,
  AnnouncementTemplateOptions,
  PasswordSetupTemplateOptions,
  RoleCredentialInvitationTemplateOptions,
  DirectMessageTemplateOptions,
  PasswordResetTemplateOptions,
  FeeReceiptTemplateOptions,
  AttendanceAlertTemplateOptions,
  RenderedEmail,
} from "../email/templates";
import {
  getInstitutionEmailConfig,
  CENTRAL_SOHAN_SOFTECH_SENDER,
  CENTRAL_SOHAN_SOFTECH_NAME,
  recordEmailDeliveryLog,
} from "./email-config.service";
import {
  EmailPurpose,
  SmtpCredentials,
  ApiProviderCredentials,
} from "@/types/email-infrastructure";

export type DeliveryStatus =
  | "EMAIL_QUEUED"
  | "PROVIDER_ACCEPTED"
  | "DELIVERY_CONFIRMED"
  | "DELIVERY_FAILED";

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
  institutionId?: string;
  purpose?: EmailPurpose;
  allowFallback?: boolean;
}

export interface EmailSendResult {
  success: boolean;
  status: DeliveryStatus;
  messageId?: string;
  provider?: string;
  fallbackUsed?: boolean;
  previewUrl?: string | false;
  simulated?: boolean;
  recipientCount?: number;
  error?: string;
  code?: string;
  details?: Record<string, any>;
}

export interface EmailServiceStatus {
  mode: "resend" | "smtp" | "ethereal" | "simulated" | "unconfigured";
  configured: boolean;
  host?: string;
  from: string;
  senderDomain?: string;
  hasApiKey?: boolean;
  hasSenderAddress?: boolean;
  verifiedDomainRequired?: boolean;
}

/**
 * Resolves the specific portal login URL for a given user role and institution.
 * Ensures Parent Portal uses /parent/dashboard, Teacher uses /campus/[slug]/teacher,
 * Student uses /student/dashboard, Admin uses /admin/login, and HOD uses /campus/[slug]/teacher/hod.
 */
export function getRolePortalLoginUrl(
  role: string,
  institutionSlug?: string | null,
  appUrl: string = getAppBaseUrl()
): string {
  const normRole = (role || "").toUpperCase();
  const slug = institutionSlug || "demo";

  switch (normRole) {
    case "STUDENT":
      return `${appUrl}/student/dashboard`;
    case "PARENT":
    case "GUARDIAN":
      return `${appUrl}/parent/dashboard`;
    case "TEACHER":
    case "FACULTY":
      return `${appUrl}/campus/${slug}/teacher`;
    case "HOD":
      return `${appUrl}/campus/${slug}/teacher/hod`;
    case "ADMIN":
    case "INSTITUTION_ADMIN":
      return `${appUrl}/admin/login`;
    case "STAFF":
      return `${appUrl}/admin`;
    case "SUPER_ADMIN":
      return `${appUrl}/super-admin/login`;
    default:
      return `${appUrl}/login`;
  }
}

/**
 * Returns the public application base URL for links, redirects, and invitation emails.
 * Prioritizes canonical NEXT_PUBLIC_APP_URL, then NEXT_PUBLIC_SITE_URL, APP_BASE_URL, falling back to localhost.
 */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
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
 * Prioritizes canonical EMAIL_FROM, then legacy INSTITUTION_INVITATION_FROM_EMAIL.
 */
function resolveDefaultSender(): string {
  return (
    process.env.EMAIL_FROM ||
    process.env.INSTITUTION_INVITATION_FROM_EMAIL ||
    ""
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
  if (options.cc) {
    const ccList = Array.isArray(options.cc) ? options.cc : [options.cc];
    if (ccList.length > 0) {
      payload.cc = ccList;
    }
  }
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
        status: "DELIVERY_FAILED",
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
        status: "DELIVERY_FAILED",
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
      status: "DELIVERY_FAILED",
      provider: "resend",
      code: body?.name || `HTTP_${response.status}`,
      error: `Resend API Error: ${errorDetail}`,
      recipientCount: toList.length,
      details: body || undefined,
    };
  }

  const messageId = body?.id || `resend_${Date.now()}`;
  console.log(`[EmailService/Resend] ✉️ Dispatched via Resend: "${options.subject}" to ${toList.length} recipient(s) [ID: ${messageId}]`);
  return {
    success: true,
    status: "PROVIDER_ACCEPTED",
    provider: "resend",
    messageId,
    recipientCount: toList.length,
    details: {
      providerId: messageId,
      status: "accepted",
    },
  };
}

/**
 * Returns active email service operational status without exposing secrets
 */
export async function getEmailServiceStatus(): Promise<EmailServiceStatus> {
  const defaultFrom = resolveDefaultSender();
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSmtp = Boolean(process.env.SMTP_HOST);
  const hasSender = Boolean(process.env.EMAIL_FROM || process.env.INSTITUTION_INVITATION_FROM_EMAIL);
  const senderDomainMatch = defaultFrom.match(/@([a-zA-Z0-9.-]+)/);
  const senderDomain = senderDomainMatch ? senderDomainMatch[1] : undefined;

  if (hasResend) {
    return {
      mode: "resend",
      configured: Boolean(hasResend && hasSender),
      host: "api.resend.com",
      from: defaultFrom,
      senderDomain,
      hasApiKey: true,
      hasSenderAddress: hasSender,
      verifiedDomainRequired: true,
    };
  }

  if (hasSmtp) {
    return {
      mode: "smtp",
      configured: true,
      host: process.env.SMTP_HOST,
      from: defaultFrom,
      senderDomain,
      hasApiKey: false,
      hasSenderAddress: hasSender,
    };
  }

  const isEtherealAllowed = process.env.ALLOW_ETHEREAL_FALLBACK === "true" || process.env.EMAIL_PROVIDER === "ethereal";
  if (isEtherealAllowed) {
    return {
      mode: "ethereal",
      configured: false,
      host: "ethereal.email",
      from: defaultFrom,
      senderDomain,
      hasApiKey: false,
      hasSenderAddress: hasSender,
    };
  }

  return {
    mode: "unconfigured",
    configured: false,
    from: defaultFrom,
    senderDomain,
    hasApiKey: false,
    hasSenderAddress: hasSender,
    verifiedDomainRequired: true,
  };
}

/**
 * Core transactional email sender.
 * Enforces Option C Architecture: Institution-Specific Email Configuration with Central Sohan Softech Fallback.
 * Strictly prevents silent fallback to mock/Ethereal accounts when real delivery is expected.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  const toList = Array.isArray(options.to) ? options.to : [options.to];
  const primaryRecipient = toList[0] || "unknown@domain.com";
  const purpose: EmailPurpose = options.purpose || "SYSTEM";

  if (toList.length === 0) {
    return {
      success: false,
      status: "DELIVERY_FAILED",
      code: "NO_RECIPIENTS",
      error: "No recipients provided",
      recipientCount: 0,
    };
  }

  let institutionAttempted = false;
  let institutionFailed = false;
  let institutionFailureReason: string | null = null;

  // =========================================================================
  // STEP 1: Option C - Check Institution-Specific Configuration First
  // =========================================================================
  if (options.institutionId) {
    try {
      const instConfig = await getInstitutionEmailConfig(options.institutionId);

      // Enforce security rule: An email address ALONE does not authorize sending.
      // Must be enabled AND explicitly verified via successful connection test.
      if (
        instConfig.isEnabled &&
        instConfig.status === "VERIFIED" &&
        instConfig.senderEmail
      ) {
        institutionAttempted = true;
        const instFrom = instConfig.senderName
          ? `"${instConfig.senderName}" <${instConfig.senderEmail}>`
          : instConfig.senderEmail;
        const instReplyTo = options.replyTo || instConfig.replyToEmail || instConfig.senderEmail;

        if (instConfig.provider === "SMTP") {
          const creds = instConfig.credentials as SmtpCredentials | undefined;
          if (creds?.host && creds?.username) {
            try {
              const transporter = nodemailer.createTransport({
                host: creds.host,
                port: creds.port || 587,
                secure: Boolean(creds.secure),
                auth: { user: creds.username, pass: creds.password || "" },
                connectionTimeout: 8000,
              });

              const info = await transporter.sendMail({
                from: instFrom,
                to: toList.join(", "),
                subject: options.subject,
                html: options.html,
                text: options.text,
                replyTo: instReplyTo,
              });

              await recordEmailDeliveryLog({
                institutionId: options.institutionId,
                recipientEmail: primaryRecipient,
                senderIdentity: instFrom,
                replyTo: instReplyTo,
                subject: options.subject,
                purpose,
                provider: "institution-smtp",
                fallbackUsed: false,
                providerMessageId: info.messageId,
                deliveryStatus: "ACCEPTED",
                retryCount: 0,
              });

              console.log(`[EmailService] ✉️ Dispatched via Institution SMTP: "${options.subject}" [ID: ${info.messageId}]`);
              return {
                success: true,
                status: "PROVIDER_ACCEPTED",
                provider: "smtp",
                messageId: info.messageId,
                fallbackUsed: false,
                recipientCount: toList.length,
              };
            } catch (smtpErr: any) {
              institutionFailed = true;
              institutionFailureReason = `Institution SMTP failed: ${smtpErr.message}`;
              console.warn(`[EmailService] Institution SMTP dispatch failed: ${smtpErr.message}. Triggering central fallback...`);
            }
          }
        } else if (instConfig.provider === "RESEND") {
          const creds = instConfig.credentials as ApiProviderCredentials | undefined;
          if (creds?.apiKey) {
            const resendResult = await sendViaResend(
              creds.apiKey,
              instFrom,
              toList,
              { ...options, replyTo: instReplyTo }
            );

            if (resendResult.success) {
              await recordEmailDeliveryLog({
                institutionId: options.institutionId,
                recipientEmail: primaryRecipient,
                senderIdentity: instFrom,
                replyTo: instReplyTo,
                subject: options.subject,
                purpose,
                provider: "institution-resend",
                fallbackUsed: false,
                providerMessageId: resendResult.messageId,
                deliveryStatus: "ACCEPTED",
                retryCount: 0,
              });

              return {
                ...resendResult,
                provider: "institution-resend",
                fallbackUsed: false,
              };
            } else {
              institutionFailed = true;
              institutionFailureReason = resendResult.error || "Institution Resend dispatch failed";
              console.warn(`[EmailService] Institution Resend failed: ${resendResult.error}. Triggering central fallback...`);
            }
          }
        }
      }
    } catch (configErr: any) {
      console.warn(`[EmailService] Failed resolving institution email config:`, configErr);
    }
  }

  // If institution sending was attempted and failed, record failure log
  if (institutionAttempted && institutionFailed) {
    await recordEmailDeliveryLog({
      institutionId: options.institutionId,
      recipientEmail: primaryRecipient,
      senderIdentity: options.from || "unknown",
      replyTo: options.replyTo,
      subject: options.subject,
      purpose,
      provider: "institution-provider",
      fallbackUsed: false,
      deliveryStatus: "FAILED",
      failureReason: institutionFailureReason,
      retryCount: 0,
    });

    if (options.allowFallback === false) {
      return {
        success: false,
        status: "DELIVERY_FAILED",
        error: institutionFailureReason || "Institution email delivery failed and fallback is disabled.",
      };
    }
  }

  // =========================================================================
  // STEP 2: Option C - Central Sohan Softech Fallback / Central Provider
  // =========================================================================
  const defaultSender = resolveDefaultSender();
  const centralFrom = options.from || defaultSender || (options.institutionId ? CENTRAL_SOHAN_SOFTECH_SENDER : "");
  const centralReplyTo = options.replyTo || (options.institutionId ? undefined : undefined);

  if (!centralFrom) {
    return {
      success: false,
      status: "DELIVERY_FAILED",
      code: "SENDER_NOT_CONFIGURED",
      error: "Sender email address is not configured. Please define EMAIL_FROM in your environment with a verified sending domain.",
      recipientCount: toList.length,
    };
  }

  // 1. Central Resend Provider
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const res = await sendViaResend(resendApiKey, centralFrom, toList, {
      ...options,
      replyTo: centralReplyTo || options.replyTo,
    });

    if (res.success) {
      const centralFallbackUsed = Boolean(options.institutionId);

      await recordEmailDeliveryLog({
        institutionId: options.institutionId,
        recipientEmail: primaryRecipient,
        senderIdentity: centralFrom,
        replyTo: centralReplyTo || options.replyTo,
        subject: options.subject,
        purpose,
        provider: "central-resend",
        fallbackUsed: centralFallbackUsed,
        providerMessageId: res.messageId,
        deliveryStatus: "ACCEPTED",
        retryCount: 0,
      });

      return {
        ...res,
        provider: "central-resend",
        fallbackUsed: centralFallbackUsed,
      };
    } else {
      const centralFallbackUsed = Boolean(options.institutionId);

      await recordEmailDeliveryLog({
        institutionId: options.institutionId,
        recipientEmail: primaryRecipient,
        senderIdentity: centralFrom,
        replyTo: centralReplyTo || options.replyTo,
        subject: options.subject,
        purpose,
        provider: "central-resend",
        fallbackUsed: centralFallbackUsed,
        deliveryStatus: "FAILED",
        failureReason: res.error,
        retryCount: 1,
      });

      return {
        ...res,
        provider: "central-resend",
        fallbackUsed: centralFallbackUsed,
      };
    }
  }

  // 2. Central SMTP Provider
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    try {
      const { transporter } = await getTransporter();
      const mailOptions: any = {
        from: centralFrom,
        to: toList.join(", "),
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: centralReplyTo || options.replyTo,
      };
      if (options.cc) {
        const ccList = Array.isArray(options.cc) ? options.cc : [options.cc];
        if (ccList.length > 0) mailOptions.cc = ccList.join(", ");
      }

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

      console.log(`[EmailService] ✉️ Central SMTP Dispatched: "${options.subject}" to ${toList.length} recipient(s) [ID: ${info.messageId}]`);
      await recordEmailDeliveryLog({
        institutionId: options.institutionId,
        recipientEmail: primaryRecipient,
        senderIdentity: centralFrom,
        replyTo: centralReplyTo || options.replyTo,
        subject: options.subject,
        purpose,
        provider: "central-smtp",
        fallbackUsed: Boolean(institutionAttempted && institutionFailed),
        providerMessageId: info.messageId,
        deliveryStatus: "ACCEPTED",
        retryCount: 0,
      });

      return {
        success: true,
        status: "PROVIDER_ACCEPTED",
        provider: "smtp",
        messageId: info.messageId,
        fallbackUsed: Boolean(institutionAttempted && institutionFailed),
        recipientCount: toList.length,
      };
    } catch (smtpErr: any) {
      console.error(`[EmailService] Central SMTP delivery failure for "${options.subject}":`, smtpErr.message);
      await recordEmailDeliveryLog({
        institutionId: options.institutionId,
        recipientEmail: primaryRecipient,
        senderIdentity: centralFrom,
        replyTo: centralReplyTo || options.replyTo,
        subject: options.subject,
        purpose,
        provider: "central-smtp",
        fallbackUsed: Boolean(institutionAttempted && institutionFailed),
        deliveryStatus: "FAILED",
        failureReason: smtpErr.message,
        retryCount: 0,
      });

      return {
        success: false,
        status: "DELIVERY_FAILED",
        provider: "smtp",
        error: smtpErr.message || "SMTP transport failure",
        recipientCount: toList.length,
      };
    }
  }

  // 3. Explicit Ethereal / Simulated Opt-in (ONLY if developer explicitly flags ALLOW_ETHEREAL_FALLBACK)
  const isEtherealAllowed = process.env.ALLOW_ETHEREAL_FALLBACK === "true" || process.env.EMAIL_PROVIDER === "ethereal";
  if (isEtherealAllowed) {
    try {
      const { transporter, mode } = await getTransporter();
      const mailOptions: any = {
        from: centralFrom,
        to: toList.join(", "),
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: centralReplyTo || options.replyTo,
      };
      if (options.cc) {
        const ccList = Array.isArray(options.cc) ? options.cc : [options.cc];
        if (ccList.length > 0) mailOptions.cc = ccList.join(", ");
      }

      const info = await transporter.sendMail(mailOptions);
      let previewUrl: string | false = false;
      if (mode === "ethereal") {
        previewUrl = nodemailer.getTestMessageUrl(info);
      }

      await recordEmailDeliveryLog({
        institutionId: options.institutionId,
        recipientEmail: primaryRecipient,
        senderIdentity: centralFrom,
        subject: options.subject,
        purpose,
        provider: mode,
        fallbackUsed: false,
        providerMessageId: info.messageId,
        deliveryStatus: "ACCEPTED",
        retryCount: 0,
      });

      return {
        success: true,
        status: "PROVIDER_ACCEPTED",
        provider: mode,
        messageId: info.messageId,
        previewUrl,
        simulated: mode === "simulated",
        recipientCount: toList.length,
      };
    } catch (testErr: any) {
      return {
        success: false,
        status: "DELIVERY_FAILED",
        provider: "ethereal",
        error: testErr.message || "Test transport failure",
        recipientCount: toList.length,
      };
    }
  }

  // 4. Default: Real email delivery expected, but no provider is configured
  // NEVER silently fall back to Ethereal when real delivery is expected!
  console.error(
    `[EmailService] Real email delivery rejected: No transactional email provider is configured. Neither RESEND_API_KEY nor SMTP_HOST is set in environment.`
  );
  return {
    success: false,
    status: "DELIVERY_FAILED",
    code: "PROVIDER_NOT_CONFIGURED",
    error: "Transactional email provider is not configured. Real delivery cannot proceed. Please configure RESEND_API_KEY (and verified EMAIL_FROM sender) or SMTP credentials in your environment.",
    recipientCount: toList.length,
    details: {
      hasResendApiKey: false,
      hasSmtpHost: false,
      provider: "unconfigured",
    },
  };
}

/**
 * Dispatches announcement emails to a list of recipients using the branded template
 */
export async function sendAnnouncementNotification(
  recipients: Array<{ email: string; name?: string }>,
  options: AnnouncementTemplateOptions & { cc?: string | string[]; institutionId?: string }
): Promise<EmailSendResult> {
  const validEmails = recipients
    .map((r) => r.email?.trim())
    .filter((e): e is string => Boolean(e && e.includes("@")));

  if (validEmails.length === 0) {
    return { success: true, status: "EMAIL_QUEUED", recipientCount: 0, simulated: true };
  }

  const { subject, html, text } = renderAnnouncementEmail(options);

  return await sendEmail({
    to: validEmails,
    cc: options.cc,
    subject,
    html,
    text,
    institutionId: options.institutionId,
    purpose: "ANNOUNCEMENT",
  });
}

/**
 * Dispatches an account invitation and password setup link
 * SECURITY GUARANTEE: Never transmits or logs plaintext passwords.
 */
export async function sendPasswordSetupInvitation(
  recipient: { email: string; name?: string },
  options: PasswordSetupTemplateOptions & { institutionId?: string }
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, status: "DELIVERY_FAILED", error: "Invalid recipient email address" };
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
    institutionId: options.institutionId,
    purpose: "INVITATION",
  });
}

/**
 * Dispatches a direct message or custom notification to a specific recipient
 */
export async function sendDirectEmail(
  recipient: { email: string; name?: string },
  options: DirectMessageTemplateOptions & { cc?: string | string[]; institutionId?: string }
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, status: "DELIVERY_FAILED", error: "Invalid recipient email address" };
  }

  const { subject, html, text } = renderDirectMessageEmail({
    ...options,
    recipientName: recipient.name || options.recipientName,
  });

  return await sendEmail({
    to: recipient.email,
    cc: options.cc,
    subject,
    html,
    text,
    institutionId: options.institutionId,
    purpose: "DIRECT",
  });
}

/**
 * Dispatches a role-specific account setup invitation with portal login URL
 */
export async function sendRoleCredentialInvitation(
  recipient: { email: string; name?: string },
  options: RoleCredentialInvitationTemplateOptions & { institutionId?: string }
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, status: "DELIVERY_FAILED", error: "Invalid recipient email address" };
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
    institutionId: options.institutionId,
    purpose: "INVITATION",
  });
}

/**
 * Dispatches a single-use expiring password reset notification (Phase 6)
 */
export async function sendPasswordResetNotification(
  recipient: { email: string; name?: string },
  options: PasswordResetTemplateOptions & { institutionId?: string }
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, status: "DELIVERY_FAILED", error: "Invalid recipient email address" };
  }

  const { subject, html, text } = renderPasswordResetEmail(options);

  return await sendEmail({
    to: recipient.email,
    subject,
    html,
    text,
    institutionId: options.institutionId,
    purpose: "PASSWORD_RESET",
  });
}

/**
 * Dispatches an official fee payment receipt notification (Phase 6)
 */
export async function sendFeeReceiptNotification(
  recipient: { email: string; name?: string },
  options: FeeReceiptTemplateOptions & { institutionId?: string }
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, status: "DELIVERY_FAILED", error: "Invalid recipient email address" };
  }

  const { subject, html, text } = renderFeeReceiptEmail(options);

  return await sendEmail({
    to: recipient.email,
    subject,
    html,
    text,
    institutionId: options.institutionId,
    purpose: "FEE_RECEIPT",
  });
}

/**
 * Dispatches an academic attendance advisory alert (Phase 6)
 */
export async function sendAttendanceAlertNotification(
  recipient: { email: string; name?: string },
  options: AttendanceAlertTemplateOptions & { institutionId?: string }
): Promise<EmailSendResult> {
  if (!recipient.email || !recipient.email.includes("@")) {
    return { success: false, status: "DELIVERY_FAILED", error: "Invalid recipient email address" };
  }

  const { subject, html, text } = renderAttendanceAlertEmail(options);

  return await sendEmail({
    to: recipient.email,
    subject,
    html,
    text,
    institutionId: options.institutionId,
    purpose: "ATTENDANCE_ALERT",
  });
}

/**
 * Previews rendered email content before sending (without dispatching)
 */
export function previewEmail(
  type: "ANNOUNCEMENT" | "INVITATION" | "DIRECT" | "PASSWORD_RESET" | "FEE_RECEIPT" | "ATTENDANCE_ALERT",
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
    case "PASSWORD_RESET":
      return renderPasswordResetEmail(options);
    case "FEE_RECEIPT":
      return renderFeeReceiptEmail(options);
    case "ATTENDANCE_ALERT":
      return renderAttendanceAlertEmail(options);
    default:
      return renderAnnouncementEmail(options);
  }
}
