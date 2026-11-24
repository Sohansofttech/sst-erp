import assert from "node:assert/strict";
import { test } from "node:test";
import { getInitialSubscriptionStatus, optionalPlanLimit } from "../lib/billing/subscription-plan";

test("validates optional positive student limits", () => {
  assert.equal(optionalPlanLimit.parse(""), undefined);
  assert.equal(optionalPlanLimit.parse("250"), 250);
  assert.equal(optionalPlanLimit.safeParse("0").success, false);
  assert.equal(optionalPlanLimit.safeParse("1.5").success, false);
});

test("activates only zero-price plans before checkout", () => {
  assert.equal(getInitialSubscriptionStatus(0), "ACTIVE");
  assert.equal(getInitialSubscriptionStatus(25), "PAST_DUE");
});
