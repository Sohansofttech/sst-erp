import Link from "next/link";
import { getPortalOverview, getSubscriptionPortalScope } from "@/lib/subscriptions/portal-data";

export const instant = false;

export default async function SubscriptionRenewalsPage() {
  const scope = await getSubscriptionPortalScope();
  const data = await getPortalOverview(scope);
  return <div className="sc-page"><div className="sc-page-heading"><div><div className="sc-eyebrow">Lifecycle operations</div><h2>Renewals & upgrades</h2><p>Current subscriptions renewing or expiring within 30 days.</p></div><Link className="sc-button sc-button-primary" href="/subscriptions/institutions">Manage subscriptions</Link></div>
    {data.errors.length > 0 && <p role="alert" className="sc-data-notice">{data.errors.join(" ")}</p>}
    <div className="sc-two-column">{[["Upcoming renewals", data.upcomingRenewals], ["Expiring subscriptions", data.expiringSubscriptions]].map(([title, rows]) => <section className="sc-card" key={title as string}><h3>{title as string}</h3>{Array.isArray(rows) && rows.length ? <ul className="sc-list">{rows.map((row, index) => <li className="sc-list-item" key={`${row.institution}-${index}`}><span className="sc-list-main"><strong>{row.institution}</strong><small>{row.plan} · {row.status}</small></span><span>{row.date}</span></li>)}</ul> : <p>No records in this period.</p>}</section>)}</div>
    <p className="sc-data-notice">Paid renewals must be completed through the institution checkout. Subscription changes and history are available in the institution register.</p>
  </div>;
}
