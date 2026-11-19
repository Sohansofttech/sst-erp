"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { Button } from "@/components/shared/Button";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [devTokenNotice, setDevTokenNotice] = useState<string | null>(null);

  // Strength calculations
  const minLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(newPassword);
  const matches = newPassword && newPassword === confirmPassword;

  let strengthScore = 0;
  if (minLength) strengthScore++;
  if (hasUpper && hasLower) strengthScore++;
  if (hasNumber && hasSpecial) strengthScore++;
  if (newPassword.length >= 12) strengthScore++;

  const strengthLabels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const strengthColors = ["bg-rose-500", "bg-rose-400", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setDevTokenNotice(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid institution email address.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to process request. Please try again.");
        return;
      }

      setSuccess(data.message);
      if (data.devToken) {
        setToken(data.devToken);
        setDevTokenNotice("Verification token generated. Auto-filled for your convenience.");
      }
      setStep("reset");
    } catch {
      setError("Unable to connect to service. Please check your network connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError("Verification token is required.");
      return;
    }

    if (!minLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      setError("Password does not meet complexity requirements.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to reset password. Token may be invalid or expired.");
        return;
      }

      setSuccess("Your password has been successfully reset! Redirecting to login...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch {
      setError("Failed to reset password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF1F5] flex flex-col items-center justify-center p-4 selection:bg-[#F5A000] selection:text-white">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <Link href="/login" className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[#123B5A] text-white flex items-center justify-center shadow-md">
              <Building2 className="w-5 h-5 text-[#F5A000]" />
            </div>
            <span className="font-extrabold text-xl tracking-tight text-[#123B5A]">
              Institution Portal
            </span>
          </Link>
          <p className="text-xs text-[#788391]">Password Recovery & Account Security</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E5E9EF] shadow-xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-[#F5A000] flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#202936]">
                {step === "request" ? "Forgot Password" : "Set New Password"}
              </h2>
              <p className="text-xs text-[#788391]">
                {step === "request"
                  ? "Enter your email to receive a secure password reset token."
                  : "Enter the reset token and create a strong, unique password."}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {devTokenNotice && (
            <div className="mb-4 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-medium">
              {devTokenNotice}
            </div>
          )}

          {step === "request" ? (
            <form onSubmit={handleRequestToken} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#202936] mb-1.5">
                  Institution Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. john.doe@student.apex.edu"
                    className="w-full h-11 px-3.5 pl-10 text-xs rounded-xl border border-[#E5E9EF] bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A000]/30 focus:border-[#F5A000] text-[#202936]"
                    required
                  />
                  <Mail className="w-4 h-4 text-[#788391] absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full h-11 justify-center"
                isLoading={isLoading}
                disabled={isLoading || !email}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Send Verification Token
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#202936] mb-1.5">
                  Verification Token
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your 15-minute verification token"
                  className="w-full h-10 px-3.5 text-xs rounded-xl border border-[#E5E9EF] bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A000]/30 focus:border-[#F5A000] font-mono text-[#202936]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#202936] mb-1.5">
                  New Strong Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 chars, uppercase, number & symbol"
                    className="w-full h-10 px-3.5 pr-10 text-xs rounded-xl border border-[#E5E9EF] bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A000]/30 focus:border-[#F5A000] text-[#202936]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#788391] hover:text-[#202936] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {newPassword.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#788391]">Strength:</span>
                      <span className="font-bold text-[#202936]">{strengthLabels[strengthScore]}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-1">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-full flex-1 transition-all rounded-full ${
                            strengthScore >= step ? strengthColors[strengthScore] : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-[#EEF1F5]/60 rounded-xl border border-[#E5E9EF] space-y-1 text-[11px] text-[#788391]">
                <p className="font-semibold text-[#202936] mb-1">Required Complexity:</p>
                <div className="grid grid-cols-2 gap-1">
                  <span className={minLength ? "text-emerald-600 font-semibold" : ""}>✓ 8+ Characters</span>
                  <span className={hasUpper && hasLower ? "text-emerald-600 font-semibold" : ""}>✓ Upper & lower</span>
                  <span className={hasNumber ? "text-emerald-600 font-semibold" : ""}>✓ Number (0-9)</span>
                  <span className={hasSpecial ? "text-emerald-600 font-semibold" : ""}>✓ Special symbol</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#202936] mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full h-10 px-3.5 pr-10 text-xs rounded-xl border border-[#E5E9EF] bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A000]/30 focus:border-[#F5A000] text-[#202936]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#788391] hover:text-[#202936] cursor-pointer"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && !matches && (
                  <p className="text-[11px] text-rose-600 mt-1">Passwords do not match.</p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full h-11 justify-center"
                isLoading={isLoading}
                disabled={isLoading || !minLength || !matches}
                icon={<ShieldCheck className="w-4 h-4" />}
              >
                Reset & Secure Password
              </Button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-[#E5E9EF] text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#123B5A] hover:text-[#F5A000] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Institution Portal Login</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

