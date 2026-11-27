"use client";

import { useActionState } from "react";
import { provisionAdminForInstitution, type InstitutionFormState } from "@/app/super-admin/(protected)/institutions/actions";

const initial: InstitutionFormState = { error: null, success: null };

export function ProvisionAdminForm({ institutionId, name, email }: { institutionId: string; name: string; email: string }) {
  const [state, action, pending] = useActionState(provisionAdminForInstitution, initial);
  return <form className="sa-form-grid sa-compact-form" style={{ marginTop: "1rem", borderTop: "1px solid var(--sa-border)", paddingTop: "0.75rem" }} action={action}>
    <input type="hidden" name="institutionId" value={institutionId} />
    <label>Admin name<input name="adminName" defaultValue={name} /></label>
    <label>Admin email<input name="adminEmail" type="email" defaultValue={email} placeholder="admin@domain.edu" required /></label>
    <label>Admin phone<input name="adminPhone" maxLength={40} /></label>
    <label>Initial password (new account only)<input name="adminPassword" type="password" minLength={6} /></label>
    <p className="sa-form-help">Retrying preserves an existing administrator password. If this is a new account and the field is blank, a random temporary password is created; the administrator should use the invitation to set a personal password.</p>
    {state.error && <p className="sa-form-message sa-form-error" role="alert">{state.error}</p>}
    {state.success && <p className="sa-form-message sa-form-success" role="status">{state.success}</p>}
    <button className="sa-button sa-button-secondary" disabled={pending}>{pending ? "Sending…" : "Retry provisioning / send invitation"}</button>
  </form>;
}
