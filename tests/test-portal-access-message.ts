import assert from "node:assert/strict";
import { getPortalAccessIssue, getPortalAccessMessage } from "../lib/super-admin/portal-access-message";

assert.equal(getPortalAccessIssue({ status: "ACTIVE" }), null);
assert.equal(getPortalAccessIssue({ status: "PENDING" }), "pending");
assert.equal(getPortalAccessIssue({ status: "SUSPENDED" }), "suspended");
assert.equal(getPortalAccessIssue({ status: "ACTIVE", archivedAt: new Date() }), "archived");
assert.equal(getPortalAccessIssue({ status: "ARCHIVED" }), "archived");
assert.equal(getPortalAccessIssue(null), "not_found");

assert.match(getPortalAccessMessage("pending", "Demo"), /not activated yet.*activate it from Institution Management/);
assert.match(getPortalAccessMessage("suspended"), /suspended/);
assert.match(getPortalAccessMessage("archived"), /archived/);
assert.doesNotMatch(getPortalAccessMessage("failed"), /prisma|error code|stack/i);

console.log("Portal access message checks passed");
