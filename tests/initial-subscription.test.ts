import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { createInitialInstitutionSubscription } from "../lib/billing/initial-subscription";

function makeTransaction(options: { price?: number; failSubscription?: boolean; planAvailable?: boolean } = {}) {
  const writes: string[] = [];
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
        : { id: "plan-1", price: options.price ?? 0, billingCycle: "MONTHLY", customCycleDays: null },
    },
    institutionSubscription: {
      create: async () => {
        writes.push("subscription");
        if (options.failSubscription) throw new Error("subscription write failed");
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
  return { transaction, writes };
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
