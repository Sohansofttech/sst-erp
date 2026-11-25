import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/super-admin/prisma";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { archiveInstitution, provisionAdminForInstitution, revokeInstitutionInvitation, setInstitutionFeatureOverride, setPrimaryInstitution, updateInstitutionStatus } from "../actions";
import { EditInstitutionForm } from "@/components/super-admin/edit-institution-form";

export const instant = false;

export default async function InstitutionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const institution = await prisma.platformInstitution.findUnique({ where: { id }, include: {
    invitations: { take: 10, orderBy: { createdAt: "desc" } },
    memberships: { take: 20, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, email: true, status: true } } } },
    subscriptions: { take: 10, orderBy: { createdAt: "desc" }, include: { plan: { select: { name: true, code: true } } } },
    usageMetrics: { take: 10, orderBy: { measuredAt: "desc" } },
    featureOverrides: { include: { feature: { select: { name: true, code: true } } } },
    auditLogs: { take: 10, orderBy: { createdAt: "desc" }, select: { id: true, action: true, createdAt: true, result: true } },
  } });
  if (!institution) notFound();
  const [features, primarySetting] = await Promise.all([
    prisma.platformFeature.findMany({ where: { isAvailable: true }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 200 }),
    prisma.platformSetting.findUnique({ where: { key: "primary_institution_id" } }),
  ]);
  const isPrimary = primarySetting?.value === id;
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
    {!institution.archivedAt && (
      <div className="sa-action-row">
        <form action={setPrimaryInstitution}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className={`sa-button ${isPrimary ? "sa-button-secondary" : "sa-button-primary"}`}
            disabled={isPrimary}
          >
            {isPrimary ? "★ Default Portal Institution" : "Set as Default Portal Institution"}
          </button>
        </form>
        <form action={updateInstitutionStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={institution.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} /><button className="sa-button sa-button-secondary">{institution.status === "ACTIVE" ? "Suspend institution" : "Activate institution"}</button></form>
        <form action={archiveInstitution}><input type="hidden" name="id" value={id} /><button className="sa-button sa-button-danger">Archive institution</button></form>
      </div>
    )}
    <h3 className="sa-section-title">Institution details</h3><EditInstitutionForm institution={editableInstitution} />
    <div className="sa-module-grid"><section className="sa-card sa-module-panel"><h3>Institution administrators & invitations</h3><div className="sa-detail-row"><strong>Provisioning status</strong><span>{institution.provisioningStatus}</span></div>{institution.memberships.length ? institution.memberships.map((membership) => <div className="sa-detail-row" key={membership.id}><strong>{membership.user.name}</strong><span>{membership.user.email} · {membership.status}</span></div>) : <p className="sa-muted-copy">No members are associated with this institution.</p>}{institution.invitations.map((invitation) => <div className="sa-detail-row" key={invitation.id}><strong>{invitation.email}</strong><span>{invitation.status} · expires {invitation.expiresAt.toLocaleString("en-IN")} {invitation.sentAt ? `· sent ${invitation.sentAt.toLocaleString("en-IN")}` : ""}</span></div>)}<form className="sa-form-grid sa-compact-form" style={{ marginTop: "1rem", borderTop: "1px solid var(--sa-border)", paddingTop: "0.75rem" }} action={provisionAdminForInstitution}><input type="hidden" name="institutionId" value={institution.id} /><label>Admin name<input name="adminName" defaultValue={`${institution.name} Administrator`} /></label><label>Admin email<input name="adminEmail" type="email" defaultValue={institution.email || ""} placeholder="admin@domain.edu" required /></label><label>Admin phone<input name="adminPhone" maxLength={40} /></label><button className="sa-button sa-button-secondary">Send / Resend invitation</button></form><form action={revokeInstitutionInvitation} style={{ marginTop: ".75rem" }}><input type="hidden" name="institutionId" value={institution.id} /><button className="sa-button sa-button-danger">Revoke active invitation</button></form></section>
    <section className="sa-card sa-module-panel"><h3>Subscriptions</h3>{institution.subscriptions.length ? institution.subscriptions.map((subscription) => <div className="sa-detail-row" key={subscription.id}><strong>{subscription.plan.name}</strong><span>{subscription.status} · started {subscription.startsAt.toLocaleDateString("en-IN")}</span></div>) : <p className="sa-muted-copy">No subscription records are available.</p>}</section>
    <section className="sa-card sa-module-panel"><h3>Recorded usage</h3>{institution.usageMetrics.length ? institution.usageMetrics.map((metric) => <div className="sa-detail-row" key={metric.id}><strong>{metric.metric}: {metric.value.toString()} {metric.unit}</strong><span>Measured {metric.measuredAt.toLocaleString("en-IN")} · {metric.source}</span></div>) : <p className="sa-muted-copy">No usage measurements have been recorded.</p>}</section>
    <section className="sa-card sa-module-panel"><h3>Institution activity</h3>{institution.auditLogs.length ? institution.auditLogs.map((entry) => <div className="sa-detail-row" key={entry.id}><strong>{entry.action}</strong><span>{entry.result ?? "Recorded"} · {entry.createdAt.toLocaleString("en-IN")}</span></div>) : <p className="sa-muted-copy">No activity has been recorded.</p>}</section>
    <section className="sa-card sa-module-panel"><h3>Institution feature overrides</h3>{institution.featureOverrides.length ? institution.featureOverrides.map((override) => <div className="sa-detail-row" key={override.featureId}><strong>{override.feature.name}: {override.enabled ? "Enabled" : "Disabled"}</strong><span>{override.reason} · {override.expiresAt ? `expires ${override.expiresAt.toLocaleDateString("en-IN")}` : "no expiry"}</span></div>) : <p className="sa-muted-copy">No institution-specific overrides are configured.</p>}<form className="sa-form-grid sa-compact-form" action={setInstitutionFeatureOverride}><input type="hidden" name="institutionId" value={institution.id} /><label>Feature<select name="featureId" required defaultValue=""><option value="" disabled>Select feature</option>{features.map((feature) => <option value={feature.id} key={feature.id}>{feature.name}</option>)}</select></label><label>Override<select name="enabled"><option value="true">Enable</option><option value="false">Disable</option></select></label><label>Expiry (optional)<input name="expiresAt" type="date" /></label><label>Reason<input name="reason" minLength={5} maxLength={500} required /></label><button className="sa-button sa-button-secondary">Save override</button></form></section></div></div>;
}
