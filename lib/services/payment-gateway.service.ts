import db from "../db";
import {
  PaymentGatewayProvider,
  GatewayEnvironment,
  MaskedGatewayConfig,
  DecryptedGatewayConfig,
  PaymentPreferences,
  SaveGatewayConfigInput,
  RazorpayCredentials,
  CashfreeCredentials,
} from "@/types/payment-gateway";
import {
  encryptCredential,
  decryptCredential,
  maskCredential,
  generateWebhookToken,
} from "../security/encryption";
import { RazorpayAdapter } from "./payments/razorpay.adapter";
import { CashfreeAdapter } from "./payments/cashfree.adapter";
import { recordAudit } from "./audit.service";

// In-memory cache for fast lookups and resilient offline/test fallback
const gatewayCache = new Map<string, Record<PaymentGatewayProvider, DecryptedGatewayConfig>>();
const preferencesCache = new Map<string, PaymentPreferences>();
const webhookTokenIndex = new Map<string, { institutionId: string; provider: PaymentGatewayProvider }>();
const processedWebhookEvents = new Set<string>();

function getBaseWebhookUrl(token: string): string {
  const host = process.env.NEXTAUTH_URL || process.env.APP_URL || "https://erp.sohansoft.in";
  const cleanHost = host.replace(/\/+$/, "");
  return `${cleanHost}/api/webhooks/payments/${token}`;
}

function toMaskedConfig(config: DecryptedGatewayConfig): MaskedGatewayConfig {
  const isRazorpay = config.provider === "RAZORPAY";
  const creds = config.credentials as any;
  const keyId = isRazorpay ? creds.keyId : creds.appId;
  const keySecret = isRazorpay ? creds.keySecret : creds.secretKey;

  return {
    id: config.id,
    institutionId: config.institutionId,
    provider: config.provider,
    environment: config.environment,
    maskedKeyId: keyId ? maskCredential(keyId, 8, 4, false) : undefined,
    maskedSecret: keySecret ? maskCredential(keySecret, 0, 0, true) : undefined,
    hasCredentials: Boolean(keyId && keySecret),
    webhookUrl: getBaseWebhookUrl(config.webhookEndpointToken),
    webhookSecretMasked: config.webhookSecret ? maskCredential(config.webhookSecret, 0, 0, true) : undefined,
    hasWebhookSecret: Boolean(config.webhookSecret),
    connectionStatus: config.connectionStatus,
    webhookStatus: config.webhookStatus,
    isEnabled: config.isEnabled,
    isDefault: config.isDefault,
    lastVerifiedAt: config.lastVerifiedAt,
    lastError: config.lastError,
  };
}

function createDefaultDecryptedConfig(
  institutionId: string,
  provider: PaymentGatewayProvider
): DecryptedGatewayConfig {
  const defaultEnv: GatewayEnvironment = provider === "RAZORPAY" ? "TEST" : "SANDBOX";
  const token = generateWebhookToken(24);

  return {
    id: `${institutionId}_${provider.toLowerCase()}`,
    institutionId,
    provider,
    environment: defaultEnv,
    credentials: provider === "RAZORPAY" ? { keyId: "", keySecret: "" } : { appId: "", secretKey: "" },
    webhookEndpointToken: token,
    connectionStatus: "NOT_CONFIGURED",
    webhookStatus: "NOT_CONFIGURED",
    isEnabled: false,
    isDefault: false,
    lastVerifiedAt: null,
    lastError: null,
  };
}

/**
 * Loads the decrypted gateway configuration record for an institution.
 * Checks in-memory cache, then PlatformSetting table.
 */
