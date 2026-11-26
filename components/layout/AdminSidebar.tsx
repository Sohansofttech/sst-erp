"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInstitution } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  getRoleLandingRoute,
  hasPermission,
  isDepartmentalRole,
  PERMISSIONS,
  ROLE_LABELS,
} from "@/lib/security/rbac";
import {
  LayoutDashboard,
  Settings,
  GraduationCap,
  Calendar,
  BookOpen,
  Building,
  Layers,
  BookMarked,
  UserPlus,
  Users,
  HeartHandshake,
  Briefcase,
  ShieldAlert,
  Clock,
  CalendarCheck,
  FileSpreadsheet,
  Award,
  TrendingUp,
  FileText,
  CreditCard,
  BarChart3,
  Home,
  Bus,
  CalendarDays,
  Shield,
  MessageSquare,
  CheckSquare,
  History,
  ChevronDown,
  Sparkles,
  HelpCircle,
  Upload,
} from "lucide-react";

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
  userPermissions?: string[];
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  isOpen,
  onClose,
  userRole,
  userPermissions = [],
}) => {
  const pathname = usePathname();
  const { profile, activeAcademicYear, isAcademicYearsLoading } = useInstitution();
  const isRoleResolved = Boolean(userRole && userRole.trim().length > 0);
  const isDeptStaff = isRoleResolved && isDepartmentalRole(userRole);
  const homeHref = !isRoleResolved ? "/admin" : isDeptStaff ? getRoleLandingRoute(userRole) : "/admin";
  const badgeText = !isRoleResolved
    ? "..."
    : isDeptStaff
    ? ROLE_LABELS[(userRole || "").toUpperCase()] || "Staff"
    : "Admin";
  const [academicsOpen, setAcademicsOpen] = useState(
    pathname.startsWith("/admin/academics") || pathname === "/admin"
  );
  const [studentsOpen, setStudentsOpen] = useState(
    pathname.startsWith("/admin/students")
  );

  const institutionInitials = React.useMemo(() => {
    const trimmed = (profile?.name || "").trim();
    if (!trimmed) return "ERP";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
    const STOP_WORDS = new Set(["OF", "AND", "&", "THE", "FOR", "IN", "AT"]);
    const meaningfulParts = parts.filter((p) => !STOP_WORDS.has(p.toUpperCase()));
    const targetParts = meaningfulParts.length >= 2 ? meaningfulParts : parts;
    return targetParts.slice(0, 3).map((p) => p[0]).join("").toUpperCase();
  }, [profile?.name]);

  const isAcademicsActive = pathname.startsWith("/admin/academics");

  const campusServiceLinks = [
    { href: "/admin/roles-permissions", label: "Roles & Permissions", icon: ShieldAlert },
    { href: "/admin/events", label: "Events & Resources", icon: CalendarDays },
    { href: "/admin/gate-management", label: "Gate Management", icon: Shield },
    { href: "/admin/communication", label: "Communication", icon: MessageSquare },
    { href: "/admin/feedback", label: "Grievances & Feedback", icon: HeartHandshake },
    { href: "/admin/approvals", label: "Approvals", icon: CheckSquare },
    { href: "/admin/audit-logs", label: "Audit Logs", icon: History },
    { href: "/admin/support", label: "Support & Helpdesk", icon: HelpCircle },
    { href: "/subscription", label: "Subscription & Plans", icon: Sparkles },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel - Fixed Deep Navy Blue Vertical Sidebar */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 w-64 bg-[var(--admin-sidebar-bg,#123B5A)] text-white flex flex-col transition-transform duration-300 ease-in-out shadow-xl",
          "lg:static lg:h-full lg:shrink-0 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand / Logo Area (Fixed Top) */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-white/10 bg-black/20 shrink-0">
          <Link href={homeHref} className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--admin-accent,#F5A000)] flex items-center justify-center font-black text-white text-xs shadow-xs shrink-0 overflow-hidden">
              {profile?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoUrl} alt="Logo" className="w-8 h-8 object-cover rounded-lg" />
              ) : (
                institutionInitials
              )}
            </div>
            <div className="min-w-0">
              <span className="text-sm font-extrabold tracking-wide text-white block leading-tight truncate" title={profile?.name || "Campus Portal"}>
                {profile?.name || "Campus Portal"}
              </span>
              <span className="text-[10px] uppercase font-bold text-[#8EA4C2] tracking-wider block truncate">
                {profile?.code ? `${profile.code} • ${badgeText}` : `Portal • ${badgeText}`}
              </span>
            </div>
          </Link>
          <span className="text-[10px] font-semibold bg-[var(--admin-accent,#F5A000)]/30 text-white border border-white/30 px-1.5 py-0.5 rounded shrink-0">
            {badgeText}
          </span>
        </div>

        {/* Navigation Items (Scrollable independently with white icons and text) */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {!isRoleResolved ? (
            <div className="space-y-2 px-2 py-2" aria-label="Loading navigation">
              <div className="h-7 rounded-lg bg-white/10 animate-pulse" />
              <div className="h-7 rounded-lg bg-white/10 animate-pulse" />
              <div className="h-7 rounded-lg bg-white/10 animate-pulse" />
            </div>
          ) : isDeptStaff ? (
            <>
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8EA4C2]">
                Department Workspace
              </div>

              {hasPermission(userPermissions, PERMISSIONS.ADMISSIONS_READ, userRole) && (
                <div className="space-y-0.5">
                  <Link
                    href="/admin/admissions"
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                      pathname.startsWith("/admin/admissions")
                        ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                        : "text-white hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <UserPlus className="w-4 h-4 shrink-0 text-white" />
                    <span>Admissions Portal</span>
                  </Link>
                  <div className="ml-4 pl-3 border-l border-white/10 space-y-0.5 py-0.5">
                    {[
                      { href: "/admin/admissions?tab=overview", label: "Overview" },
                      { href: "/admin/admissions?tab=applications", label: "Applications" },
                      { href: "/admin/admissions?tab=documents", label: "Document Verification" },
                      { href: "/admin/admissions?tab=followups", label: "Follow-ups" },
                      { href: "/admin/admissions?tab=history", label: "Admission History" },
                    ].map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={onClose}
                        className="block px-2.5 py-1 rounded-md text-[11px] text-[#E2E8F0] hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {hasPermission(userPermissions, PERMISSIONS.FEES_READ, userRole) && (
                <div className="space-y-0.5">
                  <Link
                    href="/admin/fees"
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                      pathname.startsWith("/admin/fees")
                        ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                        : "text-white hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <CreditCard className="w-4 h-4 shrink-0 text-white" />
                    <span>Finance &amp; Accounts</span>
                  </Link>
                  <div className="ml-4 pl-3 border-l border-white/10 space-y-0.5 py-0.5">
                    {[
                      { href: "/admin/fees?tab=overview", label: "Overview" },
                      { href: "/admin/fees?tab=structures", label: "Fee Structures" },
                      { href: "/admin/fees?tab=collection", label: "Fee Collection" },
                      { href: "/admin/fees?tab=invoices", label: "Invoices" },
                      { href: "/admin/fees?tab=receipts", label: "Payments & Receipts" },
                      { href: "/admin/fees?tab=concessions", label: "Concessions" },
                      { href: "/admin/fees?tab=refunds", label: "Refunds" },
                    ].map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={onClose}
                        className="block px-2.5 py-1 rounded-md text-[11px] text-[#E2E8F0] hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {sub.label}
                      </Link>
                    ))}
                    {hasPermission(userPermissions, PERMISSIONS.REPORTS_FINANCE, userRole) && (
                      <Link
                        href="/admin/reports?type=finance"
                        onClick={onClose}
                        className="block px-2.5 py-1 rounded-md text-[11px] text-[#E2E8F0] hover:bg-white/10 hover:text-white transition-colors"
                      >
                        Financial Reports
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {hasPermission(userPermissions, PERMISSIONS.HOSTEL_READ, userRole) && (
                <div className="space-y-0.5">
                  <Link
                    href="/admin/hostel"
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                      pathname.startsWith("/admin/hostel")
                        ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                        : "text-white hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Home className="w-4 h-4 shrink-0 text-white" />
                    <span>Hostel Management</span>
                  </Link>
                  <div className="ml-4 pl-3 border-l border-white/10 space-y-0.5 py-0.5">
                    {[
                      { href: "/admin/hostel?tab=overview", label: "Overview" },
                      { href: "/admin/hostel?tab=matrix", label: "Buildings & Rooms" },
                      { href: "/admin/hostel?tab=allocations", label: "Allocations" },
                      { href: "/admin/hostel?tab=maintenance", label: "Attendance & Maintenance" },
                    ].map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={onClose}
                        className="block px-2.5 py-1 rounded-md text-[11px] text-[#E2E8F0] hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {hasPermission(userPermissions, PERMISSIONS.TRANSPORT_READ, userRole) && (
                <div className="space-y-0.5">
                  <Link
                    href="/admin/transport"
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                      pathname.startsWith("/admin/transport")
                        ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                        : "text-white hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Bus className="w-4 h-4 shrink-0 text-white" />
                    <span>Transport Management</span>
                  </Link>
                  <div className="ml-4 pl-3 border-l border-white/10 space-y-0.5 py-0.5">
                    {[
                      { href: "/admin/transport?tab=overview", label: "Overview" },
                      { href: "/admin/transport?tab=fleet", label: "Vehicles & Drivers" },
                      { href: "/admin/transport?tab=routes", label: "Routes & Stops" },
                      { href: "/admin/transport?tab=allocations", label: "Allocations" },
                      { href: "/admin/transport?tab=maintenance", label: "Maintenance & Reports" },
                    ].map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={onClose}
                        className="block px-2.5 py-1 rounded-md text-[11px] text-[#E2E8F0] hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {hasPermission(userPermissions, PERMISSIONS.STUDENTS_READ, userRole) && (
                <>
                  <div className="pt-3 px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8EA4C2]">
                    Shared Directory
                  </div>
                  <Link
                    href="/admin/students"
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                      pathname.startsWith("/admin/students")
                        ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                        : "text-white hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Users className="w-4 h-4 shrink-0 text-white" />
                    <span>Student Directory (Read-Only)</span>
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
          {/* Section: Main Administration */}
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8EA4C2]">
            Main Administration
          </div>

          {/* 1. Dashboard */}
          <Link
            href="/admin"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname === "/admin"
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0 text-white" />
            <span>Dashboard</span>
          </Link>

          {/* 2. Institution Settings */}
          <Link
            href="/admin/settings"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname === "/admin/settings"
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <Settings className="w-4 h-4 shrink-0 text-white" />
            <span>Institution Settings</span>
          </Link>

          {/* 3. Academics Collapsible Group */}
          <div>
            <button
              onClick={() => setAcademicsOpen(!academicsOpen)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                isAcademicsActive
                  ? "bg-[#16466C] text-white"
                  : "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              <div className="flex items-center gap-3">
                <GraduationCap className="w-4 h-4 shrink-0 text-white" />
                <span>Academics</span>
              </div>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-white/80 transition-transform duration-200",
                  academicsOpen && "rotate-180"
                )}
              />
            </button>

            {academicsOpen && (
              <div className="mt-1 ml-4 pl-3 border-l border-white/10 space-y-1">
                {/* 3.1 Academic Years */}
                <Link
                  href="/admin/academics/academic-years"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors",
                    pathname.startsWith("/admin/academics/academic-years")
                      ? "bg-[var(--admin-active-nav,#F5A000)] text-white font-semibold"
                      : "text-[#F1F5F9] hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Calendar className="w-3.5 h-3.5 text-white shrink-0" />
                  <span>Academic Years</span>
                </Link>

                {/* 3.2 Departments */}
                <Link
                  href="/admin/academics/departments"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors",
                    pathname.startsWith("/admin/academics/departments")
                      ? "bg-[var(--admin-active-nav,#F5A000)] text-white font-semibold"
                      : "text-[#F1F5F9] hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Building className="w-3.5 h-3.5 text-white shrink-0" />
                  <span>Departments</span>
                </Link>

                {/* 3.3 Programs & Courses */}
                <Link
                  href="/admin/academics/courses"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors",
                    pathname.startsWith("/admin/academics/courses")
                      ? "bg-[var(--admin-active-nav,#F5A000)] text-white font-semibold"
                      : "text-[#F1F5F9] hover:bg-white/10 hover:text-white"
                  )}
                >
                  <BookOpen className="w-3.5 h-3.5 text-white shrink-0" />
                  <span>Programs & Courses</span>
                </Link>

                {/* 3.4 Classes & Sections */}
                <Link
                  href="/admin/academics/classes"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors",
                    pathname.startsWith("/admin/academics/classes")
                      ? "bg-[var(--admin-active-nav,#F5A000)] text-white font-semibold"
                      : "text-[#F1F5F9] hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Layers className="w-3.5 h-3.5 text-white shrink-0" />
                  <span>Classes & Sections</span>
                </Link>

                {/* 3.5 Subjects */}
                <Link
                  href="/admin/academics/subjects"
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors",
                    pathname.startsWith("/admin/academics/subjects")
                      ? "bg-[var(--admin-active-nav,#F5A000)] text-white font-semibold"
                      : "text-[#F1F5F9] hover:bg-white/10 hover:text-white"
                  )}
                >
                  <BookMarked className="w-3.5 h-3.5 text-white shrink-0" />
                  <span>Subject Master</span>
                </Link>
              </div>
            )}
          </div>

          {/* Section: People & Workload (Exact 7 top-level entries, no nested submenus) */}
          <div className="pt-3 px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8EA4C2]">
            People & Workload
          </div>

          {/* 1. Admissions */}
          {hasPermission(userPermissions, PERMISSIONS.ADMISSIONS_READ, userRole) && (
            <Link
              href="/admin/admissions"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                pathname.startsWith("/admin/admissions")
                  ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                  : "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              <UserPlus className="w-4 h-4 shrink-0 text-white" />
              <span>Admissions</span>
            </Link>
          )}

          {/* 2. Students */}
          <Link
            href="/admin/students"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/students")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <Users className="w-4 h-4 shrink-0 text-white" />
            <span>Students</span>
          </Link>

          {/* 3. Guardians */}
          <Link
            href="/admin/guardians"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/guardians")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <HeartHandshake className="w-4 h-4 shrink-0 text-white" />
            <span>Guardians</span>
          </Link>

          {/* 4. Faculty & Staff */}
          <Link
            href="/admin/staff"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/staff")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <Briefcase className="w-4 h-4 shrink-0 text-white" />
            <span>Faculty & Staff</span>
          </Link>

          {/* 5. Accountant */}
          {hasPermission(userPermissions, PERMISSIONS.FEES_READ, userRole) && (
            <Link
              href="/admin/fees"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                pathname.startsWith("/admin/fees")
                  ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                  : "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              <CreditCard className="w-4 h-4 shrink-0 text-white" />
              <span>Accountant</span>
            </Link>
          )}

          {/* 6. Warden */}
          {hasPermission(userPermissions, PERMISSIONS.HOSTEL_READ, userRole) && (
            <Link
              href="/admin/hostel"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                pathname.startsWith("/admin/hostel")
                  ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                  : "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              <Home className="w-4 h-4 shrink-0 text-white" />
              <span>Warden</span>
            </Link>
          )}

          {/* 7. Transport Manager */}
          {hasPermission(userPermissions, PERMISSIONS.TRANSPORT_READ, userRole) && (
            <Link
              href="/admin/transport"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                pathname.startsWith("/admin/transport")
                  ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                  : "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              <Bus className="w-4 h-4 shrink-0 text-white" />
              <span>Transport Manager</span>
            </Link>
          )}

          {/* Section: Academic Operations */}
          <div className="pt-3 px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8EA4C2]">
            Academic Operations
          </div>

          {/* 9. Timetable */}
          <Link
            href="/admin/timetable"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/timetable")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <Clock className="w-4 h-4 shrink-0 text-white" />
            <span>Timetable</span>
          </Link>

          {/* 10. Attendance */}
          <Link
            href="/admin/attendance"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/attendance")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <CalendarCheck className="w-4 h-4 shrink-0 text-white" />
            <span>Attendance</span>
          </Link>

          {/* 11. Examinations */}
          <Link
            href="/admin/examinations"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/examinations")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0 text-white" />
            <span>Examinations</span>
          </Link>

          {/* 12. Internal Assessment (IA) */}
          <Link
            href="/admin/ia"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/ia")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <Award className="w-4 h-4 shrink-0 text-white" />
            <span>Internal Assessment</span>
          </Link>

          {/* 13. Results */}
          <Link
            href="/admin/results"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/results")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <GraduationCap className="w-4 h-4 shrink-0 text-white" />
            <span>Results & Grading</span>
          </Link>

          {/* 14. Promotions */}
          <Link
            href="/admin/promotions"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/promotions")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <TrendingUp className="w-4 h-4 shrink-0 text-white" />
            <span>Student Promotions</span>
          </Link>

          {/* 15. Certificates */}
          <Link
            href="/admin/certificates"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/certificates")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <FileText className="w-4 h-4 shrink-0 text-white" />
            <span>Certificates</span>
          </Link>

          {/* Section: Campus Services & Administration */}
          <div className="pt-3 px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8EA4C2]">
            Campus Services & Administration
          </div>

          {/* Campus Services Links (Real Functional Modules) */}
          {campusServiceLinks.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors",
                  isActive
                    ? "bg-[var(--admin-active-nav,#F5A000)] text-white font-semibold shadow-xs"
                    : "text-white hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="w-4 h-4 shrink-0 text-white" />
                <span>{item.label}</span>
              </Link>
            );
          })}
            </>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-white/10 bg-black/20 text-[11px] text-[#8EA4C2] shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#F5A000]" />
            <span className="font-semibold text-white">Academic Year</span>
          </div>
          <p className="text-[10px] text-[#8EA4C2] mt-0.5 truncate" title={activeAcademicYear?.name}>
            {isAcademicYearsLoading
              ? "Loading..."
              : activeAcademicYear
              ? `AY ${activeAcademicYear.name}`
              : "No Academic Year Set"}
          </p>
        </div>
      </aside>
    </>
  );
};
