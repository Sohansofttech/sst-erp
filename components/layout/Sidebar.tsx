"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ShieldCheck,
  ChevronRight,
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
          className="fixed inset-0 bg-[#123B5A]/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-[#123B5A] text-white flex flex-col z-50 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Institutional Brand Header */}
        <div className="h-16 px-4 sm:px-5 flex items-center justify-between border-b border-[#1B4D70]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#F5A000] flex items-center justify-center font-bold text-white shadow-md shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-[13px] sm:text-sm tracking-tight text-white block leading-snug truncate" title={institutionName}>
                {institutionName}
              </span>
              <span className="text-[10px] text-[#F5A000] font-semibold tracking-wider uppercase block">
                {isParent ? "Parent Portal" : "Student Portal"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white/70 hover:text-white lg:hidden rounded-lg shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Card (Clean & Professional) */}
        <div className="p-3 mx-3 my-3 rounded-xl bg-[#16466C]/40 border border-[#1B4D70] flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-full bg-[#1B4D70] border border-white/20 flex items-center justify-center text-[#F5A000] font-bold text-xs shrink-0 shadow-sm">
            {userInfo.fullName
              ? userInfo.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              : "ST"}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#123B5A]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-semibold text-white truncate" title={userInfo.fullName}>
              {userInfo.fullName}
            </h2>
            <p className="text-[11px] text-white/60 truncate" title={userInfo.email}>
              {userInfo.email}
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
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
                  if (window.innerWidth < 1024) onClose();
                }}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition-all group ${
                  isActive
                    ? "bg-[#F5A000] text-white shadow-md font-semibold"
                    : "text-white/80 hover:text-white hover:bg-[#1B4D70]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? "text-white" : "text-white/70 group-hover:text-white"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Sidebar Footer with Session Sign Out */}
        <div className="p-4 border-t border-[#1B4D70]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2 text-[13px] font-medium text-white/70 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4 text-white/70 group-hover:text-red-300" />
            <span>Sign Out Session</span>
          </button>
        </div>
      </aside>
    </>
  );
};
