import assert from "node:assert/strict";
import { test } from "node:test";
import { isKnownPortalRole, portalRoleAllows } from "../lib/auth/portal-roles";

test("Admin portal accepts institution and departmental roles but excludes Super Admin", () => {
  assert.equal(portalRoleAllows("ADMIN", "ADMIN"), true);
  assert.equal(portalRoleAllows("ADMIN", "INSTITUTION_ADMIN"), true);
  assert.equal(portalRoleAllows("ADMIN", "ADMISSIONS_OFFICER"), true);
  assert.equal(portalRoleAllows("ADMIN", "ACCOUNTANT"), true);
  assert.equal(portalRoleAllows("ADMIN", "SUPER_ADMIN"), false);
  assert.equal(portalRoleAllows("ADMIN", "STUDENT"), false);
});

test("student, teacher, and Super Admin portal roles stay isolated", () => {
  assert.equal(portalRoleAllows("STUDENT", "STUDENT"), true);
  assert.equal(portalRoleAllows("STUDENT", "TEACHER"), false);
  assert.equal(portalRoleAllows("TEACHER", "TEACHER"), true);
  assert.equal(portalRoleAllows("TEACHER", "SUPER_ADMIN"), false);
  assert.equal(portalRoleAllows("SUPER_ADMIN", "SUPER_ADMIN"), true);
  assert.equal(portalRoleAllows("SUPER_ADMIN", "ADMIN"), false);
});

test("unknown portal role values are rejected", () => {
  assert.equal(isKnownPortalRole("ROOT"), false);
  assert.equal(isKnownPortalRole("ADMIN"), true);
  assert.equal(isKnownPortalRole("INSTITUTION_ADMIN"), true);
  assert.equal(portalRoleAllows("unknown", "ADMIN"), false);
  assert.equal(portalRoleAllows("toString", "ADMIN"), false);
});
