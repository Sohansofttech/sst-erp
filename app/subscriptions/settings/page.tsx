import Link from "next/link";
import { redirect } from "next/navigation";
import { getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";

export const instant = false;

export default async function SubscriptionSettingsPage() {
  const scope = await getSubscriptionPortalScope();
  if (scope.role !== "SUPER_ADMIN") redirect("/subscriptions");
  return <div className="sc-page"><div className="sc-page-heading"><div><div className="sc-eyebrow">Platform configuration</div><h2>Subscription settings</h2><p>Manage existing platform settings and the subscription catalogue.</p></div></div>
    <section className="sc-card"><h3>Platform settings</h3><p>Use the existing Super Admin settings to manage platform configuration.</p><Link className="sc-button sc-button-primary" href="/super-admin/settings">Open platform settings</Link></section>
    <section className="sc-card"><h3>Plan and billing terms</h3><p>Billing duration, prices, features and limits are configured per plan. Paid renewals use the institution checkout.</p><Link className="sc-button" href="/subscriptions/plans">Manage plans</Link></section>
    <section className="sc-card"><h3>Notifications</h3><p>Automated renewal reminders and subscription email preferences are not configured in this module.</p></section>
  </div>;
}
