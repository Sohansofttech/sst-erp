import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/super-admin/prisma";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { archiveInstitution, provisionAdminForInstitution, revokeInstitutionInvitation, setInstitutionFeatureOverride, updateInstitutionStatus } from "../actions";
import {
  createInstitutionSubscription,
  extendSubscriptionValidity,
  setSubscriptionStatus,
} from "../../[section]/actions";
import { EditInstitutionForm } from "@/components/super-admin/edit-institution-form";
import { currentOrScheduledSubscriptionWhere } from "@/lib/services/institution-subscription-lifecycle.service";

export const instant = false;

export default async function InstitutionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const institution = await prisma.platformInstitution.findUnique({ where: { id }, include: {
    invitations: { take: 10, orderBy: { createdAt: "desc" } },
    memberships: { take: 20, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, email: true, status: true } } } },
    subscriptions: {
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { name: true, code: true, maxStudents: true, maxStaff: true, maxUsers: true, storageLimitMb: true } },
        events: {
          take: 30,
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { name: true, email: true } } },
        },
      },
    },
    usageMetrics: { take: 10, orderBy: { measuredAt: "desc" } },
    featureOverrides: { include: { feature: { select: { name: true, code: true } } } },
    auditLogs: { take: 10, orderBy: { createdAt: "desc" }, select: { id: true, action: true, createdAt: true, result: true } },
  } });
  if (!institution) notFound();
  const [features, plans, invoices, subscriptionAuditLogs, currentSubscriptions] = await Promise.all([
    prisma.platformFeature.findMany({ where: { isAvailable: true }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 200 }),
    prisma.subscriptionPlan.findMany({ where: { isActive: true, archivedAt: null }, orderBy: { price: "asc" }, take: 100 }),
    prisma.invoice.findMany({
      where: { institutionId: institution.id },
      include: { payments: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.platformAuditLog.findMany({
      where: { institutionId: institution.id, entity: "InstitutionSubscription" },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.institutionSubscription.findMany({
      where: currentOrScheduledSubscriptionWhere(institution.id),
      include: { plan: { select: { name: true } } },
      orderBy: { startsAt: "desc" },
    }),
  ]);
  const now = new Date();
  const activeCurrentSubscriptions = currentSubscriptions.filter(
    (subscription) =>
      subscription.startsAt <= now &&
      (!subscription.endsAt || subscription.endsAt > now),
  );
  const editableInstitution = {
    id: institution.id,
    name: institution.name,
    code: institution.code,
    slug: institution.slug,
    type: institution.type,
    email: institution.email,
    phone: institution.phone,
    address: institution.address,
    city: institution.city,
    state: institution.state,
    postalCode: institution.postalCode,
    country: institution.country,
    website: institution.website,
  };
  return <div className="sa-module-page"><Link href="/super-admin/institutions" className="sa-small-link">← Institution Management</Link><div className="sa-page-intro"><div><h2>{institution.name}</h2><p>{institution.code ?? institution.slug} · registered {institution.createdAt.toLocaleDateString("en-IN")}</p></div><span className={`sa-status-badge sa-status-${institution.status.toLowerCase()}`}>{institution.status}</span></div>
    {institution.archivedAt && <p className="sa-form-message sa-warning-box">Archived on {institution.archivedAt.toLocaleDateString("en-IN")}.</p>}
    {!institution.archivedAt && <div className="sa-action-row"><form action={updateInstitutionStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={institution.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} /><button className="sa-button sa-button-secondary">{institution.status === "ACTIVE" ? "Suspend institution" : "Activate institution"}</button></form><form action={archiveInstitution}><input type="hidden" name="id" value={id} /><button className="sa-button sa-button-danger">Archive institution</button></form></div>}
    <h3 className="sa-section-title">Institution details</h3><EditInstitutionForm institution={editableInstitution} />
    <div className="sa-module-grid"><section className="sa-card sa-module-panel"><h3>Institution administrators & invitations</h3><div className="sa-detail-row"><strong>Provisioning status</strong><span>{institution.provisioningStatus}</span></div>{institution.memberships.length ? institution.memberships.map((membership) => <div className="sa-detail-row" key={membership.id}><strong>{membership.user.name}</strong><span>{membership.user.email} · {membership.status}</span></div>) : <p className="sa-muted-copy">No members are associated with this institution.</p>}{institution.invitations.map((invitation) => <div className="sa-detail-row" key={invitation.id}><strong>{invitation.email}</strong><span>{invitation.status} · expires {invitation.expiresAt.toLocaleString("en-IN")} {invitation.sentAt ? `· sent ${invitation.sentAt.toLocaleString("en-IN")}` : ""}</span></div>)}<form className="sa-form-grid sa-compact-form" style={{ marginTop: "1rem", borderTop: "1px solid var(--sa-border)", paddingTop: "0.75rem" }} action={provisionAdminForInstitution}><input type="hidden" name="institutionId" value={institution.id} /><label>Admin name<input name="adminName" defaultValue={`${institution.name} Administrator`} /></label><label>Admin email<input name="adminEmail" type="email" defaultValue={institution.email || ""} placeholder="admin@domain.edu" required /></label><label>Admin phone<input name="adminPhone" maxLength={40} /></label><button className="sa-button sa-button-secondary">Send / Resend invitation</button></form><form action={revokeInstitutionInvitation} style={{ marginTop: ".75rem" }}><input type="hidden" name="institutionId" value={institution.id} /><button className="sa-button sa-button-danger">Revoke active invitation</button></form></section>
    <section className="sa-card sa-module-panel" id="subscription-management">
      <h3>Subscription Management</h3>
      <div className="sa-detail-row"><strong>Institution</strong><span>{institution.name} · {institution.id}</span></div>
      {currentSubscriptions.length > 1 && <p className="sa-form-message sa-warning-box">Multiple current, trial, or scheduled subscriptions exist. Review history and reconcile records before further changes.</p>}
      {activeCurrentSubscriptions.length === 1 && <div className="sa-detail-row"><strong>Current {activeCurrentSubscriptions[0].status === "TRIALING" ? "trial" : "subscription"}</strong><span>{activeCurrentSubscriptions[0].plan.name} · {activeCurrentSubscriptions[0].status} · starts {activeCurrentSubscriptions[0].startsAt.toLocaleDateString("en-IN")} · expires {activeCurrentSubscriptions[0].endsAt?.toLocaleDateString("en-IN") ?? "no expiry"}</span></div>}
      {activeCurrentSubscriptions.length === 0 && currentSubscriptions.length === 1 && <div className="sa-detail-row"><strong>Scheduled subscription</strong><span>{currentSubscriptions[0].plan.name} · starts {currentSubscriptions[0].startsAt.toLocaleDateString("en-IN")} · expires {currentSubscriptions[0].endsAt?.toLocaleDateString("en-IN") ?? "no expiry"}</span></div>}
      {currentSubscriptions.length === 0 && <p className="sa-muted-copy">No current active or trial subscription was found.</p>}

      <h4 className="sa-section-title">Assign or change plan</h4>
      {plans.length ? <form className="sa-form-grid sa-compact-form" action={createInstitutionSubscription}>
        <input type="hidden" name="institutionId" value={institution.id} />
        <input type="hidden" name="operation" value="CHANGE" />
        <label>Plan<select name="planId" required defaultValue=""><option value="" disabled>Select an active plan</option>{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name} · {plan.currency} {Number(plan.price).toLocaleString("en-IN")} / {plan.billingCycle}</option>)}</select></label>
        <label>Effective start date<input name="startsAt" type="date" required /></label>
        <label>Expiry date (leave blank for no expiry)<input name="endsAt" type="date" /></label>
        <button className="sa-button sa-button-primary">Assign / change plan</button>
        <p className="sa-muted-copy">This is a manual administrative assignment, not a payment. Changing a plan cancels any current active or trial record while preserving its history. Choose the effective and expiry dates explicitly; no payment or invoice is created.</p>
      </form> : <p className="sa-muted-copy">No active plans are available.</p>}

      <h4 className="sa-section-title">Subscription history and operations</h4>
      {institution.subscriptions.length ? institution.subscriptions.map((subscription) => <article className="sa-detail-row" key={subscription.id} style={{ display: "block", padding: "1rem 0" }}>
        <div className="sa-detail-row"><strong>{subscription.plan.name} · {subscription.status}</strong><span>Started {subscription.startsAt.toLocaleDateString("en-IN")} · expires {subscription.endsAt?.toLocaleDateString("en-IN") ?? "no expiry"}</span></div>
        <p className="sa-muted-copy">Subscription ID: {subscription.id}</p>
        {subscription.status !== "TRIALING" && <form className="sa-action-row" action={setSubscriptionStatus}>
          <input type="hidden" name="id" value={subscription.id} />
          <label>Status<select name="status" defaultValue={subscription.status === "PAST_DUE" ? "ACTIVE" : subscription.status}>
            {subscription.status === "PAST_DUE" && <option value="PAST_DUE" disabled>PAST_DUE</option>}
            <option value="ACTIVE">ACTIVE / reactivate</option><option value="SUSPENDED">SUSPENDED</option><option value="CANCELED">CANCELED</option><option value="EXPIRED">EXPIRED</option>
          </select></label>
          <button className="sa-button sa-button-secondary">Save status</button>
        </form>}
        {subscription.status === "TRIALING" && <p className="sa-muted-copy">Trial transition is handled by assigning a paid plan so this trial record remains preserved.</p>}
        {subscription.status === "ACTIVE" && subscription.endsAt && <form className="sa-action-row" action={extendSubscriptionValidity}>
          <input type="hidden" name="id" value={subscription.id} />
          <label>Extend expiry to<input name="endsAt" type="date" min={new Date(subscription.endsAt.getTime() + 86400000).toISOString().slice(0, 10)} required /></label>
          <button className="sa-button sa-button-secondary">Extend validity</button>
        </form>}
        {subscription.events.length ? <ul className="sa-muted-copy">{subscription.events.map((event) => <li key={event.id}><strong>{event.action}</strong> · {event.createdAt.toLocaleString("en-IN")}{event.actor ? ` · ${event.actor.name || event.actor.email}` : ""}{event.details ? ` · ${JSON.stringify(event.details)}` : ""}</li>)}</ul> : <p className="sa-muted-copy">No subscription events are recorded.</p>}
      </article>) : <p className="sa-muted-copy">No subscription records are available.</p>}

      <h4 className="sa-section-title">Invoices and payment history</h4>
      {invoices.length ? invoices.map((invoice) => <div className="sa-detail-row" key={invoice.id} style={{ display: "block" }}>
        <strong>{invoice.invoiceNumber} · {invoice.status} · {invoice.currency} {Number(invoice.total).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
        <span>Issued {invoice.issuedAt?.toLocaleDateString("en-IN") ?? "not issued"} · due {invoice.dueAt?.toLocaleDateString("en-IN") ?? "no due date"}</span>
        {invoice.payments.length ? <ul className="sa-muted-copy">{invoice.payments.map((payment) => <li key={payment.id}>{payment.status} · {payment.currency} {Number(payment.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })} · {payment.provider ?? "Manual/unspecified"} · {payment.paidAt?.toLocaleString("en-IN") ?? "not paid"}{payment.providerReference ? ` · ${payment.providerReference}` : ""}</li>)}</ul> : <p className="sa-muted-copy">No payment records.</p>}
      </div>) : <p className="sa-muted-copy">No invoices are recorded.</p>}

      <h4 className="sa-section-title">Administrative audit history</h4>
      {subscriptionAuditLogs.length ? subscriptionAuditLogs.map((entry) => <div className="sa-detail-row" key={entry.id} style={{ display: "block" }}>
        <strong>{entry.action} · {entry.result ?? "Recorded"}</strong>
        <span>{entry.user?.name || entry.user?.email || "Unknown administrator"} · {entry.createdAt.toLocaleString("en-IN")} · subscription {entry.entityId ?? "not specified"}</span>
        {entry.metadata && <pre className="sa-muted-copy" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(entry.metadata)}</pre>}
      </div>) : <p className="sa-muted-copy">No subscription administrative audit records are available.</p>}
    </section>
    <section className="sa-card sa-module-panel"><h3>Recorded usage</h3>{institution.usageMetrics.length ? institution.usageMetrics.map((metric) => <div className="sa-detail-row" key={metric.id}><strong>{metric.metric}: {metric.value.toString()} {metric.unit}</strong><span>Measured {metric.measuredAt.toLocaleString("en-IN")} · {metric.source}</span></div>) : <p className="sa-muted-copy">No usage measurements have been recorded.</p>}</section>
    <section className="sa-card sa-module-panel"><h3>Institution activity</h3>{institution.auditLogs.length ? institution.auditLogs.map((entry) => <div className="sa-detail-row" key={entry.id}><strong>{entry.action}</strong><span>{entry.result ?? "Recorded"} · {entry.createdAt.toLocaleString("en-IN")}</span></div>) : <p className="sa-muted-copy">No activity has been recorded.</p>}</section>
    <section className="sa-card sa-module-panel"><h3>Institution feature overrides</h3>{institution.featureOverrides.length ? institution.featureOverrides.map((override) => <div className="sa-detail-row" key={override.featureId}><strong>{override.feature.name}: {override.enabled ? "Enabled" : "Disabled"}</strong><span>{override.reason} · {override.expiresAt ? `expires ${override.expiresAt.toLocaleDateString("en-IN")}` : "no expiry"}</span></div>) : <p className="sa-muted-copy">No institution-specific overrides are configured.</p>}<form className="sa-form-grid sa-compact-form" action={setInstitutionFeatureOverride}><input type="hidden" name="institutionId" value={institution.id} /><label>Feature<select name="featureId" required defaultValue=""><option value="" disabled>Select feature</option>{features.map((feature) => <option value={feature.id} key={feature.id}>{feature.name}</option>)}</select></label><label>Override<select name="enabled"><option value="true">Enable</option><option value="false">Disable</option></select></label><label>Expiry (optional)<input name="expiresAt" type="date" /></label><label>Reason<input name="reason" minLength={5} maxLength={500} required /></label><button className="sa-button sa-button-secondary">Save override</button></form></section></div></div>;
}
