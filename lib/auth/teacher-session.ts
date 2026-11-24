import crypto from "crypto"
import { cookies } from "next/headers"
import { NextRequest } from "next/server"
import { SignJWT, jwtVerify } from "jose"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import db from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import type { Institution, AcademicYear, Teacher, User } from "@prisma/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import type { Institution as CommonInstitution, AcademicYear as CommonAcademicYear, TenantContext } from "@/types/common"
import type { TeacherProfile } from "@/types/teacher"
import {
  type TeacherRole,
  DETERMINISTIC_TEST_ACCOUNTS,
  findDeterministicAccount,
} from "./roles"
import { resolveTeacherAssignmentsFromDb } from "@/lib/security/tenant-context"

type institutions = Institution
type academic_years = AcademicYear
type teachers = Teacher
type users = User

export const TEACHER_AUTH_COOKIE = "sst_teacher_session"
const JWT_SECRET = process.env.JWT_SECRET || "erp-secret-super-secure-key-32-chars-long!"
const jwtKey = new TextEncoder().encode(JWT_SECRET)

export interface TeacherSessionPayload {
  userId: string
  teacherId: string
  institutionId: string
  institutionSlug: string
  email: string
  fullName: string
  employeeId: string
  designation: string
  department: string
  homeroomClass?: string
  activeRole: TeacherRole
  availableRoles: TeacherRole[]
  issuedAt: number
  expiresAt: number
  lastActivity: number
}

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
  activeRole: TeacherRole
  availableRoles: TeacherRole[]
  sessionPayload?: TeacherSessionPayload
}

export type TeacherAuthErrorCode =
  | "TENANT_NOT_FOUND"
  | "UNAUTHENTICATED"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "NOT_A_TEACHER"
  | "TEACHER_RECORD_NOT_FOUND"
  | "FORBIDDEN"
  | "TENANT_MISMATCH"

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
 * Sign a secure teacher session JWT
 */
export async function signTeacherSession(payload: TeacherSessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(jwtKey)
}

/**
 * Verify teacher session JWT
 */
export async function verifyTeacherSession(token: string): Promise<TeacherSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey)
    return payload as unknown as TeacherSessionPayload
  } catch {
    return null
  }
}

/**
 * Computes sha256 hash of a session token for secure database storage and lookup
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/**
 * Creates a server session record in the PostgreSQL teacher_portal_sessions table
 */
export async function createDbSessionRecord(params: {
  id?: string
  tokenHash: string
  userId: string
  institutionId: string
  activeRole: TeacherRole
  expiresAt: Date
}): Promise<string> {
  const sessionId = params.id || crypto.randomUUID()
  try {
    await (db as any).teacherPortalSession.create({
      data: {
        id: sessionId,
        tokenHash: params.tokenHash,
        userId: params.userId,
        institutionId: params.institutionId,
        activeRole: params.activeRole,
        expiresAt: params.expiresAt,
      },
    })
  } catch {
    await db.$executeRaw`
      INSERT INTO teacher_portal_sessions (
        id,
        token_hash,
        user_id,
        institution_id,
        active_role,
        expires_at,
        created_at,
        updated_at
      ) VALUES (
        ${sessionId},
        ${params.tokenHash},
        ${params.userId},
        ${params.institutionId},
        ${params.activeRole},
        ${params.expiresAt},
        NOW(),
        NOW()
      )
    `
  }
  return sessionId
}

/**
 * Marks a teacher portal session as revoked in PostgreSQL
 */
export async function revokeDbSession(tokenOrHash: string): Promise<void> {
  const isHash = tokenOrHash.length === 64 && /^[0-9a-f]{64}$/i.test(tokenOrHash)
  const tokenHash = isHash ? tokenOrHash : hashSessionToken(tokenOrHash)
  try {
    await (db as any).teacherPortalSession.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    })
  } catch {
    await db.$executeRaw`
      UPDATE teacher_portal_sessions
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE token_hash = ${tokenHash}
    `
  }
}

/**
 * Reads the raw session token from cookies or request
 */
export async function getTeacherSessionToken(req?: NextRequest): Promise<string | undefined> {
  if (req) {
    const cookieVal = req.cookies.get(TEACHER_AUTH_COOKIE)?.value
    if (cookieVal) return cookieVal

    const rawCookie = req.headers.get("cookie")
    if (rawCookie) {
      const match = rawCookie.match(new RegExp(`(?:^|; )${TEACHER_AUTH_COOKIE}=([^;]*)`))
      if (match) return decodeURIComponent(match[1])
    }
  }

  if (process.env.TEST_TEACHER_SESSION_TOKEN && process.env.NODE_ENV !== "production") {
    return process.env.TEST_TEACHER_SESSION_TOKEN
  }

  try {
    const cookieStore = await cookies()
    return cookieStore.get(TEACHER_AUTH_COOKIE)?.value
  } catch {
    return undefined
  }
}

/**
 * Maps database institution record to the frontend TenantContext Institution model.
 */