async function loadStoredConfigs(
  institutionId: string
): Promise<Record<PaymentGatewayProvider, DecryptedGatewayConfig>> {
  if (gatewayCache.has(institutionId)) {
    return gatewayCache.get(institutionId)!;
  }

  const result: Record<PaymentGatewayProvider, DecryptedGatewayConfig> = {
    RAZORPAY: createDefaultDecryptedConfig(institutionId, "RAZORPAY"),
    CASHFREE: createDefaultDecryptedConfig(institutionId, "CASHFREE"),
  };

  try {
    const settingKey = `payment_gateways:${institutionId}`;
    const row: any = await db.platformSetting.findUnique({
      where: { key: settingKey },
    });

    if (row?.value) {
      const stored = typeof row.value === "string" ? JSON.parse(row.value) : row.value;

      if (stored.RAZORPAY) {
        const raw = stored.RAZORPAY;
        let creds: any = { keyId: "", keySecret: "" };
        if (raw.encryptedCredentials) {
          try {
            creds = JSON.parse(decryptCredential(raw.encryptedCredentials));
          } catch {}
        }
        let webhookSecret = "";
        if (raw.encryptedWebhookSecret) {
          try {
            webhookSecret = decryptCredential(raw.encryptedWebhookSecret);
          } catch {}
        }

        result.RAZORPAY = {
          ...result.RAZORPAY,
          ...raw,
          credentials: creds,
          webhookSecret: webhookSecret || undefined,
        };
      }

      if (stored.CASHFREE) {
        const raw = stored.CASHFREE;
        let creds: any = { appId: "", secretKey: "" };
        if (raw.encryptedCredentials) {
          try {
            creds = JSON.parse(decryptCredential(raw.encryptedCredentials));
          } catch {}
        }
        let webhookSecret = "";
        if (raw.encryptedWebhookSecret) {
          try {
            webhookSecret = decryptCredential(raw.encryptedWebhookSecret);
          } catch {}
        }

        result.CASHFREE = {
          ...result.CASHFREE,
          ...raw,
          credentials: creds,
          webhookSecret: webhookSecret || undefined,
        };
      }
    }
  } catch (err) {
    // If table read fails in sandbox/test, proceed with default configs
  }

  // Populate cache and webhook index
  gatewayCache.set(institutionId, result);
  if (result.RAZORPAY.webhookEndpointToken) {
    webhookTokenIndex.set(result.RAZORPAY.webhookEndpointToken, { institutionId, provider: "RAZORPAY" });
  }
  if (result.CASHFREE.webhookEndpointToken) {
    webhookTokenIndex.set(result.CASHFREE.webhookEndpointToken, { institutionId, provider: "CASHFREE" });
  }

  return result;
}

/**
 * Persists updated gateway configs back to PlatformSetting & cache.
 */
async function persistConfigs(
  institutionId: string,
  configs: Record<PaymentGatewayProvider, DecryptedGatewayConfig>
) {
  gatewayCache.set(institutionId, configs);

  // Update webhook token index
  if (configs.RAZORPAY.webhookEndpointToken) {
    webhookTokenIndex.set(configs.RAZORPAY.webhookEndpointToken, { institutionId, provider: "RAZORPAY" });
  }
  if (configs.CASHFREE.webhookEndpointToken) {
    webhookTokenIndex.set(configs.CASHFREE.webhookEndpointToken, { institutionId, provider: "CASHFREE" });
  }

  // Prepare encrypted record for storage
  const serialized = {
    RAZORPAY: {
      id: configs.RAZORPAY.id,
      institutionId: configs.RAZORPAY.institutionId,
      provider: configs.RAZORPAY.provider,
      environment: configs.RAZORPAY.environment,
      encryptedCredentials: encryptCredential(JSON.stringify(configs.RAZORPAY.credentials)),
      encryptedWebhookSecret: configs.RAZORPAY.webhookSecret ? encryptCredential(configs.RAZORPAY.webhookSecret) : null,
      webhookEndpointToken: configs.RAZORPAY.webhookEndpointToken,
      connectionStatus: configs.RAZORPAY.connectionStatus,
      webhookStatus: configs.RAZORPAY.webhookStatus,
      isEnabled: configs.RAZORPAY.isEnabled,
      isDefault: configs.RAZORPAY.isDefault,
      lastVerifiedAt: configs.RAZORPAY.lastVerifiedAt,
      lastError: configs.RAZORPAY.lastError,
    },
    CASHFREE: {
      id: configs.CASHFREE.id,
      institutionId: configs.CASHFREE.institutionId,
      provider: configs.CASHFREE.provider,
      environment: configs.CASHFREE.environment,
      encryptedCredentials: encryptCredential(JSON.stringify(configs.CASHFREE.credentials)),
      encryptedWebhookSecret: configs.CASHFREE.webhookSecret ? encryptCredential(configs.CASHFREE.webhookSecret) : null,
      webhookEndpointToken: configs.CASHFREE.webhookEndpointToken,
      connectionStatus: configs.CASHFREE.connectionStatus,
      webhookStatus: configs.CASHFREE.webhookStatus,
      isEnabled: configs.CASHFREE.isEnabled,
      isDefault: configs.CASHFREE.isDefault,
      lastVerifiedAt: configs.CASHFREE.lastVerifiedAt,
      lastError: configs.CASHFREE.lastError,
    },
  };

  try {
    const settingKey = `payment_gateways:${institutionId}`;
    await db.platformSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: serialized as any,
        description: `Payment gateway credentials for institution ${institutionId}`,
      },
      update: {
        value: serialized as any,
        updatedAt: new Date(),
      },
    });

    // Also store token mappings in DB for multi-instance webhook routing
    await db.platformSetting.upsert({
      where: { key: `webhook_token:${configs.RAZORPAY.webhookEndpointToken}` },
      create: {
        key: `webhook_token:${configs.RAZORPAY.webhookEndpointToken}`,
        value: { institutionId, provider: "RAZORPAY" } as any,
      },
      update: {
        value: { institutionId, provider: "RAZORPAY" } as any,
      },
    });

    await db.platformSetting.upsert({
      where: { key: `webhook_token:${configs.CASHFREE.webhookEndpointToken}` },
      create: {
        key: `webhook_token:${configs.CASHFREE.webhookEndpointToken}`,
        value: { institutionId, provider: "CASHFREE" } as any,
      },
      update: {
        value: { institutionId, provider: "CASHFREE" } as any,
      },
    });
  } catch (err) {
    // If DB writes fail in test mode, in-memory cache preserves data
  }
}

