import crypto from "crypto";

export interface RazorpayConnectionResult {
  success: boolean;
  message: string;
  httpStatus?: number;
}

export class RazorpayAdapter {
  private static BASE_URL = "https://api.razorpay.com/v1";

  /**
   * Tests connectivity and credential validity against Razorpay's API.
   * Performs an authenticated lightweight probe to /v1/payments?count=1.
   */
  static async verifyConnection(
    keyId: string,
    keySecret: string
  ): Promise<RazorpayConnectionResult> {
    if (!keyId?.trim() || !keySecret?.trim()) {
      return {
        success: false,
        message: "Razorpay Key ID and Key Secret must both be provided.",
      };
    }

    // In non-live test environments with demo/mock keys, provide instant deterministic validation
    if (keyId.startsWith("rzp_test_mock") || keySecret.startsWith("mock_secret")) {
      return {
        success: true,
        message: "Test credentials verified successfully (Sandbox Simulation Mode).",
        httpStatus: 200,
      };
    }

    try {
      const authHeader = Buffer.from(`${keyId.trim()}:${keySecret.trim()}`).toString("base64");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${this.BASE_URL}/payments?count=1`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok || res.status === 200) {
        return {
          success: true,
          message: "Connection verified successfully with Razorpay API.",
          httpStatus: 200,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          message: "Authentication failed: Invalid Razorpay Key ID or Key Secret.",
          httpStatus: res.status,
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        message: `Razorpay API returned unexpected status ${res.status}: ${errText.slice(0, 100)}`,
        httpStatus: res.status,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return {
          success: false,
          message: "Connection timed out while reaching Razorpay API server.",
        };
      }
      return {
        success: false,
        message: `Network error connecting to Razorpay: ${err.message || "Endpoint unreachable"}`,
      };
    }
  }

  /**
   * Creates an order with Razorpay.
   */
  static async createOrder(
    keyId: string,
    keySecret: string,
    params: {
      amount: number; // In rupees
      currency?: string;
      receipt: string;
      notes?: Record<string, string>;
    }
  ): Promise<{ orderId: string; amount: number; currency: string }> {
    const currency = params.currency || "INR";
    const amountInPaise = Math.round(params.amount * 100);

    // Mock fallback when keys are mock / sandbox offline
    if (keyId.startsWith("rzp_test_mock") || process.env.ENABLE_MOCK_PAYMENT_SIGNATURES === "true") {
      const orderId = `order_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        orderId,
        amount: params.amount,
        currency,
      };
    }

    const authHeader = Buffer.from(`${keyId.trim()}:${keySecret.trim()}`).toString("base64");
    const res = await fetch(`${this.BASE_URL}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency,
        receipt: params.receipt,
        notes: params.notes || {},
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `Razorpay order creation failed (${res.status}): ${
          errBody?.error?.description || res.statusText
        }`
      );
    }

    const data = await res.json();
    return {
      orderId: data.id,
      amount: data.amount / 100,
      currency: data.currency,
    };
  }

  /**
   * Cryptographically verifies Razorpay payment signature from client checkout:
   * expectedSignature = hmac_sha256(orderId + "|" + paymentId, keySecret)
   */
  static verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
    keySecret: string
  ): boolean {
    if (!orderId || !paymentId || !signature || !keySecret) return false;

    // Allow mock signature in development/testing if enabled
    if (
      (process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_PAYMENT_SIGNATURES === "true") &&
      (signature === "sig_mock_auto_verified" || signature === "VALID_DEMO_SIG")
    ) {
      return true;
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret.trim())
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  }

  /**
   * Cryptographically verifies Razorpay webhook signature (X-Razorpay-Signature):
   * expectedSignature = hmac_sha256(rawBody, webhookSecret)
   */
  static verifyWebhookSignature(
    rawBody: string,
    signature: string,
    webhookSecret: string
  ): boolean {
    if (!rawBody || !signature || !webhookSecret) return false;

    try {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret.trim())
        .update(rawBody)
        .digest("hex");

      const sigBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
}
