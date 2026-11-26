/**
 * SST-ERP Email Infrastructure Configuration & Delivery Logging Service
 * Option C Architecture: Institution-Specific Email Configuration with Central Sohan Softech Fallback
 */

import db from "../db";
import nodemailer from "nodemailer";
import {
  EmailProviderType,
  EmailVerificationStatus,
  EmailDeliveryStatus,
  EmailPurpose,
  InstitutionEmailConfig,
  MaskedInstitutionEmailConfig,
  CentralEmailProviderConfig,
  MaskedCentralEmailConfig,
  EmailDeliveryLogRecord,
  SaveInstitutionEmailInput,
  SaveCentralEmailInput,
  TestConnectionResult,
  SmtpCredentials,
  ApiProviderCredentials,
  DecryptedEmailCredentials,
} from "@/types/email-infrastructure";
import {
  encryptCredential,
  decryptCredential,
  maskCredential,
} from "../security/encryption";
import { recordAudit } from "./audit.service";

// Canonical Central Sohan Softech Email Sender
export const CENTRAL_SOHAN_SOFTECH_SENDER = "noreply@erp.sohansoft.in";
export const CENTRAL_SOHAN_SOFTECH_NAME = "SOHAN SOFT TECH ERP";

// In-memory cache for ultra-fast lookups and resilient offline/test fallback
const institutionConfigCache = new Map<string, InstitutionEmailConfig>();
let centralConfigCache: CentralEmailProviderConfig | null = null;
const deliveryLogBuffer: EmailDeliveryLogRecord[] = [];
const MAX_LOG_BUFFER_SIZE = 1000;

/**
 * Test-only helper: clears the in-memory configuration caches so tests can
 * exercise the authoritative database read path (cache reset). Not used in
 * production code paths.
 */
export function __resetEmailConfigCachesForTests(): void {
  institutionConfigCache.clear();
  centralConfigCache = null;
}

function createDefaultInstitutionConfig(institutionId: string): InstitutionEmailConfig {
  return {
    institutionId,
    provider: "SMTP",
    isEnabled: false,
    senderEmail: "",
    senderName: "",
    status: "NOT_CONFIGURED",
    updatedAt: new Date().toISOString(),
  };
}

