import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  BillingIntegrationError,
  createRazorpayOrder,
  fetchRazorpayPayment,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "../lib/billing/razorpay";
import {
  markSubscriptionPaymentFailedInTransaction,
  settleCapturedSubscriptionPaymentInTransaction,
} from "../lib/billing/subscription-settlement";
import { getSubscriptionEnd, InvalidBillingCycleError } from "../lib/billing/subscription-period";

const fakeCredentials = {
  keyId: "rzp_test_subscription_unit",
  keySecret: "unit-test-key-secret",
  webhookSecret: "unit-test-webhook-secret",
};

function setTestCredentials() {
  process.env.RAZORPAY_KEY_ID = fakeCredentials.keyId;
  process.env.RAZORPAY_KEY_SECRET = fakeCredentials.keySecret;
  process.env.RAZORPAY_WEBHOOK_SECRET = fakeCredentials.webhookSecret;
}

test("creates a server-side Razorpay order with the expected test API contract", async (t) => {
  setTestCredentials();
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://api.razorpay.com/v1/orders");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(
      headers.get("authorization"),
      `Basic ${Buffer.from(`${fakeCredentials.keyId}:${fakeCredentials.keySecret}`).toString("base64")}`,
    );
    assert.equal(headers.get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      amount: 12500,
      currency: "INR",
      receipt: "SST-TEST-001",
      notes: { invoice_id: "invoice-1" },
    });
    return Response.json({ id: "order_test123", amount: 12500, currency: "INR" });
  }) as typeof fetch;

  const result = await createRazorpayOrder({
    amount: 12500,
    currency: "INR",
    receipt: "SST-TEST-001",
    notes: { invoice_id: "invoice-1" },
  });
  assert.deepEqual(result, { id: "order_test123", keyId: fakeCredentials.keyId });
});

test("rejects live-mode credentials and malformed signatures", async () => {
  setTestCredentials();
  process.env.RAZORPAY_KEY_ID = "rzp_live_not-a-real-key";
  await assert.rejects(
    () => createRazorpayOrder({ amount: 100, currency: "INR", receipt: "test", notes: {} }),
    (error: unknown) => error instanceof BillingIntegrationError && error.code === "RAZORPAY_TEST_MODE_REQUIRED",
  );
  process.env.RAZORPAY_KEY_ID = fakeCredentials.keyId;

  const checkoutMessage = "order_test123|pay_test456";
  const checkoutSignature = createHmac("sha256", fakeCredentials.keySecret).update(checkoutMessage).digest("hex");
  assert.equal(verifyCheckoutSignature("order_test123", "pay_test456", checkoutSignature), true);
  assert.equal(verifyCheckoutSignature("order_test123", "pay_test456", "0".repeat(64)), false);

  const webhookBody = JSON.stringify({ event: "payment.captured" });
  const webhookSignature = createHmac("sha256", fakeCredentials.webhookSecret).update(webhookBody).digest("hex");
  assert.equal(verifyWebhookSignature(webhookBody, webhookSignature), true);
  assert.equal(verifyWebhookSignature(webhookBody, null), false);
});

test("fetches payment status from Razorpay and maps provider authorization failures", async (t) => {
  setTestCredentials();
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://api.razorpay.com/v1/payments/pay_test456");
    assert.equal(init?.method, undefined);
    const headers = new Headers(init?.headers);
    assert.equal(
      headers.get("authorization"),
      `Basic ${Buffer.from(`${fakeCredentials.keyId}:${fakeCredentials.keySecret}`).toString("base64")}`,
    );
    return Response.json({
      id: "pay_test456",
      order_id: "order_test123",
      amount: 12500,
      currency: "INR",
      status: "captured",
      captured: true,
    });
  }) as typeof fetch;
  const payment = await fetchRazorpayPayment("pay_test456");
  assert.equal(payment.status, "captured");
  assert.equal(payment.order_id, "order_test123");

  globalThis.fetch = async () => Response.json(
    { error: { code: "BAD_REQUEST_ERROR", description: "Invalid key in test response" } },
    { status: 401 },
  );
  await assert.rejects(
    () => createRazorpayOrder({ amount: 100, currency: "INR", receipt: "test", notes: {} }),
    (error: unknown) =>
      error instanceof BillingIntegrationError &&
      error.statusCode === 502 &&
      error.message.includes("Razorpay rejected the test credentials"),
  );
});

