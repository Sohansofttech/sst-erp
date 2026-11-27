"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getInstitutionHistory, manageInstitutionSubscription, reconcileLegacyInstitution, saveSubscriptionPlan } from "@/app/subscriptions/actions";
import type { ManagedPlan, PlanCatalogue } from "@/lib/subscriptions/management-types";
import type { PortalInstitutionRecord } from "@/lib/subscriptions/portal-data";
import { describeInstitutionType, isPlanCompatible } from "@/lib/institution-type-config";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
}

function Dialog({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  return <div className="sc-modal-backdrop" onMouseDown={close}><section className="sc-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
    <header className="sc-modal-header"><h3>{title}</h3><button type="button" className="sc-modal-close" aria-label="Close" onClick={close}>×</button></header>{children}
  </section></div>;
}

export function PlanManagement({ catalogue, readOnly = false }: { catalogue: PlanCatalogue; readOnly?: boolean }) {
  const [editing, setEditing] = useState<ManagedPlan | "new" | null>(null);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  async function save(form: FormData) {
    const numberOrNull = (key: string) => form.get(key) ? Number(form.get(key)) : null;
    const previousFeatures = editing && editing !== "new" ? editing.features : [];
    const selectedFeatures = catalogue.features.filter((feature) =>
      form.has(`feature-${feature.id}`) || previousFeatures.some((entry) => entry.featureId === feature.id),
    ).map((feature) => ({
      featureId: feature.id, enabled: form.has(`feature-${feature.id}`), limitValue: numberOrNull(`limit-${feature.id}`),
    }));
    const result = await saveSubscriptionPlan({
      ...(editing && editing !== "new" ? { id: editing.id } : {}),
      code: String(form.get("code")), name: String(form.get("name")), description: String(form.get("description")),
      price: Number(form.get("price")), currency: String(form.get("currency")), billingCycle: String(form.get("billingCycle")),
      customCycleDays: numberOrNull("customCycleDays"),
      studentLimit: numberOrNull("studentLimit"), storageLimitMb: numberOrNull("storageLimitMb"),
      isActive: form.has("isActive"), features: selectedFeatures,
      institutionTypes: ["COLLEGE", "SCHOOL", "ACADEMY"].filter((type) =>
        form.has(`institutionType-${type}`),
      ) as Array<"COLLEGE" | "SCHOOL" | "ACADEMY">,
    });
    setMessage(result.message);
    if (result.success) { setEditing(null); router.refresh(); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => { await save(data); });
  }
  const plan = editing && editing !== "new" ? editing : null;
  return <div className="sc-page">
    <div className="sc-page-heading"><div><div className="sc-eyebrow">Plan catalogue</div><h2>{readOnly ? "Available plans" : "Subscription plans"}</h2><p>{readOnly ? "Review the available platform subscription plans." : "Manage the platform plan catalogue and assign plans to institutions."}</p></div>{!readOnly && <button className="sc-button sc-button-primary" onClick={() => { setMessage(""); setEditing("new"); }} type="button">Create plan</button>}</div>
    {!catalogue.studentLimitAvailable && <p className="sc-data-notice">Student limits are unavailable until the existing student capacity migration is applied.</p>}
    {message && <p role="status" className="sc-data-notice">{message}</p>}
    {catalogue.plans.length ? <div className="sc-plan-grid">{catalogue.plans.map((item) => <article className="sc-plan-card" key={item.id}>
      <div className="sc-plan-heading"><div><h3>{item.name}</h3><p>{item.code} · {item.billingCycle === "CUSTOM" ? `${item.customCycleDays} days` : item.billingCycle.toLowerCase()}</p></div><span className="sc-status">{item.isActive ? "Published" : "Unpublished"}</span></div>
      <p className="sc-plan-description">{item.description || "No description"}</p><div className="sc-plan-price">{money(item.price, item.currency)}</div>
      <div className="sc-plan-limit"><span>Student limit</span><strong>{catalogue.studentLimitAvailable ? item.studentLimit ?? "Unlimited" : "Unavailable"}</strong></div>
      <div className="sc-plan-limit"><span>Storage MB</span><strong>{item.storageLimitMb ?? "Unlimited"}</strong></div>
      <ul className="sc-feature-list">{item.features.filter((feature) => feature.enabled).map((feature) => <li key={feature.featureId}>{catalogue.features.find((entry) => entry.id === feature.featureId)?.name ?? "Unknown feature"}{feature.limitValue !== null ? ` (${feature.limitValue})` : ""}</li>)}</ul>
      {!readOnly && <div className="sc-plan-actions"><button className="sc-button" type="button" onClick={() => { setMessage(""); setEditing(item); }}>Edit / enable / disable</button><a className="sc-button" href={`/subscriptions/institutions?assignPlan=${encodeURIComponent(item.id)}`}>Assign to institution</a></div>}
    </article>)}</div> : <section className="sc-card">No subscription plans exist.</section>}
    {editing && <Dialog title={plan ? "Edit subscription plan" : "Create subscription plan"} close={() => setEditing(null)}>
      <form onSubmit={submit}><div className="sc-modal-body"><div className="sc-form-grid">
        <label className="sc-form-field">Code<input className="sc-input" name="code" required pattern="[A-Za-z0-9_-]{2,40}" defaultValue={plan?.code} /></label>
        <label className="sc-form-field">Name<input className="sc-input" name="name" required minLength={2} maxLength={120} defaultValue={plan?.name} /></label>
        <label className="sc-form-field sc-form-field-full">Description<textarea className="sc-input" name="description" maxLength={500} defaultValue={plan?.description ?? ""} /></label>
        <label className="sc-form-field">Price<input className="sc-input" name="price" type="number" min="0" max="100000000" step="0.01" required defaultValue={plan?.price ?? 0} /></label>
        <label className="sc-form-field">Currency<input className="sc-input" name="currency" required pattern="[A-Za-z]{3}" defaultValue={plan?.currency ?? "INR"} /></label>
        <label className="sc-form-field">Billing cycle<select className="sc-select" name="billingCycle" defaultValue={plan?.billingCycle ?? "MONTHLY"}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="YEARLY">Yearly</option><option value="CUSTOM">Custom</option></select></label>
        <label className="sc-form-field">Custom duration (days)<input className="sc-input" name="customCycleDays" type="number" min="1" max="3650" defaultValue={plan?.customCycleDays ?? ""} /></label>
        <label className="sc-form-field">Student limit<input className="sc-input" name="studentLimit" type="number" min="1" max="100000000" disabled={!catalogue.studentLimitAvailable} defaultValue={plan?.studentLimit ?? ""} /></label>
        <label className="sc-form-field">Storage limit (MB)<input className="sc-input" name="storageLimitMb" type="number" min="1" max="100000000" defaultValue={plan?.storageLimitMb ?? ""} /></label>
        <fieldset className="sc-form-field sc-form-field-full"><legend>Compatible institution types</legend><p className="sc-form-help">No selection applies to all institution types.</p>{["COLLEGE", "SCHOOL", "ACADEMY"].map((type) => <label className="sc-check-row" key={type}><input name={`institutionType-${type}`} type="checkbox" defaultChecked={plan?.institutionTypes.includes(type as "COLLEGE" | "SCHOOL" | "ACADEMY") ?? false} />{type === "SCHOOL" ? "School / Montessori" : type === "ACADEMY" ? "Academy" : "College"}</label>)}</fieldset>
        <label className="sc-check-row"><input name="isActive" type="checkbox" defaultChecked={plan?.isActive ?? true} /> Published (visible to institutions)</label>
        <fieldset className="sc-form-field sc-form-field-full"><legend>Platform features and optional limits</legend>
          {catalogue.features.length ? catalogue.features.map((feature) => { const selected = plan?.features.find((entry) => entry.featureId === feature.id); return <div className="sc-settings-row" key={feature.id}><label><input name={`feature-${feature.id}`} type="checkbox" defaultChecked={selected?.enabled ?? false} /> {feature.name} ({feature.code}){!feature.isAvailable && " · unavailable"}</label><input aria-label={`${feature.name} limit`} className="sc-input" name={`limit-${feature.id}`} type="number" min="0" max="100000000" placeholder="Unlimited" defaultValue={selected?.limitValue ?? ""} /></div>; }) : <p>No platform features configured.</p>}
        </fieldset>
      </div>{plan && plan.subscriptionCount > 0 && <p className="sc-data-notice">Existing subscriptions retain their terms. Create a new plan to change price, duration or limits.</p>}{message && <p role="alert">{message}</p>}</div>
      <footer className="sc-modal-footer"><button className="sc-button" type="button" onClick={() => setEditing(null)}>Cancel</button><button className="sc-button sc-button-primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save plan"}</button></footer></form>
    </Dialog>}
  </div>;
}

