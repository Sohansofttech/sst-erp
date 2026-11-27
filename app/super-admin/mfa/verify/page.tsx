"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, KeyRound, AlertTriangle, ArrowRight } from "lucide-react";

export default function SuperAdminMfaVerifyPage() {
  const router = useRouter();
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = useBackupCode
      ? { backupCode: backupCode.trim() }
      : { totpCode: totpCode.trim() };

    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/mfa/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || "Verification failed. Please check your code.");
          return;
        }

        router.push(data.redirectTo || "/super-admin");
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Network error. Please try again.");
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-6 sm:p-8">
        <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] border border-[#3B82F6]/30 flex items-center justify-center mx-auto mb-4 text-[#2563EB] shadow-sm">
          {useBackupCode ? <KeyRound className="w-7 h-7" /> : <ShieldCheck className="w-7 h-7" />}
        </div>

        <h1 className="text-xl font-extrabold text-[#1E293B] text-center tracking-tight">
          {useBackupCode ? "Emergency Recovery Code" : "Two-Factor Verification"}
        </h1>

        <p className="text-xs sm:text-sm text-[#64748B] text-center mt-2 leading-relaxed">
          {useBackupCode
            ? "Enter one of your 10-character backup recovery codes to access the platform."
            : "Enter the 6-digit verification code from your authenticator application."}
        </p>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          {!useBackupCode ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                6-Digit Security Code
              </label>
              <input
                type="text"
                maxLength={6}
                pattern="\d{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="123456"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-center text-xl font-mono tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Backup Recovery Code
              </label>
              <input
                type="text"
                maxLength={12}
                required
                placeholder="XXXX-XXXX"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-center text-base font-mono tracking-wider text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || (!useBackupCode && totpCode.length !== 6) || (useBackupCode && !backupCode)}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#123B5A] text-white text-xs font-bold hover:bg-[#16466C] disabled:opacity-50 transition-all shadow-sm cursor-pointer"
          >
            {isPending ? "Verifying..." : "Verify & Continue"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setError(null);
            }}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
          >
            {useBackupCode
              ? "Use Authenticator Application instead"
              : "Lost authenticator device? Use a backup recovery code"}
          </button>
        </div>
      </div>
    </div>
  );
}