function createDefaultCentralConfig(): CentralEmailProviderConfig {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSmtp = Boolean(process.env.SMTP_HOST);

  return {
    provider: hasResend ? "RESEND" : hasSmtp ? "SMTP" : "RESEND",
    senderEmail: process.env.EMAIL_FROM || process.env.INSTITUTION_INVITATION_FROM_EMAIL || CENTRAL_SOHAN_SOFTECH_SENDER,
    senderName: CENTRAL_SOHAN_SOFTECH_NAME,
    status: hasResend || hasSmtp ? "VERIFIED" : "NOT_CONFIGURED",
    lastVerifiedAt: hasResend || hasSmtp ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Masks institution email credentials for safe frontend serialization.
 * GUARANTEE: Never exposes plaintext passwords or raw API keys.
 */
export function toMaskedInstitutionConfig(
  config: InstitutionEmailConfig
): MaskedInstitutionEmailConfig {
  let maskedCreds: any = undefined;

  if (config.provider === "SMTP") {
    const creds = config.credentials as SmtpCredentials | undefined;
    maskedCreds = {
      host: creds?.host || "",
      port: creds?.port || 587,
      secure: Boolean(creds?.secure),
      username: creds?.username || "",
      hasPassword: Boolean(creds?.password),
      maskedPassword: creds?.password ? maskCredential(creds.password, 0, 0, true) : undefined,
    };
  } else if (config.provider === "RESEND" || config.provider === "SENDGRID") {
    const creds = config.credentials as ApiProviderCredentials | undefined;
    maskedCreds = {
      hasApiKey: Boolean(creds?.apiKey),
      maskedApiKey: creds?.apiKey ? maskCredential(creds.apiKey, 4, 4, false) : undefined,
    };
  }

  return {
    institutionId: config.institutionId,
    provider: config.provider,
    isEnabled: config.isEnabled,
    senderEmail: config.senderEmail,
    senderName: config.senderName,
    replyToEmail: config.replyToEmail,
    status: config.status,
    hasCredentials: Boolean(config.credentials || config.encryptedCredentials),
    maskedCredentials: maskedCreds,
    lastVerifiedAt: config.lastVerifiedAt,
    lastError: config.lastError,
    updatedAt: config.updatedAt,
    centralFallbackSender: CENTRAL_SOHAN_SOFTECH_SENDER,
    architectureMode: "OPTION_C_INSTITUTION_WITH_CENTRAL_FALLBACK",
  };
}

/**
 * Masks central Super Admin email credentials for safe frontend serialization.
 */
export function toMaskedCentralConfig(
  config: CentralEmailProviderConfig
): MaskedCentralEmailConfig {
  let maskedCreds: any = undefined;
  if (config.provider === "SMTP") {
    const creds = config.credentials as SmtpCredentials | undefined;
    maskedCreds = {
      host: creds?.host || "",
      port: creds?.port || 587,
      secure: Boolean(creds?.secure),
      username: creds?.username || "",
      hasPassword: Boolean(creds?.password),
      maskedPassword: creds?.password ? maskCredential(creds.password, 0, 0, true) : undefined,
    };
  } else {
    const creds = config.credentials as ApiProviderCredentials | undefined;
    const apiKey = creds?.apiKey || process.env.RESEND_API_KEY || "";
    maskedCreds = {
      hasApiKey: Boolean(apiKey),
      maskedApiKey: apiKey ? maskCredential(apiKey, 4, 4, false) : undefined,
    };
  }

  return {
    provider: config.provider,
    senderEmail: config.senderEmail,
    senderName: config.senderName,
    status: config.status,
    hasCredentials: Boolean(config.credentials || config.encryptedCredentials || process.env.RESEND_API_KEY),
    maskedCredentials: maskedCreds,
    lastVerifiedAt: config.lastVerifiedAt,
    lastError: config.lastError,
    updatedAt: config.updatedAt,
  };
}

/**
 * Retrieves the institution-specific email configuration.
 * Tenant Isolation Guarantee: strictly scoped by institutionId.
 */
export async function getInstitutionEmailConfig(
  institutionId: string
): Promise<InstitutionEmailConfig> {
  if (institutionConfigCache.has(institutionId)) {
    return institutionConfigCache.get(institutionId)!;
  }

  const fallbackConfig = createDefaultInstitutionConfig(institutionId);

  try {
    const settingKey = `email_config:${institutionId}`;
    const row: any = await db.platformSetting.findUnique({
      where: { key: settingKey },
    });

    if (row?.value) {
      const stored = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      let creds: DecryptedEmailCredentials | undefined = undefined;

      if (stored.encryptedCredentials) {
        try {
          creds = JSON.parse(decryptCredential(stored.encryptedCredentials));
        } catch (decErr) {
          console.warn(`[EmailConfig] Failed to decrypt credentials for institution ${institutionId}:`, decErr);
        }
      }

      const config: InstitutionEmailConfig = {
        ...fallbackConfig,
        ...stored,
        credentials: creds,
        updatedAt: stored.updatedAt || new Date().toISOString(),
      };

      institutionConfigCache.set(institutionId, config);
      return config;
    }
  } catch (err: any) {
    // Database table or record not found; return safe memory fallback
  }

  institutionConfigCache.set(institutionId, fallbackConfig);
  return fallbackConfig;
}

/**
 * Saves the institution-specific email configuration.
 * Encrypts provider credentials using AES-256-GCM.
 * Enforces rule: Changing sender or credentials resets status to PENDING_VERIFICATION
 * until an explicit connection test succeeds.
 */
export async function saveInstitutionEmailConfig(
  institutionId: string,
  input: SaveInstitutionEmailInput,
  actorUserId?: string
): Promise<InstitutionEmailConfig> {
  const existing = await getInstitutionEmailConfig(institutionId);

  // Validate email format
  const senderEmail = input.senderEmail?.trim() || "";
  const senderName = input.senderName?.trim() || "";
  const replyToEmail = input.replyToEmail?.trim() || undefined;

  let credentialsToStore: DecryptedEmailCredentials | undefined = input.credentials;
  let encryptedPayload = existing.encryptedCredentials;

  const credentialsUpdated = Boolean(
    input.credentials &&
      ((input.credentials as any).password || (input.credentials as any).apiKey)
  );

  if (credentialsUpdated && input.credentials) {
    encryptedPayload = encryptCredential(JSON.stringify(input.credentials));
    credentialsToStore = input.credentials;
  } else if (!credentialsToStore && existing.credentials) {
    credentialsToStore = existing.credentials;
  }

  // If sender email or credentials changed, reset status to PENDING_VERIFICATION
  const isSenderChanged = existing.senderEmail !== senderEmail;
  let status = existing.status;
  if (!senderEmail) {
    status = "NOT_CONFIGURED";
  } else if (isSenderChanged || credentialsUpdated) {
    status = "PENDING_VERIFICATION";
  }

  const updatedConfig: InstitutionEmailConfig = {
    institutionId,
    provider: input.provider || existing.provider || "SMTP",
    isEnabled: input.isEnabled !== undefined ? input.isEnabled : existing.isEnabled,
    senderEmail,
    senderName,
    replyToEmail,
    status,
    encryptedCredentials: encryptedPayload,
    credentials: credentialsToStore,
    lastVerifiedAt: status === "VERIFIED" ? existing.lastVerifiedAt : null,
    lastError: status === "VERIFIED" ? existing.lastError : null,
    updatedAt: new Date().toISOString(),
  };

  // Persist to PlatformSetting first. Persistence is authoritative: if the write
  // fails we must NOT update the cache or report success, otherwise the in-memory
  // copy diverges from the database and the configuration appears "saved" until a
  // cold start reveals it was never persisted. Errors propagate to the caller.
  const settingKey = `email_config:${institutionId}`;
  const valueToStore = {
    institutionId,
    provider: updatedConfig.provider,
    isEnabled: updatedConfig.isEnabled,
    senderEmail: updatedConfig.senderEmail,
    senderName: updatedConfig.senderName,
    replyToEmail: updatedConfig.replyToEmail,
    status: updatedConfig.status,
    encryptedCredentials: updatedConfig.encryptedCredentials,
    lastVerifiedAt: updatedConfig.lastVerifiedAt,
    lastError: updatedConfig.lastError,
    updatedAt: updatedConfig.updatedAt,
  };

  await db.platformSetting.upsert({
    where: { key: settingKey },
    create: {
      key: settingKey,
      value: valueToStore,
      description: `Institution Email Configuration for ${institutionId} (Option C)`,
      updatedAt: new Date(),
    },
    update: {
      value: valueToStore,
      updatedAt: new Date(),
    },
  });

  // Only cache after the database write has durably succeeded.
  institutionConfigCache.set(institutionId, updatedConfig);

  // Audit is best-effort (recordAudit swallows its own failures) and must never
  // affect the already-committed persistence result.
  await recordAudit({
    institutionId,
    actorUserId: actorUserId || null,
    action: "UPDATE",
    entityType: "INSTITUTION_EMAIL_CONFIG",
    entityId: institutionId,
    newValues: {
      provider: updatedConfig.provider,
      isEnabled: updatedConfig.isEnabled,
      senderEmail: updatedConfig.senderEmail,
      status: updatedConfig.status,
    },
  });

  return updatedConfig;
}

/**
 * Retrieves the central Super Admin email provider configuration.
 */
export async function getCentralEmailConfig(): Promise<CentralEmailProviderConfig> {
  if (centralConfigCache) {
    return centralConfigCache;
  }

  const defaultCentral = createDefaultCentralConfig();

  try {
    const settingKey = "central_email_provider";
    const row: any = await db.platformSetting.findUnique({
      where: { key: settingKey },
    });

    if (row?.value) {
      const stored = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      let creds: DecryptedEmailCredentials | undefined = undefined;

      if (stored.encryptedCredentials) {
        try {
          creds = JSON.parse(decryptCredential(stored.encryptedCredentials));
        } catch {}
      }

      const config: CentralEmailProviderConfig = {
        ...defaultCentral,
        ...stored,
        credentials: creds,
        updatedAt: stored.updatedAt || new Date().toISOString(),
      };

      centralConfigCache = config;
      return config;
    }
  } catch {}

  centralConfigCache = defaultCentral;
  return defaultCentral;
}

/**
 * Saves the central Super Admin email provider configuration.
 */
export async function saveCentralEmailConfig(
  input: SaveCentralEmailInput,
  actorUserId?: string
): Promise<CentralEmailProviderConfig> {
  const existing = await getCentralEmailConfig();

  let encryptedPayload = existing.encryptedCredentials;
  let credentialsToStore: DecryptedEmailCredentials | undefined = input.credentials;

  if (input.credentials) {
    encryptedPayload = encryptCredential(JSON.stringify(input.credentials));
  } else {
    credentialsToStore = existing.credentials;
  }

  const updatedConfig: CentralEmailProviderConfig = {
    provider: input.provider,
    senderEmail: input.senderEmail || existing.senderEmail || CENTRAL_SOHAN_SOFTECH_SENDER,
    senderName: input.senderName || existing.senderName || CENTRAL_SOHAN_SOFTECH_NAME,
    status: existing.status,
    encryptedCredentials: encryptedPayload,
    credentials: credentialsToStore,
    lastVerifiedAt: existing.lastVerifiedAt,
    lastError: existing.lastError,
    updatedAt: new Date().toISOString(),
  };

  // Persist to PlatformSetting first; persistence is authoritative. On failure we
  // log a generic message (never credentials/secrets) and rethrow so the caller
  // does not report a false success. The cache is updated only after success.
  try {
    const settingKey = "central_email_provider";
    const valueToStore = {
      provider: updatedConfig.provider,
      senderEmail: updatedConfig.senderEmail,
      senderName: updatedConfig.senderName,
      status: updatedConfig.status,
      encryptedCredentials: updatedConfig.encryptedCredentials,
      lastVerifiedAt: updatedConfig.lastVerifiedAt,
      lastError: updatedConfig.lastError,
      updatedAt: updatedConfig.updatedAt,
    };

    await db.platformSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: valueToStore,
        description: "Central Super Admin Email Provider Configuration (Option C)",
        updatedAt: new Date(),
      },
      update: {
        value: valueToStore,
        updatedAt: new Date(),
      },
    });

    await recordAudit({
      institutionId: "SUPER_ADMIN",
      actorUserId: actorUserId || null,
      action: "UPDATE",
      entityType: "CENTRAL_EMAIL_PROVIDER",
      entityId: "central_email_provider",
      newValues: {
        provider: updatedConfig.provider,
        senderEmail: updatedConfig.senderEmail,
      },
    });
  } catch (err: any) {
    // Generic log only — never include credentials, secrets, or config payloads.
    console.error("[EmailConfig] Failed to persist central email provider configuration.");
    throw err;
  }

  // Only cache after the database write has durably succeeded.
  centralConfigCache = updatedConfig;

  return updatedConfig;
}

