import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getInstitutionSubscriptionStatus,
  isValidSubscriptionInstitutionId,
} from "../lib/services/subscription.service";
import { assertActiveSubscription } from "../lib/security/subscription-guard";

test("subscription status rejects missing and malformed institution IDs", async () => {
  assert.equal(isValidSubscriptionInstitutionId(""), false);
  assert.equal(isValidSubscriptionInstitutionId("not-a-uuid"), false);
  await assert.rejects(
    () => getInstitutionSubscriptionStatus("not-a-uuid"),
    /valid institution ID is required/i,
  );
  await assert.rejects(
    () => getInstitutionSubscriptionStatus(""),
    /valid institution ID is required/i,
  );
});

test("the subscription guard fails closed without an institution context", async () => {
  await assert.rejects(
    () => assertActiveSubscription("", "INSTITUTION_ADMIN"),
    /valid institutional tenant is required/i,
  );
});

test("Super Admin keeps the explicit subscription enforcement exemption", async () => {
  assert.deepEqual(
    await assertActiveSubscription("", "SUPER_ADMIN"),
    { allowed: true, status: "SUPER_ADMIN_EXEMPT" },
  );
});
