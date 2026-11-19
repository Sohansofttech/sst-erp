"use client"

import * as React from "react"
import {
  Award,
  BookMarked,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileBarChart2,
  FileCheck2,
  FileSpreadsheet,
  FolderOpen,
  HeartHandshake,
  History,
  LayoutDashboard,
  Loader2,
  Megaphone,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserCircle2,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  PortalShell,
  type PortalNavGroup,
} from "@/components/shared"
import { MustChangePasswordBanner } from "@/components/shared/MustChangePasswordBanner"
import {
  TeacherRoleProvider,
  useTeacherRole,
  type TeacherRole,
  type TeacherRoleContextUser,
} from "./teacher-role-context"
import { TEACHER_ROLE_CONFIGS } from "@/lib/auth/roles"
import { getTeacherDashboard } from "@/lib/services/teacher.service"

const ROLE_OPTIONS: Array<{
  value: TeacherRole
  label: string
  shortLabel: string
  title: string
}> = [
  {
    value: "teacher",
    label: "Teacher",
    shortLabel: "Teacher",
    title: "Senior PGT — Mathematics",
  },
  {
    value: "class_teacher",
    label: "Class Teacher",
    shortLabel: "CT (10-A)",
    title: "Class Teacher — Class 10-A",
  },
  {
    value: "hod",
    label: "HoD",
    shortLabel: "HoD",
    title: "HoD — Department of Mathematics",
  },
]

function TeacherRoleSwitch() {
  const { role, availableRoles, switchRole, isSwitching } = useTeacherRole()

  // Requirement: Display ONLY roles the current authenticated user actually holds.
  // E.g. rajesh.verma sees no role switcher (availableRoles has only 'teacher').
  if (!availableRoles || availableRoles.length <= 1) {
    return null
  }

  const visibleOptions = ROLE_OPTIONS.filter((option) =>
    availableRoles.includes(option.value)
  )

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
            onClick={() => switchRole(option.value)}
            aria-pressed={active}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-all",
              active
                ? "bg-[#123B5A] text-white shadow-xs"
                : "text-[#788391] hover:text-[#202936] hover:bg-white/60",
              isSwitching && "opacity-70 cursor-wait"
            )}
          >
            {active && isSwitching && (
              <Loader2 className="size-3 animate-spin text-[#F5A000]" />
            )}
            <span className="hidden lg:inline">{option.label}</span>
            <span className="lg:hidden">{option.shortLabel}</span>
          </button>
        )
      })}
    </div>
  )
}

function TeacherPortalShellInner({ children }: { children: React.ReactNode }) {
  const {
    role,
    academicYear,
    setAcademicYear,
    slug,
    institutionName,
    user,
    signOut,
  } = useTeacherRole()

  const [unreadCount, setUnreadCount] = React.useState(3)
  const [pendingApprovals, setPendingApprovals] = React.useState(2)

  React.useEffect(() => {
    let active = true
    getTeacherDashboard(slug)
      .then((data) => {
        if (!active) return
        setUnreadCount(data.kpis.unreadNotificationsCount)
        setPendingApprovals(data.kpis.pendingApprovalsCount)
      })
      .catch(() => {
        // Keep defaults on error
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
          label: "Homeroom Class 10-A",
          defaultOpen: true,
          items: [
            {
              label: "Section Dashboard",
              href: `${base}/class-teacher`,
              icon: <LayoutDashboard className="size-4" />,
              exact: true,
            },
            {
              label: "Section Students (18)",
              href: `${base}/class-teacher/students`,
              icon: <Users className="size-4" />,
            },
            {
              label: "Attendance Defaulters",
              href: `${base}/class-teacher/defaulters`,
              icon: <ShieldAlert className="size-4" />,
              badge: "2 Alert",
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
          label: "Department of Mathematics",
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
              badge: "2 Pending",
              badgeTone: "warning",
            },
            {
              label: "Faculty Workload (5)",
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
  }, [base, pendingApprovals, role])

  const currentRoleMeta = TEACHER_ROLE_CONFIGS[role]

  const portalLabel = React.useMemo(() => {
    if (role === "hod") return "Faculty · HoD Mathematics"
    if (role === "class_teacher") return "Faculty · Class Teacher (10-A)"
    return "Teacher Portal"
  }, [role])

  return (
    <PortalShell
      institutionName={institutionName}
      institutionSlug={slug}
      portalLabel={portalLabel}
      navGroups={navGroups}
      selectedAcademicYear={academicYear}
      onAcademicYearChange={(year) => {
        setAcademicYear(year)
        toast.info(`Switched academic year to ${year}`)
      }}
      notificationCount={unreadCount}
      onNotificationClick={() =>
        toast.info(`${unreadCount} unread notifications`, {
          description:
            "Review pending student leave requests & attendance reminders.",
        })
      }
      headerExtra={<TeacherRoleSwitch />}
      user={{
        name: user.name,
        email: user.email,
        role: currentRoleMeta?.title ?? user.role,
        initials: user.initials,
      }}
      profileHref={`${base}/profile`}
      onSignOut={signOut}
      sidebarFooter={
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
      }
    >
      <MustChangePasswordBanner />
      {children}
    </PortalShell>
  )
}

export function TeacherPortalShell({
  slug,
  institutionName,
  initialRole = "teacher",
  availableRoles = ["teacher", "class_teacher", "hod"],
  user,
  children,
}: {
  slug: string
  institutionName: string
  initialRole?: TeacherRole
  availableRoles?: TeacherRole[]
  user?: TeacherRoleContextUser
  children: React.ReactNode
}) {
  return (
    <TeacherRoleProvider
      slug={slug}
      institutionName={institutionName}
      initialRole={initialRole}
      availableRoles={availableRoles}
      user={user}
    >
      <TeacherPortalShellInner>{children}</TeacherPortalShellInner>
    </TeacherRoleProvider>
  )
}