export class PaymentGatewayService {
  /**
   * Retrieves all masked payment gateway configs for an institution (for UI display).
   */
  static async getInstitutionGateways(institutionId: string): Promise<MaskedGatewayConfig[]> {
    const configs = await loadStoredConfigs(institutionId);
    return [
      toMaskedConfig(configs.RAZORPAY),
      toMaskedConfig(configs.CASHFREE),
    ];
  }

  /**
   * Retrieves a single masked gateway configuration.
   */
  static async getInstitutionGateway(
    institutionId: string,
    provider: PaymentGatewayProvider
  ): Promise<MaskedGatewayConfig> {
    const configs = await loadStoredConfigs(institutionId);
    return toMaskedConfig(configs[provider]);
  }

  /**
   * Retrieves decrypted credentials for internal processing (never send to client).
   */
  static async getDecryptedGateway(
    institutionId: string,
    provider: PaymentGatewayProvider
  ): Promise<DecryptedGatewayConfig> {
    const configs = await loadStoredConfigs(institutionId);
    return configs[provider];
  }

  /**
   * Retrieves the active default payment gateway for student fee collection.
   */
  static async getDecryptedDefaultGateway(
    institutionId: string
  ): Promise<DecryptedGatewayConfig | null> {
    const prefs = await this.getPaymentPreferences(institutionId);
    if (!prefs.onlinePaymentsEnabled || !prefs.defaultGateway) {
      return null;
    }

    const configs = await loadStoredConfigs(institutionId);
    const defaultGateway = configs[prefs.defaultGateway];
    if (defaultGateway.isEnabled && defaultGateway.connectionStatus === "CONNECTED") {
      return defaultGateway;
    }

    // Fallback: check if the other gateway is connected and enabled
    const fallbackProvider: PaymentGatewayProvider =
      prefs.defaultGateway === "RAZORPAY" ? "CASHFREE" : "RAZORPAY";
    const fallback = configs[fallbackProvider];
    if (fallback.isEnabled && fallback.connectionStatus === "CONNECTED") {
      return fallback;
    }

    return null;
  }

