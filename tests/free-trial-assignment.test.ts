import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { assignInstitutionTrial } from "../lib/services/subscription.service";

function makeTrialDatabase(options: {
  activeSubscription?: unknown;
  previousTrial?: unknown;
  configuredTrialDays?: number;
} = {}) {
  let createdSubscription: any = null;
  let subscriptionCreates = 0;
  const trialPlan = {
    id: "trial-plan",
    code: "FREE_TRIAL",
    name: "Free Trial",
    billingCycle: "CUSTOM",
    customCycleDays: options.configuredTrialDays ?? 156,
    price: new Prisma.Decimal(0),
    currency: "INR",
  };
  const dbClient = {
    institutionSubscription: {
      findFirst: async ({ where }: any) =>
        where?.status ? options.activeSubscription ?? null : options.previousTrial ?? null,
      create: async ({ data }: any) => {
        subscriptionCreates += 1;
        createdSubscription = { id: "new-trial", ...data, plan: trialPlan };
        return createdSubscription;
      },
    },
    subscriptionPlan: {
      findFirst: async () => trialPlan,
      create: async () => trialPlan,
    },
    subscriptionEvent: {
      create: async () => ({}),
    },
  } as unknown as Prisma.TransactionClient;

  return {
    dbClient,
    getCreatedSubscription: () => createdSubscription,
    getSubscriptionCreates: () => subscriptionCreates,
  };
}

test("assignInstitutionTrial always creates a 14-day term from its start date", async () => {
  const { dbClient, getCreatedSubscription } = makeTrialDatabase();
  const startsAt = new Date("2026-11-19T00:00:00.000Z");

  await assignInstitutionTrial(dbClient, {
    institutionId: "institution-1",
    startsAt,
  });

  const subscription = getCreatedSubscription();
  assert.equal(subscription.endsAt.toISOString(), "2026-12-03T00:00:00.000Z");
  assert.equal(subscription.endsAt.getTime() - subscription.startsAt.getTime(), 14 * 24 * 60 * 60 * 1000);
});

test("does not issue a duplicate trial when an active subscription exists", async () => {
  const { dbClient, getSubscriptionCreates } = makeTrialDatabase({
    activeSubscription: { id: "paid-subscription", status: "ACTIVE" },
  });

  const result = await assignInstitutionTrial(dbClient, {
    institutionId: "institution-1",
  });

  assert.equal(result.created, false);
  assert.equal(getSubscriptionCreates(), 0);
});

test("does not issue a second trial when an earlier trial record exists", async () => {
  const { dbClient, getSubscriptionCreates } = makeTrialDatabase({
    previousTrial: { id: "expired-trial", status: "EXPIRED" },
  });

  const result = await assignInstitutionTrial(dbClient, {
    institutionId: "institution-1",
  });

  assert.equal(result.created, false);
  assert.equal(result.subscription.id, "expired-trial");
  assert.equal(getSubscriptionCreates(), 0);
});