test("calculates clamped billing periods and rejects invalid custom cycles", () => {
  const start = new Date("2024-01-31T12:00:00.000Z");
  assert.equal(
    getSubscriptionEnd(start, { billingCycle: "MONTHLY", customCycleDays: null }).toISOString(),
    "2024-02-29T12:00:00.000Z",
  );
  assert.equal(
    getSubscriptionEnd(start, { billingCycle: "QUARTERLY", customCycleDays: null }).toISOString(),
    "2024-04-30T12:00:00.000Z",
  );
  assert.equal(
    getSubscriptionEnd(start, { billingCycle: "CUSTOM", customCycleDays: 15 }).toISOString(),
    "2024-02-15T12:00:00.000Z",
  );
  assert.throws(
    () => getSubscriptionEnd(start, { billingCycle: "CUSTOM", customCycleDays: null }),
    InvalidBillingCycleError,
  );
});

function makeSettlementTransaction(paymentStatus: "PENDING" | "SUCCEEDED" = "PENDING") {
  const payment = {
    id: "payment-row-1",
    invoiceId: "invoice-1",
    amount: 125,
    currency: "INR",
    status: paymentStatus,
    provider: "RAZORPAY_TEST",
    providerReference: paymentStatus === "SUCCEEDED" ? "pay_test456" : null,
    metadata: { planId: "plan-1", renewalSubscriptionId: null },
    invoice: { id: "invoice-1", institutionId: "institution-1", total: 125, currency: "INR" },
  };
  const writes = { payment: 0, subscription: 0, event: 0, invoice: 0 };

  const transaction = {
    payment: {
      findUnique: async () => payment,
      updateMany: async () => {
        writes.payment += 1;
        payment.status = "SUCCEEDED";
        payment.providerReference = "pay_test456";
        return { count: 1 };
      },
    },
    subscriptionPlan: {
      findUnique: async () => ({ id: "plan-1", name: "Test", billingCycle: "MONTHLY", customCycleDays: null }),
    },
    institutionSubscription: {
      findMany: async () => [],
      create: async () => {
        writes.subscription += 1;
        return { id: "subscription-1" };
      },
    },
    subscriptionEvent: {
      create: async () => {
        writes.event += 1;
        return {};
      },
    },
    invoice: {
      update: async () => {
        writes.invoice += 1;
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { transaction, writes, payment };
}

test("settles a captured payment once and rejects mismatched invoice totals", async () => {
  const { transaction, writes, payment } = makeSettlementTransaction();
  const input = {
    orderId: "order_test123",
    paymentId: "pay_test456",
    amount: 12500,
    currency: "INR",
  };

  const first = await settleCapturedSubscriptionPaymentInTransaction(transaction, input);
  assert.equal(first.alreadyProcessed, false);
  assert.equal(payment.status, "SUCCEEDED");
  assert.deepEqual(writes, { payment: 1, subscription: 1, event: 1, invoice: 1 });

  const duplicate = await settleCapturedSubscriptionPaymentInTransaction(transaction, input);
  assert.deepEqual(duplicate, { alreadyProcessed: true });
  assert.deepEqual(writes, { payment: 1, subscription: 1, event: 1, invoice: 1 });

  const mismatch = makeSettlementTransaction();
  await assert.rejects(
    () => settleCapturedSubscriptionPaymentInTransaction(mismatch.transaction, { ...input, amount: 12000 }),
    (error: unknown) => error instanceof BillingIntegrationError && error.code === "PAYMENT_AMOUNT_MISMATCH",
  );
  assert.deepEqual(mismatch.writes, { payment: 0, subscription: 0, event: 0, invoice: 0 });
});

test("records failed payment attempts without changing successful or unrelated orders", async () => {
  let updateArgs: { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
  const transaction = {
    payment: {
      updateMany: async (args: { where?: Record<string, unknown>; data?: Record<string, unknown> }) => {
        updateArgs = args;
        return { count: 1 };
      },
    },
  } as unknown as Prisma.TransactionClient;

  const count = await markSubscriptionPaymentFailedInTransaction(
    transaction,
    "order_test123",
    "x".repeat(400),
  );
  assert.equal(count, 1);
  assert.deepEqual(updateArgs?.where, {
    providerOrderId: "order_test123",
    provider: "RAZORPAY_TEST",
    status: "PENDING",
    providerReference: null,
  });
  assert.equal(updateArgs?.data?.status, "FAILED");
  assert.equal(String(updateArgs?.data?.failureReason).length, 300);
});
