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
}

export const Sidebar: React.FC<SidebarProps> = ({
  portalType,
  isOpen,
  onClose,
  userFullName,
  userEmail,
}) => {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string>(portalType || "STUDENT");
  const [userInfo, setUserInfo] = useState<{ fullName: string; email: string }>({
    fullName: userFullName || "John Doe",
    email: userEmail || "john.doe@student.apex.edu",
  });

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
          className="fixed inset-0 bg-[#0F2942]/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-[#0F2942] text-white flex flex-col z-50 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Institutional Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-[#183B5E]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F59E0B] flex items-center justify-center font-bold text-white shadow-md">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-[15px] tracking-tight text-white block leading-tight">
                Sohan Soft Tech
              </span>
              <span className="text-[11px] text-[#F59E0B] font-semibold tracking-wide uppercase">
                Student Portal
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#8FA6B9] hover:text-white lg:hidden rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Header (Matching Reference Design) */}
        <div className="pt-6 pb-4 px-6 border-b border-[#183B5E] text-center">
          <div className="relative mx-auto w-14 h-14 rounded-full bg-[#183B5E] border-2 border-white/20 flex items-center justify-center text-white mb-2 shadow-inner">
            <User className="w-7 h-7 text-[#F59E0B]" />
          </div>
          <h2 className="text-sm font-bold text-white tracking-wider uppercase truncate">
            {userInfo.fullName}
          </h2>
          <p className="text-[11px] text-[#8FA6B9] truncate mt-0.5">
            {userInfo.email}
          </p>
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
                    ? "bg-[#F59E0B] text-white shadow-md font-semibold"
                    : "text-[#8FA6B9] hover:text-white hover:bg-[#183B5E]/60"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? "text-white" : "text-[#8FA6B9] group-hover:text-white"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Sidebar Footer with Session Sign Out */}
        <div className="p-4 border-t border-[#183B5E]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2 text-[13px] font-medium text-[#8FA6B9] hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4 text-[#8FA6B9] group-hover:text-red-300" />
            <span>Sign Out Session</span>
          </button>
        </div>
      </aside>
    </>
  );
};
