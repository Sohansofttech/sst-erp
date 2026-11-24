/**
 * SST-ERP Email Infrastructure Type Definitions
 * Option C Architecture: Institution-Specific Email Configuration with Central Sohan Softech Fallback
 */

export type EmailProviderType = "SMTP" | "RESEND" | "SENDGRID" | "CENTRAL_FALLBACK";

export type EmailVerificationStatus =
  | "NOT_CONFIGURED"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "FAILED";

export type EmailDeliveryStatus =
  | "QUEUED"
  | "ACCEPTED"
  | "DELIVERED"
  | "BOUNCED"
  | "FAILED";

export type EmailPurpose =
  | "INVITATION"
  | "ANNOUNCEMENT"
  | "PASSWORD_RESET"
  | "FEE_RECEIPT"
  | "ATTENDANCE_ALERT"
  | "DIRECT"
  | "SYSTEM";

export interface SmtpCredentials {
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password?: string;
}

export interface ApiProviderCredentials {
  apiKey: string;
}

export type DecryptedEmailCredentials = SmtpCredentials | ApiProviderCredentials;

export interface MaskedSmtpCredentials {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  hasPassword: boolean;
  maskedPassword?: string;
}

export interface MaskedApiCredentials {
  hasApiKey: boolean;
  maskedApiKey?: string;
}

export type MaskedEmailCredentials = MaskedSmtpCredentials | MaskedApiCredentials;

/**
 * Institution-specific email configuration (Option C)
 */
export interface InstitutionEmailConfig {
  institutionId: string;
  provider: EmailProviderType;
  isEnabled: boolean;
  senderEmail: string;
  senderName: string;
  replyToEmail?: string;
  status: EmailVerificationStatus;
  encryptedCredentials?: string;
  credentials?: DecryptedEmailCredentials;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt: string;
}

/**
 * Masked Institution Email Config safe for frontend transmission
 */
export interface MaskedInstitutionEmailConfig {
  institutionId: string;
  provider: EmailProviderType;
  isEnabled: boolean;
  senderEmail: string;
  senderName: string;
  replyToEmail?: string;
  status: EmailVerificationStatus;
  hasCredentials: boolean;
  maskedCredentials?: MaskedEmailCredentials;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  updatedAt: string;
  centralFallbackSender: string;
  architectureMode: "OPTION_C_INSTITUTION_WITH_CENTRAL_FALLBACK";
}

/**
 * Super Admin Central Email Provider Configuration
 */
export interface CentralEmailProviderConfig {
  provider: "RESEND" | "SMTP";
  senderEmail: string; // e.g. "noreply@erp.sohansoft.in"
  senderName: string; // e.g. "SOHAN SOFT TECH ERP"
  status: EmailVerificationStatus;
  encryptedCredentials?: string;
  credentials?: DecryptedEmailCredentials;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  updatedAt: string;
}

export interface MaskedCentralEmailConfig {
  provider: "RESEND" | "SMTP";
  senderEmail: string;
  senderName: string;
  status: EmailVerificationStatus;
  hasCredentials: boolean;
  maskedCredentials?: MaskedEmailCredentials;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  updatedAt: string;
}

/**
 * Delivery log record tracking email dispatches across tenants
 */
export interface EmailDeliveryLogRecord {
  id: string;
  institutionId?: string | null;
  institutionName?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  senderIdentity: string;
  replyTo?: string | null;
  subject: string;
  purpose: EmailPurpose;
  provider: string; // e.g. "institution-smtp", "institution-resend", "central-resend"
  fallbackUsed: boolean;
  providerMessageId?: string | null;
  deliveryStatus: EmailDeliveryStatus;
  failureReason?: string | null;
  retryCount: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SaveInstitutionEmailInput {
  provider: EmailProviderType;
  senderEmail: string;
  senderName: string;
  replyToEmail?: string;
  isEnabled?: boolean;
  credentials?: DecryptedEmailCredentials;
}

export interface SaveCentralEmailInput {
  provider: "RESEND" | "SMTP";
  senderEmail?: string;
  senderName?: string;
  credentials?: DecryptedEmailCredentials;
}

export interface TestConnectionResult {
  success: boolean;
  provider: string;
  senderVerified: boolean;
  message: string;
  testedAt: string;
  details?: Record<string, any>;
}
