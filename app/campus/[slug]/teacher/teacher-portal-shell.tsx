"use client"

import * as React from "react"
import {
  Award,
  BookMarked,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileSpreadsheet,
  FolderOpen,
  HeartHandshake,
  History,
  LayoutDashboard,
  Megaphone,
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
import { NotificationDropdown } from "@/components/shared/NotificationDropdown"
import { MustChangePasswordBanner } from "@/components/shared/MustChangePasswordBanner"
import {
  TeacherRoleProvider,
  useTeacherRole,
  type TeacherDemoRole,
} from "./teacher-role-context"
import { getTeacherDashboard } from "@/lib/services/teacher.service"

const ROLE_OPTIONS: Array<{
  value: TeacherDemoRole
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
  const { role, setRole } = useTeacherRole()

  const handleSelect = (nextRole: TeacherDemoRole) => {
    if (nextRole === role) return
    setRole(nextRole)
    const option = ROLE_OPTIONS.find((o) => o.value === nextRole)
    toast.info(`Switched demo view to ${option?.label ?? nextRole}`, {
      description: option?.title,
    })
  }

  return (
    <div
      role="group"
      aria-label="Demo role switch"
      className="hidden items-center rounded-xl border border-[#E5E9EF] bg-[#EEF1F5] p-0.5 sm:inline-flex"
    >
      {ROLE_OPTIONS.map((option) => {
        const active = role === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            aria-pressed={active}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12px] font-bold transition-all",
              active
                ? "bg-[#123B5A] text-white shadow-xs"
                : "text-[#788391] hover:text-[#202936]"
            )}
          >
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

  const navGroups: PortalNavGroup[] = React.useMemo(
    () => [
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
        id: "exams-mentoring",
        label: "Exams & Mentoring",
        defaultOpen: true,
        items: [
          {
            label: "Exam Duties",
            href: `${base}/exams`,
            icon: <CalendarClock className="size-4" />,
          },
          {
            label: "Results",
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
        id: "operations-roles",
        label: "Operations & Roles",
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
            label: "Campus & Exam Duties",
            href: `${base}/duties`,
            icon: <CalendarClock className="size-4" />,
          },
          {
            label: "Class Teacher Tools",
            href: `${base}/class-teacher`,
            icon: <UserCheck className="size-4" />,
            badge: role === "class_teacher" ? "Active" : "CT",
            badgeTone: role === "class_teacher" ? "teal" : "muted",
          },
          {
            label: "HoD Oversight",
            href: `${base}/hod`,
            icon: <ShieldCheck className="size-4" />,
            badge: role === "hod" ? "Active" : "HoD",
            badgeTone: role === "hod" ? "teal" : "muted",
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
    ],
    [base, pendingApprovals, role]
  )

  const currentRoleMeta = ROLE_OPTIONS.find((r) => r.value === role)

  return (
    <PortalShell
      institutionName={institutionName}
      institutionSlug={slug}
      portalLabel={
        role === "hod"
          ? "Faculty · HoD View"
          : role === "class_teacher"
            ? "Faculty · Class Teacher"
            : "Teacher Portal"
      }
      navGroups={navGroups}
      selectedAcademicYear={academicYear}
      onAcademicYearChange={(year) => {
        setAcademicYear(year)
        toast.info(`Switched academic year to ${year}`)
      }}
      notificationCount={unreadCount}
      notificationElement={<NotificationDropdown />}
      onNotificationClick={() =>
        toast.info(`${unreadCount} unread notifications`, {
          description:
            "Review pending student leave requests & attendance reminders.",
        })
      }
      headerExtra={<TeacherRoleSwitch />}
      user={{
        name: "Dr. Ananya Sharma",
        email: "ananya.sharma@vidyaniketan.edu.in",
        role: currentRoleMeta?.title ?? "Senior PGT — Mathematics",
        initials: "AS",
      }}
      profileHref={`${base}/profile`}
      onSignOut={() => toast.info("Demo sign-out clicked")}
      sidebarFooter={
        <div className="space-y-1.5 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-white/70">
            <span>ACTIVE ROLE</span>
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
  children,
}: {
  slug: string
  institutionName: string
  children: React.ReactNode
}) {
  return (
    <TeacherRoleProvider slug={slug} institutionName={institutionName}>
      <TeacherPortalShellInner>{children}</TeacherPortalShellInner>
    </TeacherRoleProvider>
  )
}

