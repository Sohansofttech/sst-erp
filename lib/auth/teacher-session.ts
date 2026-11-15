import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import type { institutions, academic_years, teachers, users } from "@/generated/prisma/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import type { Institution, AcademicYear, TenantContext } from "@/types/common"
import type { TeacherProfile } from "@/types/teacher"

export interface TeacherSession {
  institution: institutions
  user: users
  teacher: teachers
  academicYears: academic_years[]
  currentAcademicYear: academic_years | null
  profile: TeacherProfile
  tenantContext: TenantContext
  supabaseUser?: SupabaseUser | null
  isDemoFallback?: boolean
}

export type TeacherAuthErrorCode =
  | "TENANT_NOT_FOUND"
  | "UNAUTHENTICATED"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "NOT_A_TEACHER"
  | "TEACHER_RECORD_NOT_FOUND"

export class TeacherAuthError extends Error {
  constructor(
    message: string,
    public code: TeacherAuthErrorCode,
    public status: number = 401
  ) {
    super(message)
    this.name = "TeacherAuthError"
  }
}

/**
 * Maps database institution record to the frontend TenantContext Institution model.
 */
export function mapDbInstitutionToCommon(inst: institutions): Institution {
  return {
    id: inst.id,
    name: inst.name,
    slug: inst.code.toLowerCase(),
    type: "school",
    code: inst.code,
    city: inst.address?.includes(",") ? inst.address.split(",").slice(-2)[0]?.trim() : "Bengaluru",
    state: "Karnataka",
    boardOrUniversity: "CBSE",
    logoUrl: inst.logoUrl ?? undefined,
  }
}

/**
 * Maps database academic_years record to the frontend AcademicYear model.
 */
export function mapDbAcademicYearToCommon(ay: academic_years): AcademicYear {
  return {
    id: ay.id,
    institutionId: ay.institutionId,
    name: ay.name,
    isCurrent: ay.isCurrent,
    startDate: ay.startDate.toISOString().split("T")[0],
    endDate: ay.endDate.toISOString().split("T")[0],
  }
}

/**
 * Maps database teacher + user records to the frontend TeacherProfile model.
 */
