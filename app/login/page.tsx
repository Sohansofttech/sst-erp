"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  GraduationCap,
  Users,
  AlertCircle,
  KeyRound,
  Smartphone,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/shared/Button";
import { FormInput } from "@/components/shared/FormInput";

function LoginForm() {
  const [authMethod, setAuthMethod] = useState<"PASSWORD" | "OTP">("PASSWORD");
  const [email, setEmail] = useState("john.doe@student.apex.edu");
  const [password, setPassword] = useState("Student@123");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSendOtp = () => {
    if (!email) {
      setError("Please enter your registered institutional email address first.");
      return;
    }
    setError(null);
    setOtpSent(true);
    setOtp("123456"); // Pre-fill demo OTP
    setInfoMessage("Verification OTP sent! For testing, use demo OTP: 123456");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        email: email.trim().toLowerCase(),
        loginType: authMethod,
      };

      if (authMethod === "PASSWORD") {
        payload.password = password;
      } else {
        payload.otp = otp;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Authentication failed.");
      }

      if (json.data?.token) {
        localStorage.setItem("erp_token", json.data.token);
      }
      if (json.data?.user) {
        localStorage.setItem("erp_user", JSON.stringify(json.data.user));
        if (json.data.user.activeChildId) {
          localStorage.setItem("erp_active_child_id", json.data.user.activeChildId);
          document.cookie = `erp_active_child=${json.data.user.activeChildId}; path=/; max-age=86400`;
        } else {
          localStorage.removeItem("erp_active_child_id");
          document.cookie = "erp_active_child=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
      }

      // Hard navigation ensures all session cookies and layout states reload freshly
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] flex flex-col justify-center py-4 sm:py-6 sm:px-6 lg:px-8">
      {/* Back to Home Link */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 mb-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F2942] hover:text-[#F59E0B] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sohan Soft Tech ERP Home</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-2xl bg-[#0F2942] text-white flex items-center justify-center shadow-md border-2 border-white">
            <GraduationCap className="w-7 h-7 text-[#F59E0B]" />
          </div>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0F2942]">
          Student Portal
        </h1>
        <p className="mt-0.5 text-xs font-medium text-[#64748B]">
          Sign in to access your student academic records, timetable, and coursework
        </p>
      </div>

      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-6 px-6 shadow-xl border border-[#E2E8F0] sm:rounded-2xl sm:px-8">
          {/* Authentication Method Switcher: Password vs OTP */}
          <div className="mb-4">
            <div className="flex bg-[#EEF2F6] p-1 rounded-xl border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod("PASSWORD");
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  authMethod === "PASSWORD"
                    ? "bg-white text-[#0F2942] shadow-sm border border-[#E2E8F0]"
                    : "text-[#64748B] hover:text-[#1E293B]"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Password Login</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod("OTP");
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  authMethod === "OTP"
                    ? "bg-white text-[#0F2942] shadow-sm border border-[#E2E8F0]"
                    : "text-[#64748B] hover:text-[#1E293B]"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>OTP Login</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-[#FEE2E2] border border-[#FECACA] rounded-lg text-xs text-[#DC2626] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>{infoMessage}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <FormInput
              label="Institutional Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. name@student.apex.edu"
              required
            />

            {authMethod === "PASSWORD" ? (
              <>
                <FormInput
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      defaultChecked
                      suppressHydrationWarning
                      className="h-4 w-4 text-[#F59E0B] focus:ring-[#F59E0B] border-[#E2E8F0] rounded"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-[#64748B]">
                      Remember session
                    </label>
                  </div>
                  <span className="text-[#0F2942] hover:text-[#F59E0B] font-medium hover:underline cursor-pointer">
                    Forgot password?
                  </span>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-[13px] font-medium text-[#1E293B]">
                    6-Digit One-Time Password (OTP)
                  </label>
                  {!otpSent ? (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      className="text-xs font-semibold text-[#F59E0B] hover:underline"
                    >
                      Send OTP Code
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      className="text-xs text-[#64748B] hover:underline"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    className="w-full px-3.5 py-2 text-sm tracking-widest font-mono text-center border border-[#E2E8F0] rounded-lg focus:border-[#F59E0B] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/20 bg-white"
                    required
                  />
                  {!otpSent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSendOtp}
                      className="shrink-0"
                    >
                      Request OTP
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="secondary"
              className="w-full mt-2 font-semibold shadow-md py-2.5 text-sm"
              isLoading={loading}
            >
              Sign In to Student Portal
            </Button>
          </form>

          {/* Quick Fill Credentials helpers */}
          <div className="mt-6 pt-4 border-t border-[#E2E8F0] text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs text-[#64748B]">
              <span className="font-semibold text-slate-700">Quick Fill:</span>
              <button
                type="button"
                onClick={() => {
                  setEmail("john.doe@student.apex.edu");
                  setPassword("Student@123");
                  setError(null);
                  setInfoMessage(null);
                }}
                className="text-[#D97706] hover:underline font-semibold inline-flex items-center gap-1 bg-[#FEF3C7] px-2.5 py-1 rounded-md border border-[#FDE68A]"
              >
                <GraduationCap className="w-3.5 h-3.5 text-[#D97706]" />
                Student Account
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#64748B]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span>Secure Student Portal • Sohan Soft Tech ERP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-3 border-[#0F2942] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-[#64748B] font-medium">Loading Student Portal...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
