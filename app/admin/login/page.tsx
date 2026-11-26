"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInstitution } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import {
  Building2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  School,
  GraduationCap,
  Users,
  ShieldAlert,
} from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useInstitution();

  const requestedRole = searchParams.get("role") || searchParams.get("portal");

  // Automatically redirect if Super Admin was explicitly requested
  useEffect(() => {
    if (requestedRole === "super-admin" || requestedRole === "platform") {
      router.replace("/super-admin/login");
    }
  }, [requestedRole, router]);

  // Form states for Institution Admin
  const [institutionCode, setInstitutionCode] = useState("");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Status & Error states
  const [fieldErrors, setFieldErrors] = useState<{
    institutionCode?: string;
    usernameOrEmail?: string;
    password?: string;
  }>({});
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // Forgot password modal
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotCode, setForgotCode] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const validateForm = () => {
    const errors: {
      institutionCode?: string;
      usernameOrEmail?: string;
      password?: string;
    } = {};

    // College Code is optional on client so existing institution admins can log in without it.
    // The server enforces College Code for newly created institutions.

    if (!usernameOrEmail.trim()) {
      errors.usernameOrEmail = "Administrator Email or Username is required.";
    } else if (
      usernameOrEmail.includes("@") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usernameOrEmail.trim())
    ) {
      errors.usernameOrEmail = "Please enter a valid institutional email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: usernameOrEmail.trim().toLowerCase(),
          password,
          institutionCode: institutionCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setIsLoading(false);
        setAuthError(data.error || "Authentication failed: Unrecognized Institution Code or Invalid Credentials.");
        return;
      }

      // Check role
      const userRole = (data.data?.user?.role || "").toUpperCase();
      const allowedAdminRoles = [
        "ADMIN",
        "INSTITUTION_ADMIN",
        "SUPER_ADMIN",
        "ADMISSIONS_OFFICER",
        "ACCOUNTANT",
        "HOSTEL_WARDEN",
        "TRANSPORT_OFFICER",
      ];
      if (!allowedAdminRoles.includes(userRole)) {
        setIsLoading(false);
        setAuthError("Access restricted: This account does not have Institution Admin or Departmental Staff privileges.");
        return;
      }

      setLoginSuccess(true);
      router.replace(data.data?.redirectUrl || "/admin");
    } catch (err: unknown) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : "A network or server error occurred during login. Please try again.";
      setAuthError(msg);
    }
  };


  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");

    if (!forgotCode.trim()) {
      setForgotError("Institution Code is required.");
    }
    if (!forgotEmail.trim() || !forgotEmail.includes("@")) {
      setForgotError("A valid institutional contact email is required.");
      return;
    }

    setForgotSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#EEF1F5] flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="w-full bg-white border-b border-[#E2E8F0] px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-[#123B5A] hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-[#123B5A] text-white flex items-center justify-center font-black text-sm shadow-xs">
              SST
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight text-[#123B5A] block leading-tight">
                SST ERP
              </span>
              <span className="text-[10px] uppercase font-bold text-[#F5A000] tracking-wider block">
                Institution Admin Authentication
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/super-admin/login"
              className="text-xs font-semibold text-[#123B5A] hover:text-[#F5A000] transition-colors hidden sm:flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#F5A000]" />
              <span>Super Admin Console</span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#123B5A] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Main Portal</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-5xl bg-white rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Hero Branded Banner (5 Cols) */}
          <div className="lg:col-span-5 bg-gradient-to-br from-[#123B5A] via-[#16466C] to-[#0D2B42] text-white p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F5A000]/20 border border-[#F5A000]/40 text-[#F5A000] text-xs font-bold">
                <span>Institution Administration</span>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                  SST ERP Institution Portal
                </h1>
                <p className="text-xs sm:text-sm text-[#8EA4C2] mt-2 leading-relaxed">
                  Centralized governance, academic lifecycle setup, department orchestration, and role-based institutional administration.
                </p>
              </div>

              {/* Institutional Capabilities List */}
              <div className="space-y-3.5 pt-2">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#16466C] border border-[#16466C]/60 flex items-center justify-center shrink-0 mt-0.5 text-white">
                    <School className="w-4 h-4 text-[#F5A000]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Institutional Settings</h4>
                    <p className="text-[11px] text-[#CBD5E1]">Campus profile, code, accreditation, and administrative metadata.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#16466C] border border-[#16466C]/60 flex items-center justify-center shrink-0 mt-0.5 text-white">
                    <GraduationCap className="w-4 h-4 text-[#F5A000]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Academic Hierarchy</h4>
                    <p className="text-[11px] text-[#CBD5E1]">Academic cycles, degrees, departments, batches, sections, and subjects.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#16466C] border border-[#16466C]/60 flex items-center justify-center shrink-0 mt-0.5 text-white">
                    <Users className="w-4 h-4 text-[#F5A000]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Role-Based Access Control</h4>
                    <p className="text-[11px] text-[#CBD5E1]">Granular permissions matrix for campus principals, deans, and officers.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Tenant Scoping Badge */}
            <div className="pt-8 border-t border-white/10 mt-6">
              <div className="flex items-center gap-2 text-xs text-[#CBD5E1]">
                <ShieldCheck className="w-4 h-4 text-[#F5A000]" />
                <span>Tenant Scoped: <strong className="text-white">{profile.name}</strong></span>
              </div>
              <p className="text-[10px] text-[#8EA4C2] mt-1 font-mono">
                Code: {profile.code} • {profile.type}
              </p>
            </div>
          </div>

          {/* Right Login Form (7 Cols) */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Form Title */}
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl sm:text-2xl font-black text-[#1E293B] tracking-tight">
                    Institution Sign In
                  </h2>
                  <span className="text-[11px] font-bold text-[#123B5A] bg-[#EEF1F5] px-2.5 py-1 rounded-full border border-[#D5DCE5]">
                    Campus Access
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#64748B] mt-1">
                  Enter your assigned institutional identifier and administrative credentials to manage your campus.
                </p>
              </div>

              {/* Auth Failure Alert */}
              {authError && (
                <Alert
                  variant="error"
                  title="Sign In Failed"
                  icon={<AlertCircle className="w-5 h-5 text-[#DC2626]" />}
                >
                  {authError}
                </Alert>
              )}

              {/* Success Notification */}
              {loginSuccess && (
                <Alert
                  variant="success"
                  title="Sign In Successful"
                  icon={<CheckCircle2 className="w-5 h-5 text-[#16A34A]" />}
                >
                  Redirecting to the Institution Admin Dashboard...
                </Alert>
              )}

              {/* Login Form */}
              <form onSubmit={handleSignIn} className="space-y-4">
                {/* Field 1: Institution Code */}
                <div>
                  <Input
                    label="College Code / Institution Code"
                    id="institutionCode"
                    type="text"
                    value={institutionCode}
                    onChange={(e) => {
                      setInstitutionCode(e.target.value);
                      if (fieldErrors.institutionCode) {
                        setFieldErrors((prev) => ({ ...prev, institutionCode: undefined }));
                      }
                    }}
                    placeholder="e.g. CC101 (Required for new institutions, optional for existing)"
                    leftIcon={<Building2 className="w-4 h-4 text-[#64748B]" />}
                    error={fieldErrors.institutionCode}
                    helperText="Required for newly created institutions. Existing admins may leave blank."
                  />
                </div>

                {/* Field 2: Username / Email */}
                <div>
                  <Input
                    label="Administrator Email or Username"
                    id="usernameOrEmail"
                    type="text"
                    value={usernameOrEmail}
                    onChange={(e) => {
                      setUsernameOrEmail(e.target.value);
                      if (fieldErrors.usernameOrEmail) {
                        setFieldErrors((prev) => ({ ...prev, usernameOrEmail: undefined }));
                      }
                    }}
                    placeholder="e.g. admin@sohansoft.in"
                    leftIcon={<Mail className="w-4 h-4 text-[#64748B]" />}
                    error={fieldErrors.usernameOrEmail}
                  />
                </div>

                {/* Field 3: Password with Show/Hide Toggle */}
                <div>
                  <label
                    htmlFor="adminPassword"
                    className="block text-xs font-semibold text-[#1E293B] uppercase tracking-wider mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748B]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="adminPassword"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) {
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }
                      }}
                      placeholder="••••••••"
                      className={`w-full pl-9 pr-10 py-2.5 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 bg-white text-[#1E293B] ${
                        fieldErrors.password
                          ? "border-[#DC2626] focus:ring-[#DC2626]/20"
                          : "border-[#E2E8F0] focus:border-[#123B5A] focus:ring-[#123B5A]/20"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#64748B] hover:text-[#1E293B] transition-colors cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-xs text-[#DC2626] font-medium">{fieldErrors.password}</p>
                  )}
                </div>

                {/* Options: Remember Me & Forgot Password */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-[#123B5A] border-[#CBD5E1] focus:ring-[#123B5A]"
                    />
                    <span className="text-xs font-medium text-[#64748B]">
                      Remember this institution
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotSubmitted(false);
                      setForgotError("");
                      setIsForgotModalOpen(true);
                    }}
                    className="text-xs font-semibold text-[#123B5A] hover:text-[#F5A000] hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Primary Sign In Button */}
                <div className="pt-2 space-y-2.5">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full text-sm font-bold shadow-md bg-[#F5A000] hover:bg-[#DE9100] text-white"
                    isLoading={isLoading}
                    rightIcon={!isLoading ? <ArrowRight className="w-4 h-4" /> : undefined}
                  >
                    {isLoading ? "Validating Session..." : "Sign In to Institution Portal"}
                  </Button>

                </div>
              </form>
            </div>

            {/* Bottom Footer Details */}
            <div className="mt-8 pt-4 border-t border-[#F1F5F9] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
              <span>SST ERP • Institution Administration Subsystem</span>
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-[#F5A000] hover:underline font-semibold">
                  Unified Campus Gateway (/login) →
                </Link>
                <Link href="/super-admin/login" className="text-[#123B5A] hover:text-[#F5A000] font-semibold">
                  Super Admin Console →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Page Footer */}
      <footer className="w-full text-center py-4 text-xs text-[#94A3B8] border-t border-[#E2E8F0] bg-white">
        © {new Date().getFullYear()} SST ERP Solutions. All administrative rights reserved.
      </footer>

      {/* Forgot Password Modal (for Institution Admin) */}
      <Modal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        title="Institution Password Recovery"
        description="Request administrative credential reset instructions for your institution."
        maxWidth="md"
        footer={
          !forgotSubmitted ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsForgotModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleForgotPasswordSubmit}
                className="bg-[#F5A000] hover:bg-[#DE9100] text-white"
                leftIcon={<KeyRound className="w-4 h-4" />}
              >
                Send Reset Link
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsForgotModalOpen(false)}
              className="bg-[#F5A000] hover:bg-[#DE9100] text-white"
            >
              Done
            </Button>
          )
        }
      >
        {!forgotSubmitted ? (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <div className="p-3 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#92400E] flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
              <span>
                In demo mode, password recovery is simulated. In a live deployment, a cryptographic reset token is dispatched to the registered campus authority email.
              </span>
            </div>

            {forgotError && (
              <p className="text-xs text-[#DC2626] font-semibold">{forgotError}</p>
            )}

            <div>
              <Input
                label="Institution Code"
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value)}
                placeholder="e.g. SST-ENG-001"
              />
            </div>

            <div>
              <Input
                label="Registered Administrator Email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="admin@sohansoft.in"
                helperText="Recovery instructions will be routed to this institutional inbox."
              />
            </div>
          </form>
        ) : (
          <div className="py-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-[#1E293B]">Reset Link Dispatched</h4>
            <p className="text-xs text-[#64748B] max-w-sm mx-auto leading-relaxed">
              If an active institutional administrative profile matches <strong>{forgotEmail}</strong> for code <strong>{forgotCode}</strong>, security instructions have been generated.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#EEF1F5] flex items-center justify-center text-sm text-[#64748B]">Loading Administrative Gateway...</div>}>
      <LoginContent />
    </Suspense>
  );
}