export function mapDbTeacherToProfile(
  teacher: teachers,
  user: users,
  options?: {
    isClassTeacher?: boolean
    classTeacherOf?: string
    subjectsHandled?: string[]
  }
): TeacherProfile {
  const deptCode = teacher.department
    ? `dept-${teacher.department.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    : "dept-general"

  return {
    id: teacher.id,
    institutionId: teacher.institutionId,
    employeeCode: teacher.employeeId,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? "+91 98450 00000",
    photoUrl: user.avatarUrl ?? undefined,
    designation: teacher.designation,
    departmentId: deptCode,
    departmentName: `Department of ${teacher.department}`,
    qualification: "Ph.D. / M.Sc., B.Ed.",
    specialization: `${teacher.department} & Curriculum Lead`,
    experienceYears: 10,
    joiningDate: teacher.createdAt.toISOString().split("T")[0],
    isClassTeacher: options?.isClassTeacher ?? true,
    classTeacherOf: options?.classTeacherOf ?? "Class 10 - A",
    subjectsHandled: options?.subjectsHandled ?? [
      `${teacher.department} (10-A)`,
      `${teacher.department} (10-B)`,
    ],
    officeRoom: "Academic Block Staff Room",
    bio: `${teacher.designation} in ${teacher.department}. Coordinates subject curriculum, assessments, and student mentoring.`,
    status: user.isActive ? "active" : "inactive",
  }
}

/**
 * Resolves an active institution from the database by slug or institution code / id.
 */
export async function resolveInstitution(slug: string): Promise<institutions | null> {
  if (!slug) return null

  const trimmed = slug.trim()

  return prisma.institutions.findFirst({
    where: {
      OR: [
        { code: trimmed },
        { code: trimmed.toLowerCase() },
        { code: trimmed.toUpperCase() },
        { id: trimmed },
      ],
      isActive: true,
    },
  })
}

/**
 * Resolves the full TenantContext for an institution, including its academic years.
 * Throws TeacherAuthError if the institution cannot be found.
 */
export async function getTenantContext(slug: string): Promise<TenantContext> {
  const institution = await resolveInstitution(slug)
  if (!institution) {
    throw new TeacherAuthError(
      `Institution with slug '${slug}' not found or is currently inactive.`,
      "TENANT_NOT_FOUND",
      404
    )
  }

  const dbYears = await prisma.academic_years.findMany({
    where: { institutionId: institution.id },
    orderBy: { startDate: "desc" },
  })

  const academicYears = dbYears.map(mapDbAcademicYearToCommon)
  const currentAcademicYear =
    academicYears.find((y) => y.isCurrent) ??
    academicYears[0] ?? {
      id: "ay-default",
      institutionId: institution.id,
      name: "2026-27",
      isCurrent: true,
      startDate: "2026-06-01",
      endDate: "2027-03-31",
    }

  return {
    institution: mapDbInstitutionToCommon(institution),
    academicYears,
    currentAcademicYear,
  }
}

/**
 * Retrieves the currently authenticated Supabase Auth user via server cookies.
 */
export async function getAuthenticatedUser(): Promise<SupabaseUser | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return user
  } catch {
    return null
  }
}

export interface TeacherSessionOptions {
  /**
   * If true (default in non-production or for 'demo-school'), returns the default
   * seeded teacher profile when no active Supabase Auth cookie is present.
   */
  allowDemoFallback?: boolean
}

/**
 * Resolves tenant and authenticated teacher session.
 * 1. Resolves institution by slug
 * 2. Checks Supabase auth cookie
 * 3. Matches DB user & teacher record within the institution
 * 4. Falls back to baseline seeded teacher profile for demo-school when not authenticated
 */
export async function getTeacherSession(
  slug: string,
  options: TeacherSessionOptions = {}
): Promise<TeacherSession | null> {
  const institution = await resolveInstitution(slug)
  if (!institution) {
    return null
  }

  const [dbYears, supabaseUser] = await Promise.all([
    prisma.academic_years.findMany({
      where: { institutionId: institution.id },
      orderBy: { startDate: "desc" },
    }),
    getAuthenticatedUser(),
  ])

  const currentAcademicYear = dbYears.find((y) => y.isCurrent) ?? dbYears[0] ?? null

  const academicYearsCommon = dbYears.map(mapDbAcademicYearToCommon)
  const currentAcademicYearCommon = currentAcademicYear
    ? mapDbAcademicYearToCommon(currentAcademicYear)
    : {
        id: "ay-default",
        institutionId: institution.id,
        name: "2026-27",
        isCurrent: true,
      }

  const tenantContext: TenantContext = {
    institution: mapDbInstitutionToCommon(institution),
    academicYears: academicYearsCommon,
    currentAcademicYear: currentAcademicYearCommon,
  }

  // 1. Try to find the teacher from Supabase Auth credentials
  if (supabaseUser) {
    const user = await prisma.users.findFirst({
      where: {
        institutionId: institution.id,
        isActive: true,
        OR: [
          { id: supabaseUser.id },
          ...(supabaseUser.email ? [{ email: supabaseUser.email }] : []),
        ],
      },
      include: {
        teachers: true,
      },
    })

    if (user && user.teachers && (user.role === "TEACHER" || user.role === "ADMIN" || user.role === "FACULTY")) {
      const profile = mapDbTeacherToProfile(user.teachers, user)
      return {
        institution,
        user,
        teacher: user.teachers,
        academicYears: dbYears,
        currentAcademicYear,
        profile,
        tenantContext,
        supabaseUser,
        isDemoFallback: false,
      }
    }
  }

  // 2. Demo fallback check
  const allowFallback =
    options.allowDemoFallback ??
    (slug === "demo-school" || institution.code === "demo-school" || process.env.NODE_ENV !== "production")

  if (allowFallback) {
    // Find the first active teacher for this institution (e.g. seeded Dr. Ananya Sharma)
    const demoTeacher = await prisma.teachers.findFirst({
      where: { institutionId: institution.id },
      include: { users: true },
      orderBy: { createdAt: "asc" },
    })

    if (demoTeacher && demoTeacher.users && demoTeacher.users.isActive) {
      const profile = mapDbTeacherToProfile(demoTeacher, demoTeacher.users)
      return {
        institution,
        user: demoTeacher.users,
        teacher: demoTeacher,
        academicYears: dbYears,
        currentAcademicYear,
        profile,
        tenantContext,
        supabaseUser: null,
        isDemoFallback: true,
      }
    }
  }

  return null
}

/**
 * Strict version of getTeacherSession that throws TeacherAuthError if not authenticated.
 */
export async function requireTeacherSession(
  slug: string,
  options: TeacherSessionOptions = {}
): Promise<TeacherSession> {
  const institution = await resolveInstitution(slug)
  if (!institution) {
    throw new TeacherAuthError(
      `Institution with slug '${slug}' not found.`,
      "TENANT_NOT_FOUND",
      404
    )
  }

  const session = await getTeacherSession(slug, options)
  if (!session) {
    throw new TeacherAuthError(
      `Authenticated teacher session required for campus '${slug}'.`,
      "UNAUTHENTICATED",
      401
    )
  }

  return session
}