  /**
   * Saves or updates gateway configuration and credentials.
   */
  static async saveGatewayConfig(
    institutionId: string,
    input: SaveGatewayConfigInput,
    actorUserId?: string
  ): Promise<MaskedGatewayConfig> {
    const configs = await loadStoredConfigs(institutionId);
    const current = configs[input.provider];

    // Determine credentials to store
    let newCredentials = current.credentials;
    if (input.keyId && input.keySecret) {
      if (input.provider === "RAZORPAY") {
        newCredentials = {
          keyId: input.keyId.trim(),
          keySecret: input.keySecret.trim(),
        } as RazorpayCredentials;
      } else {
        newCredentials = {
          appId: input.keyId.trim(),
          secretKey: input.keySecret.trim(),
        } as CashfreeCredentials;
      }
    }

    const newEnvironment = input.environment || current.environment;
    const newWebhookSecret = input.webhookSecret?.trim() || current.webhookSecret;
    const isEnabled = input.isEnabled !== undefined ? input.isEnabled : current.isEnabled;
    const isDefault = input.isDefault !== undefined ? input.isDefault : current.isDefault;

    // If making this gateway the default, unset default on the other
    if (isDefault) {
      const otherProvider: PaymentGatewayProvider =
        input.provider === "RAZORPAY" ? "CASHFREE" : "RAZORPAY";
      configs[otherProvider].isDefault = false;
      await this.savePaymentPreferences(institutionId, { defaultGateway: input.provider });
    }

    configs[input.provider] = {
      ...current,
      environment: newEnvironment,
      credentials: newCredentials,
      webhookSecret: newWebhookSecret,
      webhookStatus: newWebhookSecret ? "ACTIVE" : "NOT_CONFIGURED",
      isEnabled,
      isDefault,
      // If credentials were provided or changed, mark connection status
      connectionStatus: current.connectionStatus === "NOT_CONFIGURED" && input.keyId ? "CONNECTED" : current.connectionStatus,
      lastError: null,
    };

    await persistConfigs(institutionId, configs);

    await recordAudit({
      institutionId,
      entityId: institutionId,
      entityType: "PAYMENT_GATEWAY",
      actorUserId: actorUserId || "system",
      action: "PAYMENT_GATEWAY_CONFIG_UPDATED",
      metadata: {
        provider: input.provider,
        environment: newEnvironment,
        isEnabled,
        isDefault,
      },
    }).catch(() => {});

    return toMaskedConfig(configs[input.provider]);
  }

  /**
   * Tests connection with provider API using saved or passed credentials.
   */
  static async testGatewayConnection(
    institutionId: string,
    provider: PaymentGatewayProvider,
    overrideCredentials?: { keyId?: string; keySecret?: string; environment?: GatewayEnvironment },
    actorUserId?: string
  ): Promise<{ success: boolean; message: string; lastVerifiedAt?: string }> {
    const configs = await loadStoredConfigs(institutionId);
    const config = configs[provider];

    let keyId = "";
    let keySecret = "";
    let environment = overrideCredentials?.environment || config.environment;

    if (overrideCredentials?.keyId && overrideCredentials?.keySecret) {
      keyId = overrideCredentials.keyId.trim();
      keySecret = overrideCredentials.keySecret.trim();
    } else {
      const creds = config.credentials as any;
      keyId = provider === "RAZORPAY" ? creds.keyId : creds.appId;
      keySecret = provider === "RAZORPAY" ? creds.keySecret : creds.secretKey;
    }

    if (!keyId || !keySecret) {
      return {
        success: false,
        message: "No credentials configured to test. Please enter credentials first.",
      };
    }

    let verificationResult: { success: boolean; message: string };

    if (provider === "RAZORPAY") {
      verificationResult = await RazorpayAdapter.verifyConnection(keyId, keySecret);
    } else {
      verificationResult = await CashfreeAdapter.verifyConnection(keyId, keySecret, environment);
    }

    const now = new Date().toISOString();
    if (verificationResult.success) {
      configs[provider].connectionStatus = "CONNECTED";
      configs[provider].lastVerifiedAt = now;
      configs[provider].lastError = null;
    } else {
      configs[provider].connectionStatus = "FAILED";
      configs[provider].lastError = verificationResult.message;
    }

    await persistConfigs(institutionId, configs);

    await recordAudit({
      institutionId,
      entityId: institutionId,
      entityType: "PAYMENT_GATEWAY",
      actorUserId: actorUserId || "system",
      action: "PAYMENT_GATEWAY_CONNECTION_TESTED",
      metadata: {
        provider,
        success: verificationResult.success,
        message: verificationResult.message,
      },
    }).catch(() => {});

    return {
      success: verificationResult.success,
      message: verificationResult.message,
      lastVerifiedAt: verificationResult.success ? now : undefined,
    };
  }

