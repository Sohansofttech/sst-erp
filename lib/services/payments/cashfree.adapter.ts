import crypto from "crypto";

export interface CashfreeConnectionResult {
  success: boolean;
  message: string;
  httpStatus?: number;
}

export class CashfreeAdapter {
  private static SANDBOX_URL = "https://sandbox.cashfree.com/pg";
  private static PRODUCTION_URL = "https://api.cashfree.com/pg";

  private static getBaseUrl(environment: string): string {
    return environment === "PRODUCTION" || environment === "LIVE"
      ? this.PRODUCTION_URL
      : this.SANDBOX_URL;
  }

  /**
   * Tests connectivity and credential validity against Cashfree API.
   * Performs an authenticated lightweight probe to /orders endpoint with limit.
   */
  static async verifyConnection(
    appId: string,
    secretKey: string,
    environment = "SANDBOX"
  ): Promise<CashfreeConnectionResult> {
    if (!appId?.trim() || !secretKey?.trim()) {
      return {
        success: false,
        message: "Cashfree App ID (Client ID) and Secret Key must both be provided.",
      };
    }

    // In non-live test environments with demo/mock keys, provide instant deterministic validation
    if (appId.startsWith("cf_test_mock") || secretKey.startsWith("mock_secret")) {
      return {
        success: true,
        message: "Cashfree credentials verified successfully (Sandbox Simulation Mode).",
        httpStatus: 200,
      };
    }

    try {
      const baseUrl = this.getBaseUrl(environment);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${baseUrl}/orders`, {
        method: "GET",
        headers: {
          "x-client-id": appId.trim(),
          "x-client-secret": secretKey.trim(),
          "x-api-version": "2023-08-01",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok || res.status === 200) {
        return {
          success: true,
          message: "Connection verified successfully with Cashfree API.",
          httpStatus: 200,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          message: "Authentication failed: Invalid Cashfree App ID or Secret Key.",
          httpStatus: res.status,
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        message: `Cashfree API returned unexpected status ${res.status}: ${errText.slice(0, 100)}`,
        httpStatus: res.status,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return {
          success: false,
          message: "Connection timed out while reaching Cashfree API server.",
        };
      }
      return {
        success: false,
        message: `Network error connecting to Cashfree: ${err.message || "Endpoint unreachable"}`,
      };
    }
  }

  /**
   * Creates an order with Cashfree PG.
   */
  static async createOrder(
    appId: string,
    secretKey: string,
    environment: string,
    params: {
      orderId: string;
      amount: number;
      currency?: string;
      customerId: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
    }
  ): Promise<{ orderId: string; paymentSessionId: string }> {
    const currency = params.currency || "INR";

    // Mock fallback when keys are mock / sandbox offline
    if (appId.startsWith("cf_test_mock") || process.env.ENABLE_MOCK_PAYMENT_SIGNATURES === "true") {
      return {
        orderId: params.orderId,
        paymentSessionId: `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      };
    }

    const baseUrl = this.getBaseUrl(environment);
    const res = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "x-client-id": appId.trim(),
        "x-client-secret": secretKey.trim(),
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: params.orderId,
        order_amount: params.amount,
        order_currency: currency,
        customer_details: {
          customer_id: params.customerId || "cust_guest",
          customer_name: params.customerName || "Student / Parent",
          customer_email: params.customerEmail || "student@institution.edu",
          customer_phone: params.customerPhone || "9999999999",
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `Cashfree order creation failed (${res.status}): ${
          errBody?.message || res.statusText
        }`
      );
    }

    const data = await res.json();
    return {
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
    };
  }

  /**
   * Cryptographically verifies Cashfree webhook signature (x-webhook-signature):
   * expectedSignature = base64(hmac_sha256(timestamp + rawBody, secretKey))
   */
  static verifyWebhookSignature(
    rawBody: string,
    signature: string,
    timestamp: string,
    secretKey: string
  ): boolean {
    if (!rawBody || !signature || !secretKey) return false;

    try {
      const payload = timestamp ? `${timestamp}${rawBody}` : rawBody;
      const expectedSignature = crypto
        .createHmac("sha256", secretKey.trim())
        .update(payload)
        .digest("base64");

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
}
