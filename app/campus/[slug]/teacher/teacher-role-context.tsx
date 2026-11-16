"use client"

import * as React from "react"

export type TeacherDemoRole = "teacher" | "class_teacher" | "hod"

export interface TeacherRoleContextValue {
  role: TeacherDemoRole
  setRole: (role: TeacherDemoRole) => void
  academicYear: string
  setAcademicYear: (year: string) => void
  slug: string
  institutionName: string
}

const TeacherRoleContext = React.createContext<TeacherRoleContextValue | null>(
  null
)

export function TeacherRoleProvider({
  slug,
  institutionName,
  initialAcademicYear = "2026-27",
  children,
}: {
  slug: string
  institutionName: string
  initialAcademicYear?: string
  children: React.ReactNode
}) {
  const [role, setRole] = React.useState<TeacherDemoRole>("teacher")
  const [academicYear, setAcademicYear] = React.useState(initialAcademicYear)

  const value = React.useMemo(
    () => ({
      role,
      setRole,
      academicYear,
      setAcademicYear,
      slug,
      institutionName,
    }),
    [role, academicYear, slug, institutionName]
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

