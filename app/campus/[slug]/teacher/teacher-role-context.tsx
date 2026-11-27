"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { TeacherRole } from "@/lib/auth/roles"
import { TEACHER_ROLE_CONFIGS } from "@/lib/auth/roles"

export type { TeacherRole }

export interface TeacherRoleContextUser {
  name: string
  email: string
  role: string
  initials: string
  employeeId?: string
  department?: string
  homeroomClass?: string
}

export interface TeacherRoleContextValue {
  role: TeacherRole
  availableRoles: TeacherRole[]
  setRole: (role: TeacherRole) => void
  switchRole: (targetRole: TeacherRole) => Promise<void>
  isSwitching: boolean
  academicYear: string
  academicYears: string[]
  setAcademicYear: (year: string) => void
  slug: string
  institutionName: string
  user: TeacherRoleContextUser
  signOut: () => Promise<void>
}

const TeacherRoleContext = React.createContext<TeacherRoleContextValue | null>(null)

export function TeacherRoleProvider({
  slug,
  institutionName,
  initialRole = "teacher",
  availableRoles = ["teacher", "class_teacher", "hod"],
  initialAcademicYear,
  academicYears = ["2026-27", "2025-26", "2024-25"],
  user = {
    name: "Faculty Member",
    email: "",
    role: "Faculty",
    initials: "FM",
  },
  children,
}: {
  slug: string
  institutionName: string
  initialRole?: TeacherRole
  availableRoles?: TeacherRole[]
  initialAcademicYear?: string
  academicYears?: string[]
  user?: TeacherRoleContextUser
  children: React.ReactNode
}) {
  const router = useRouter()
  const [role, setRoleState] = React.useState<TeacherRole>(initialRole)
  const [isSwitching, setIsSwitching] = React.useState(false)
  const [academicYear, setAcademicYear] = React.useState(
    initialAcademicYear || academicYears[0] || "2026-27"
  )

  // Sync if initialRole changes on server
  React.useEffect(() => {
    setRoleState(initialRole)
  }, [initialRole])

  const switchRole = React.useCallback(
    async (targetRole: TeacherRole) => {
      if (targetRole === role || isSwitching) return

      if (!availableRoles.includes(targetRole)) {
        toast.error(`Forbidden: Account does not have ${targetRole} role assigned.`)
        return
      }

      setIsSwitching(true)
      const targetMeta = TEACHER_ROLE_CONFIGS[targetRole]

      try {
        const res = await fetch(`/api/campus/${slug}/auth/switch-role`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetRole }),
        })

        const data = await res.json()

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to switch role on server.")
        }

        setRoleState(targetRole)
        toast.success(`Switched active workspace to ${targetMeta.label}`, {
          description: targetMeta.title,
        })

        const redirectUrl = data.data?.redirectUrl || targetMeta.landingPath(slug)
        router.push(redirectUrl)
        router.refresh()
      } catch (err: any) {
        toast.error("Role switch failed", { description: err.message })
      } finally {
        setIsSwitching(false)
      }
    },
    [role, isSwitching, availableRoles, slug, router]
  )

  const signOut = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/campus/${slug}/auth/logout`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      toast.info("Logged out", { description: "Redirecting to login..." })
      window.location.href = data.redirectUrl || "/login"
    } catch {
      window.location.href = "/login"
    }
  }, [slug])

  const value = React.useMemo(
    () => ({
      role,
      availableRoles,
      setRole: setRoleState,
      switchRole,
      isSwitching,
      academicYear,
      academicYears,
      setAcademicYear,
      slug,
      institutionName,
      user,
      signOut,
    }),
    [
      role,
      availableRoles,
      switchRole,
      isSwitching,
      academicYear,
      academicYears,
      slug,
      institutionName,
      user,
      signOut,
    ]
  )

  return (
    <TeacherRoleContext.Provider value={value}>
      {children}
    </TeacherRoleContext.Provider>
  )
}

export function useTeacherRole(): TeacherRoleContextValue {
  const ctx = React.useContext(TeacherRoleContext)
  if (!ctx) {
    throw new Error("useTeacherRole must be used inside TeacherRoleProvider")
  }
  return ctx
}
