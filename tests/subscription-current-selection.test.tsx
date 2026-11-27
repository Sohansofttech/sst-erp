import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialSubscriptionBanner, type TrialSubscriptionData } from "../components/admin/TrialSubscriptionBanner";
import {
  calculateSubscriptionRemainingDays,
  isSubscriptionCurrentlyEffective,
  selectCurrentSubscription,
  type SubscriptionSelectionRecord,
} from "../lib/billing/subscription-selection";
import { getFreeTrialEnd } from "../lib/billing/subscription-period";

const now = new Date("2026-11-27T00:00:00.000Z");
const institutionId = "institution-a";

interface SubscriptionFixture extends SubscriptionSelectionRecord {
  planName: string;
}

function subscription(
  id: string,
  values: Partial<SubscriptionFixture> = {}
): SubscriptionFixture {
  return {
    id,
    institutionId,
    plan: { code: "STANDARD" },
    status: "ACTIVE",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: new Date("2026-12-01T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    events: [],
    planName: "Standard",
    ...values,
  };
}

function lifecycleEvent(
  id: string,
  action: string,
  createdAt: string,
  details?: unknown
) {
  return { id, action, createdAt: new Date(createdAt), details };
}

function canceledBannerData(): TrialSubscriptionData {
  return {
    hasSubscription: true,
    isTrial: false,
    status: "CANCELED",
    statusLabel: "Canceled",
    planName: "Standard",
    planCode: "STANDARD",
    startsAt: "2026-11-01T00:00:00.000Z",
    endsAt: null,
    remainingDays: 0,
    isExpired: false,
    canAccessErp: false,
  };
}

test("a November 19 free trial ends after 14 days and has six days remaining on November 27", () => {
  const trial = subscription("trial", {
    status: "TRIALING",
    planName: "Free Trial",
    startsAt: new Date("2026-11-19T00:00:00.000Z"),
    endsAt: getFreeTrialEnd(new Date("2026-11-19T00:00:00.000Z")),
  });

  assert.equal(selectCurrentSubscription([trial], institutionId, now), trial);
  assert.equal(trial.endsAt?.toISOString(), "2026-12-03T00:00:00.000Z");
  assert.equal(calculateSubscriptionRemainingDays(trial, now), 6);
  assert.equal(isSubscriptionCurrentlyEffective(trial, now), true);
});

test("a trial expires at the exact end timestamp", () => {
  const startsAt = new Date("2026-11-19T00:00:00.000Z");
  const trial = subscription("trial-boundary", {
    status: "TRIALING",
    planName: "Free Trial",
    startsAt,
    endsAt: getFreeTrialEnd(startsAt),
  });

  assert.equal(calculateSubscriptionRemainingDays(trial, trial.endsAt!), 0);
  assert.equal(isSubscriptionCurrentlyEffective(trial, trial.endsAt!), false);
});

test("an effective trial takes precedence over a future canceled subscription", () => {
  const trial = subscription("trial", { status: "TRIALING" });
  const futureCanceled = subscription("future-canceled", {
    status: "CANCELED",
    startsAt: new Date("2026-12-01T00:00:00.000Z"),
    createdAt: new Date("2026-11-27T01:00:00.000Z"),
    cancelledAt: new Date("2026-11-27T01:00:00.000Z"),
    events: [lifecycleEvent("cancel-event", "STATUS_CANCELED", "2026-11-27T01:00:00.000Z")],
  });

  assert.equal(
    selectCurrentSubscription([futureCanceled, trial], institutionId, now),
    trial
  );
});

test("a started explicit cancellation blocks an older overlapping active subscription", () => {
  const active = subscription("older-active", {
    status: "ACTIVE",
    endsAt: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    events: [lifecycleEvent("active-event", "ASSIGNED_FREE", "2026-10-01T00:00:00.000Z")],
  });
  const canceled = subscription("newer-canceled", {
    status: "CANCELED",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: null,
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    updatedAt: new Date("2026-11-20T00:00:00.000Z"),
    cancelledAt: new Date("2026-11-20T00:00:00.000Z"),
    events: [lifecycleEvent("cancel-event", "STATUS_CANCELED", "2026-11-20T00:00:00.000Z")],
  });

  const selected = selectCurrentSubscription([active, canceled], institutionId, now);
  assert.equal(selected, canceled);
  assert.equal(isSubscriptionCurrentlyEffective(selected!, now), false);
});

test("a pending paid-plan assignment does not block an existing active subscription", () => {
  const active = subscription("existing-active", {
    status: "ACTIVE",
    endsAt: null,
    events: [lifecycleEvent("active-event", "ASSIGNED_FREE", "2026-10-01T00:00:00.000Z")],
  });
  const pending = subscription("pending-paid", {
    status: "PAST_DUE",
    startsAt: new Date("2026-11-20T00:00:00.000Z"),
    createdAt: new Date("2026-11-20T00:00:00.000Z"),
    updatedAt: new Date("2026-11-20T00:00:00.000Z"),
    events: [
      lifecycleEvent(
        "pending-event",
        "ASSIGNED_PENDING_PAYMENT",
        "2026-11-20T00:00:00.000Z",
        { status: "PAST_DUE" }
      ),
    ],
  });

  assert.equal(
    selectCurrentSubscription([active, pending], institutionId, now),
    active
  );
});

test("a paid replacement is selected instead of the subscription it replaced", () => {
  const invoiceId = "invoice-1";
  const oldSubscription = subscription("old-subscription", {
    status: "CANCELED",
    planId: "old-plan",
    endsAt: null,
    cancelledAt: new Date("2026-11-20T00:00:00.000Z"),
    updatedAt: new Date("2026-11-20T00:00:00.000Z"),
    events: [
      lifecycleEvent(
        "replacement-event",
        "REPLACED_BY_PAID_PLAN",
        "2026-11-20T00:00:00.000Z",
        { replacementPlanId: "new-plan", invoiceId }
      ),
    ],
  });
  const replacement = subscription("replacement-subscription", {
    status: "ACTIVE",
    planId: "new-plan",
    startsAt: new Date("2026-11-20T00:00:00.000Z"),
    endsAt: new Date("2026-12-20T00:00:00.000Z"),
    createdAt: new Date("2026-11-20T00:00:00.000Z"),
    updatedAt: new Date("2026-11-20T00:00:00.000Z"),
    events: [
      lifecycleEvent("purchase-event", "PURCHASED", "2026-11-20T00:00:01.000Z", {
        invoiceId,
        planId: "new-plan",
      }),
    ],
  });

  assert.equal(
    selectCurrentSubscription([oldSubscription, replacement], institutionId, now),
    replacement
  );
});

test("a canceled-only institution retains the canceled status and banner", () => {
  const canceled = subscription("canceled", { status: "CANCELED" });
  const selected = selectCurrentSubscription([canceled], institutionId, now);
  const markup = renderToStaticMarkup(
    createElement(TrialSubscriptionBanner, { subscription: canceledBannerData() })
  );

  assert.equal(selected, canceled);
  assert.match(markup, /Subscription Canceled/);
  assert.doesNotMatch(markup, /Active Plan:/);
});

test("an expired-only institution remains blocked", () => {
  const expired = subscription("expired", {
    status: "EXPIRED",
    endsAt: new Date("2026-11-26T00:00:00.000Z"),
    events: [lifecycleEvent("expired-event", "TRIAL_EXPIRED", "2026-11-26T00:00:00.000Z")],
  });

  const selected = selectCurrentSubscription([expired], institutionId, now);
  assert.equal(selected, expired);
  assert.equal(isSubscriptionCurrentlyEffective(selected!, now), false);
});

test("a newer expired subscription cannot be bypassed by an older active subscription", () => {
  const active = subscription("older-active", {
    status: "ACTIVE",
    endsAt: null,
    events: [lifecycleEvent("active-event", "ASSIGNED_FREE", "2026-10-01T00:00:00.000Z")],
  });
  const expired = subscription("newer-expired", {
    status: "EXPIRED",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: new Date("2026-11-20T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    events: [lifecycleEvent("expired-event", "TRIAL_EXPIRED", "2026-11-20T00:00:00.000Z")],
  });

  const selected = selectCurrentSubscription([active, expired], institutionId, now);
  assert.equal(selected, expired);
  assert.equal(isSubscriptionCurrentlyEffective(selected!, now), false);
});

test("an expired ACTIVE free trial blocks an older overlapping active subscription", () => {
  const olderActive = subscription("older-active", {
    status: "ACTIVE",
    endsAt: null,
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  });
  const expiredTrial = subscription("expired-active-trial", {
    plan: { code: "FREE_TRIAL" },
    status: "ACTIVE",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    endsAt: new Date("2026-11-15T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    updatedAt: new Date("2026-11-01T00:00:00.000Z"),
  });

  const selected = selectCurrentSubscription(
    [olderActive, expiredTrial],
    institutionId,
    now
  );
  assert.equal(selected, expiredTrial);
  assert.equal(isSubscriptionCurrentlyEffective(selected!, now), false);
  assert.equal(calculateSubscriptionRemainingDays(selected!, now), 0);
});

test("a paid subscription starting at trial expiry supersedes the elapsed trial", () => {
  const trialEnd = new Date("2026-11-26T00:00:00.000Z");
  const expiredTrial = subscription("expired-trial", {
    plan: { code: "FREE_TRIAL" },
    status: "ACTIVE",
    startsAt: new Date("2026-11-12T00:00:00.000Z"),
    endsAt: trialEnd,
    createdAt: new Date("2026-11-12T00:00:00.000Z"),
    updatedAt: new Date("2026-11-12T00:00:00.000Z"),
  });
  const paidSubscription = subscription("paid-replacement", {
    planId: "paid-plan",
    startsAt: trialEnd,
    endsAt: new Date("2026-12-26T00:00:00.000Z"),
    createdAt: new Date("2026-11-25T00:00:00.000Z"),
    updatedAt: new Date("2026-11-25T00:00:00.000Z"),
    events: [
      lifecycleEvent("purchase", "PURCHASED", "2026-11-25T00:00:00.000Z", {
        invoiceId: "invoice-2",
        planId: "paid-plan",
      }),
    ],
  });

  assert.equal(
    selectCurrentSubscription(
      [expiredTrial, paidSubscription],
      institutionId,
      now
    ),
    paidSubscription
  );
});

test("a suspended-only institution remains blocked", () => {
  const suspended = subscription("suspended", {
    status: "SUSPENDED",
    events: [lifecycleEvent("suspended-event", "STATUS_SUSPENDED", "2026-11-20T00:00:00.000Z")],
  });

  const selected = selectCurrentSubscription([suspended], institutionId, now);
  assert.equal(selected, suspended);
  assert.equal(isSubscriptionCurrentlyEffective(selected!, now), false);
});

test("a newer suspended subscription cannot be bypassed by an older active subscription", () => {
  const active = subscription("older-active", {
    status: "ACTIVE",
    endsAt: null,
    events: [lifecycleEvent("active-event", "ASSIGNED_FREE", "2026-10-01T00:00:00.000Z")],
  });
  const suspended = subscription("newer-suspended", {
    status: "SUSPENDED",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    events: [
      lifecycleEvent("suspended-event", "STATUS_SUSPENDED", "2026-11-20T00:00:00.000Z"),
    ],
  });

  const selected = selectCurrentSubscription([active, suspended], institutionId, now);
  assert.equal(selected, suspended);
  assert.equal(isSubscriptionCurrentlyEffective(selected!, now), false);
});

test("an expired trial remains selected when no effective subscription exists", () => {
  const expiredTrial = subscription("expired-trial", {
    status: "TRIALING",
    planName: "Free Trial",
    endsAt: new Date("2026-11-26T00:00:00.000Z"),
  });

  assert.equal(
    selectCurrentSubscription([expiredTrial], institutionId, now),
    expiredTrial
  );
  assert.equal(calculateSubscriptionRemainingDays(expiredTrial, now), 0);
});

test("an effective paid subscription takes precedence over an older canceled record", () => {
  const canceled = subscription("older-canceled", {
    status: "CANCELED",
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
  });
  const active = subscription("active-paid", {
    status: "ACTIVE",
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
  });

  assert.equal(selectCurrentSubscription([canceled, active], institutionId, now), active);
});

test("identical startsAt values use createdAt and id as deterministic tie-breakers", () => {
  const first = subscription("subscription-a", {
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T01:00:00.000Z"),
  });
  const second = subscription("subscription-b", {
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T02:00:00.000Z"),
  });
  const idTieBreaker = subscription("subscription-z", {
    startsAt: new Date("2026-11-01T00:00:00.000Z"),
    createdAt: new Date("2026-11-01T02:00:00.000Z"),
  });

  assert.equal(
    selectCurrentSubscription([first, second, idTieBreaker], institutionId, now),
    idTieBreaker
  );
  assert.equal(
    selectCurrentSubscription([idTieBreaker, second, first], institutionId, now),
    idTieBreaker
  );
});

test("subscription selection is isolated to the requested institution", () => {
  const otherInstitutionActive = subscription("other-institution-active", {
    institutionId: "institution-a",
    endsAt: null,
  });
  const currentInstitutionCanceled = subscription("current-institution-canceled", {
    institutionId: "institution-b",
    status: "CANCELED",
    events: [lifecycleEvent("cancel-event-b", "STATUS_CANCELED", "2026-11-20T00:00:00.000Z")],
  });

  assert.equal(
    selectCurrentSubscription(
      [otherInstitutionActive, currentInstitutionCanceled],
      "institution-b",
      now
    ),
    currentInstitutionCanceled
  );
});

test("a future active record is not considered effective or given remaining days", () => {
  const futureActive = subscription("future-active", {
    startsAt: new Date("2026-12-01T00:00:00.000Z"),
    endsAt: new Date("2026-12-15T00:00:00.000Z"),
  });
  const scheduledBanner = {
    ...canceledBannerData(),
    status: "ACTIVE" as const,
    statusLabel: "Scheduled",
    planName: futureActive.planName,
    startsAt: futureActive.startsAt.toISOString(),
    endsAt: futureActive.endsAt?.toISOString() ?? null,
  };
  const markup = renderToStaticMarkup(
    createElement(TrialSubscriptionBanner, { subscription: scheduledBanner })
  );

  assert.equal(selectCurrentSubscription([futureActive], institutionId, now), futureActive);
  assert.equal(isSubscriptionCurrentlyEffective(futureActive, now), false);
  assert.equal(calculateSubscriptionRemainingDays(futureActive, now), 0);
  assert.match(markup, /Upcoming Subscription/);
  assert.doesNotMatch(markup, /Active Plan:/);
});
