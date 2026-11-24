export type PaymentGatewayProvider = "RAZORPAY" | "CASHFREE";

export type GatewayEnvironment = "TEST" | "LIVE" | "SANDBOX" | "PRODUCTION";

export type GatewayConnectionStatus = "NOT_CONFIGURED" | "CONNECTED" | "FAILED" | "DISABLED";

export type WebhookStatus = "NOT_CONFIGURED" | "ACTIVE" | "FAILED";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export interface CashfreeCredentials {
  appId: string;
  secretKey: string;
}

export type GatewayCredentials = RazorpayCredentials | CashfreeCredentials;

export interface MaskedGatewayConfig {
  id: string;
  institutionId: string;
  provider: PaymentGatewayProvider;
  environment: GatewayEnvironment;
  maskedKeyId?: string;
  maskedSecret?: string;
  hasCredentials: boolean;
  webhookUrl: string;
  webhookSecretMasked?: string;
  hasWebhookSecret: boolean;
  connectionStatus: GatewayConnectionStatus;
  webhookStatus: WebhookStatus;
  isEnabled: boolean;
  isDefault: boolean;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DecryptedGatewayConfig {
  id: string;
  institutionId: string;
  provider: PaymentGatewayProvider;
  environment: GatewayEnvironment;
  credentials: RazorpayCredentials | CashfreeCredentials;
  webhookSecret?: string;
  webhookEndpointToken: string;
  connectionStatus: GatewayConnectionStatus;
  webhookStatus: WebhookStatus;
  isEnabled: boolean;
  isDefault: boolean;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
}

export interface PaymentPreferences {
  onlinePaymentsEnabled: boolean;
  defaultGateway: PaymentGatewayProvider | null;
}

export interface SaveGatewayConfigInput {
  provider: PaymentGatewayProvider;
  environment: GatewayEnvironment;
  keyId?: string;       // Razorpay Key ID or Cashfree App ID
  keySecret?: string;   // Razorpay Key Secret or Cashfree Secret Key
  webhookSecret?: string;
  isEnabled?: boolean;
  isDefault?: boolean;
}

export interface CreateOrderParams {
  amount: number;
  currency: string;
  receiptNumber: string;
  studentId: string;
  invoiceId: string;
  notes?: Record<string, string>;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  provider: PaymentGatewayProvider;
  publicKey: string;
  environment: GatewayEnvironment;
  paymentSessionId?: string; // For Cashfree
}
