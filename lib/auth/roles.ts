export type TeacherRole = "teacher" | "class_teacher" | "hod"

export interface TeacherRoleConfig {
  id: TeacherRole
  label: string
  shortLabel: string
  title: string
  description: string
  badgeTone: "teal" | "muted" | "warning"
  landingPath: (slug: string) => string
  permittedPrefixes: (slug: string) => string[]
  capabilities: string[]
}

export const TEACHER_ROLE_CONFIGS: Record<TeacherRole, TeacherRoleConfig> = {
  teacher: {
    id: "teacher",
    label: "Teacher",
    shortLabel: "Teacher",
    title: "Senior PGT — Mathematics",
    description: "Subject faculty workspace for course sections, teaching schedule, LMS & grading.",
    badgeTone: "muted",
    landingPath: (slug: string) => `/campus/${slug}/teacher`,
    permittedPrefixes: (slug: string) => [
      `/campus/${slug}/teacher`,
      `/campus/${slug}/teacher/timetable`,
      `/campus/${slug}/teacher/classes`,
      `/campus/${slug}/teacher/attendance`,
      `/campus/${slug}/teacher/assessments`,
      `/campus/${slug}/teacher/assignments`,
      `/campus/${slug}/teacher/lms`,
      `/campus/${slug}/teacher/quizzes`,
      `/campus/${slug}/teacher/results`,
      `/campus/${slug}/teacher/mentoring`,
      `/campus/${slug}/teacher/logbook`,
      `/campus/${slug}/teacher/leave`,
      `/campus/${slug}/teacher/duties`,
      `/campus/${slug}/teacher/communication`,
      `/campus/${slug}/teacher/profile`,
    ],
    capabilities: [
      "view:timetable",
      "manage:attendance",
      "manage:assessments",
      "manage:assignments",
      "manage:lms",
      "manage:quizzes",
      "manage:results",
      "view:mentoring",
      "manage:leave",
      "view:communication",
      "view:profile",
    ],
  },
  class_teacher: {
    id: "class_teacher",
    label: "Class Teacher",
    shortLabel: "CT (10-A)",
    title: "Class Teacher — Class 10-A",
    description: "Homeroom workspace for Class 10-A: student roster, attendance defaulters, leave approvals & parent communications.",
    badgeTone: "teal",
    landingPath: (slug: string) => `/campus/${slug}/teacher/class-teacher`,
    permittedPrefixes: (slug: string) => [
      `/campus/${slug}/teacher/class-teacher`,
      `/campus/${slug}/class-teacher`,
      `/campus/${slug}/teacher/classes`,
      `/campus/${slug}/teacher/mentoring`,
      `/campus/${slug}/teacher/timetable`,
      `/campus/${slug}/teacher/profile`,
    ],
    capabilities: [
      "manage:homeroom_students",
      "manage:homeroom_attendance",
      "approve:student_leave",
      "send:parent_notices",
      "generate:section_recommendations",
      "view:section_analytics",
    ],
  },
  hod: {
    id: "hod",
    label: "HoD",
    shortLabel: "HoD (Math)",
    title: "HoD — Department of Mathematics",
    description: "Departmental leadership: IA review & locking, faculty workloads, leave approvals with timetable substitution.",
    badgeTone: "warning",
    landingPath: (slug: string) => `/campus/${slug}/teacher/hod`,
    permittedPrefixes: (slug: string) => [
      `/campus/${slug}/teacher/hod`,
      `/campus/${slug}/hod`,
      `/campus/${slug}/teacher/assessments`,
      `/campus/${slug}/teacher/leave`,
      `/campus/${slug}/teacher/communication`,
      `/campus/${slug}/teacher/profile`,
    ],
    capabilities: [
      "manage:department_faculty",
      "approve:ia_marks",
      "lock:ia_marks",
      "return:ia_marks",
      "allocate:courses",
      "approve:faculty_leave",
      "assign:substitutions",
      "view:department_analytics",
    ],
  },
}

export interface TeacherTestAccount {
  username: string
  email: string
  employeeId: string
  fullName: string
  designation: string
  department: string
  homeroomClass?: string
  roles: TeacherRole[]
  defaultRole: TeacherRole
  // Password hash for 'Password@123'
  passwordHash: string
}

export const DETERMINISTIC_TEST_ACCOUNTS: Record<string, TeacherTestAccount> = {
  "ananya.sharma": {
    username: "ananya.sharma",
    email: "ananya.sharma@vidyaniketan.edu.in",
    employeeId: "VNPS-TCH-042",
    fullName: "Dr. Ananya Sharma",
    designation: "Senior PGT — Mathematics & HoD",
    department: "Mathematics",
    homeroomClass: "Class 10-A",
    roles: ["teacher", "class_teacher", "hod"],
    defaultRole: "teacher",
    passwordHash: "$2a$10$Ay4Wg3GqdeVT4ls7Z88/2e08Km5OecjLhRpT27wtww/BI.xbkl.0K",
  },
  "rajesh.verma": {
    username: "rajesh.verma",
    email: "rajesh.verma@vidyaniketan.edu.in",
    employeeId: "VNPS-TCH-089",
    fullName: "Prof. Rajesh Verma",
    designation: "PGT — Mathematics",
    department: "Mathematics",
    roles: ["teacher"],
    defaultRole: "teacher",
    passwordHash: "$2a$10$Ay4Wg3GqdeVT4ls7Z88/2e08Km5OecjLhRpT27wtww/BI.xbkl.0K",
  },
}

export function findDeterministicAccount(identifier: string): TeacherTestAccount | null {
  const norm = identifier.trim().toLowerCase()
  for (const account of Object.values(DETERMINISTIC_TEST_ACCOUNTS)) {
    if (
      account.username.toLowerCase() === norm ||
      account.email.toLowerCase() === norm ||
      account.employeeId.toLowerCase() === norm
    ) {
      return account
    }
  }
  return null
}

export function isRouteAllowedForRole(role: TeacherRole, pathname: string, slug: string): boolean {
  // If attempting to access HoD workspace
  const isHodRoute =
    pathname === `/campus/${slug}/teacher/hod` ||
    pathname.startsWith(`/campus/${slug}/teacher/hod/`) ||
    pathname === `/campus/${slug}/hod` ||
    pathname.startsWith(`/campus/${slug}/hod/`)

  if (isHodRoute) {
    return role === "hod"
  }

  // If attempting to access Class Teacher workspace
  const isClassTeacherRoute =
    pathname === `/campus/${slug}/teacher/class-teacher` ||
    pathname.startsWith(`/campus/${slug}/teacher/class-teacher/`) ||
    pathname === `/campus/${slug}/class-teacher` ||
    pathname.startsWith(`/campus/${slug}/class-teacher/`)

  if (isClassTeacherRoute) {
    return role === "class_teacher" || role === "hod"
  }

  // General teacher routes are accessible to all teacher roles
  return true
}
