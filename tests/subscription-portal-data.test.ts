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

test("the current active subscription takes precedence over a newer pending assignment", () => {
  const active = { status: "ACTIVE", startsAt: new Date("2026-01-01"), endsAt: new Date("2027-01-01"), createdAt: new Date("2026-01-01") };
  const pending = { status: "PAST_DUE", startsAt: new Date("2026-06-01"), endsAt: null, createdAt: new Date("2026-06-01") };
  assert.equal(currentInstitutionSubscription([pending, active], new Date("2026-07-01")), active);
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

test("overview uses scoped totals and bounded recent and monthly queries", () => {
  const source = readFileSync(join(process.cwd(), "lib/subscriptions/portal-data.ts"), "utf8");
  const overview = source.slice(source.indexOf("export async function getPortalOverview"));
  assert.match(overview, /queryPayments\(scope, 5\)/);
  assert.match(overview, /where: paymentScope, _count/);
  assert.match(overview, /where: \{ \.\.\.paymentScope, status: "SUCCEEDED" \}, _sum/);
  assert.match(overview, /paidAt: \{ gte: start, lt: end \}/);
  assert.match(overview, /createdAt: \{ gte: start, lt: end \}/);
  assert.match(overview, /where: subscriptionScope, orderBy:.*take: 5/);
});

test("invoice and payment register queries have tenant-scoped pages", () => {
  const source = readFileSync(join(process.cwd(), "lib/subscriptions/management-data.ts"), "utf8");
  const register = source.slice(source.indexOf("export async function getInvoiceRegister"));
  assert.match(register, /invoice\.count\(\{ where \}\)/);
  assert.match(register, /skip: \(page - 1\) \* pageSize/);
  assert.match(register, /take: pageSize/);
  assert.match(register, /invoice: \{ institutionId \}/);
  assert.match(register, /take: 10/);
});

test("dashboard history is aggregated by bounded periods and plan currency", () => {
  const source = readFileSync(join(process.cwd(), "lib/super-admin/dashboard.ts"), "utf8");
  assert.match(source, /points\.length < 24/);
  assert.match(source, /WITH periods\(idx, start_at, end_at\)/);
  assert.match(source, /GROUP BY COALESCE\(p\.name, 'Unassigned'\), pay\.currency/);
  assert.doesNotMatch(source, /findMany\(\{ where: activityPeriod, select: \{ createdAt: true \} \}\)/);
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
