import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/super-admin/prisma";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import {
  archiveInstitution,
  revokeInstitutionInvitation,
  setInstitutionFeatureOverride,
  setPrimaryInstitution,
  updateInstitutionStatus,
  createInstitutionDivision,
  updateInstitutionDivisionStatus,
  setDefaultInstitutionDivision,
  archiveInstitutionDivision,
  openInstitutionSupportPortal,
} from "../actions";
import { getInstitutionPortalUrl } from "@/lib/super-admin/institution-portal";
import { CopyPortalUrlButton } from "@/components/super-admin/copy-portal-url";
import { ProvisionAdminForm } from "@/components/super-admin/provision-admin-form";
import { EditInstitutionForm } from "@/components/super-admin/edit-institution-form";
import { DestructiveActionDialog } from "@/components/super-admin/destructive-action-dialog";
import { connection } from "next/server";
import { describeInstitutionType } from "@/lib/institution-type-config";
import { assertSupportAccess, SUPPORT_READ } from "@/lib/security/support-access";

export const instant = false;

export default async function InstitutionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const actor = await requireSuperAdmin();
  const { id } = await params;
  // SAF-007: viewing an institution's details is institution-scoped READ.
  await assertSupportAccess({ actorId: actor.id, institutionId: id, requiredAction: SUPPORT_READ, developmentMode: actor.developmentMode });
  const institution = await prisma.platformInstitution.findUnique({ where: { id }, include: {
    invitations: { take: 10, orderBy: { createdAt: "desc" } },
    memberships: { take: 20, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, email: true, status: true } } } },
    subscriptions: { take: 10, orderBy: { createdAt: "desc" }, include: { plan: { select: { name: true, code: true } } } },
    usageMetrics: { take: 10, orderBy: { measuredAt: "desc" } },
    featureOverrides: { include: { feature: { select: { name: true, code: true } } } },
    auditLogs: { take: 10, orderBy: { createdAt: "desc" }, select: { id: true, action: true, createdAt: true, result: true } },
    domains: { where: { status: { not: "REMOVED" } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, domain: true, status: true } },
  } });
  if (!institution) notFound();
  const [featuresResult, primarySettingResult, divisionsResult] = await Promise.allSettled([
    prisma.platformFeature.findMany({ where: { isAvailable: true }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 200 }),
    prisma.platformSetting.findUnique({ where: { key: "primary_institution_id" } }),
    prisma.institutionDivision.findMany({
      where: { institutionId: id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  const secondaryWarnings: string[] = [];
  const features = featuresResult.status === "fulfilled" ? featuresResult.value : [];
  const primarySetting = primarySettingResult.status === "fulfilled" ? primarySettingResult.value : null;
  const divisions = divisionsResult.status === "fulfilled" ? divisionsResult.value : [];

  if (featuresResult.status === "rejected") {
    console.error(`[SuperAdmin] Failed to load institution ${id} feature options`, featuresResult.reason);
    secondaryWarnings.push("Feature options could not be loaded.");
  }
  if (primarySettingResult.status === "rejected") {
    console.error(`[SuperAdmin] Failed to load institution ${id} primary setting`, primarySettingResult.reason);
    secondaryWarnings.push("Default portal institution status could not be verified.");
  }
  if (divisionsResult.status === "rejected") {
    console.error(`[SuperAdmin] Failed to load institution ${id} divisions`, divisionsResult.reason);
    secondaryWarnings.push("Educational divisions could not be loaded.");
  }
  const isPrimary = primarySetting?.value === id;
  const editableInstitution = {
    id: institution.id,
    name: institution.name,
    code: institution.code,
    slug: institution.slug,
    type: institution.type,
    category: institution.category,
    email: institution.email,
    phone: institution.phone,
    address: institution.address,
    city: institution.city,
    state: institution.state,
    postalCode: institution.postalCode,
    country: institution.country,
    website: institution.website,
  };
  const portalUrl = getInstitutionPortalUrl({
    id: institution.id,
    name: institution.name,
    code: institution.code,
    slug: institution.slug,
    type: institution.type,
  });
  return <div className="sa-module-page"><Link href="/super-admin/institutions" className="sa-small-link">← Institution Management</Link><div className="sa-page-intro"><div><h2>{institution.name}</h2><p>{institution.code ?? institution.slug} · {describeInstitutionType(institution.type)}{institution.category ? ` · ${institution.category}` : ""} · registered {institution.createdAt.toLocaleDateString("en-IN")}</p></div><span className={`sa-status-badge sa-status-${institution.status.toLowerCase()}`}>{institution.status}</span></div>
    {institution.archivedAt && <p className="sa-form-message sa-warning-box">Archived on {institution.archivedAt.toLocaleDateString("en-IN")}.</p>}
    {secondaryWarnings.length > 0 && (
      <div className="sa-form-message sa-warning-box" role="alert">
        <strong>Some secondary details could not be loaded.</strong>
        <div>{secondaryWarnings.join(" ")}</div>
      </div>
    )}
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
        <form action={openInstitutionSupportPortal}>
          <input type="hidden" name="institutionId" value={institution.id} />
          <button type="submit" className="sa-button sa-button-secondary">Open Institution Portal</button>
        </form>
        <DestructiveActionDialog
          action={updateInstitutionStatus}
          buttonText={institution.status === "ACTIVE" ? "Suspend institution" : "Activate institution"}
          buttonClass="sa-button sa-button-secondary"
          dialogTitle={institution.status === "ACTIVE" ? "Suspend Institution" : "Activate Institution"}
          dialogDescription={
            institution.status === "ACTIVE"
              ? `Are you sure you want to suspend "${institution.name}"? Users belonging to this institution will immediately lose access to their portals until it is reactivated.`
              : `Are you sure you want to reactivate "${institution.name}"? This will restore portal access for users in this institution.`
          }
          confirmButtonText={institution.status === "ACTIVE" ? "Suspend Institution" : "Activate Institution"}
          isDestructive={institution.status === "ACTIVE"}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={institution.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
        </DestructiveActionDialog>
        <DestructiveActionDialog
          action={archiveInstitution}
          buttonText="Archive institution"
          buttonClass="sa-button sa-button-danger"
          dialogTitle="Archive Institution"
          dialogDescription={`Archiving "${institution.name}" is a critical operation. It will permanently disable portal access, suspend all subscriptions, and mark this tenant as archived.`}
          confirmButtonText="Archive Institution"
          confirmInputMatch={institution.name}
          confirmInputLabel={`Type the institution name "${institution.name}" to confirm archival:`}
          isDestructive={true}
        >
          <input type="hidden" name="id" value={id} />
        </DestructiveActionDialog>
      </div>
    )}
    <section className="sa-card sa-module-panel" style={{ marginTop: "1rem" }}>
      <h3 className="sa-section-title" style={{ marginTop: 0 }}>Institution Portal Access</h3>
      <div className="sa-module-grid">
        <div><strong>Institution name</strong><p>{institution.name}</p></div>
        <div><strong>Institution code</strong><p>{institution.code ?? "Not configured"}</p></div>
        <div><strong>Institution type</strong><p>{describeInstitutionType(institution.type)}</p></div>
        <div><strong>Domain/subdomain status</strong><p>{institution.domains.length ? institution.domains.map((domain) => `${domain.domain} — ${domain.status}`).join(", ") : "No domain configured"}</p></div>
      </div>
      <p className="sa-muted-copy" style={{ wordBreak: "break-all" }}>Current portal URL: {portalUrl}</p>
      <div className="sa-action-row">
        <form action={openInstitutionSupportPortal}>
          <input type="hidden" name="institutionId" value={institution.id} />
          <button type="submit" className="sa-button sa-button-primary">Open Institution Portal</button>
        </form>
        <CopyPortalUrlButton url={portalUrl} />
        <Link className="sa-button sa-button-secondary" href="/super-admin/domains">Manage Domain</Link>
      </div>
    </section>
    <h3 className="sa-section-title">Institution details</h3><EditInstitutionForm institution={editableInstitution} />
    <div className="sa-module-grid">
      <section className="sa-card sa-module-panel" style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <div>
            <h3 style={{ margin: 0 }}>Educational Divisions ({divisions.length})</h3>
            <p className="sa-muted-copy" style={{ margin: "0.25rem 0 0" }}>
              Schools, Colleges, and Academies configured under this institution.
            </p>
          </div>
        </div>

        {divisions.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            {divisions.map((div) => (
              <div
                key={div.id}
                className="sa-detail-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  background: "var(--sa-background, #f9fafb)",
                  borderRadius: "6px",
                  border: "1px solid var(--sa-border, #e5e7eb)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong>{div.name}</strong>
                    <span style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", borderRadius: "4px", background: "#e0e7ff", color: "#3730a3", fontWeight: 600 }}>
                      {div.code}
                    </span>
                    <span style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", borderRadius: "4px", background: "#f3f4f6", color: "#4b5563" }}>
                      {div.type}
                    </span>
                    {div.isDefault && (
                      <span style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", borderRadius: "4px", background: "#fef3c7", color: "#92400e", fontWeight: 600 }}>
                        ★ Default
                      </span>
                    )}
                    <span className={`sa-status-badge sa-status-${div.status.toLowerCase()}`}>
                      {div.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
                    /{div.slug}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {!div.isDefault && div.status === "ACTIVE" && (
                    <form action={setDefaultInstitutionDivision}>
                      <input type="hidden" name="institutionId" value={institution.id} />
                      <input type="hidden" name="divisionId" value={div.id} />
                      <button type="submit" className="sa-button sa-button-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}>
                        Set Default
                      </button>
                    </form>
                  )}
                  <DestructiveActionDialog
                    action={updateInstitutionDivisionStatus}
                    buttonText={div.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    buttonClass="sa-button sa-button-secondary"
                    buttonStyle={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                    dialogTitle={div.status === "ACTIVE" ? "Deactivate Division" : "Activate Division"}
                    dialogDescription={
                      div.status === "ACTIVE"
                        ? `Are you sure you want to deactivate the "${div.name}" division? Students and staff linked to this division will not be able to access division-specific resources.`
                        : `Are you sure you want to activate the "${div.name}" division?`
                    }
                    confirmButtonText={div.status === "ACTIVE" ? "Deactivate Division" : "Activate Division"}
                    isDestructive={div.status === "ACTIVE"}
                  >
                    <input type="hidden" name="institutionId" value={institution.id} />
                    <input type="hidden" name="divisionId" value={div.id} />
                    <input type="hidden" name="status" value={div.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                  </DestructiveActionDialog>
                  {div.status !== "ARCHIVED" && (
                    <DestructiveActionDialog
                      action={archiveInstitutionDivision}
                      buttonText="Archive"
                      buttonClass="sa-button sa-button-danger"
                      buttonStyle={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      dialogTitle="Archive Educational Division"
                      dialogDescription={`Archiving division "${div.name}" will make it inactive and hide it from active selections. Associated class records will be retained.`}
                      confirmButtonText="Archive Division"
                      confirmInputMatch={div.name}
                      confirmInputLabel={`Type the division name "${div.name}" to confirm archival:`}
                      isDestructive={true}
                    >
                      <input type="hidden" name="institutionId" value={institution.id} />
                      <input type="hidden" name="divisionId" value={div.id} />
                    </DestructiveActionDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="sa-muted-copy" style={{ marginBottom: "1rem" }}>
            No educational divisions registered. Add a division below.
          </p>
        )}

        <form
          className="sa-form-grid sa-compact-form"
          style={{ marginTop: "1rem", borderTop: "1px solid var(--sa-border, #e5e7eb)", paddingTop: "0.75rem" }}
          action={createInstitutionDivision}
        >
          <input type="hidden" name="institutionId" value={institution.id} />
          <label>
            Division Name
            <input name="name" placeholder="e.g. High School Wing, Engineering College" required />
          </label>
          <label>
            Division Code (optional)
            <input name="code" placeholder="e.g. SCH-01, ENG-01" />
          </label>
          <label>
            Division Type
            <select name="type" required defaultValue="COLLEGE">
              <option value="MONTESSORI">Montessori (Early Childhood)</option>
              <option value="SCHOOL">School (K-10)</option>
              <option value="HIGHER_SECONDARY">Higher Secondary (+1/+2)</option>
              <option value="COLLEGE">College (Higher Education)</option>
              <option value="ACADEMY">Academy (Vocational)</option>
            </select>
          </label>
          <label>
            Brand Accent Color (Hex)
            <input name="brandColor" defaultValue="#2563eb" placeholder="#2563eb" />
          </label>
          <label>
            Description (optional)
            <input name="description" placeholder="Brief division overview" />
          </label>
          <label>
            Set as Default
            <select name="isDefault" defaultValue={divisions.length === 0 ? "true" : "false"}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
          <div style={{ gridColumn: "1 / -1", marginTop: "0.5rem" }}>
            <button className="sa-button sa-button-primary">Add Educational Division</button>
          </div>
        </form>
      </section>
      <section className="sa-card sa-module-panel"><h3>Institution administrators & invitations</h3><div className="sa-detail-row"><strong>Provisioning status</strong><span>{institution.provisioningStatus}</span></div>{institution.memberships.length ? institution.memberships.map((membership) => <div className="sa-detail-row" key={membership.id}><strong>{membership.user.name}</strong><span>{membership.user.email} · {membership.status}</span></div>) : <p className="sa-muted-copy">No members are associated with this institution.</p>}{institution.invitations.map((invitation) => <div className="sa-detail-row" key={invitation.id}><strong>{invitation.email}</strong><span>{invitation.status} · expires {invitation.expiresAt.toLocaleString("en-IN")} {invitation.sentAt ? `· sent ${invitation.sentAt.toLocaleString("en-IN")}` : ""}</span></div>)}<ProvisionAdminForm institutionId={institution.id} name={institution.memberships.find((membership) => membership.user.id === institution.primaryAdminUserId)?.user.name || `${institution.name} Administrator`} email={institution.invitations[0]?.email || institution.email || ""} /><form action={revokeInstitutionInvitation} style={{ marginTop: ".75rem" }}><input type="hidden" name="institutionId" value={institution.id} /><button className="sa-button sa-button-danger">Revoke active invitation</button></form></section>
    <section className="sa-card sa-module-panel"><h3>Subscriptions</h3>{institution.subscriptions.length ? institution.subscriptions.map((subscription) => <div className="sa-detail-row" key={subscription.id}><strong>{subscription.plan.name}</strong><span>{subscription.status} · started {subscription.startsAt.toLocaleDateString("en-IN")}</span></div>) : <p className="sa-muted-copy">No subscription records are available.</p>}</section>
    <section className="sa-card sa-module-panel"><h3>Recorded usage</h3>{institution.usageMetrics.length ? institution.usageMetrics.map((metric) => <div className="sa-detail-row" key={metric.id}><strong>{metric.metric}: {metric.value.toString()} {metric.unit}</strong><span>Measured {metric.measuredAt.toLocaleString("en-IN")} · {metric.source}</span></div>) : <p className="sa-muted-copy">No usage measurements have been recorded.</p>}</section>
    <section className="sa-card sa-module-panel"><h3>Institution activity</h3>{institution.auditLogs.length ? institution.auditLogs.map((entry) => <div className="sa-detail-row" key={entry.id}><strong>{entry.action}</strong><span>{entry.result ?? "Recorded"} · {entry.createdAt.toLocaleString("en-IN")}</span></div>) : <p className="sa-muted-copy">No activity has been recorded.</p>}</section>
    <section className="sa-card sa-module-panel"><h3>Institution feature overrides</h3>{institution.featureOverrides.length ? institution.featureOverrides.map((override) => <div className="sa-detail-row" key={override.featureId}><strong>{override.feature.name}: {override.enabled ? "Enabled" : "Disabled"}</strong><span>{override.reason} · {override.expiresAt ? `expires ${override.expiresAt.toLocaleDateString("en-IN")}` : "no expiry"}</span></div>) : <p className="sa-muted-copy">No institution-specific overrides are configured.</p>}<form className="sa-form-grid sa-compact-form" action={setInstitutionFeatureOverride}><input type="hidden" name="institutionId" value={institution.id} /><label>Feature<select name="featureId" required defaultValue=""><option value="" disabled>Select feature</option>{features.map((feature) => <option value={feature.id} key={feature.id}>{feature.name}</option>)}</select></label><label>Override<select name="enabled"><option value="true">Enable</option><option value="false">Disable</option></select></label><label>Expiry (optional)<input name="expiresAt" type="date" /></label><label>Reason<input name="reason" minLength={5} maxLength={500} required /></label><button className="sa-button sa-button-secondary">Save override</button></form></section></div></div>;
}