/**
 * Tests the connection and verifies the sender for an institution email provider.
 * GUARANTEE: Entering an email address alone NEVER marks it as verified.
 * Must successfully connect to SMTP server or API endpoint to become VERIFIED.
 */
export async function testInstitutionEmailConnection(
  institutionId: string,
  testRecipient?: string
): Promise<TestConnectionResult> {
  const config = await getInstitutionEmailConfig(institutionId);

  if (!config.senderEmail || !config.senderEmail.includes("@")) {
    return {
      success: false,
      provider: config.provider,
      senderVerified: false,
      message: "Please configure a valid official sender email address before testing.",
      testedAt: new Date().toISOString(),
    };
  }

  let testSuccess = false;
  let testMessage = "";
  let details: Record<string, any> = {};

  if (config.provider === "SMTP") {
    const creds = config.credentials as SmtpCredentials | undefined;
    if (!creds?.host || !creds?.username) {
      return {
        success: false,
        provider: "SMTP",
        senderVerified: false,
        message: "Incomplete SMTP configuration. Host and username are required.",
        testedAt: new Date().toISOString(),
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: creds.host,
        port: creds.port || 587,
        secure: Boolean(creds.secure),
        auth: {
          user: creds.username,
          pass: creds.password || "",
        },
        connectionTimeout: 8000,
      });

      await transporter.verify();
      testSuccess = true;
      testMessage = `SMTP server (${creds.host}:${creds.port}) connection verified successfully.`;
      details = { host: creds.host, port: creds.port, secure: creds.secure };
    } catch (smtpErr: any) {
      testSuccess = false;
      testMessage = `SMTP connection failed: ${smtpErr.message || "Connection refused"}`;
      details = { error: smtpErr.message };
    }
  } else if (config.provider === "RESEND") {
    const creds = config.credentials as ApiProviderCredentials | undefined;
    const apiKey = creds?.apiKey || "";
    if (!apiKey) {
      return {
        success: false,
        provider: "RESEND",
        senderVerified: false,
        message: "Resend API key is required to verify configuration.",
        testedAt: new Date().toISOString(),
      };
    }

    try {
      // Test sending capability to verified sink or domain test
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${config.senderName || "SST-ERP"} <${config.senderEmail}>`,
          to: "delivered@resend.dev",
          subject: "SST-ERP — Institution Sender Verification Probe",
          html: "<p>Verification probe</p>",
        }),
      });

      if (res.ok) {
        testSuccess = true;
        testMessage = `Resend API verified successfully for sender ${config.senderEmail}.`;
      } else {
        const body: any = await res.json().catch(() => ({}));
        testSuccess = false;
        testMessage = `Resend verification error (${res.status}): ${body.message || "Invalid API key or unverified domain"}`;
        details = body;
      }
    } catch (netErr: any) {
      testSuccess = false;
      testMessage = `Network error contacting Resend API: ${netErr.message}`;
    }
  } else {
    // SendGrid or other API providers
    testSuccess = false;
    testMessage = `Provider ${config.provider} verification adapter pending setup.`;
  }

  // Update institution verification status based on empirical outcome
  const newStatus: EmailVerificationStatus = testSuccess ? "VERIFIED" : "FAILED";
  config.status = newStatus;
  config.lastVerifiedAt = testSuccess ? new Date().toISOString() : config.lastVerifiedAt;
  config.lastError = testSuccess ? null : testMessage;
  config.updatedAt = new Date().toISOString();

  institutionConfigCache.set(institutionId, config);

  // Persist updated status. Use upsert so verification succeeds even when the
  // setting row does not yet exist (e.g. test before the first save). A failed
  // write must surface as a failed test result rather than a false success.
  try {
    const settingKey = `email_config:${institutionId}`;
    const valueToStore = {
      institutionId,
      provider: config.provider,
      isEnabled: config.isEnabled,
      senderEmail: config.senderEmail,
      senderName: config.senderName,
      replyToEmail: config.replyToEmail,
      status: newStatus,
      encryptedCredentials: config.encryptedCredentials,
      lastVerifiedAt: config.lastVerifiedAt,
      lastError: config.lastError,
      updatedAt: config.updatedAt,
    };
    await db.platformSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: valueToStore,
        description: `Institution Email Configuration for ${institutionId} (Option C)`,
        updatedAt: new Date(),
      },
      update: {
        value: valueToStore,
        updatedAt: new Date(),
      },
    });
  } catch (err: any) {
    // Do not report a verified/persisted status when the write failed.
    console.error("[EmailConfig] Failed to persist institution email verification status.");
    config.status = "FAILED";
    config.lastError = testMessage;
    institutionConfigCache.set(institutionId, config);
    return {
      success: false,
      provider: config.provider,
      senderVerified: false,
      message: "Connection test could not be saved. Please try again.",
      testedAt: new Date().toISOString(),
      details,
    };
  }

  return {
    success: testSuccess,
    provider: config.provider,
    senderVerified: testSuccess,
    message: testMessage,
    testedAt: new Date().toISOString(),
    details,
  };
}

/**
 * Records an email delivery event in the persistent audit log and delivery history.
 * Distinguishes QUEUED, ACCEPTED, DELIVERED, BOUNCED, FAILED.
 * CRITICAL: Provider acceptance (ACCEPTED) is NEVER represented as confirmed inbox delivery (DELIVERED).
 */
export async function recordEmailDeliveryLog(
  log: Omit<EmailDeliveryLogRecord, "id" | "timestamp">
): Promise<EmailDeliveryLogRecord> {
  const record: EmailDeliveryLogRecord = {
    ...log,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
  };

  // Keep the in-memory buffer only as a non-authoritative compatibility cache.
  // The database (AuditLog) is the source of truth for reads.
  deliveryLogBuffer.unshift(record);
  if (deliveryLogBuffer.length > MAX_LOG_BUFFER_SIZE) {
    deliveryLogBuffer.pop();
  }

  // Persist durably to the physical audit_logs table. Only safe delivery metadata
  // is stored — never credentials, API keys, passwords, or auth secrets.
  const safeMetadata = {
    recipientEmail: record.recipientEmail,
    recipientName: record.recipientName ?? null,
    senderIdentity: record.senderIdentity,
    replyTo: record.replyTo ?? null,
    subject: record.subject,
    purpose: record.purpose,
    provider: record.provider,
    fallbackUsed: record.fallbackUsed,
    providerMessageId: record.providerMessageId ?? null,
    deliveryStatus: record.deliveryStatus,
    failureReason: record.failureReason ?? null,
    retryCount: record.retryCount,
    timestamp: record.timestamp,
  };

  try {
    if (log.institutionId) {
      // Institution-scoped delivery: AuditLog requires a real institution UUID FK.
      await db.auditLog.create({
        data: {
          institutionId: log.institutionId,
          action: log.deliveryStatus === "FAILED" ? "EMAIL_DELIVERY_FAILED" : "EMAIL_DISPATCH",
          entityType: "EMAIL_DELIVERY",
          entityId: record.id,
          newValuesJson: JSON.stringify(safeMetadata),
        },
      });
    } else {
      // Central (Super Admin) delivery: no institution, so use PlatformAuditLog
      // with a null institutionId. Never use "SUPER_ADMIN" as a UUID.
      await db.platformAuditLog.create({
        data: {
          institutionId: null,
          action: log.deliveryStatus === "FAILED" ? "EMAIL_DELIVERY_FAILED" : "EMAIL_DISPATCH",
          entity: "EMAIL_DELIVERY",
          entityId: record.id,
          metadata: safeMetadata,
        },
      });
    }
  } catch (err: any) {
    // Report the persistence failure via safe server-side logging (no secrets),
    // but do NOT throw: a logging failure must never make a successfully sent
    // email appear to have failed.
    console.error(
      `[EmailConfig] Failed to persist email delivery log ${record.id}:`,
      err?.message || "unknown error"
    );
  }

  return record;
}

/**
 * Retrieves delivery logs with filtering options.
 * Enforces tenant isolation: Institution Admins only see their institution's logs;
 * Super Admin can view cross-institution logs.
 */
export async function getEmailDeliveryLogs(options: {
  institutionId?: string | null;
  status?: EmailDeliveryStatus;
  purpose?: EmailPurpose;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ logs: EmailDeliveryLogRecord[]; total: number }> {
  // Authoritative sources are the durable audit tables. Institution-scoped logs
  // live in AuditLog; central (no-institution) logs live in PlatformAuditLog.
  // The in-memory buffer is NOT used as a fallback, so database failures surface
  // as errors rather than presenting incomplete results as complete.
  const parsed: EmailDeliveryLogRecord[] = [];

  if (options.institutionId) {
    // Specific institution requested: only that institution's AuditLog rows.
    const rows = await db.auditLog.findMany({
      where: { entityType: "EMAIL_DELIVERY", institutionId: options.institutionId },
      orderBy: { createdAt: "desc" },
    });
    for (const row of rows) {
      let meta: any = null;
      try {
        meta = row.newValuesJson ? JSON.parse(row.newValuesJson) : null;
      } catch {
        meta = null;
      }
      if (!meta || typeof meta !== "object") continue;
      parsed.push(normalizeAuditLogRow(row.entityId, row.institutionId, meta, row.createdAt));
    }
  } else {
    // Unfiltered Super Admin view: combine institution + central logs.
    const [instRows, centralRows] = await Promise.all([
      db.auditLog.findMany({
        where: { entityType: "EMAIL_DELIVERY" },
        orderBy: { createdAt: "desc" },
      }),
      db.platformAuditLog.findMany({
        where: { entity: "EMAIL_DELIVERY" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    for (const row of instRows) {
      let meta: any = null;
      try {
        meta = row.newValuesJson ? JSON.parse(row.newValuesJson) : null;
      } catch {
        meta = null;
      }
      if (!meta || typeof meta !== "object") continue;
      parsed.push(normalizeAuditLogRow(row.entityId, row.institutionId, meta, row.createdAt));
    }
    for (const row of centralRows) {
      const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : null) as any;
      if (!meta) continue;
      parsed.push(normalizeAuditLogRow(row.entityId ?? "", row.institutionId ?? null, meta, row.createdAt));
    }
  }

  // Newest first (sources are already sorted, but the combined list is not).
  parsed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  let filtered = parsed;

  if (options.status) {
    filtered = filtered.filter((l) => l.deliveryStatus === options.status);
  }

  if (options.purpose) {
    filtered = filtered.filter((l) => l.purpose === options.purpose);
  }

  if (options.search) {
    const q = options.search.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        (l.recipientEmail || "").toLowerCase().includes(q) ||
        (l.subject || "").toLowerCase().includes(q) ||
        (l.senderIdentity || "").toLowerCase().includes(q) ||
        (l.providerMessageId && l.providerMessageId.toLowerCase().includes(q))
    );
  }

  const total = filtered.length;
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  const logs = filtered.slice(offset, offset + limit);

  return { logs, total };
}

function normalizeAuditLogRow(
  id: string,
  institutionId: string | null,
  meta: any,
  createdAt: Date
): EmailDeliveryLogRecord {
  return {
    id,
    institutionId: institutionId ?? null,
    institutionName: meta.institutionName ?? null,
    recipientEmail: meta.recipientEmail ?? "",
    recipientName: meta.recipientName ?? null,
    senderIdentity: meta.senderIdentity ?? "",
    replyTo: meta.replyTo ?? null,
    subject: meta.subject ?? "",
    purpose: meta.purpose,
    provider: meta.provider ?? "",
    fallbackUsed: Boolean(meta.fallbackUsed),
    providerMessageId: meta.providerMessageId ?? null,
    deliveryStatus: meta.deliveryStatus,
    failureReason: meta.failureReason ?? null,
    retryCount: typeof meta.retryCount === "number" ? meta.retryCount : 0,
    timestamp: meta.timestamp || createdAt.toISOString(),
    metadata: undefined,
  };
}
