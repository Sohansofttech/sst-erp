import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { getTeacherSession } from "@/lib/auth/teacher-session"
import { LoadingState } from "@/components/shared/StateViews"
import { TeacherPortalShell } from "./teacher-portal-shell"
import type { TeacherRole } from "@/lib/auth/roles"

function formatInstitutionName(slug: string): string {
  if (slug === "demo-school") return "Vidya Niketan Public School"
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getInitials(name: string): string {
  if (!name) return "T"
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

async function TeacherLayoutResolver({
  params,
  children,
}: {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}) {
  const { slug } = await params

  // 1. Check if user is a student attempting to access faculty portal
  const erpSession = await getSession()
  if (erpSession && erpSession.role === "STUDENT") {
    redirect("/dashboard")
  }

  // 2. Resolve teacher session
  const teacherSession = await getTeacherSession(slug)

  if (!teacherSession) {
    redirect(`/login?from=${encodeURIComponent(`/campus/${slug}/teacher`)}&error=unauthorized`)
  }

  const institutionName = teacherSession.institution?.name || formatInstitutionName(slug)
  const activeRole: TeacherRole = teacherSession.activeRole || "teacher"
  const availableRoles: TeacherRole[] = teacherSession.availableRoles || ["teacher"]

  const userContext = {
    name: teacherSession.profile.fullName,
    email: teacherSession.profile.email,
    role: teacherSession.profile.designation,
    initials: getInitials(teacherSession.profile.fullName),
    employeeId: teacherSession.profile.employeeCode,
    department: teacherSession.profile.departmentName,
    homeroomClass: teacherSession.profile.classTeacherOf,
  }

  return (
    <TeacherPortalShell
      slug={slug}
      institutionName={institutionName}
      initialRole={activeRole}
      availableRoles={availableRoles}
      user={userContext}
    >
      {children}
    </TeacherPortalShell>
  )
}

export default function TeacherLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#EEF1F5] p-6">
          <div className="w-full max-w-md">
            <LoadingState
              title="Loading Campus Workspace"
              description="Authenticating session and preparing workspace..."
            />
          </div>
        </div>
      }
    >
      <TeacherLayoutResolver params={params}>{children}</TeacherLayoutResolver>
    </Suspense>
  )
}
