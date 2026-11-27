"use client";

import { useActionState } from "react";
import type { DomainActionState } from "@/app/super-admin/(protected)/[section]/actions";
import { verifyDomain } from "@/app/super-admin/(protected)/[section]/actions";

const initialState: DomainActionState = { ok: false, message: "" };

export function DomainVerificationAction({ id }: { id: string }) {
  const [state, action, pending] = useActionState(verifyDomain, initialState);

  return (
    <div className="sa-row-action-form">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <button className="sa-small-link" disabled={pending}>
          {pending ? "Checking DNS…" : "Verify DNS"}
        </button>
      </form>
      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`sa-form-message ${state.ok ? "sa-success-box" : "sa-form-error"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