export function mapDbInstitutionToCommon(inst: institutions): CommonInstitution {
  return {
    id: inst.id,
    name: inst.name,
    slug: (inst.code || inst.slug || "institution").toLowerCase(),
    type: "school",
    code: inst.code ?? undefined,
    city: inst.address?.includes(",") ? inst.address.split(",").slice(-2)[0]?.trim() : "Bengaluru",
    state: "Karnataka",
    boardOrUniversity: "CBSE",
    logoUrl: inst.logoUrl ?? undefined,
  }
}

/**
 * Maps database academic_years record to the frontend AcademicYear model.
 */
export function mapDbAcademicYearToCommon(ay: academic_years): CommonAcademicYear {
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
    fullName: user.fullName || user.name || "Faculty Member",
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
    isClassTeacher: options?.isClassTeacher ?? false,
    classTeacherOf: options?.classTeacherOf,
    subjectsHandled: options?.subjectsHandled ?? [
      `${teacher.department} (10-A)`,
      `${teacher.department} (10-B)`,
    ],
    officeRoom: "Academic Block Staff Room",
    bio: `${teacher.designation} in ${teacher.department}. Coordinates subject curriculum, assessments, and student mentoring.`,
    status: user.isActive ? "active" : "inactive",
  }
}

// In-memory caches for fast tenant resolution and zero pool churn
const institutionCache = new Map<string, { inst: institutions; timestamp: number }>()
const inFlightInstitutions = new Map<string, Promise<institutions | null>>()

/**
 * Resolves an active institution from the database by slug or institution code / id.
 */
export async function resolveInstitution(slug: string): Promise<institutions | null> {
  if (!slug) return null

  const trimmed = slug.trim()
  const lower = trimmed.toLowerCase()

  const cached = institutionCache.get(lower)
  if (cached && Date.now() - cached.timestamp < 300_000) {
    return cached.inst
  }

  if (inFlightInstitutions.has(lower)) {
    return inFlightInstitutions.get(lower)!
  }

  const promise = (async () => {
    try {
      const searchTerms = [trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()]
      if (lower === "vidyaniketan" || lower === "demo-school") {
        searchTerms.push("demo-school", "vidyaniketan", "inst_demo_school")
      }
      const inst = await prisma.institutions.findFirst({
        where: {
          OR: [
            ...searchTerms.map(t => ({ code: t })),
            ...searchTerms.map(t => ({ id: t })),
            ...searchTerms.map(t => ({ slug: t })),
          ],
          isActive: true,
        },
      })
      if (inst) {
        const entry = { inst, timestamp: Date.now() }
        institutionCache.set(lower, entry)
        institutionCache.set(inst.id.toLowerCase(), entry)
        if (inst.code) institutionCache.set(inst.code.toLowerCase(), entry)
        if (inst.slug) institutionCache.set(inst.slug.toLowerCase(), entry)
      }
      return inst
    } catch (err) {
      console.warn("[resolveInstitution] DB error:", err)
      return cached?.inst ?? null
    } finally {
      inFlightInstitutions.delete(lower)
    }
  })()

  inFlightInstitutions.set(lower, promise)
  return promise
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

  let dbYears: any[] = []
  try {
    dbYears = await prisma.academic_years.findMany({
      where: { institutionId: institution.id },
      orderBy: { startDate: "desc" },
    })
  } catch (err) {
    console.warn("[getTenantContext] AY query error:", err)
  }

  const academicYears = dbYears.map(mapDbAcademicYearToCommon)
  const currentAcademicYear =
    academicYears.find((y: CommonAcademicYear) => y.isCurrent) ??
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
  req?: NextRequest
}

/**
 * Resolves tenant and authenticated teacher session.
 * 1. Resolves institution by slug
 * 2. Reads & verifies `sst_teacher_session` cookie against JWT & DB session table
 * 3. Checks tenant alignment
 * 4. Loads DB user & teacher records
 * 5. Dynamically re-loads user's roles from DB on every request
 * NO silent login or allowDemoFallback permitted in any environment.
 */
