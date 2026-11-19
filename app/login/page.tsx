"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  School,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Building2,
  GraduationCap,
  BookOpen,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type PortalRole = "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN";

const portalConfigs: Record<
  PortalRole,
  {
    title: string;
    badge: string;
    welcome: string;
    subtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    helperText: string;
    buttonText: string;
    icon: LucideIcon;
  }
> = {
  STUDENT: {
    title: "Student Portal",
    badge: "STUDENT PORTAL",
    welcome: "Welcome, Student",
    subtitle: "Access courses, attendance, examinations, fees, and campus services.",
    emailLabel: "Student Email",
    emailPlaceholder: "e.g. student.name@apex.edu",
    helperText: "Use your institution-issued student email to continue.",
    buttonText: "Sign In to Student Portal",
    icon: GraduationCap,
  },
  TEACHER: {
    title: "Teacher Portal",
    badge: "TEACHER PORTAL",
    welcome: "Welcome, Faculty",
    subtitle: "Manage classes, attendance, assessments, and student academic records.",
    emailLabel: "Faculty Email",
    emailPlaceholder: "e.g. faculty.name@apex.edu",
    helperText: "Use your institution-issued faculty email to continue.",
    buttonText: "Sign In to Teacher Portal",
    icon: BookOpen,
  },
  ADMIN: {
    title: "Institution Admin Portal",
    badge: "INSTITUTION ADMIN PORTAL",
    welcome: "Institution Administration",
    subtitle: "Manage academic operations, staff, students, finance, and institutional services.",
    emailLabel: "Institution Admin Email",
    emailPlaceholder: "e.g. admin@apex.edu",
    helperText: "Use your Institution Admin account email to continue.",
    buttonText: "Sign In to Institution Admin Portal",
    icon: Building2,
  },
  SUPER_ADMIN: {
    title: "Super Admin Portal",
    badge: "SUPER ADMIN PORTAL",
    welcome: "Welcome, Super Admin",
    subtitle: "Govern institutions, platform users, subscriptions, security, and global operations.",
    emailLabel: "Super Admin Email",
    emailPlaceholder: "e.g. superadmin@sohansofttech.com",
    helperText: "Use an active Super Admin platform account.",
    buttonText: "Sign In to Super Admin Portal",
    icon: ShieldCheck,
  },
};

const demoAccounts: Array<{
  role: PortalRole;
  label: string;
  email: string;
  icon: LucideIcon;
}> = [
  { role: "STUDENT", label: "Student", email: "john.doe@student.apex.edu", icon: GraduationCap },
  { role: "TEACHER", label: "Teacher", email: "prof.sharma@apex.edu", icon: BookOpen },
  { role: "ADMIN", label: "Institution Admin", email: "admin@apex.edu", icon: Building2 },
  { role: "SUPER_ADMIN", label: "Super Admin", email: "superadmin@sohansofttech.com", icon: ShieldCheck },
];

