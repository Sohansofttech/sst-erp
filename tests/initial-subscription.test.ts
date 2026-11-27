import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { createInitialInstitutionSubscription } from "../lib/billing/initial-subscription";

function makeTransaction(options: {
  price?: number;
  planCode?: string;
  customCycleDays?: number | null;
  failSubscription?: boolean;
  planAvailable?: boolean;
  existingSubscription?: { id: string; planId: string; status: "ACTIVE" | "TRIALING" } | null;
  previousTrial?: { id: string; planId: string; status: "EXPIRED" | "CANCELED" } | null;
} = {}) {
  const writes: string[] = [];
  let createdData: any = null;
  const transaction = {
    platformInstitution: {
      create: async () => {
        writes.push("institution");
        return { id: "institution-1" };
      },
    },
    subscriptionPlan: {
      findFirst: async () => options.planAvailable === false
        ? null
        : {
            id: "plan-1",
            code: options.planCode ?? "STANDARD",
            price: options.price ?? 0,
            billingCycle: "MONTHLY",
            customCycleDays: options.customCycleDays ?? null,
          },
    },
    institutionSubscription: {
      findFirst: async ({ where }: any) => where?.status
        ? options.existingSubscription ?? null
        : options.previousTrial ?? null,
      create: async ({ data }: any) => {
        writes.push("subscription");
        if (options.failSubscription) throw new Error("subscription write failed");
        createdData = data;
        return { id: "subscription-1" };
      },
    },
    subscriptionEvent: {
      create: async () => {
        writes.push("event");
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { transaction, writes, getCreatedData: () => createdData };
}

test("creates an active, period-bound subscription for a free selected plan", async () => {
  const { transaction, writes } = makeTransaction();

  const result = await createInitialInstitutionSubscription(transaction, {
    institutionId: "institution-1",
    planId: "plan-1",
    actorId: "admin-1",
  });

  assert.equal(result.status, "ACTIVE");
  assert.equal(result.subscriptionId, "subscription-1");
  assert.deepEqual(writes, ["subscription", "event"]);
});

test("leaves a paid selected plan pending verified payment", async () => {
  const { transaction } = makeTransaction({ price: 99 });

  const result = await createInitialInstitutionSubscription(transaction, {
    institutionId: "institution-1",
    planId: "plan-1",
    actorId: null,
  });

  assert.equal(result.status, "PAST_DUE");
});

test("creates a FREE_TRIAL plan subscription for exactly 14 days despite its configured cycle", async () => {
  const { transaction, getCreatedData } = makeTransaction({
    planCode: "FREE_TRIAL",
    customCycleDays: 156,
  });

  await createInitialInstitutionSubscription(transaction, {
    institutionId: "institution-1",
    planId: "plan-1",
    actorId: null,
  });

  const createdData = getCreatedData();
  assert.equal(createdData.endsAt.getTime() - createdData.startsAt.getTime(), 14 * 24 * 60 * 60 * 1000);
});

test("does not create a duplicate while an active subscription exists", async () => {
  const { transaction, writes } = makeTransaction({
    existingSubscription: { id: "existing-1", planId: "paid-plan", status: "ACTIVE" },
  });

  const result = await createInitialInstitutionSubscription(transaction, {
    institutionId: "institution-1",
    planId: "plan-1",
    actorId: null,
  });

  assert.deepEqual(result, {
    planId: "paid-plan",
    status: "ACTIVE",
    subscriptionId: "existing-1",
  });
  assert.deepEqual(writes, []);
});

test("does not issue a second FREE_TRIAL after an earlier trial record", async () => {
  const { transaction, writes } = makeTransaction({
    planCode: "FREE_TRIAL",
    previousTrial: { id: "old-trial", planId: "plan-1", status: "CANCELED" },
  });

  const result = await createInitialInstitutionSubscription(transaction, {
    institutionId: "institution-1",
    planId: "plan-1",
    actorId: null,
  });

  assert.equal(result.subscriptionId, "old-trial");
  assert.equal(result.status, "CANCELED");
  assert.deepEqual(writes, []);
});

test("a failed subscription write rejects the institution transaction before commit", async () => {
  const { transaction } = makeTransaction({ failSubscription: true });
  let committed = false;
  const fakeDatabase = {
    $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const result = await callback(transaction);
      committed = true;
      return result;
    },
  };

  await assert.rejects(
    () => fakeDatabase.$transaction(async (tx) => {
      await tx.platformInstitution.create({
        data: { name: "Test", slug: "test", type: "COLLEGE" },
      });
      await createInitialInstitutionSubscription(tx, {
        institutionId: "institution-1",
        planId: "plan-1",
        actorId: null,
      });
    }),
    /subscription write failed/,
  );
  assert.equal(committed, false);
});