export async function getTeacherSession(
  slug: string,
  options: TeacherSessionOptions = {}
): Promise<TeacherSession | null> {
  const institution = await resolveInstitution(slug)
  if (!institution) {
    return null
  }

  let dbYears: any[] = []
  try {
    dbYears = await prisma.academic_years.findMany({
      where: { institutionId: institution.id },
      orderBy: { startDate: "desc" },
    })
  } catch (err) {
    console.warn("[getTeacherSession] AY query error:", err)
  }

  const currentAcademicYear = dbYears.find((y: any) => y.isCurrent) ?? dbYears[0] ?? null
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

  // 1. Check primary teacher session cookie (sst_teacher_session)
  const teacherToken = await getTeacherSessionToken(options.req)
  if (teacherToken) {
    const payload = await verifyTeacherSession(teacherToken)
    if (payload) {
      // Validate that session institution strictly matches the requested campus institution
      if (payload.institutionId && payload.institutionId !== institution.id) {
        return null
      }

      // Validate session in PostgreSQL teacher_portal_sessions table
      const tokenHash = hashSessionToken(teacherToken)
      let dbSessionRecord: any = null
      try {
        const sessionRecord = await (db as any).teacherPortalSession.findFirst({
          where: {
            tokenHash,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        })
        if (sessionRecord) {
          dbSessionRecord = {
            id: sessionRecord.id,
            user_id: sessionRecord.userId,
            institution_id: sessionRecord.institutionId,
            active_role: sessionRecord.activeRole,
            expires_at: sessionRecord.expiresAt,
            revoked_at: sessionRecord.revokedAt,
          }
        }
      } catch (err) {
        // Fallback to raw query if needed
        try {
          const sessions: any[] = await db.$queryRaw`
            SELECT id, user_id, institution_id, active_role, expires_at, revoked_at
            FROM teacher_portal_sessions
            WHERE token_hash = ${tokenHash}
              AND revoked_at IS NULL
              AND expires_at > NOW()
            LIMIT 1
          `
          dbSessionRecord = sessions[0] || null
        } catch (rawErr) {
          console.warn("[getTeacherSession] DB session lookup error:", rawErr)
        }
      }

      // If token is revoked or not found in teacher_portal_sessions, reject immediately
      if (!dbSessionRecord) {
        return null
      }

      if (dbSessionRecord.institution_id && dbSessionRecord.institution_id !== institution.id) {
        return null
      }

      // Re-load user & teacher record from DB on every request
      let user: any = null
      try {
        user = await prisma.users.findFirst({
          where: {
            id: dbSessionRecord.user_id,
            isActive: true,
          },
          include: {
            teacherProfile: true,
          },
        })
      } catch (err) {
        console.warn("[getTeacherSession] User DB lookup error:", err)
      }

      if (!user || !user.isActive || (user.institutionId && user.institutionId !== institution.id)) {
        return null
      }

      // Re-load user's roles from DB assignments & test accounts dynamically
      const testAccount = findDeterministicAccount(user.email) || findDeterministicAccount(user.id)
      let teacherObj = (user as any)?.teacherProfile || (user as any)?.teachers
      if (!teacherObj && testAccount) {
        teacherObj = {
          id: payload.teacherId || `teacher_${user.id}`,
          institutionId: institution.id,
          userId: user.id,
          employeeId: testAccount.employeeId,
          department: testAccount.department,
          designation: testAccount.designation,
          createdAt: new Date(),
        }
      }

      const dbAssignments = await resolveTeacherAssignmentsFromDb(
        teacherObj?.id || user.id,
        user.id,
        institution.id,
        teacherObj?.department,
        teacherObj?.designation
      )
      const availableRoles: TeacherRole[] = testAccount?.roles || dbAssignments.roles
      const homeroomClass = testAccount?.homeroomClass || dbAssignments.homeroomClass
      let activeRole = (dbSessionRecord.active_role as TeacherRole) || payload.activeRole || "teacher"
      if (!availableRoles.includes(activeRole)) {
        activeRole = "teacher"
      }

      if (teacherObj) {
        const profile = mapDbTeacherToProfile(teacherObj, user, {
          isClassTeacher: availableRoles.includes("class_teacher"),
          classTeacherOf: homeroomClass,
        })

        return {
          institution,
          user,
          teacher: teacherObj,
          academicYears: dbYears,
          currentAcademicYear,
          profile,
          tenantContext,
          supabaseUser: null,
          isDemoFallback: false,
          activeRole,
          availableRoles,
          sessionPayload: payload,
        }
      }
    }
  }

  // 2. Check general ERP session (sst_session / erp_session)
  const erpSession = await getSession(options.req)
  if (erpSession && (erpSession.role === "TEACHER" || erpSession.role === "ADMIN" || erpSession.role === "SUPER_ADMIN")) {
    if (erpSession.role !== "SUPER_ADMIN" && erpSession.institutionId && erpSession.institutionId !== institution.id) {
      return null
    }
    const user = await prisma.users.findFirst({
      where: {
        id: erpSession.userId,
        isActive: true,
      },
      include: {
        teacherProfile: true,
      },
    })

    const teacherObj = (user as any)?.teacherProfile || (user as any)?.teachers
    if (user && teacherObj) {
      const profile = mapDbTeacherToProfile(teacherObj, user)
      return {
        institution,
        user,
        teacher: teacherObj,
        academicYears: dbYears,
        currentAcademicYear,
        profile,
        tenantContext,
        supabaseUser: null,
        isDemoFallback: false,
        activeRole: "teacher",
        availableRoles: ["teacher"],
      }
    }
  }

  // No demo fallback. Unauthenticated requests return null.
  return null
}

/**
 * Strict version of getTeacherSession that throws TeacherAuthError if not authenticated
 * or if role authorization fails.
 */
export async function requireTeacherSession(
  slug: string,
  allowedRoles?: TeacherRole[],
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

  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(session.activeRole)) {
      throw new TeacherAuthError(
        `Access forbidden: Active role '${session.activeRole}' is not authorized for this workspace. Required: ${allowedRoles.join(", ")}`,
        "FORBIDDEN",
        403
      )
    }
  }

  return session
}
