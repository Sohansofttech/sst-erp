"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInstitution } from "@/lib/store";
import { fetchClientSession } from "@/lib/auth/client-session";
import {
  Menu,
  Calendar,
  Building2,
  ChevronDown,
  User,
  ShieldCheck,
  LogOut,
  Sparkles,
  ExternalLink,
  KeyRound,
} from "lucide-react";
import { NotificationDropdown } from "@/components/shared/NotificationDropdown";
import { ChangePasswordModal } from "../shared/ChangePasswordModal";

interface AdminHeaderProps {
  onToggleSidebar: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ onToggleSidebar }) => {
  const router = useRouter();
  const {
    profile,
    activeAcademicYear,
    academicYears,
    isAcademicYearsLoading,
    setActiveAcademicYear,
  } = useInstitution();
  const [showYearMenu, setShowYearMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Authenticated user identity derived from secure server session
  const [currentUser, setCurrentUser] = useState<{
    fullName: string;
    email: string;
    role: string;
  } | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetchClientSession()
      .then((data) => {
        if (isMounted && data?.success && data?.data?.session) {
          const sess = data.data.session;
          setCurrentUser({
            fullName: sess.fullName || "Administrator",
            email: sess.email || "",
            role: sess.role || "INSTITUTION_ADMIN",
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingUser(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const userInitials = useMemo(() => {
    if (!currentUser?.fullName) return "AD";
    const parts = currentUser.fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [currentUser?.fullName]);

  const roleDisplay = useMemo(() => {
    switch (currentUser?.role) {
      case "SUPER_ADMIN":
        return "Super Admin";
      case "TEACHER":
        return "Faculty / Staff";
      case "STUDENT":
        return "Student";
      case "PARENT":
        return "Parent / Guardian";
      default:
        return "Institution Admin";
    }
  }, [currentUser?.role]);

  const handleLogout = async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("erp_token");
        localStorage.removeItem("erp_user");
        localStorage.removeItem("erp_institution_name");
        localStorage.removeItem("sst_erp_inst_admin_profile");
      }
      await fetch("/api/auth/me", { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-[#E2E8F0] shadow-xs">
      {/* Left: Mobile Toggle & Institution Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#123B5A] text-white font-bold shadow-xs">
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-cover" />
            ) : (
              <Building2 className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold text-[#1E293B] leading-tight truncate max-w-[200px] sm:max-w-xs md:max-w-md">
              {profile.name}
            </h1>
            <p className="text-[11px] text-[#64748B] font-medium hidden sm:block">
              {profile.code} • {profile.type}
            </p>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Portal Portal Home Switcher Link */}
        <Link
          href="/"
          className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#64748B] hover:text-[#1E293B] hover:bg-[#F8FAFC] transition-colors"
          title="Return to Shared ERP Portal Selector"
        >
          <span>Main Portal</span>
          <ExternalLink className="w-3 h-3 text-[#64748B]" />
        </Link>

        {/* Active Academic Year Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowYearMenu(!showYearMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#1E293B] transition-colors cursor-pointer"
            title="Switch Active Academic Year"
          >
            <Calendar className="w-4 h-4 text-[#F5A000]" />
            <div className="text-left hidden md:block">
              <span className="text-[10px] uppercase font-semibold text-[#64748B] block leading-none">
                Academic Year
              </span>
              <span className="text-xs font-bold text-[#123B5A] leading-none">
                {isAcademicYearsLoading ? "Loading..." : (activeAcademicYear?.name || "Not Set")}
              </span>
            </div>
            <span className="text-xs font-bold text-[#123B5A] md:hidden">
              {isAcademicYearsLoading ? "Loading..." : (activeAcademicYear?.name || "Not Set")}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
          </button>

          {showYearMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-[#E2E8F0] p-1.5 z-40 animate-in fade-in zoom-in-95">
              <div className="px-3 py-2 text-[11px] font-bold text-[#64748B] uppercase tracking-wider border-b border-[#F1F5F9]">
                Select Active Year
              </div>
              <div className="py-1">
                {isAcademicYearsLoading ? (
                  <div className="px-3 py-3 text-xs text-[#64748B] text-center">
                    Loading academic years...
                  </div>
                ) : academicYears.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-[#64748B] text-center">
                    No academic years configured.
                  </div>
                ) : (
                  academicYears.map((ay) => (
                    <button
                      key={ay.id}
                      onClick={() => {
                        setActiveAcademicYear(ay.id);
                        setShowYearMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition-colors cursor-pointer ${
                        ay.isActive
                          ? "bg-[#FEF3C7] text-[#D97706] font-bold"
                          : "text-[#1E293B] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <span>{ay.name}</span>
                      {ay.isActive && (
                        <span className="text-[10px] font-semibold bg-[#F5A000] text-white px-1.5 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live Notification Dropdown */}
        <NotificationDropdown />

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            aria-label="User Profile Menu"
          >
            <div className="w-8 h-8 rounded-full bg-[#123B5A] text-white flex items-center justify-center font-bold text-xs ring-2 ring-[#F5A000]/20">
              {isLoadingUser ? "..." : userInitials}
            </div>
            <div className="hidden lg:block text-left leading-none">
              <span className="text-xs font-bold text-[#1E293B] block">
                {isLoadingUser ? "Loading..." : (currentUser?.fullName || "Administrator")}
              </span>
              <span className="text-[11px] text-[#F5A000] font-semibold">
                {roleDisplay}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#64748B] hidden lg:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-[#E2E8F0] p-1.5 z-40 animate-in fade-in">
              <div className="px-3 py-2 border-b border-[#F1F5F9]">
                <p className="text-xs font-bold text-[#1E293B] truncate">
                  {isLoadingUser ? "Loading..." : (currentUser?.fullName || "Administrator")}
                </p>
                <p className="text-[11px] text-[#64748B] truncate font-medium mt-0.5" title={currentUser?.email || undefined}>
                  {isLoadingUser ? "Loading..." : (currentUser?.email || "No email available")}
                </p>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-[#14B8A6] font-bold">
                  <ShieldCheck className="w-3 h-3" />
                  {currentUser?.role === "SUPER_ADMIN"
                    ? "Platform Administrator"
                    : currentUser?.role === "TEACHER"
                    ? "Faculty Member"
                    : "System Administrator"}
                </div>
              </div>
              <div className="py-1">
                <Link
                  href="/admin/settings"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-[#1E293B] hover:bg-[#F8FAFC]"
                >
                  <User className="w-3.5 h-3.5 text-[#64748B]" /> Institution Profile
                </Link>
                <Link
                  href="/admin/roles-permissions"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-[#1E293B] hover:bg-[#F8FAFC]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#F5A000]" /> Roles & Access
                </Link>
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setIsPasswordModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-[#1E293B] hover:bg-[#F8FAFC] text-left cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#F5A000]" /> Security & Password
                </button>
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-[#DC2626] hover:bg-[#FEE2E2] text-left cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </header>
  );
};
