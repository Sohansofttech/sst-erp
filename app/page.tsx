"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  School,
  GraduationCap,
  Users,
  BookOpen,
  Building2,
  ShieldCheck,
  ArrowRight,
  LogOut,
  Sparkles,
  Lock,
  Clock,
} from "lucide-react";
import { Button } from "@/components/shared/Button";

export default function HomePage() {
  const [session, setSession] = useState<{
    fullName: string;
    role: string;
    institutionName: string;
  } | null>(null);

  // Check if user already has an active session
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.session) {
          setSession({
            fullName: json.data.session.fullName,
            role: json.data.session.role,
            institutionName: json.data.session.institutionName,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/me", { method: "POST" });
      setSession(null);
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const getDashboardHref = () => {
    if (!session) return "/login";
    return "/dashboard";
  };

  return (
    <div className="min-h-screen bg-[#EEF1F5] text-[#202936] flex flex-col justify-between font-sans selection:bg-[#F5A000] selection:text-white">
      {/* 1. Header Navigation */}
      <header className="bg-white border-b border-[#E5E9EF] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-18">
            {/* Logo and Platform Name */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#123B5A] to-[#1B4D70] text-white flex items-center justify-center shadow-md">
                <School className="w-6 h-6 text-[#F5A000]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xl tracking-tight text-[#123B5A]">
                    Sohan Soft Tech
                  </span>
                  <span className="bg-[#123B5A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wider uppercase">
                    ERP
                  </span>
                </div>
                <p className="text-[11px] font-medium text-[#788391]">
                  Smart Campus Management System
                </p>
              </div>
            </div>

            {/* Active Session Indicator */}
            {session && (
              <div className="flex items-center gap-3 bg-[#EEF1F5] pl-3 pr-1.5 py-1.5 rounded-xl border border-[#E5E9EF]">
                <div className="text-left text-xs">
                  <p className="font-bold text-[#202936] line-clamp-1">{session.fullName}</p>
                  <p className="text-[10px] text-[#788391] font-medium uppercase tracking-wider">
                    {session.role}
                  </p>
                </div>
                <Link href={getDashboardHref()}>
                  <Button variant="primary" size="sm">
                    Go to Dashboard
                  </Button>
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-[#788391] hover:text-red-600 rounded-lg transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main Hero & 5 Portal Options */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 w-full flex flex-col justify-center">
        {/* Welcome Heading & Instruction */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#123B5A]/5 border border-[#123B5A]/15 text-[#123B5A] text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5 text-[#F5A000]" />
            <span>Institutional Access Gateway</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#123B5A] tracking-tight leading-tight">
            Welcome to{" "}
            <span className="bg-gradient-to-r from-[#123B5A] via-[#1B4D70] to-[#F5A000] bg-clip-text text-transparent">
              Sohan Soft Tech ERP
            </span>
          </h1>

          <p className="mt-4 text-base sm:text-lg text-[#788391] font-medium">
            Select your portal to continue.
          </p>
        </div>

        {/* Four Portal Cards (1 Active Student Portal + 3 Placeholders) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Student Portal (Active) */}
          <div className="bg-white rounded-2xl border border-[#E5E9EF] p-6 shadow-sm hover:shadow-lg hover:border-[#F5A000] transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#FFFBEB] text-[#F5A000] flex items-center justify-center border border-[#FDE68A] shadow-xs group-hover:scale-105 transition-transform">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
                  Active
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#123B5A] group-hover:text-[#F5A000] transition-colors">
                Student Portal
              </h2>
              <p className="text-xs text-[#788391] mt-2 leading-relaxed">
                Academic portal for students to access course timetables, attendance tracking, grades, fee dues, and campus communications.
              </p>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-100">
              <Link href="/login" className="block">
                <Button
                  variant="primary"
                  className="w-full justify-center bg-[#F5A000] hover:bg-[#DE9100] shadow-sm text-xs font-semibold py-2.5 text-white"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Enter Student Portal
                </Button>
              </Link>
            </div>
          </div>

          {/* Card 3: Teacher Portal */}
          <div className="bg-white rounded-2xl border border-slate-200 hover:border-[#153B66] p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#153B66]/10 text-[#153B66] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BookOpen className="w-6 h-6 text-[#153B66]" />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active Portal
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#1E293B] group-hover:text-[#153B66] transition-colors">
                Teacher Portal
              </h2>
              <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
                Faculty workspace for attendance marking, timetable management, IA marks, LMS course materials, and exam duties.
              </p>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-100">
              <Link href="/campus/demo-school/teacher" className="block">
                <Button
                  variant="primary"
                  className="w-full justify-center bg-[#153B66] hover:bg-[#1E293B] shadow-sm text-xs font-semibold py-2.5"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Access Teacher Portal
                </Button>
              </Link>
            </div>
          </div>

          {/* Card 4: Institution Admin Login (Active - Batches 1-6) */}
          <div className="bg-white rounded-2xl border border-[#153B66]/30 p-6 shadow-sm hover:shadow-lg hover:border-[#153B66] transition-all flex flex-col justify-between group relative ring-1 ring-[#153B66]/10">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#153B66]/10 text-[#153B66] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Building2 className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#153B66] group-hover:text-[#2563EB] transition-colors">
                Institution Admin
              </h2>
              <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
                Administrative governance for admissions, academics, staff & students, marks, promotions, and certificates.
              </p>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-100 flex flex-col gap-2">
              <Link href="/admin/login" className="block">
                <Button
                  variant="primary"
                  className="w-full justify-center bg-[#153B66] hover:bg-[#0F2942] shadow-sm text-xs font-semibold py-2.5"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Admin Login
                </Button>
              </Link>
              <Link href="/admin" className="block text-center text-xs font-medium text-[#2563EB] hover:underline py-1">
                Direct Dashboard
              </Link>
            </div>
          </div>

          {/* Card 5: Super Admin Platform Console */}
          <div className="bg-white rounded-2xl border border-slate-200 hover:border-slate-800 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active Console
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#1E293B] group-hover:text-slate-900 transition-colors">
                Super Admin Login
              </h2>
              <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
                Platform-wide governance console for multi-tenant institution onboarding, system telemetry, and security.
              </p>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-100">
              <Link href="/admin/login?role=super-admin" className="block">
                <Button
                  variant="primary"
                  className="w-full justify-center bg-slate-900 hover:bg-slate-800 shadow-sm text-xs font-semibold py-2.5"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Super Admin Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Clean Footer */}
      <footer className="bg-white border-t border-[#E2E8F0] py-6 text-center text-xs text-[#64748B]">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 Sohan Soft Tech ERP. All rights reserved.</p>
          <p className="text-[11px] text-[#94A3B8] mt-1">
            Secure Student Campus Management System
          </p>
        </div>
      </footer>
    </div>
  );
}
