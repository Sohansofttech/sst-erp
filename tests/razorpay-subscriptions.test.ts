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
  applySubscriptionPurchase,
  markSubscriptionPaymentFailedInTransaction,
  settleCapturedSubscriptionPaymentInTransaction,
} from "../lib/billing/subscription-settlement";
import { getSubscriptionEnd, InvalidBillingCycleError } from "../lib/billing/subscription-period";
import { createAndPersistOrder } from "../lib/billing/order-persistence";

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

test("retries only local order persistence and recognizes a committed write with a lost acknowledgement", async () => {
  let creates = 0;
  let writes = 0;
  let recorded: string | null = null;
  const result = await createAndPersistOrder({
    invoiceNumber: "SST-TEST",
    create: async () => { creates++; return { id: "order_test123", keyId: "test-key" }; },
    persist: async (id) => {
      writes++;
      if (writes === 1) throw new Error("database unavailable");
      recorded = id;
      throw new Error("acknowledgement lost");
    },
    lookup: async () => recorded,
    onOrderReceived: () => {},
  });
  assert.equal(result.id, "order_test123");
  assert.equal(creates, 1);
  assert.equal(writes, 2);
});

test("unconfirmed orders do not create a replacement and conflicting links are not overwritten", async () => {
  let writes = 0;
  let creates = 0;
  await assert.rejects(() => createAndPersistOrder({
    invoiceNumber: "SST-TEST",
    create: async () => { creates++; return { id: "order_test123", keyId: "test-key" }; },
    persist: async () => { writes++; return 0; },
    lookup: async () => "order_other",
    onOrderReceived: () => {},
  }), (error: unknown) => error instanceof BillingIntegrationError &&
    error.code === "ORDER_PERSISTENCE_UNCONFIRMED" && error.message.includes("SST-TEST"));
  assert.equal(creates, 1);
  assert.equal(writes, 1);

  writes = 0;
  await assert.rejects(() => createAndPersistOrder({
    invoiceNumber: "SST-TEST",
    create: async () => ({ id: "order_test123", keyId: "test-key" }),
    persist: async () => { writes++; throw new Error("unavailable"); },
    lookup: async () => { throw new Error("unavailable"); },
    onOrderReceived: () => {},
  }), (error: unknown) => error instanceof BillingIntegrationError && error.code === "ORDER_PERSISTENCE_UNCONFIRMED");
  assert.equal(writes, 3);
});

test("an unknown provider outcome is not retried or treated as a failed order", async () => {
  let creates = 0;
  let writes = 0;
  await assert.rejects(() => createAndPersistOrder({
    invoiceNumber: "SST-TEST",
    create: async () => { creates++; throw new Error("timeout"); },
    persist: async () => { writes++; return 1; },
    lookup: async () => null,
    onOrderReceived: () => {},
  }), (error: unknown) => error instanceof BillingIntegrationError &&
    error.code === "ORDER_OUTCOME_UNKNOWN" && error.message.includes("Do not retry"));
  assert.equal(creates, 1);
  assert.equal(writes, 0);
});

test("known pre-request configuration errors remain distinguishable from unknown outcomes", async () => {
  const error = new BillingIntegrationError("Not configured", 503, "RAZORPAY_NOT_CONFIGURED");
  await assert.rejects(() => createAndPersistOrder({
    invoiceNumber: "SST-TEST",
    create: async () => { throw error; },
    persist: async () => { throw new Error("unexpected write"); },
    lookup: async () => null,
    onOrderReceived: () => {},
  }), (caught: unknown) => caught === error);
});

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

  globalThis.fetch = async () => Response.json({ id: "order_bad-id", amount: 12500, currency: "INR" });
  await assert.rejects(
    () => createRazorpayOrder({ amount: 12500, currency: "INR", receipt: "SST-TEST-001", notes: {} }),
    (error: unknown) => error instanceof BillingIntegrationError && error.code === "RAZORPAY_BAD_ORDER",
  );
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

function makeSettlementTransaction(paymentStatus: "PENDING" | "SUCCEEDED" = "PENDING", pendingAssignments: string[] = []) {
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
    $queryRaw: async () => [],
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
      findMany: async (args: { where: { status: unknown } }) => args.where.status === "PAST_DUE" ? pendingAssignments.map((id) => ({ id })) : [],
      updateMany: async () => {
        writes.subscription += 1;
        return { count: 1 };
      },
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

test("settlement activates the pending plan assignment instead of creating a duplicate", async () => {
  const { transaction, writes } = makeSettlementTransaction("PENDING", ["pending-subscription"]);
  const result = await settleCapturedSubscriptionPaymentInTransaction(transaction, {
    orderId: "order_test123", paymentId: "pay_test456", amount: 12500, currency: "INR",
  });
  assert.ok("subscriptionId" in result);
  assert.equal(result.subscriptionId, "pending-subscription");
  assert.deepEqual(writes, { payment: 1, subscription: 1, event: 1, invoice: 1 });
});

test("settlement rejects multiple pending assignments instead of choosing one", async () => {
  const { transaction } = makeSettlementTransaction("PENDING", ["pending-1", "pending-2"]);
  await assert.rejects(() => settleCapturedSubscriptionPaymentInTransaction(transaction, {
    orderId: "order_test123", paymentId: "pay_test456", amount: 12500, currency: "INR",
  }), (error: unknown) => error instanceof BillingIntegrationError && error.code === "DUPLICATE_PENDING_SUBSCRIPTIONS");
});

test("a purchase starts after already scheduled subscriptions", async () => {
  const transaction = {
    $queryRaw: async () => [],
    subscriptionPlan: { findUnique: async () => ({ id: "plan-1", name: "Test", billingCycle: "MONTHLY", customCycleDays: null }) },
    institutionSubscription: {
      findMany: async (args: { where: { status: unknown } }) => args.where.status === "PAST_DUE" ? [] : [
        { id: "future", startsAt: new Date("2026-02-01T00:00:00Z"), endsAt: new Date("2026-03-01T00:00:00Z") },
      ],
      create: async () => ({ id: "new" }),
    },
    subscriptionEvent: { create: async () => ({}) },
    invoice: { update: async () => ({}) },
  } as unknown as Prisma.TransactionClient;
  const result = await applySubscriptionPurchase(transaction, {
    institutionId: "institution-1", invoiceId: "invoice-1", planId: "plan-1",
    renewalSubscriptionId: null, paymentId: "payment-1", paidAt: new Date("2026-01-01T00:00:00Z"),
  });
  assert.equal(result.startsAt.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(result.endsAt.toISOString(), "2026-04-01T00:00:00.000Z");
});

test("a renewal rejects a period that overlaps a different subscription", async () => {
  const transaction = {
    $queryRaw: async () => [],
    subscriptionPlan: { findUnique: async () => ({ id: "plan-1", name: "Test", billingCycle: "MONTHLY", customCycleDays: null }) },
    institutionSubscription: {
      findFirst: async (args: { where: { id: unknown } }) => typeof args.where.id === "string"
        ? { id: "current", startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: new Date("2026-02-01T00:00:00Z") }
        : { id: "future" },
    },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(() => applySubscriptionPurchase(transaction, {
    institutionId: "institution-1", invoiceId: "invoice-1", planId: "plan-1",
    renewalSubscriptionId: "current", paymentId: "payment-1", paidAt: new Date("2026-01-15T00:00:00Z"),
  }), (error: unknown) => error instanceof BillingIntegrationError && error.code === "SUBSCRIPTION_PERIOD_CONFLICT");
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
