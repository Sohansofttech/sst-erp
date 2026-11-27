"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, KeyRound, Copy, Check, ArrowRight } from "lucide-react";

export default function SuperAdminMfaSetupPage() {
  const router = useRouter();
  const [setupData, setSetupData] = useState<{
    otpauthUri: string;
    secretBase32: string;
    backupCodes: string[];
  } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/super-admin/mfa/setup")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setSetupData(json.data);
        } else {
          setError(json.error || "Failed to load MFA setup parameters.");
        }
      })
      .catch((err) => setError(err.message || "Failed to connect to MFA service."));
  }, []);

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/mfa/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ totpCode: totpCode.trim() }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || "Failed to enroll. Please verify your code.");
          return;
        }

        router.push("/super-admin");
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Network error. Please try again.");
      }
    });
  };

  const handleCopyBackupCodes = () => {
    if (!setupData?.backupCodes) return;
    navigator.clipboard.writeText(setupData.backupCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center p-4 font-sans">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-6 sm:p-8">
        <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] border border-[#3B82F6]/30 flex items-center justify-center mx-auto mb-4 text-[#2563EB] shadow-sm">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h1 className="text-xl font-extrabold text-[#1E293B] text-center tracking-tight">
          Super Admin Two-Factor Setup
        </h1>

        <p className="text-xs sm:text-sm text-[#64748B] text-center mt-2 leading-relaxed">
          Configure an authenticator application (Google Authenticator, Authy, or 1Password) to protect your Super Admin access.
        </p>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            {error}
          </div>
        )}

        {setupData ? (
          <div className="mt-6 space-y-6">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                1. Authenticator Secret Key
              </span>
              <p className="font-mono text-sm font-extrabold text-slate-900 select-all break-all">
                {setupData.secretBase32}
              </p>
              <p className="text-[11px] text-slate-500">
                Add an account manually in your authenticator app using this base32 secret.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  2. Emergency Backup Recovery Codes
                </span>
                <button
                  type="button"
                  onClick={handleCopyBackupCodes}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  {copiedCodes ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCodes ? "Copied" : "Copy All"}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200">
                {setupData.backupCodes.map((code, idx) => (
                  <div key={idx} className="p-1 text-center bg-slate-50 rounded">
                    {code}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                Save these backup codes securely. Each code can be used exactly once if you lose access to your authenticator device.
              </p>
            </div>

            <form onSubmit={handleEnroll} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  3. Verify Code from Authenticator
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

              <button
                type="submit"
                disabled={isPending || totpCode.length !== 6}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#123B5A] text-white text-xs font-bold hover:bg-[#16466C] disabled:opacity-50 transition-all shadow-sm cursor-pointer"
              >
                {isPending ? "Confirming..." : "Complete MFA Enrollment"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          !error && (
            <div className="py-12 text-center text-slate-500 text-xs">
              Loading MFA configuration...
            </div>
          )
        )}
      </div>
    </div>
  );
}
