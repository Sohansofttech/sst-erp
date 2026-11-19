"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, CheckCircle2, AlertCircle, ArrowRight, Lock } from "lucide-react";
import Link from "next/link";

function SetupPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userInfo, setUserInfo] = useState<{ email: string; name: string; institutionName?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Setup token is missing. Please use the link provided in your onboarding email.");
      setLoading(false);
      return;
    }

    fetch(`/api/auth/setup-password?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUserInfo({ email: data.email, name: data.name, institutionName: data.institutionName });
        } else {
          setError(data.error || "Invalid or expired setup token.");
        }
      })
      .catch(() => {
        setError("Network error while validating setup link.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          if (data.role === "ADMIN" || data.role === "SUPER_ADMIN") {
            router.push("/admin");
          } else if (data.role === "TEACHER") {
            const institutionSlug = (data.institutionSlug || "").trim();
            if (institutionSlug) {
              router.push(`/campus/${institutionSlug}/teacher`);
            } else {
              router.push("/login");
            }
          } else {
            router.push("/dashboard");
          }
        }, 1500);
      } else {
        setError(data.error || "Failed to set up password.");
      }
    } catch {
      setError("An unexpected network error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#123B5A] text-white shadow-md mb-4">
          <KeyRound className="w-6 h-6 text-[#F5A000]" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">
          Set Up Your Account Password
        </h2>
        <p className="mt-1 text-sm text-[#64748B]">
          {userInfo?.institutionName ? `${userInfo.institutionName} • Secure Credential Onboarding` : "SST-ERP Secure Credential Onboarding"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border border-[#E2E8F0] sm:rounded-2xl sm:px-10">
          {loading ? (
            <div className="py-8 text-center text-sm text-[#64748B]">
              Verifying your secure invitation link...
            </div>
          ) : success ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-[#16A34A] mx-auto mb-3" />
              <h3 className="text-lg font-bold text-[#0F172A]">Password Configured!</h3>
              <p className="text-sm text-[#64748B] mt-1">
                Your credentials have been securely activated. Redirecting you to your portal...
              </p>
            </div>
          ) : error && !userInfo ? (
            <div className="text-center py-6">
              <AlertCircle className="w-12 h-12 text-[#DC2626] mx-auto mb-3" />
              <h3 className="text-base font-bold text-[#0F172A]">Invalid or Expired Link</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{error}</p>
              <div className="mt-6">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#123B5A] hover:underline"
                >
                  Return to Portal Login &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {userInfo && (
                <div className="bg-[#F1F5F9] rounded-lg p-3 text-xs text-[#334155] border border-[#E2E8F0]">
                  <span className="font-semibold block text-[#0F172A]">Account Member:</span>
                  <span>{userInfo.name} ({userInfo.email})</span>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] p-3 text-xs text-[#B91C1C] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#123B5A] focus:border-transparent transition"
                  />
                  <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#123B5A] focus:border-transparent transition"
                  />
                  <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-3" />
                </div>
              </div>

              <div className="bg-[#FFFBEB] rounded-lg p-3 border border-[#FDE68A] text-[11px] text-[#92400E] leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#D97706] mt-0.5" />
                <span>
                  Passwords are encrypted using bcrypt salted hashing. Never share your password with anyone.
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#123B5A] hover:bg-[#0F2F48] text-white text-sm font-semibold shadow transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Saving Password..." : "Complete Setup & Sign In"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm text-[#64748B]">
          Loading secure page...
        </div>
      }
    >
      <SetupPasswordForm />
    </Suspense>
  );
}
