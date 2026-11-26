import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenError } from "../lib/auth/session";
import { assertInstitutionAdminMembership } from "../lib/security/institution-admin";

const memberContext = {
  email: "admin@example.test",
  userInstitutionId: "institution-a",
};

test("allows an active Institution Admin membership for the user's institution", async () => {
  let lookupInstitutionId = "";
  await assertInstitutionAdminMembership(
    memberContext,
    "institution-a",
    async (_email, institutionId) => {
      lookupInstitutionId = institutionId;
      return true;
    },
  );
  assert.equal(lookupInstitutionId, "institution-a");
});

test("denies a membership without an active Institution Admin role", async () => {
  await assert.rejects(
    assertInstitutionAdminMembership(memberContext, "institution-a", async () => false),
    ForbiddenError,
  );
});

test("denies an account with no InstitutionMembership record", async () => {
  await assert.rejects(
    assertInstitutionAdminMembership(memberContext, "institution-a", async () => false),
    ForbiddenError,
  );
});

test("denies an account with no institution membership context", async () => {
  await assert.rejects(
    assertInstitutionAdminMembership({ ...memberContext, userInstitutionId: null }, "institution-a", async () => true),
    ForbiddenError,
  );
});

test("propagates membership database failures so the request fails closed", async () => {
  await assert.rejects(
    assertInstitutionAdminMembership(memberContext, "institution-a", async () => {
      throw new Error("membership query failed");
    }),
    /membership query failed/,
  );
});

test("denies requests targeting another institution before querying membership", async () => {
  let lookupCalled = false;
  await assert.rejects(
    assertInstitutionAdminMembership(memberContext, "institution-b", async () => {
      lookupCalled = true;
      return true;
    }),
    ForbiddenError,
  );
  assert.equal(lookupCalled, false);
});
