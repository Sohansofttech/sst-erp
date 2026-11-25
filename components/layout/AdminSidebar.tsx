"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInstitution } from "@/lib/store";
import { useDivision, ALL_DIVISIONS_ID } from "@/lib/division-store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Settings,
  GraduationCap,
  Calendar,
  BookOpen,
  Building,
  Building2,
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
} from "lucide-react";

export interface AcademicNavItem {
  href: string;
  label: string;
  iconName: "Calendar" | "Building" | "BookOpen" | "Layers" | "BookMarked";
}

export function getVisibleAcademicNavItems(divType: string): AcademicNavItem[] {
  if (divType === "ALL") return [];

  const items: AcademicNavItem[] = [
    { href: "/admin/academics/academic-years", label: "Academic Years", iconName: "Calendar" },
  ];

  if (divType === "COLLEGE" || divType === "ACADEMY") {
    items.push({ href: "/admin/academics/departments", label: "Departments", iconName: "Building" });
  }

  if (divType === "COLLEGE") {
    items.push({ href: "/admin/academics/courses", label: "Programs & Courses", iconName: "BookOpen" });
  }

  items.push({ href: "/admin/academics/classes", label: "Classes & Sections", iconName: "Layers" });

  if (divType !== "MONTESSORI") {
    items.push({ href: "/admin/academics/subjects", label: "Subject Master", iconName: "BookMarked" });
  }

  return items;
}

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const { profile, activeAcademicYear, isAcademicYearsLoading } = useInstitution();
  const { activeDivision, activeDivisionId } = useDivision();
  const divType = activeDivisionId === ALL_DIVISIONS_ID ? "ALL" : (activeDivision?.type ?? "COLLEGE");
  const visibleAcademicItems = getVisibleAcademicNavItems(divType);
  const [academicsOpen, setAcademicsOpen] = useState(
    pathname.startsWith("/admin/academics") || pathname === "/admin"
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
    { href: "/admin/fees", label: "Fees & Finance", icon: CreditCard },
    { href: "/subscriptions", label: "Central Subscriptions & Billing", icon: CreditCard },
    { href: "/admin/subscriptions", label: "Subscriptions & Billing", icon: CreditCard },
    { href: "/admin/hostel", label: "Hostel", icon: Home },
    { href: "/admin/transport", label: "Transport", icon: Bus },
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
          <Link href="/admin" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--admin-accent,#F5A000)] flex items-center justify-center font-black text-white text-xs shadow-xs shrink-0 overflow-hidden">
              {profile?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoUrl} alt="Logo" className="w-8 h-8 object-cover rounded-lg" />
              ) : (
                institutionInitials
              )}
            </div>
            <div className="min-w-0">
              <span className="text-sm font-extrabold tracking-wide text-white block leading-tight truncate" title={profile?.name || "Institution Admin"}>
                {profile?.name || "Institution Admin"}
              </span>
              <span className="text-[10px] uppercase font-bold text-[#8EA4C2] tracking-wider block truncate">
                {profile?.code ? `${profile.code} • Admin` : "Institution Admin"}
              </span>
            </div>
          </Link>
          <span className="text-[10px] font-semibold bg-[var(--admin-accent,#F5A000)]/30 text-white border border-white/30 px-1.5 py-0.5 rounded shrink-0">
            Admin
          </span>
        </div>

        {/* Navigation Items (Scrollable independently with white icons and text) */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
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

          {/* 3. Educational Divisions */}
          <Link
            href="/admin/divisions"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/divisions")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <Building2 className="w-4 h-4 shrink-0 text-white" />
            <span>Educational Divisions</span>
          </Link>

          {/* 4. Academics Collapsible Group (Adaptive per division type) */}
          {visibleAcademicItems.length > 0 && (
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
                  {visibleAcademicItems.map((item) => {
                    const IconComponent =
                      item.iconName === "Calendar"
                        ? Calendar
                        : item.iconName === "Building"
                        ? Building
                        : item.iconName === "BookOpen"
                        ? BookOpen
                        : item.iconName === "Layers"
                        ? Layers
                        : BookMarked;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[11px] transition-colors",
                          pathname.startsWith(item.href)
                            ? "bg-[var(--admin-active-nav,#F5A000)] text-white font-semibold"
                            : "text-[#F1F5F9] hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <IconComponent className="w-3.5 h-3.5 text-white shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. Admissions */}
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

          {/* Section: People & Workload */}
          <div className="pt-3 px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8EA4C2]">
            People & Workload
          </div>

          {/* 5. Students */}
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

          {/* 6. Guardians */}
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

          {/* 7. Faculty & Staff */}
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

          {/* 8. Roles & Permissions */}
          <Link
            href="/admin/roles-permissions"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
              pathname.startsWith("/admin/roles-permissions")
                ? "bg-[var(--admin-active-nav,#F5A000)] text-white shadow-xs"
                : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 text-white" />
            <span>Roles & Permissions</span>
          </Link>

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
