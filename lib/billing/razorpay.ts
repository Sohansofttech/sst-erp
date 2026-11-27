import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";

export class BillingIntegrationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "BillingIntegrationError";
  }
}

type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
};

function getCredentials(): RazorpayCredentials {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw new BillingIntegrationError(
      "Razorpay test-mode credentials are not configured.",
      503,
      "RAZORPAY_NOT_CONFIGURED",
    );
  }
  if (!keyId.startsWith("rzp_test_")) {
    throw new BillingIntegrationError(
      "Subscription payments are restricted to Razorpay test mode.",
      503,
      "RAZORPAY_TEST_MODE_REQUIRED",
    );
  }

  return { keyId, keySecret };
}

function authorizationHeader(credentials: RazorpayCredentials) {
  return `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`;
}

function safeEqualHex(expected: string, provided: string) {
  if (!/^[\da-f]{64}$/i.test(provided)) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const providedBytes = Buffer.from(provided, "hex");
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

async function providerJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    if (response.ok) {
      throw new BillingIntegrationError("Razorpay returned an unreadable response.", 502, "RAZORPAY_BAD_RESPONSE");
    }
  }

  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : {};
    const providerCode = typeof error.code === "string" ? error.code : "UNKNOWN";
    console.error("[Razorpay] Provider request rejected", { status: response.status, providerCode });
    const message = response.status === 401 || response.status === 403
      ? "Razorpay rejected the test credentials. Confirm the test-mode key pair."
      : response.status >= 500
        ? "Razorpay is temporarily unavailable. Try again shortly."
        : "Razorpay could not process this subscription payment.";
    throw new BillingIntegrationError(message, response.status >= 500 ? 503 : 502, "RAZORPAY_REQUEST_FAILED");
  }

  return payload as T;
}

export async function createRazorpayOrder(input: {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}) {
  const credentials = getCredentials();
  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API}/orders`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[Razorpay] Order request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    throw new BillingIntegrationError("Razorpay could not be reached. Try again shortly.", 503, "RAZORPAY_UNAVAILABLE");
  }

  const order = await providerJson<{ id?: unknown; amount?: unknown; currency?: unknown }>(response);
  if (
    typeof order.id !== "string" ||
    !/^order_[A-Za-z0-9]+$/.test(order.id) ||
    Number(order.amount) !== input.amount ||
    order.currency !== input.currency
  ) {
    throw new BillingIntegrationError("Razorpay returned an invalid order response.", 502, "RAZORPAY_BAD_ORDER");
  }
  return { id: order.id, keyId: credentials.keyId };
}

export async function fetchRazorpayPayment(paymentId: string) {
  const credentials = getCredentials();
  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: authorizationHeader(credentials) },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[Razorpay] Payment lookup failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    throw new BillingIntegrationError("Razorpay could not be reached to verify the payment.", 503, "RAZORPAY_UNAVAILABLE");
  }

  return providerJson<{
    id?: unknown;
    order_id?: unknown;
    amount?: unknown;
    currency?: unknown;
    status?: unknown;
    captured?: unknown;
  }>(response);
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const { keySecret } = getCredentials();
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  getCredentials();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new BillingIntegrationError(
      "Razorpay webhook verification is not configured.",
      503,
      "RAZORPAY_WEBHOOK_NOT_CONFIGURED",
    );
  }
  if (!signature) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