  /**
   * Safely disconnects / disables a gateway configuration.
   */
  static async disconnectGateway(
    institutionId: string,
    provider: PaymentGatewayProvider,
    actorUserId?: string
  ): Promise<{ success: boolean; message: string }> {
    const configs = await loadStoredConfigs(institutionId);
    const current = configs[provider];

    configs[provider] = {
      ...current,
      credentials: provider === "RAZORPAY" ? { keyId: "", keySecret: "" } : { appId: "", secretKey: "" },
      webhookSecret: undefined,
      connectionStatus: "NOT_CONFIGURED",
      webhookStatus: "NOT_CONFIGURED",
      isEnabled: false,
      isDefault: false,
      lastVerifiedAt: null,
      lastError: null,
    };

    // If this was default gateway, update preferences
    const prefs = await this.getPaymentPreferences(institutionId);
    if (prefs.defaultGateway === provider) {
      const otherProvider: PaymentGatewayProvider =
        provider === "RAZORPAY" ? "CASHFREE" : "RAZORPAY";
      const otherConfig = configs[otherProvider];
      const newDefault = otherConfig.isEnabled && otherConfig.connectionStatus === "CONNECTED"
        ? otherProvider
        : null;
      await this.savePaymentPreferences(institutionId, { defaultGateway: newDefault });
    }

    await persistConfigs(institutionId, configs);

    await recordAudit({
      institutionId,
      entityId: institutionId,
      entityType: "PAYMENT_GATEWAY",
      actorUserId: actorUserId || "system",
      action: "PAYMENT_GATEWAY_DISCONNECTED",
      metadata: { provider },
    }).catch(() => {});

    return {
      success: true,
      message: `${provider === "RAZORPAY" ? "Razorpay" : "Cashfree"} configuration has been removed.`,
    };
  }

  /**
   * Retrieves institutional payment preferences.
   */
  static async getPaymentPreferences(institutionId: string): Promise<PaymentPreferences> {
    if (preferencesCache.has(institutionId)) {
      return preferencesCache.get(institutionId)!;
    }

    let prefs: PaymentPreferences = {
      onlinePaymentsEnabled: true,
      defaultGateway: null,
    };

    try {
      const row: any = await db.platformSetting.findUnique({
        where: { key: `payment_preferences:${institutionId}` },
      });
      if (row?.value) {
        prefs = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      }
    } catch {}

    preferencesCache.set(institutionId, prefs);
    return prefs;
  }

  /**
   * Updates payment preferences (toggle online payments, default gateway).
   */
  static async savePaymentPreferences(
    institutionId: string,
    updates: Partial<PaymentPreferences>
  ): Promise<PaymentPreferences> {
    const current = await this.getPaymentPreferences(institutionId);
    const updated: PaymentPreferences = {
      ...current,
      ...updates,
    };

    preferencesCache.set(institutionId, updated);

    try {
      await db.platformSetting.upsert({
        where: { key: `payment_preferences:${institutionId}` },
        create: {
          key: `payment_preferences:${institutionId}`,
          value: updated as any,
          description: `Online payment preferences for institution ${institutionId}`,
        },
        update: {
          value: updated as any,
          updatedAt: new Date(),
        },
      });
    } catch {}

    return updated;
  }

  /**
   * Resolves institution and decrypted gateway config from an unpredictable webhook token.
   */
  static async resolveGatewayByWebhookToken(
    token: string
  ): Promise<{ institutionId: string; provider: PaymentGatewayProvider; config: DecryptedGatewayConfig } | null> {
    if (!token?.trim()) return null;

    // Check in-memory index
    let mapping = webhookTokenIndex.get(token);

    if (!mapping) {
      try {
        const row: any = await db.platformSetting.findUnique({
          where: { key: `webhook_token:${token}` },
        });
        if (row?.value) {
          mapping = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        }
      } catch {}
    }

    if (!mapping) return null;

    const configs = await loadStoredConfigs(mapping.institutionId);
    const config = configs[mapping.provider];
    if (config.webhookEndpointToken !== token) return null;

    return {
      institutionId: mapping.institutionId,
      provider: mapping.provider,
      config,
    };
  }

  /**
   * Enforces webhook idempotency by tracking processed event IDs.
   * Returns true if newly recorded, false if previously processed (duplicate).
   */
  static async recordWebhookEvent(eventId: string, institutionId: string, provider: string): Promise<boolean> {
    if (!eventId) return true;

    if (processedWebhookEvents.has(eventId)) {
      return false; // Duplicate
    }

    try {
      const key = `webhook_event:${eventId}`;
      const existing: any = await db.platformSetting.findUnique({
        where: { key },
      });

      if (existing) {
        processedWebhookEvents.add(eventId);
        return false;
      }

      await db.platformSetting.create({
        data: {
          key,
          value: { eventId, institutionId, provider, processedAt: new Date().toISOString() } as any,
          description: `Processed webhook event ${eventId}`,
        },
      });

      processedWebhookEvents.add(eventId);
      return true;
    } catch {
      processedWebhookEvents.add(eventId);
      return true;
    }
  }
}
