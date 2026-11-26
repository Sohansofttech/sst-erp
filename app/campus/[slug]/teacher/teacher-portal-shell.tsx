"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Award,
  Bell,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileBarChart2,
  FileCheck2,
  FileSpreadsheet,
  FolderOpen,
  GraduationCap,
  HeartHandshake,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
  UserCircle2,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type PortalNavGroup,
  type PortalNavItem,
} from "@/components/shared"
import { NotificationDropdown } from "@/components/shared/NotificationDropdown"
import { MustChangePasswordBanner } from "@/components/shared/MustChangePasswordBanner"
import {
  TeacherRoleProvider,
  useTeacherRole,
  type TeacherRole,
  type TeacherRoleContextUser,
} from "./teacher-role-context"
import { TEACHER_ROLE_CONFIGS } from "@/lib/auth/roles"
import { getTeacherPortalKpis } from "@/lib/services/teacher.service"
import { TeacherDivisionSwitcher } from "@/components/teacher/TeacherDivisionSwitcher"

const FALLBACK_ACADEMIC_YEARS = ["2026-27", "2025-26", "2024-25"]

function getRoleOptions(user: TeacherRoleContextUser): Array<{
  value: TeacherRole
  label: string
  shortLabel: string
  title: string
}> {
  const homeroomDisplay = user.homeroomClass ? user.homeroomClass.replace(/^Class\s*/i, "") : ""
  const deptDisplay = user.department ? user.department.replace(/^Department of\s*/i, "") : ""

  return [
    {
      value: "teacher",
      label: "Teacher",
      shortLabel: "Teacher",
      title: user.role || "Teacher Workspace",
    },
    {
      value: "class_teacher",
      label: "Class Teacher",
      shortLabel: homeroomDisplay ? `CT (${homeroomDisplay})` : "Class Teacher",
      title: user.homeroomClass ? `Class Teacher — ${user.homeroomClass}` : "Class Teacher Workspace",
    },
    {
      value: "hod",
      label: "HoD",
      shortLabel: deptDisplay ? `HoD (${deptDisplay.slice(0, 4)})` : "HoD",
      title: user.department
        ? `HoD — ${user.department.startsWith("Department of") ? user.department : `Department of ${user.department}`}`
        : "Head of Department",
    },
  ]
}

