"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ActivateInstitutionAdminForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token] = useState(() => searchParams.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!token) {
      setError("Activation token is missing.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/institution/invitations/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || "Activation failed.");
        return;
      }
      setSuccess(data.message);
      window.setTimeout(() => router.replace("/admin/login"), 1200);
    } catch {
      setError("Activation failed due to a network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef1f5] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-[#e2e8f0] bg-white p-7 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f5a000]">SOHAN SOFT TECH ERP</p>
        <h1 className="mt-2 text-2xl font-bold text-[#1e293b]">Activate Institution Account</h1>
        <p className="mt-2 text-sm text-[#64748b]">Create a strong password to activate your administrator account.</p>
        <label className="mt-6 grid gap-2 text-sm font-semibold text-[#334155]">New password<input className="h-11 rounded-lg border border-[#cbd5e1] px-3" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label className="mt-4 grid gap-2 text-sm font-semibold text-[#334155]">Confirm password<input className="h-11 rounded-lg border border-[#cbd5e1] px-3" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</p>}
        <button type="submit" disabled={pending} className="mt-6 h-11 w-full rounded-lg bg-[#123b5a] px-4 font-semibold text-white disabled:opacity-60">{pending ? "Activating…" : "Activate account"}</button>
      </form>
    </main>
  );
}
