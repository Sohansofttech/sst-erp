import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import {
  currentInstitutionSubscription,
  institutionPaymentWhere,
  institutionSubscriptionStatus,
  institutionSubscriptionWhere,
  summarizePayments,
} from "../lib/subscriptions/portal-metrics";

test("institution admin query scopes are bound to the verified institution", () => {
  const scope = { role: "INSTITUTION_ADMIN" as const, institutionId: "institution-a" };
  assert.deepEqual(institutionSubscriptionWhere(scope), { institutionId: "institution-a" });
  assert.deepEqual(institutionPaymentWhere(scope), { invoice: { institutionId: "institution-a" } });
  assert.equal(institutionSubscriptionWhere({ role: "SUPER_ADMIN" }), undefined);
  assert.equal(institutionPaymentWhere({ role: "SUPER_ADMIN" }), undefined);
});

test("institutions without subscription records remain explicitly unassigned", () => {
  assert.equal(currentInstitutionSubscription([], new Date("2026-01-01T00:00:00.000Z")), null);
  assert.equal(institutionSubscriptionStatus(null, new Date("2026-01-01T00:00:00.000Z")), "NO_SUBSCRIPTION");
});

test("verified revenue includes succeeded payments only and groups currencies", () => {
  const summary = summarizePayments([
    { status: "SUCCEEDED", amount: 125, currency: "INR" },
    { status: "SUCCEEDED", amount: 0.1, currency: "USD" },
    { status: "SUCCEEDED", amount: 0.2, currency: "USD" },
    { status: "PENDING", amount: 500, currency: "INR" },
    { status: "FAILED", amount: 800, currency: "INR" },
    { status: "SUCCEEDED", amount: 10, currency: "USD" },
  ]);
  assert.equal(summary.counts.get("PENDING"), 1);
  assert.deepEqual(summary.revenueByCurrency, [
    { currency: "INR", amount: 125 },
    { currency: "USD", amount: 10.3 },
  ]);
});

test("subscription table rows contain no whitespace-only direct JSX children", () => {
  const files = [
    join(process.cwd(), "app/super-admin/(protected)/[section]/page.tsx"),
    join(process.cwd(), "components/subscriptions/SubscriptionSection.tsx"),
  ];
  const invalidChildren: string[] = [];

  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "tr") {
        for (const child of node.children) {
          if (ts.isJsxText(child) && child.text.trim().length === 0) {
            invalidChildren.push(`${file}:${source.getLineAndCharacterOfPosition(child.getStart(source)).line + 1}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  assert.deepEqual(invalidChildren, []);
});