export function InstitutionActions({ institution, catalogue }: { institution: PortalInstitutionRecord; catalogue: PlanCatalogue }) {
  const [mode, setMode] = useState<"assign" | "extend" | "history" | null>(null);
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("30");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getInstitutionHistory>> | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(action: "assign" | "renew" | "extend" | "activate" | "suspend" | "cancel", subscriptionId = institution.subscriptionId) {
    if (["cancel", "suspend", "renew"].includes(action) && !window.confirm(`${action[0].toUpperCase() + action.slice(1)} the subscription for ${institution.institution}?`)) return;
    if (action === "assign" && institution.subscriptionId && catalogue.plans.find((plan) => plan.id === planId)?.price === 0
      && !window.confirm("Assigning this free plan cancels the institution's existing current subscription immediately. Continue?")) return;
    setMessage("");
    startTransition(async () => {
      const result = await manageInstitutionSubscription({ institutionId: institution.id, subscriptionId, action,
        ...(action === "assign" ? { planId, startsAt: startsAt || null, endsAt: endsAt || null } : {}),
        ...(action === "extend" ? { days: Number(days) } : {}) });
      setMessage(result.message);
      if (result.success) { setMode(null); router.refresh(); }
    });
  }
  function showHistory() {
    setMode("history"); setHistory(null); setMessage("");
    startTransition(async () => {
      try { setHistory(await getInstitutionHistory(institution.id)); }
      catch (error) { console.error("Could not load subscription history", error); setMessage("Could not load history. Please try again."); }
    });
  }
  const selected = catalogue.plans.find((plan) => plan.id === planId);
  return <div>
    <details><summary className="sc-button">Actions</summary><div className="sc-plan-actions">
      <button className="sc-button" disabled={pending || institution.archived} type="button" onClick={() => { setMessage(""); setMode("assign"); }}>Assign / change plan</button>
      {institution.subscriptionId && <><button className="sc-button" disabled={pending} type="button" onClick={() => run("renew")}>Renew</button><button className="sc-button" disabled={pending} type="button" onClick={() => { setMessage(""); setMode("extend"); }}>Extend</button><button className="sc-button" disabled={pending} type="button" onClick={() => run("activate")}>Activate</button><button className="sc-button" disabled={pending} type="button" onClick={() => run("suspend")}>Suspend</button><button className="sc-button" disabled={pending} type="button" onClick={() => run("cancel")}>Cancel subscription</button></>}
      <button className="sc-button" type="button" onClick={showHistory}>Subscription, payments & invoices</button>
    </div></details>
    {message && !mode && <p role="status" className="sc-data-notice">{message}</p>}
    {mode === "assign" && <Dialog title={`Assign plan · ${institution.institution}`} close={() => setMode(null)}><div className="sc-modal-body">
      <label className="sc-form-field">Available plans<select className="sc-select" value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">Select a plan</option>{catalogue.plans.filter((plan) => plan.isActive && isPlanCompatible(plan.institutionTypes, institution.institutionType)).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.price, plan.currency)} · {plan.billingCycle === "CUSTOM" ? `${plan.customCycleDays} days` : plan.billingCycle.toLowerCase()}</option>)}</select></label>
      <div className="sc-form-grid"><label className="sc-form-field">Start date<input className="sc-input" type="date" value={startsAt} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="sc-form-field">Expiry date (free plans)<input className="sc-input" type="date" value={endsAt} min={startsAt || new Date().toISOString().slice(0, 10)} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
      {selected && <p>{selected.description || "No description"}<br />Features: {selected.features.filter((feature) => feature.enabled).map((feature) => `${catalogue.features.find((item) => item.id === feature.featureId)?.name ?? "Unknown feature"}${feature.limitValue === null ? "" : ` (${feature.limitValue})`}`).join(", ") || "None configured"}<br />Students: {catalogue.studentLimitAvailable ? selected.studentLimit ?? "Unlimited" : "Unavailable"} · Storage (MB): {selected.storageLimitMb ?? "Unlimited"}</p>}
      <p className="sc-data-notice">Paid plans remain pending until verified payment. A free plan replaces the current subscription immediately after confirmation.</p>{message && <p role="alert">{message}</p>}
    </div><footer className="sc-modal-footer"><button className="sc-button sc-button-primary" disabled={pending || !planId} onClick={() => run("assign")} type="button">Assign plan</button></footer></Dialog>}
    {mode === "extend" && <Dialog title={`Extend subscription · ${institution.institution}`} close={() => setMode(null)}><div className="sc-modal-body"><label className="sc-form-field">Additional days (complimentary)<input className="sc-input" type="number" min="1" max="3650" value={days} onChange={(event) => setDays(event.target.value)} /></label><p>No payment is created by this action.</p>{message && <p role="alert">{message}</p>}</div><footer className="sc-modal-footer"><button className="sc-button sc-button-primary" disabled={pending} onClick={() => run("extend")} type="button">Extend validity</button></footer></Dialog>}
    {mode === "history" && <Dialog title={`History · ${institution.institution}`} close={() => setMode(null)}><div className="sc-modal-body">
      {message && <p role="alert">{message}</p>}{pending && <p>Loading…</p>}
      {history && <><h3>Subscription history</h3>{history.subscriptions.length ? history.subscriptions.map((sub) => <div key={sub.id}><p><strong>{sub.plan.name}</strong> · {sub.status} · {sub.startsAt.slice(0, 10)} to {sub.endsAt?.slice(0, 10) ?? "No expiry"}</p>{sub.status === "PAST_DUE" && <button className="sc-button" type="button" disabled={pending} onClick={() => run("cancel", sub.id)}>Cancel pending assignment</button>}{sub.events.map((event) => <p key={event.id}>{event.createdAt.slice(0, 10)} · {event.action}</p>)}</div>) : <p>No subscription records.</p>}
      <h3>Invoices and payment history</h3>{!history.documentsAvailable && <p>Printable invoices require the existing billing migration.</p>}{history.invoices.length ? history.invoices.map((invoice) => <div key={invoice.id}><p><strong>{history.documentsAvailable ? <Link href={`/super-admin/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link> : invoice.invoiceNumber}</strong> · {invoice.status} · {money(invoice.total, invoice.currency)}</p>{invoice.payments.map((payment) => <p key={payment.id}>{payment.status} · {money(payment.amount, payment.currency)} · {payment.paidAt?.slice(0, 10) ?? payment.createdAt.slice(0, 10)} · {payment.providerReference ?? "No receipt reference"}</p>)}</div>) : <p>No invoices or payment records.</p>}</>}
    </div></Dialog>}
  </div>;
}

export function InstitutionAssignment({
  institutions,
  catalogue,
  initialPlanId = "",
}: {
  institutions: PortalInstitutionRecord[];
  catalogue: PlanCatalogue;
  initialPlanId?: string;
}) {
  const [open, setOpen] = useState(Boolean(initialPlanId));
  const [institutionId, setInstitutionId] = useState("");
  const [planId, setPlanId] = useState(initialPlanId);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const institution = institutions.find((item) => item.id === institutionId);
  const plan = catalogue.plans.find((item) => item.id === planId);

  function assign() {
    setMessage("");
    startTransition(async () => {
      const result = await manageInstitutionSubscription({
        institutionId,
        subscriptionId: institution?.subscriptionId ?? null,
        action: "assign",
        planId,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
      });
      setMessage(result.message);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return <>
    <button className="sc-button sc-button-primary" disabled={!institutions.length} onClick={() => { setMessage(""); setOpen(true); }} type="button">Assign to Institution</button>
    {open && <Dialog title="Assign subscription to institution" close={() => setOpen(false)}>
      <div className="sc-modal-body">
        <div className="sc-form-grid">
          <label className="sc-form-field">Institution<select className="sc-select" value={institutionId} onChange={(event) => {
            const next = institutions.find((item) => item.id === event.target.value);
            const chosen = catalogue.plans.find((item) => item.id === planId);
            setInstitutionId(event.target.value);
            if (chosen && next && !isPlanCompatible(chosen.institutionTypes, next.institutionType)) setPlanId("");
          }}><option value="">Select institution</option>{institutions.map((item) => <option value={item.id} key={item.id}>{item.institution} · {item.code} · {describeInstitutionType(item.institutionType)}</option>)}</select></label>
          <label className="sc-form-field">Published plan<select className="sc-select" value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">Select plan</option>{catalogue.plans.filter((item) => item.isActive && (!institution || isPlanCompatible(item.institutionTypes, institution.institutionType))).map((item) => <option value={item.id} key={item.id}>{item.name} · {money(item.price, item.currency)}</option>)}</select></label>
          <label className="sc-form-field">Start date<input className="sc-input" type="date" min={new Date().toISOString().slice(0, 10)} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
          <label className="sc-form-field">Expiry date (free plans)<input className="sc-input" type="date" min={startsAt || new Date().toISOString().slice(0, 10)} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        </div>
        {institution && plan && <div className="sc-card"><h4>Assignment summary</h4><dl className="sc-detail-grid">
          <div><dt>Institution</dt><dd>{institution.institution} ({describeInstitutionType(institution.institutionType)})</dd></div><div><dt>Plan</dt><dd>{plan.name}</dd></div>
          <div><dt>Price</dt><dd>{money(plan.price, plan.currency)}</dd></div><div><dt>Duration</dt><dd>{plan.billingCycle === "CUSTOM" ? `${plan.customCycleDays} days` : plan.billingCycle.toLowerCase()}</dd></div>
          <div><dt>Students</dt><dd>{catalogue.studentLimitAvailable ? plan.studentLimit ?? "Unlimited" : "Unavailable"}</dd></div>
          <div><dt>Storage</dt><dd>{plan.storageLimitMb === null ? "Unlimited" : `${plan.storageLimitMb} MB`}</dd></div>
          <div><dt>Status after save</dt><dd>{plan.price === 0 ? "Active" : "Pending verified payment"}</dd></div>
        </dl></div>}
        <p className="sc-data-notice">Paid plans remain pending until Razorpay payment verification succeeds. The institution administrator receives a database-backed notification in the same transaction.</p>
        {message && <p role="alert">{message}</p>}
      </div>
      <footer className="sc-modal-footer"><button className="sc-button" onClick={() => setOpen(false)} type="button">Cancel</button><button className="sc-button sc-button-primary" disabled={pending || !institutionId || !planId} onClick={assign} type="button">{pending ? "Assigning…" : "Assign plan"}</button></footer>
    </Dialog>}
  </>;
}

export function LegacyReconciliationAction({ institution }: { institution: PortalInstitutionRecord }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function reconcile() {
    if (!window.confirm(`Link "${institution.institution}" to platform billing using its existing ERP institution ID?`)) return;
    startTransition(async () => {
      const result = await reconcileLegacyInstitution({ institutionId: institution.id });
      setMessage(result.message);
      if (result.success) router.refresh();
    });
  }
  return <div><button className="sc-button" disabled={pending} onClick={reconcile} type="button">{pending ? "Linking…" : "Link billing record"}</button>{message && <small role={message.includes("linked") ? "status" : "alert"}>{message}</small>}</div>;
}