function LoginForm() {
  const [selectedRole, setSelectedRole] = useState<PortalRole>("ADMIN");
  const [email, setEmail] = useState("");
  const [institutionCode, setInstitutionCode] = useState("");
  const [showCollegeCode, setShowCollegeCode] = useState(false);
  const emailInputRef = React.useRef<HTMLInputElement>(null);
  const collegeCodeInputRef = React.useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState<string>("Apex Institute of Technology");

  // Dynamically load the live institution name configured by Super Admin / Admin
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("erp_institution_name");
      if (stored && !stored.includes("E2E")) {
        setInstitutionName(stored);
      } else {
        try {
          const profile = localStorage.getItem("sst_erp_inst_admin_profile");
          if (profile) {
            const parsed = JSON.parse(profile);
            if (parsed.name && !parsed.name.includes("E2E")) {
              setInstitutionName(parsed.name);
            }
          }
        } catch {}
      }
    }

    fetch("/api/public/institution")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.name) {
          setInstitutionName(data.name);
          if (typeof window !== "undefined") {
            localStorage.setItem("erp_institution_name", data.name);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData(e.currentTarget as HTMLFormElement);
      const submittedEmail = String(formData.get("email") || email).trim().toLowerCase();
      const submittedPassword = String(formData.get("password") || "");
      const submittedCollegeCode = String(formData.get("institutionCode") || institutionCode || "").trim();

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: submittedEmail,
          password: submittedPassword,
          institutionCode: submittedCollegeCode || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.error && json.error.toLowerCase().includes("college code")) {
          setShowCollegeCode(true);
          setTimeout(() => {
            collegeCodeInputRef.current?.focus();
          }, 100);
        }
        throw new Error(json.error || "Invalid email or password.");
      }

      if (json.data?.token) {
        localStorage.setItem("erp_token", json.data.token);
      }
      if (json.data?.user) {
        localStorage.setItem("erp_user", JSON.stringify(json.data.user));
        if (json.data.user.institutionName) {
          localStorage.setItem("erp_institution_name", json.data.user.institutionName);
        }
        if (json.data.user.activeChildId) {
          localStorage.setItem("erp_active_child_id", json.data.user.activeChildId);
          document.cookie = `erp_active_child=${json.data.user.activeChildId}; path=/; max-age=86400`;
        } else {
          localStorage.removeItem("erp_active_child_id");
          document.cookie = "erp_active_child=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
      }

      const destination = json.data?.redirectUrl || "/dashboard";
      setSuccessMessage("Authentication successful. Redirecting to your portal...");

      // Hard navigation ensures all session cookies and layout states initialize freshly
      window.location.href = destination;
    } catch (err: any) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoFill = (role: PortalRole, demoEmail: string) => {
    setSelectedRole(role);
    setEmail(demoEmail);
    if (emailInputRef.current) {
      emailInputRef.current.value = demoEmail;
    }
    setInstitutionCode("");
    if (collegeCodeInputRef.current) {
      collegeCodeInputRef.current.value = "";
    }
    setError(null);
    setSuccessMessage(null);
  };

  const portal = portalConfigs[selectedRole];
  const PortalIcon = portal.icon;

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#EEF1F5] text-[#202936] font-sans">
      {/* LEFT COLUMN: Immersive Visual Hero Banner (Desktop / Large Screens) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[52%] relative bg-[#123B5A] text-white flex-col justify-between p-10 xl:p-14 overflow-hidden">
        {/* Background Image with Dark Navy Gradient Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/images/campus-hero.jpg"
            alt="Institution Campus"
            className="w-full h-full object-cover object-center filter brightness-[0.88] contrast-[1.05]"
          />
          {/* Multi-layered dark navy overlay for optimal contrast and elegance */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#123B5A] via-[#123B5A]/75 to-[#123B5A]/55" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#123B5A]/90 via-transparent to-[#123B5A]/50" />
        </div>
        {/* Top Branding Bar on Hero */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg shrink-0">
            <School className="w-6 h-6 text-[#F5A000]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight text-white truncate max-w-[280px] xl:max-w-[360px]" title={institutionName}>
                {institutionName}
              </span>
              <span className="bg-[#F5A000] text-[#123B5A] text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider shadow-sm shrink-0">
                ERP
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">
              Smart Campus Management System
            </p>
          </div>
        </div>

        {/* Center / Showcase Section */}
        <div className="relative z-10 my-auto py-12 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[#F5A000] text-xs font-bold tracking-wide uppercase mb-6 shadow-sm">
            <Sparkles className="w-4 h-4 text-[#F5A000]" />
            <span>Unified Campus Ecosystem</span>
          </div>

          <h2 className="text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm">
            Empowering Academic Excellence & Seamless Campus Governance
          </h2>

          <p className="mt-4 text-sm xl:text-base text-slate-200 leading-relaxed font-normal">
            A secure single-entry portal designed for students, teachers, departmental leadership, and administrators.
          </p>

          {/* Value Proposition Pills */}
          <div className="mt-8 grid grid-cols-1 gap-3">
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-[#F5A000]/20 flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4 text-[#F5A000]" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-white">Academic Lifecycle Management</p>
                <p className="text-slate-300">Timetable, dynamic attendance, marks, examinations & LMS tasks.</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-[#F5A000]/20 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-[#F5A000]" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-white">Automated Role-Based Redirection</p>
                <p className="text-slate-300">Intelligent server routing to Student, Teacher, Admin, or Super Admin portals.</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-[#F5A000]/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-[#F5A000]" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-white">Multi-Tenant Institutional Security</p>
                <p className="text-slate-300">Cryptographically signed sessions, strict tenant isolation & audit logs.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status / Trust Bar on Hero */}
        <div className="relative z-10 pt-6 border-t border-white/15 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Institutional System Operational</span>
          </div>
          <span className="text-[11px] text-slate-400">© 2026 {institutionName}</span>
        </div>
      </div>

      {/* RIGHT COLUMN: The Clean, Modern Institution Portal Login Card */}
      <div className="w-full lg:w-1/2 xl:w-[48%] flex flex-col justify-center items-center py-8 sm:py-12 px-4 sm:px-8 lg:px-12 xl:px-16 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Header & Badging */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#123B5A] text-white shadow-md border-2 border-white mb-3">
              <PortalIcon className="w-7 h-7 text-[#F5A000]" />
            </div>

            <div className="flex justify-center mb-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#123B5A]/10 text-[#123B5A] text-[11px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-[#F5A000]" />
                <span>{portal.badge}</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#123B5A]">
              {portal.title}
            </h1>
            <p className="text-xs sm:text-sm font-medium text-[#788391] mt-1">
              {portal.welcome}
            </p>
            <p className="text-[11px] text-[#94A3B8] mt-1 max-w-sm mx-auto">
              {portal.subtitle}
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-[#E5E9EF] p-6 sm:p-8">
            {error && (
              <div className="mb-4 p-3.5 bg-[#FEE2E2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] font-semibold flex items-center gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
            )}

            <form
              className="space-y-4"
              autoComplete="on"
              onSubmit={handleSubmit}
            >
              {/* College Code / Institution Code Input */}
              {(selectedRole === "ADMIN" || showCollegeCode) && (
                <div className="animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="institutionCode"
                      className="block text-xs font-bold text-[#202936] uppercase tracking-wider"
                    >
                      College Code
                    </label>
                    <span className="text-[10px] text-[#788391] font-semibold">
                      Required for New Institutions
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#788391]">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <input
                      id="institutionCode"
                      ref={collegeCodeInputRef}
                      name="institutionCode"
                      type="text"
                      autoComplete="organization"
                      value={institutionCode}
                      onChange={(e) => {
                        setInstitutionCode(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Enter College Code (e.g. AIT2026)"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm bg-[#F8FAFC] focus:bg-white border border-[#E5E9EF] rounded-xl text-[#202936] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#123B5A] focus:border-transparent transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-[#94A3B8] mt-1">
                    Enter your assigned College Code. Existing admins (Apex) may leave this blank.
                  </p>
                </div>
              )}

              {/* Enter College Code option for students/teachers when hidden */}
              {!showCollegeCode && selectedRole !== "ADMIN" && selectedRole !== "SUPER_ADMIN" && (
                <div className="text-right -mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCollegeCode(true);
                      setTimeout(() => collegeCodeInputRef.current?.focus(), 50);
                    }}
                    className="text-[11px] font-semibold text-[#123B5A] hover:text-[#F5A000] transition-colors cursor-pointer"
                  >
                    + Enter College Code (if required)
                  </button>
                </div>
              )}

              {/* Email Address */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold text-[#202936] uppercase tracking-wider mb-1.5"
                >
                  {portal.emailLabel}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#788391]">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="email"
                    ref={emailInputRef}
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    defaultValue={email}
                    placeholder={portal.emailPlaceholder}
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm bg-[#F8FAFC] focus:bg-white border border-[#E5E9EF] rounded-xl text-[#202936] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#123B5A] focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-bold text-[#202936] uppercase tracking-wider mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#788391]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-[#F8FAFC] focus:bg-white border border-[#E5E9EF] rounded-xl text-[#202936] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#123B5A] focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#788391] hover:text-[#202936] transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center justify-end mt-1.5">
                  <Link
                    href="/forgot-password"
                    className="text-[11px] font-semibold text-[#123B5A] hover:text-[#F5A000] transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#F5A000] hover:bg-[#DE9100] active:scale-[0.99] shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>{portal.buttonText}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Demo Credentials Helper */}
            <div className="mt-6 pt-5 border-t border-[#E2E8F0]">
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2.5 text-center">
                Quick Demo Access (Click to auto-fill)
              </p>
              <div className="grid grid-cols-2 gap-2 text-left">
                {demoAccounts.map((account) => {
                  const Icon = account.icon;
                  const isSelected = selectedRole === account.role;

                  return (
                    <button
                      key={account.role}
                      type="button"
                      onClick={() => handleDemoFill(account.role, account.email)}
                      aria-pressed={isSelected}
                      className={`p-2.5 rounded-xl border transition-all text-[11px] group cursor-pointer text-left ${
                        isSelected
                          ? "border-[#F5A000] bg-[#FFFBEB] shadow-xs ring-1 ring-[#F5A000]/50"
                          : "border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#F5A000] hover:bg-amber-50/50"
                      }`}
                    >
                      <div
                        className={`flex items-center gap-1.5 font-bold transition-colors ${
                          isSelected
                            ? "text-[#D97706]"
                            : "text-[#123B5A] group-hover:text-[#F5A000]"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 text-[#F5A000]" />
                        <span>{account.label}</span>
                      </div>
                      <span
                        className={`text-[10px] block truncate mt-0.5 ${
                          isSelected ? "text-[#92400E]" : "text-[#64748B]"
                        }`}
                      >
                        {account.email}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-center text-[#94A3B8]">
                {portal.helperText}
              </p>
            </div>
          </div>

          {/* Security & Support Note */}
          <div className="mt-5 text-center text-[11px] text-[#788391] flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Encrypted with 256-bit SSL | Institutional Single Sign-On</span>
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
        <div className="min-h-screen bg-[#EEF1F5] flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#123B5A] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
