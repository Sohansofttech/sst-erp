"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  User,
  GraduationCap,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  Award,
  CreditCard,
  BookOpen,
  Building2,
  Users2,
  MessageSquare,
  X,
  LogOut,
} from "lucide-react";

interface SidebarProps {
  portalType?: "STUDENT" | "PARENT";
  isOpen: boolean;
  onClose: () => void;
  selectedChildId?: string;
  userFullName?: string;
  userEmail?: string;
  institutionName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  portalType,
  isOpen,
  onClose,
  userFullName,
  userEmail,
  institutionName: propInstitutionName,
}) => {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string>(portalType || "STUDENT");
  const [institutionName, setInstitutionName] = useState<string>(
    propInstitutionName || "Apex Institute of Technology"
  );
  const [userInfo, setUserInfo] = useState<{ fullName: string; email: string }>({
    fullName: userFullName || "John Doe",
    email: userEmail || "john.doe@student.apex.edu",
  });

  useEffect(() => {
    if (propInstitutionName) {
      setInstitutionName(propInstitutionName);
    } else if (typeof window !== "undefined") {
      const stored = localStorage.getItem("erp_institution_name");
      if (stored) setInstitutionName(stored);
    }
  }, [propInstitutionName]);

  useEffect(() => {
    if (userFullName) {
      setUserInfo((prev) => ({
        fullName: userFullName,
        email: userEmail || prev.email,
      }));
    }
  }, [userFullName, userEmail]);

  useEffect(() => {
    if (portalType) {
      setUserRole(portalType);
    }
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("erp_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.role) setUserRole(parsed.role);
          if (parsed.institutionName) setInstitutionName(parsed.institutionName);
          if (parsed.fullName) {
            setUserInfo({
              fullName: parsed.fullName,
              email: parsed.email || "john.doe@student.apex.edu",
            });
          }
        }
      } catch {}
    }
  }, [portalType]);

  const isParent = userRole === "PARENT" || portalType === "PARENT";

  // Unified Student Portal Navigation for both Students and Parents
  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Student Profile", href: "/student/profile", icon: User },
    { label: "Academic History", href: "/student/academic-history", icon: GraduationCap },
    { label: "Timetable", href: "/student/timetable", icon: Calendar },
    { label: "Attendance & In/Out", href: "/student/attendance", icon: CheckCircle2 },
    { label: "Internal Assessment", href: "/student/assessments", icon: FileSpreadsheet },
    { label: "Examinations & Results", href: "/student/examinations", icon: Award },
    { label: "Fees & Receipts", href: "/student/fees", icon: CreditCard },
    { label: "LMS & Assignments", href: "/student/lms", icon: BookOpen },
    { label: "Campus Services", href: "/student/campus-services", icon: Building2 },
    { label: "Mentoring & Log Book", href: "/student/mentoring", icon: Users2 },
    { label: "Feedback & Inquiries", href: "/student/feedback", icon: MessageSquare },
  ];

  // Examinations & Results is strictly restricted to Student accounts (hidden from Parents)
  const displayNavItems = navItems.filter((item) => {
    if (isParent && item.href === "/student/examinations") {
      return false;
    }
    return true;
  });

  const handleLogout = async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("erp_token");
        localStorage.removeItem("erp_user");
        localStorage.removeItem("erp_active_child_id");
        document.cookie = "erp_active_child=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }
      await fetch("/api/auth/me", { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0D2B42]/60 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container - Deep Navy Vertical Sidebar matching Institution Admin */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#123B5A] text-white flex flex-col transition-transform duration-300 ease-in-out shadow-xl",
          "lg:static lg:h-full lg:shrink-0 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand / Logo Area (Fixed Top, h-16 px-5) */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-[#16466C] bg-[#0D2B42] shrink-0">
          <Link href={isParent ? "/parent/dashboard" : "/dashboard"} className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#F5A000] flex items-center justify-center font-black text-white text-base shadow-xs shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-extrabold tracking-wide text-white block leading-tight truncate" title={institutionName}>
                {institutionName}
              </span>
              <span className="text-[10px] uppercase font-bold text-[#8EA4C2] tracking-wider block">
                {isParent ? "Parent Portal" : "Student Portal"}
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-semibold bg-[#F5A000]/30 text-white border border-[#F5A000]/60 px-1.5 py-0.5 rounded">
              {isParent ? "Parent" : "Student"}
            </span>
            <button
              onClick={onClose}
              className="p-1 text-white/70 hover:text-white lg:hidden rounded-lg shrink-0 ml-1"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* User Profile Card */}
        <div className="p-2.5 mx-3 my-2.5 rounded-lg bg-[#16466C]/40 border border-[#16466C] flex items-center gap-2.5 shrink-0">
          <div className="relative w-8 h-8 rounded-full bg-[#16466C] border border-white/20 flex items-center justify-center text-[#F5A000] font-bold text-xs shrink-0 shadow-xs">
            {userInfo.fullName
              ? userInfo.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              : "ST"}
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-[#123B5A]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-semibold text-white truncate" title={userInfo.fullName}>
              {userInfo.fullName}
            </h2>
            <p className="text-[11px] text-white/70 truncate" title={userInfo.email}>
              {userInfo.email}
            </p>
          </div>
        </div>

        {/* Navigation Items (px-3 py-3 space-y-1, px-3 py-2 rounded-lg text-xs font-semibold) */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8EA4C2]">
            {isParent ? "Parent Navigation" : "Academic Navigation"}
          </div>

          {displayNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href === "/dashboard" && pathname === "/") ||
              pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (typeof window !== "undefined" && window.innerWidth < 1024) onClose();
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                  isActive
                    ? "bg-[#F5A000] text-white shadow-xs"
                    : "text-white hover:bg-[#16466C] hover:text-white"
                )}
              >
                <Icon
                  className="w-4 h-4 shrink-0 text-white"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Sidebar Footer with Session Sign Out */}
        <div className="p-3 border-t border-[#16466C] shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white/80 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-white/80 group-hover:text-red-300" />
            <span>Sign Out Session</span>
          </button>
        </div>
      </aside>
    </>
  );
};
