"use client";

import React from "react";
import { Menu, School, LogOut, Calendar, ChevronDown } from "lucide-react";
import { NotificationDropdown } from "../shared/NotificationDropdown";
import { Badge } from "../shared/Badge";

interface HeaderProps {
  portalType: "STUDENT" | "PARENT";
  userFullName?: string;
  userRole?: string;
  institutionName?: string;
  selectedChildId?: string;
  onSelectChild?: (childId: string) => void;
  onMenuToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  portalType,
  userFullName = "User",
  userRole = "STUDENT",
  institutionName = "Apex Institute of Technology",
  selectedChildId,
  onSelectChild,
  onMenuToggle,
}) => {
  const handleLogout = async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("erp_token");
        localStorage.removeItem("erp_user");
      }
      await fetch("/api/auth/me", { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };
  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-[#E5E9EF] shadow-sm flex items-center justify-between px-4 sm:px-6">
      {/* Left side: Mobile Toggle & Institution Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-2 -ml-2 text-[#788391] hover:text-[#202936] hover:bg-[#EEF1F5] rounded-lg lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-xs text-[#788391] font-medium">
            <div className="w-7 h-7 rounded-lg bg-[#EEF1F5] flex items-center justify-center text-[#123B5A]">
              <School className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-[#202936] block leading-tight">{institutionName}</span>
              <span className="text-[10px] text-[#788391] block leading-tight">Institutional ERP</span>
            </div>
          </div>
          <Badge variant="brand" size="sm" className="hidden md:inline-flex bg-[#123B5A] text-white ml-1">
            Active Student
          </Badge>
        </div>
      </div>

      {/* Right side: Academic Year, Notifications, User Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        {/* Academic Year Selector matching Reference Screenshot */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E9EF] bg-white text-xs font-semibold text-[#202936] shadow-2xs">
          <Calendar className="w-3.5 h-3.5 text-[#F5A000]" />
          <span>AY 2026-2027</span>
          <ChevronDown className="w-3 h-3 text-[#788391] ml-0.5" />
        </div>

        <NotificationDropdown />

        <div className="h-6 w-px bg-[#E5E9EF] hidden sm:block" />

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#123B5A] text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {userFullName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase()}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-[#202936] leading-tight">
              {userFullName}
            </p>
            <p className="text-[11px] text-[#788391] capitalize">{userRole.toLowerCase()}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-[#788391] hidden md:block" />

          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-1.5 text-[#788391] hover:text-[#DC2626] hover:bg-[#FEE2E2]/60 rounded-lg transition-colors ml-1"
            aria-label="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