function getInitials(name: string): string {
  if (!name) return "T"
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

/**
 * Role Switcher Component:
 * - On desktop: pill group in header
 * - In drawer: full-width segmented buttons
 */
function TeacherRoleSwitch({
  inDrawer = false,
  onSwitched,
}: {
  inDrawer?: boolean
  onSwitched?: () => void
}) {
  const { role, availableRoles, switchRole, isSwitching, user } = useTeacherRole()

  const roleOptions = React.useMemo(() => getRoleOptions(user), [user])

  if (!availableRoles || availableRoles.length <= 1) {
    return null
  }

  const visibleOptions = roleOptions.filter((option) =>
    availableRoles.includes(option.value)
  )

  const handleSwitch = async (targetRole: TeacherRole) => {
    if (targetRole === role || isSwitching) return
    await switchRole(targetRole)
    onSwitched?.()
  }

  if (inDrawer) {
    return (
      <div className="space-y-1.5 px-3 py-2">
        <p className="text-[10px] font-bold tracking-wider text-white/60 uppercase">
          Switch Workspace
        </p>
        <div
          role="group"
          aria-label="Active workspace switcher"
          className="grid grid-cols-3 gap-1 rounded-xl bg-white/[0.08] p-1 border border-white/10"
        >
          {visibleOptions.map((option) => {
            const active = role === option.value
            return (
              <button
                key={option.value}
                type="button"
                disabled={isSwitching}
                onClick={() => void handleSwitch(option.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex min-h-[38px] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-bold transition-all",
                  active
                    ? "bg-[#F5A000] text-[#123B5A] shadow-xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white",
                  isSwitching && "opacity-70 cursor-wait"
                )}
              >
                {active && isSwitching && (
                  <Loader2 className="size-3 animate-spin text-[#123B5A]" />
                )}
                <span className="truncate">{option.shortLabel}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label="Active workspace switcher"
      className="inline-flex items-center rounded-xl border border-[#E5E9EF] bg-[#EEF1F5] p-0.5 shadow-2xs"
    >
      {visibleOptions.map((option) => {
        const active = role === option.value
        return (
          <button
            key={option.value}
            type="button"
            disabled={isSwitching}
            onClick={() => void handleSwitch(option.value)}
            aria-pressed={active}
            className={cn(
              "relative flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-all",
              active
                ? "bg-[#123B5A] text-white shadow-xs"
                : "text-[#788391] hover:text-[#202936] hover:bg-white/60",
              isSwitching && "opacity-70 cursor-wait"
            )}
          >
            {active && isSwitching && (
              <Loader2 className="size-3 animate-spin text-[#F5A000]" />
            )}
            <span className="hidden xl:inline">{option.label}</span>
            <span className="xl:hidden">{option.shortLabel}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Reusable Sidebar Content (Used for desktop sidebar & mobile drawer)
 */
function SidebarContent({
  institutionName,
  institutionSlug,
  portalLabel,
  groups,
  pathname,
  user,
  onSignOut,
  sidebarFooter,
  onNavigate,
  academicYear,
  academicYears,
  onAcademicYearChange,
}: {
  institutionName: string
  institutionSlug: string
  portalLabel: string
  groups: PortalNavGroup[]
  pathname: string
  user: TeacherRoleContextUser
  onSignOut?: () => void
  sidebarFooter?: React.ReactNode
  onNavigate?: () => void
  academicYear: string
  academicYears: string[]
  onAcademicYearChange: (year: string) => void
}) {
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {}
      for (const group of groups) {
        initial[group.id] = group.defaultOpen ?? true
      }
      return initial
    }
  )

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !(prev[groupId] ?? true),
    }))
  }

  const userInitials = user.initials || getInitials(user.name)
  const displayYears = academicYears && academicYears.length > 0 ? academicYears : FALLBACK_ACADEMIC_YEARS

  return (
    <div className="flex h-full flex-col bg-[#123B5A] text-white select-none">
      {/* Brand header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#F5A000] text-[#123B5A] shadow-xs">
            <GraduationCap className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold tracking-tight text-white">
              {institutionName}
            </p>
            <p className="truncate text-[12px] font-medium text-white/75">
              {portalLabel}
            </p>
          </div>
        </div>
        {onNavigate && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onNavigate}
            aria-label="Close navigation drawer"
            className="lg:hidden size-9 rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </Button>
        )}
      </div>

      {/* Role Switcher in Drawer (on mobile/tablet) */}
      <div className="lg:hidden">
        <TeacherRoleSwitch inDrawer onSwitched={onNavigate} />
      </div>

      {/* Profile banner inside sidebar */}
      <div className="mx-3 mt-2 mb-1 flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 border border-white/10">
        <Avatar className="size-10 shrink-0 ring-2 ring-[#F5A000]/60">
          <AvatarFallback className="bg-[#F5A000] text-[#123B5A] font-bold text-xs">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-white leading-tight">
            {user.name}
          </p>
          <p className="truncate text-[11px] text-white/70 leading-tight mt-0.5">
            {user.role}
          </p>
        </div>
      </div>

      {/* Academic Year select inside drawer on mobile */}
      <div className="mx-3 my-1 block lg:hidden">
        <div className="flex items-center justify-between rounded-xl bg-white/[0.06] px-3 py-2 border border-white/10">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-white/75">
            <Calendar className="size-3.5 text-[#F5A000]" />
            ACADEMIC YEAR
          </span>
          <select
            value={academicYear}
            onChange={(e) => onAcademicYearChange(e.target.value)}
            aria-label="Select academic year in drawer"
            className="bg-transparent text-[12px] font-bold text-white outline-none cursor-pointer text-right [&>option]:text-black"
          >
            {displayYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grouped Navigation */}
      <nav
        aria-label="Portal Navigation"
        className="flex-1 space-y-4 overflow-y-auto px-3 py-3"
      >
        {groups.map((group) => {
          const isOpen = openGroups[group.id] ?? true
          const isCollapsible = group.collapsible ?? true

          return (
            <div key={group.id} className="space-y-1">
              {isCollapsible ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                  aria-controls={`nav-group-${group.id}`}
                  className="flex w-full min-h-[36px] items-center justify-between rounded-lg px-3 py-1.5 text-left text-[11px] font-bold tracking-wider text-white/60 uppercase transition-colors hover:text-white/90"
                >
                  <span>{group.label}</span>
                  {isOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
              ) : (
                <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-white/60 uppercase">
                  {group.label}
                </div>
              )}

              {isOpen && (
                <div id={`nav-group-${group.id}`} className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "group relative flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-xs transition-all",
                          isActive
                            ? "bg-[#F5A000] font-bold text-[#123B5A] shadow-xs"
                            : "text-white/80 font-semibold hover:bg-[#1B4D70] hover:text-white"
                        )}
                      >
                        {item.icon && (
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center transition-colors",
                              isActive
                                ? "text-[#123B5A]"
                                : "text-white/75 group-hover:text-white"
                            )}
                          >
                            {item.icon}
                          </span>
                        )}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span
                            className={cn(
                              "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold",
                              isActive
                                ? "bg-[#123B5A]/20 text-[#123B5A]"
                                : item.badgeTone === "warning"
                                  ? "bg-[#F5A000]/30 text-amber-200"
                                  : "bg-white/15 text-white"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Sidebar footer */}
      <div className="border-t border-white/10 p-3 space-y-2 pb-safe">
        {sidebarFooter}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full min-h-[40px] items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-white/75 hover:bg-[#1B4D70] hover:text-white transition-colors"
          >
            <LogOut className="size-4 text-white/70" />
            <span>Sign out</span>
          </button>
        )}
      </div>
    </div>
  )
}

function TeacherPortalShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const {
    role,
    academicYear,
    academicYears,
    setAcademicYear,
    slug,
    institutionName,
    user,
    signOut,
  } = useTeacherRole()

  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [pendingApprovals, setPendingApprovals] = React.useState(0)

  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const drawerRef = React.useRef<HTMLDivElement | null>(null)

  // Auto-close drawer on route change
  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Body scroll lock while mobile drawer is open
  React.useEffect(() => {
    if (mobileOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [mobileOpen])

  // Accessibility: Focus trap & Escape key handler for drawer
  React.useEffect(() => {
    if (!mobileOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false)
        menuButtonRef.current?.focus()
        return
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    const timer = setTimeout(() => {
      if (drawerRef.current) {
        const first = drawerRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        first?.focus()
      }
    }, 50)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      clearTimeout(timer)
    }
  }, [mobileOpen])

  React.useEffect(() => {
    let active = true
    getTeacherPortalKpis(slug)
      .then((kpis) => {
        if (!active) return
        setUnreadCount(kpis.unreadNotificationsCount || 0)
        setPendingApprovals(kpis.pendingApprovalsCount || 0)
      })
      .catch(() => {
        if (!active) return
        setUnreadCount(0)
        setPendingApprovals(0)
      })
    return () => {
      active = false
    }
  }, [slug])

  const base = `/campus/${slug}/teacher`

  // Dynamic Navigation Groups tailored to Active Role Workspace
  const navGroups: PortalNavGroup[] = React.useMemo(() => {
    if (role === "class_teacher") {
      return [
        {
          id: "homeroom-main",
          label: user.homeroomClass ? `Homeroom ${user.homeroomClass}` : "Homeroom Section",
          defaultOpen: true,
          items: [
            {
              label: "Section Dashboard",
              href: `${base}/class-teacher`,
              icon: <LayoutDashboard className="size-4" />,
              exact: true,
            },
            {
              label: "Section Students",
              href: `${base}/class-teacher/students`,
              icon: <Users className="size-4" />,
            },
            {
              label: "Attendance Defaulters",
              href: `${base}/class-teacher/defaulters`,
              icon: <ShieldAlert className="size-4" />,
              badgeTone: "warning",
            },
          ],
        },
        {
          id: "homeroom-ops",
          label: "Approvals & Parent Notices",
          defaultOpen: true,
          items: [
            {
              label: "Student Leave & OD",
              href: `${base}/class-teacher/leave-approvals`,
              icon: <CheckCircle2 className="size-4" />,
              badge: pendingApprovals > 0 ? `${pendingApprovals} Pending` : undefined,
              badgeTone: "warning",
            },
            {
              label: "Section Summary & Remarks",
              href: `${base}/class-teacher/recommendations`,
              icon: <FileBarChart2 className="size-4" />,
            },
            {
              label: "Parent Notices Broadcast",
              href: `${base}/class-teacher/notices`,
              icon: <Megaphone className="size-4" />,
            },
          ],
        },
        {
          id: "homeroom-links",
          label: "Academic Coordination",
          defaultOpen: true,
          items: [
            {
              label: "Class Timetable",
              href: `${base}/timetable`,
              icon: <Calendar className="size-4" />,
            },
            {
              label: "Student Mentoring",
              href: `${base}/mentoring`,
              icon: <HeartHandshake className="size-4" />,
            },
            {
              label: "Faculty Profile",
              href: `${base}/profile`,
              icon: <UserCircle2 className="size-4" />,
            },
          ],
        },
      ]
    }

    if (role === "hod") {
      return [
        {
          id: "hod-oversight",
          label: user.department
            ? (user.department.startsWith("Department of") ? user.department : `Department of ${user.department}`)
            : "Department Leadership",
          defaultOpen: true,
          items: [
            {
              label: "Dept Dashboard",
              href: `${base}/hod`,
              icon: <LayoutDashboard className="size-4" />,
              exact: true,
            },
            {
              label: "IA Approval & Lock Queue",
              href: `${base}/hod/ia-approvals`,
              icon: <ClipboardCheck className="size-4" />,
              badge: pendingApprovals > 0 ? `${pendingApprovals} Pending` : undefined,
              badgeTone: "warning",
            },
            {
              label: "Faculty Workload",
              href: `${base}/hod/faculty-load`,
              icon: <Users className="size-4" />,
            },
          ],
        },
        {
          id: "hod-academic-ops",
          label: "Operations & Substitutions",
          defaultOpen: true,
          items: [
            {
              label: "Faculty Leave & Substitutions",
              href: `${base}/hod/leave-approvals`,
              icon: <BookOpen className="size-4" />,
            },
            {
              label: "Department Analytics",
              href: `${base}/hod/analytics`,
              icon: <FileBarChart2 className="size-4" />,
            },
            {
              label: "Department Communication",
              href: `${base}/communication`,
              icon: <Megaphone className="size-4" />,
            },
            {
              label: "HoD Profile",
              href: `${base}/profile`,
              icon: <UserCircle2 className="size-4" />,
            },
          ],
        },
      ]
    }

    // Default: TEACHER Workspace
    return [
      {
        id: "main",
        label: "Main",
        defaultOpen: true,
        items: [
          {
            label: "Dashboard",
            href: base,
            icon: <LayoutDashboard className="size-4" />,
            exact: true,
          },
          {
            label: "My Timetable",
            href: `${base}/timetable`,
            icon: <Calendar className="size-4" />,
          },
          {
            label: "My Classes & Students",
            href: `${base}/classes`,
            icon: <Users className="size-4" />,
          },
        ],
      },
      {
        id: "classroom",
        label: "Classroom",
        defaultOpen: true,
        items: [
          {
            label: "Attendance",
            href: `${base}/attendance`,
            icon: <CalendarCheck className="size-4" />,
            exact: true,
          },
          {
            label: "Attendance History",
            href: `${base}/attendance/history`,
            icon: <History className="size-4" />,
          },
          {
            label: "Internal Assessments (IA)",
            href: `${base}/assessments`,
            icon: <ClipboardCheck className="size-4" />,
          },
          {
            label: "Assignments",
            href: `${base}/assignments`,
            icon: <ClipboardList className="size-4" />,
          },
          {
            label: "Study Material (LMS)",
            href: `${base}/lms`,
            icon: <FolderOpen className="size-4" />,
          },
          {
            label: "Quizzes",
            href: `${base}/quizzes`,
            icon: <FileCheck2 className="size-4" />,
          },
        ],
      },
      {
        id: "results-mentoring",
        label: "Results & Mentoring",
        defaultOpen: true,
        items: [
          {
            label: "Results Tracker",
            href: `${base}/results`,
            icon: <FileSpreadsheet className="size-4" />,
          },
          {
            label: "Mentoring",
            href: `${base}/mentoring`,
            icon: <HeartHandshake className="size-4" />,
          },
          {
            label: "Log Book",
            href: `${base}/logbook`,
            icon: <BookMarked className="size-4" />,
          },
        ],
      },
      {
        id: "operations",
        label: "Faculty Operations",
        defaultOpen: true,
        items: [
          {
            label: "Leave & Substitution",
            href: `${base}/leave`,
            icon: <BookOpen className="size-4" />,
            badge: pendingApprovals > 0 ? pendingApprovals : undefined,
            badgeTone: "warning",
          },
          {
            label: "Campus Duties",
            href: `${base}/duties`,
            icon: <Briefcase className="size-4" />,
          },
          {
            label: "Communication",
            href: `${base}/communication`,
            icon: <Megaphone className="size-4" />,
          },
          {
            label: "My Profile",
            href: `${base}/profile`,
            icon: <UserCircle2 className="size-4" />,
          },
        ],
      },
    ]
  }, [base, pendingApprovals, role, user.department, user.homeroomClass])

  const currentRoleMeta = TEACHER_ROLE_CONFIGS[role]

  const portalLabel = React.useMemo(() => {
    if (role === "hod") {
      const dept = user.department ? user.department.replace(/^Department of\s*/i, "") : "Department"
      return `Faculty · HoD ${dept}`
    }
    if (role === "class_teacher") {
      const cls = user.homeroomClass ? user.homeroomClass.replace(/^Class\s*/i, "") : "Section"
      return `Faculty · Class Teacher (${cls})`
    }
    return "Teacher Portal"
  }, [role, user.department, user.homeroomClass])

  const userInitials = user.initials || getInitials(user.name)

  const displayYears = academicYears && academicYears.length > 0 ? academicYears : FALLBACK_ACADEMIC_YEARS

  const handleYearChange = (year: string) => {
    setAcademicYear(year)
    toast.info(`Switched academic year to ${year}`)
  }

  const handleCloseDrawer = () => {
    setMobileOpen(false)
    menuButtonRef.current?.focus()
  }

  const sidebarFooter = (
    <div className="space-y-1.5 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2.5">
      <div className="flex items-center justify-between text-[11px] font-bold text-white/70">
        <span>ACTIVE WORKSPACE</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#F5A000]/25 px-2 py-0.5 text-[10px] font-bold text-[#F5A000]">
          <Award className="size-2.5" />
          {currentRoleMeta?.label}
        </span>
      </div>
      <p className="truncate font-mono text-[12px] text-white/90">
        /{slug} · AY {academicYear}
      </p>
    </div>
  )

  return (
    <div className="sst-teacher-theme min-h-screen bg-[#EEF1F5] text-[#202936]">
      {/* Desktop Fixed Left Sidebar (>=1024px) */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col shadow-lg">
        <SidebarContent
          institutionName={institutionName}
          institutionSlug={slug}
          portalLabel={portalLabel}
          groups={navGroups}
          pathname={pathname}
          user={user}
          onSignOut={signOut}
          sidebarFooter={sidebarFooter}
          academicYear={academicYear}
          academicYears={displayYears}
          onAcademicYearChange={handleYearChange}
        />
      </aside>

      {/* Mobile Off-canvas Drawer (<1024px) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={handleCloseDrawer}
            aria-hidden="true"
          />

          {/* Drawer container */}
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${institutionName} Navigation`}
            className="fixed inset-y-0 left-0 z-50 w-72 sm:w-80 shadow-2xl transition-transform duration-300 ease-out"
          >
            <SidebarContent
              institutionName={institutionName}
              institutionSlug={slug}
              portalLabel={portalLabel}
              groups={navGroups}
              pathname={pathname}
              user={user}
              onSignOut={signOut}
              sidebarFooter={sidebarFooter}
              onNavigate={handleCloseDrawer}
              academicYear={academicYear}
              academicYears={displayYears}
              onAcademicYearChange={handleYearChange}
            />
          </div>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Responsive Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#E2E8F0] bg-white px-3 sm:px-4 lg:px-8 shadow-xs">
          {/* Left section: Hamburger + Institution Brand */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button
              ref={menuButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden size-10 shrink-0 text-[#202936] hover:bg-[#EEF1F5] rounded-xl"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="size-5 text-[#202936]" />
            </Button>

            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <div className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-[#123B5A]/10 text-[#123B5A] sm:flex">
                <Building2 className="size-4" />
              </div>
              <span className="truncate text-[14px] sm:text-[15px] font-bold text-[#202936] max-w-[130px] xs:max-w-[170px] sm:max-w-[240px] md:max-w-xs lg:max-w-none">
                {institutionName}
              </span>
              <Badge
                variant="outline"
                className="hidden rounded-full border-[#F5A000]/40 bg-amber-50 font-sans text-[11px] font-bold text-[#9A6200] sm:inline-flex"
              >
                {currentRoleMeta?.label ?? "Active Teacher"}
              </Badge>
            </div>
          </div>

          {/* Right section: Role Switcher + AY Selector + Notifications + Profile */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
            {/* Teacher Educational Division Switcher */}
            <TeacherDivisionSwitcher />

            {/* Role Switcher: visible on md+ (>=768px). On phones it is comfortably inside the mobile drawer */}
            <div className="hidden md:block">
              <TeacherRoleSwitch />
            </div>

            {/* Academic Year Selector: visible on sm+ (>=640px). On phones accessible in drawer and avatar dropdown */}
            <div className="hidden sm:block">
              <Select value={academicYear} onValueChange={handleYearChange}>
                <SelectTrigger
                  size="sm"
                  aria-label="Select academic year"
                  className="h-9 gap-1.5 border-[#E5E9EF] bg-white text-[13px] font-semibold text-[#202936] rounded-xl hover:bg-[#EEF1F5]/50 focus:ring-[#F5A000]"
                >
                  <Calendar className="size-3.5 text-[#788391]" />
                  <span className="hidden text-[#788391] md:inline">AY</span>
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent align="end" className="rounded-xl border-[#E5E9EF] bg-white">
                  {displayYears.map((year) => (
                    <SelectItem
                      key={year}
                      value={year}
                      className="text-[13px] font-medium text-[#202936] focus:bg-[#EEF1F5]"
                    >
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notification Dropdown */}
            <NotificationDropdown
              buttonClassName="size-9 shrink-0 rounded-xl border border-[#E5E9EF] bg-white text-[#788391] hover:text-[#202936] hover:bg-[#EEF1F5] flex items-center justify-center p-0"
            />

            {/* User Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-9 shrink-0 p-0 rounded-full hover:bg-transparent focus-visible:ring-[#F5A000]"
                  aria-label="User account menu"
                >
                  <Avatar className="size-8 sm:size-9 ring-2 ring-[#F5A000]/60">
                    <AvatarFallback className="bg-[#123B5A] text-xs font-bold text-white">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 rounded-2xl border-[#E5E9EF] bg-white p-2 shadow-lg"
              >
                <DropdownMenuLabel className="p-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-9 ring-1 ring-[#F5A000]/40">
                      <AvatarFallback className="bg-[#123B5A] text-xs font-bold text-white">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-[#202936]">
                        {user.name}
                      </p>
                      <p className="truncate text-[11px] text-[#788391]">
                        {user.role}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="bg-[#E5E9EF]" />

                {/* Mobile-only Academic Year selector in profile dropdown */}
                <div className="px-2 py-1.5 sm:hidden">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#788391]">
                    Academic Year
                  </p>
                  <div className="mt-1 flex gap-1">
                    {displayYears.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => handleYearChange(y)}
                        className={cn(
                          "flex-1 rounded-lg py-1 text-center text-[11px] font-bold transition-all",
                          academicYear === y
                            ? "bg-[#123B5A] text-white"
                            : "bg-[#EEF1F5] text-[#202936] hover:bg-slate-200"
                        )}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>

                <DropdownMenuSeparator className="bg-[#E5E9EF] sm:hidden" />

                <DropdownMenuItem asChild className="rounded-xl text-[13px] font-medium text-[#202936] focus:bg-[#EEF1F5]">
                  <Link href={`${base}/profile`} className="flex items-center gap-2">
                    <User className="size-4 text-[#788391]" />
                    <span>My Faculty Profile</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-[#E5E9EF]" />

                <DropdownMenuItem
                  onClick={signOut}
                  className="rounded-xl text-[13px] font-medium text-rose-600 focus:bg-rose-50 focus:text-rose-700 cursor-pointer"
                >
                  <LogOut className="size-4 mr-2" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Page Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <MustChangePasswordBanner />
          {children}
        </main>
      </div>
    </div>
  )
}

export function TeacherPortalShell({
  slug,
  institutionName,
  initialRole = "teacher",
  availableRoles = ["teacher", "class_teacher", "hod"],
  academicYears,
  initialAcademicYear,
  user,
  children,
}: {
  slug: string
  institutionName: string
  initialRole?: TeacherRole
  availableRoles?: TeacherRole[]
  academicYears?: string[]
  initialAcademicYear?: string
  user?: TeacherRoleContextUser
  children: React.ReactNode
}) {
  return (
    <TeacherRoleProvider
      slug={slug}
      institutionName={institutionName}
      initialRole={initialRole}
      availableRoles={availableRoles}
      academicYears={academicYears}
      initialAcademicYear={initialAcademicYear}
      user={user}
    >
      <TeacherPortalShellInner>{children}</TeacherPortalShellInner>
    </TeacherRoleProvider>
  )
}
