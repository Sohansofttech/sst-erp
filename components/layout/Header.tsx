"use client";

import React, { useState } from "react";
import { Menu, School, LogOut, Calendar, ChevronDown, KeyRound } from "lucide-react";
import { NotificationDropdown } from "../shared/NotificationDropdown";
import { Badge } from "../shared/Badge";
import { ChangePasswordModal } from "../shared/ChangePasswordModal";
import { clearClientSessionCache } from "@/lib/auth/client-session";
import { StudentDivisionSwitcher } from "@/components/student/StudentDivisionSwitcher";
import { ParentChildDivisionSwitcher } from "@/components/parent/ParentChildDivisionSwitcher";

interface HeaderProps {
  portalType: "STUDENT" | "PARENT" | "INSTITUTION_ADMIN" | "SUPER_ADMIN";
  userFullName?: string;
  userRole?: string;
  userEmail?: string;
  institutionName?: string;
  institutionCode?: string | null;
  institutionLogo?: string | null;
  academicYearName?: string;
  selectedChildId?: string;
  onSelectChild?: (childId: string) => void;
  onMenuToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  portalType,
  userFullName = "User",
  userRole = "STUDENT",
  userEmail,
  institutionName = "Campus Portal",
  institutionCode,
  institutionLogo,
  academicYearName,
  selectedChildId,
  onSelectChild,
  onMenuToggle,
}) => {
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const handleLogout = async () => {
    try {
      clearClientSessionCache();
      if (typeof window !== "undefined") {
        localStorage.removeItem("erp_token");
        localStorage.removeItem("erp_user");
        localStorage.removeItem("erp_institution_name");
        localStorage.removeItem("erp_institution");
        localStorage.removeItem("erp_active_child_id");
        localStorage.removeItem("sst_erp_inst_admin_profile");
      }
      await fetch("/api/auth/me", { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-[#E2E8F0] shadow-xs shrink-0">
      {/* Left side: Mobile Toggle & Institution Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] transition-colors cursor-pointer lg:hidden"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#123B5A] text-white font-bold shadow-xs shrink-0 overflow-hidden">
            {institutionLogo ? (
              <img src={institutionLogo} alt={institutionName} className="w-full h-full object-contain p-1" />
            ) : (
              <School className="w-5 h-5 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-[#1E293B] leading-tight truncate max-w-[200px] sm:max-w-xs md:max-w-md" title={institutionName}>
              {institutionName}
            </h1>
            <p className="text-[11px] text-[#64748B] font-medium hidden sm:block">
              {portalType === "INSTITUTION_ADMIN"
                ? "Institution Subscription Center"
                : portalType === "SUPER_ADMIN"
                  ? "Subscription Center"
                  : portalType === "STUDENT"
                    ? "Student Portal"
                    : "Parent Portal"}
              {institutionCode ? ` • ${institutionCode}` : ""}
              {academicYearName ? ` • AY ${academicYearName}` : ""}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#123B5A] text-white ml-1">
            {(() => {
              if (portalType === "INSTITUTION_ADMIN") return "Institution Admin";
              if (portalType === "SUPER_ADMIN") return "Super Admin";
              return portalType === "STUDENT" ? "Active Student" : "Active Parent";
            })()}
          </span>
        </div>
      </div>

      {/* Right side: Academic Year, Notifications, User Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        {/* Portal Division Switching: Parent Child & Division Selector OR Student Enrollment Selector */}
        {portalType === "PARENT" ? (
          <ParentChildDivisionSwitcher
            selectedChildId={selectedChildId}
            onSelectChild={onSelectChild}
          />
        ) : portalType === "STUDENT" ? (
          <StudentDivisionSwitcher />
        ) : null}

        {/* Academic Year Switcher matching Admin Header */}
        {academicYearName ? (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#1E293B]">
            <Calendar className="w-4 h-4 text-[#F5A000]" />
            <span>AY {academicYearName}</span>
          </div>
        ) : null}

        <NotificationDropdown />

        <div className="h-6 w-px bg-[#E2E8F0] hidden sm:block" />

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#123B5A] text-white flex items-center justify-center font-bold text-xs shadow-xs">
            {userFullName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase()}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-[#1E293B] leading-tight">
              {userFullName}
            </p>
            <p className="text-[11px] text-[#64748B] truncate max-w-[150px]" title={userEmail || userRole.toLowerCase()}>
              {userEmail || userRole.toLowerCase()}
            </p>
          </div>

          <button
            onClick={() => setIsPasswordModalOpen(true)}
            title="Change Password"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#64748B] hover:text-[#123B5A] hover:bg-slate-50 hover:border-[#123B5A]/30 transition-colors ml-1 cursor-pointer"
            aria-label="Change Password"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#F5A000]" />
            <span className="hidden sm:inline">Password</span>
          </button>

          <button
            onClick={handleLogout}
            title="Log Out"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#64748B] hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors ml-1 cursor-pointer"
            aria-label="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </header>
  );
};
