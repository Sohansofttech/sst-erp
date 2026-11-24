"use server"

import type {
  AcademicYear,
  ApprovalStatus,
  DayOfWeek,
  Institution,
  TenantContext,
} from "@/types/common"
import type {
  Announcement,
  Assignment,
  AssignmentSubmission,
  AttendanceAuditEntry,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  CampusDuty,
  ClassAllocation,
  CreateAnnouncementInput,
  CreateAssignmentInput,
  CreateInternalAssessmentInput,
  CreateLearningMaterialInput,
  CreateLogBookEntryInput,
  CreateMentoringSessionInput,
  CreateQuizInput,
  CreateTeacherLeaveInput,
  DepartmentFacultyLoad,
  ExamDuty,
  ExamScheduleItem,
  GuardianContact,
  InternalAssessment,
  LearningMaterial,
  LearningMaterialType,
  LogBookEntry,
  Mentee,
  MentoringSession,
  NotificationItem,
  Quiz,
  QuizQuestion,
  QuizSubmission,
  ResultEntry,
  ResultMarkRow,
  SaveIAMarksInput,
  SaveResultMarksInput,
  StudentLeaveRequest,
  StudentLogReview,
  StudentRosterItem,
  SubjectAllocation,
  SubmitAttendanceInput,
  TeacherDashboardData,
  TeacherLeaveRequest,
  TeacherProfile,
  TimetableSlot,
} from "@/types/teacher"
import { prisma } from "@/lib/prisma"
import {
  getTeacherSession,
  getTeacherSessionToken,
  verifyTeacherSession,
  TeacherAuthError,
  resolveInstitution as resolveDbInstitution,
} from "@/lib/auth/teacher-session"
import { getSession } from "@/lib/auth/session"
import { calculateAttendance, RawAttendanceRecord } from "@/lib/services/attendance-calculator"

// ---------------------------------------------------------------------------
// Multi-tenant Active Teacher Resolution (with strict authentication & tenant isolation)
// ---------------------------------------------------------------------------
export interface ResolvedTeacher {
  teacher: any
  user: any
  institutionId: string
}

const teacherCache = new Map<string, { data: ResolvedTeacher; timestamp: number }>()
const inFlightResolutions = new Map<string, Promise<ResolvedTeacher>>()

export async function resolveActiveTeacher(
  teacherId?: string | any,
  institutionId?: string | any,
  slug?: string | any
): Promise<ResolvedTeacher> {
  let resolvedTeacherId: string | undefined = undefined
  let resolvedInstId: string | undefined = undefined
  let resolvedSlug: string | undefined = undefined

  if (typeof teacherId === "object" && teacherId !== null) {
    if (typeof teacherId.teacherId === "string") resolvedTeacherId = teacherId.teacherId.trim()
    if (typeof teacherId.institutionId === "string") resolvedInstId = teacherId.institutionId.trim()
    if (typeof teacherId.slug === "string") resolvedSlug = teacherId.slug.trim()
  } else if (typeof teacherId === "string" && teacherId.trim().length > 0) {
    resolvedTeacherId = teacherId.trim()
  }

  if (typeof institutionId === "string" && institutionId.trim().length > 0) {
    resolvedInstId = institutionId.trim()
  }

  if (typeof slug === "string" && slug.trim().length > 0) {
    resolvedSlug = slug.trim()
  }

  // 1. Resolve active session from teacher cookie or general ERP session
  let session = null
  let erpSession = null

  // If a slug was passed, attempt to get teacher session for this campus slug
  if (resolvedSlug) {
    try {
      session = await getTeacherSession(resolvedSlug)
    } catch (err) {
      console.warn("[resolveActiveTeacher] getTeacherSession slug error:", err)
    }
  }

  // If no session resolved yet, check teacher session token
  if (!session) {
    try {
      const teacherToken = await getTeacherSessionToken()
      if (teacherToken) {
        const payload = await verifyTeacherSession(teacherToken)
        if (payload?.institutionSlug) {
          session = await getTeacherSession(payload.institutionSlug)
        } else if (payload?.institutionId) {
          const inst = await resolveDbInstitution(payload.institutionId)
          if (inst) {
            session = await getTeacherSession(inst.slug || inst.code || inst.id)
          }
        }
      }
    } catch (err) {
      console.warn("[resolveActiveTeacher] teacherToken verification error:", err)
    }
  }

  // If still no teacher session, check general ERP session
  if (!session) {
    try {
      erpSession = await getSession()
      if (erpSession && (erpSession.role === "TEACHER" || erpSession.role === "ADMIN" || erpSession.role === "SUPER_ADMIN")) {
        if (erpSession.institutionId) {
          const inst = await resolveDbInstitution(erpSession.institutionId)
          if (inst) {
            session = await getTeacherSession(inst.slug || inst.code || inst.id)
          }
        }
      }
    } catch (err) {
      console.warn("[resolveActiveTeacher] erpSession check error:", err)
    }
  }

  // 2. Reject unauthenticated requests immediately - NO DB or mock fallbacks!
  if (!session && !erpSession) {
    throw new TeacherAuthError(
      "Authentication required: No active faculty session.",
      "UNAUTHENTICATED",
      401
    )
  }

  let effectiveInstId = session ? session.institution.id : erpSession!.institutionId!
  let effectiveUser = session ? session.user : null
  let effectiveTeacher = session ? session.teacher : null

  // Admin acting in teacher context
  if (!effectiveTeacher && erpSession && (erpSession.role === "ADMIN" || erpSession.role === "SUPER_ADMIN")) {
    const isSuperAdmin = erpSession.role === "SUPER_ADMIN"
    const targetInstId = (isSuperAdmin && resolvedInstId) ? resolvedInstId : effectiveInstId
    if (resolvedTeacherId) {
      const dbTeacher = await prisma.teachers.findFirst({
        where: {
          id: resolvedTeacherId,
          ...(targetInstId ? { institutionId: targetInstId } : {}),
        },
        include: { user: true, institution: true },
      })
      if (!dbTeacher) {
        throw new TeacherAuthError("Teacher not found in this institution.", "TEACHER_RECORD_NOT_FOUND", 404)
      }
      effectiveTeacher = dbTeacher
      effectiveUser = dbTeacher.user ?? (dbTeacher as any).users
      effectiveInstId = dbTeacher.institutionId
    }
  }

  if (!effectiveTeacher) {
    throw new TeacherAuthError(
      "Authentication required: No active faculty session.",
      "UNAUTHENTICATED",
      401
    )
  }

  // 3. Multi-institution boundary verification (Tenant Isolation)
  const isSuperAdmin = erpSession?.role === "SUPER_ADMIN"
  if (!isSuperAdmin) {
    if (resolvedInstId && resolvedInstId !== effectiveInstId) {
      throw new TeacherAuthError(
        "Tenant violation: You do not have permission to access another institution's data.",
        "TENANT_MISMATCH",
        403
      )
    }

    if (resolvedSlug) {
      const inst = session?.institution
      const expectedSlug = (inst?.slug || inst?.code || "").toLowerCase()
      if (expectedSlug && resolvedSlug.toLowerCase() !== expectedSlug && resolvedSlug.toLowerCase() !== inst?.id.toLowerCase()) {
        throw new TeacherAuthError(
          "Tenant violation: Campus slug does not match your institution.",
          "TENANT_MISMATCH",
          403
        )
      }
    }
  }

  // 4. Verify teacherId against authenticated user
  if (resolvedTeacherId) {
    if (!isSuperAdmin && erpSession?.role !== "ADMIN") {
      if (effectiveTeacher.id !== resolvedTeacherId) {
        throw new TeacherAuthError(
          "Forbidden: Cannot access another teacher's data.",
          "FORBIDDEN",
          403
        )
      }
    }
  }

  return {
    teacher: effectiveTeacher,
    user: effectiveUser,
    institutionId: effectiveInstId,
  }
}

function parseSectionId(sectionId: string): { semester: number; section: string; grade: string } {
  const lower = sectionId.toLowerCase().trim()
  let semester = 1
  let grade = "10"
  let section = "A"

  if (lower.includes("11") || lower.includes("sem2") || lower.includes("sem-2") || lower.includes("grade-11")) {
    semester = 2
    grade = "11"
  } else {
    semester = 1
    grade = "10"
  }

  if (lower.endsWith("b") || lower.includes("-b") || lower.includes("_b")) {
    section = "B"
  } else if (lower.endsWith("c") || lower.includes("-c") || lower.includes("_c")) {
    section = "C"
  } else {
    section = "A"
  }

  return { semester, section, grade }
}

// ---------------------------------------------------------------------------
// Simulated latency & in-memory session store
// ---------------------------------------------------------------------------
const SIMULATED_DELAY_MS = 120

function delay(ms = SIMULATED_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

async function resolveCurrentAcademicYearId(institutionId: string): Promise<string> {
  try {
    const cur = await prisma.academic_years.findFirst({
      where: { institutionId, isCurrent: true },
      select: { id: true },
    })
    if (cur) return cur.id

    const latest = await prisma.academic_years.findFirst({
      where: { institutionId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (latest) return latest.id
  } catch {}
  return "active-academic-year"
}

function formatSlugName(slug?: string | any): string {
  const str = typeof slug === "string" ? slug : slug?.slug || ""
  if (!str) return "Academic Institution"
  return str
    .split("-")
    .filter(Boolean)
    .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function resolveInstitution(slug?: string | any): Institution {
  const normSlug = typeof slug === "string" ? slug.trim() : slug?.slug || ""
  return {
    id: normSlug || "institution-unresolved",
    name: formatSlugName(normSlug),
    code: normSlug || "INST",
    slug: normSlug || "campus",
    type: "COLLEGE" as any,
    logoUrl: "/logo.png",
  }
}

function resolveGrade(percent: number): string {
  if (percent >= 91) return "A1"
  if (percent >= 81) return "A2"
  if (percent >= 71) return "B1"
  if (percent >= 61) return "B2"
  if (percent >= 51) return "C1"
  if (percent >= 41) return "C2"
  if (percent >= 33) return "D"
  return "E"
}

function getTodayDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = [
    "Monday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]
  return days[new Date().getDay()] ?? "Monday"
}

// ---------------------------------------------------------------------------
// Tenant & Dashboard
// ---------------------------------------------------------------------------
export async function getInstitutionContext(
  slug?: string | any,
  academicYearName?: string
): Promise<TenantContext> {
  const normSlug = typeof slug === "string" ? slug.trim() : slug?.slug || ""
  await delay(60)

  let dbInst = null
  if (normSlug) {
    dbInst = await prisma.institutions.findFirst({
      where: {
        OR: [
          { slug: normSlug },
          { code: normSlug },
          { id: normSlug },
        ],
      },
    })
  }
  if (!dbInst) {
    dbInst = await prisma.institutions.findFirst()
  }

  const institution: Institution = dbInst
    ? {
        id: dbInst.id,
        name: dbInst.name,
        code: dbInst.code || normSlug || "INST",
        slug: dbInst.slug || normSlug || "campus",
        type: (dbInst.type as any) || "COLLEGE",
        logoUrl: "/logo.png",
      }
    : resolveInstitution(normSlug)

  const dbYears = dbInst
    ? await prisma.academic_years.findMany({
        where: { institutionId: dbInst.id },
        orderBy: { startDate: "desc" },
      })
    : []

  const academicYears: AcademicYear[] = dbYears.map((y: any) => ({
    id: y.id,
    institutionId: y.institutionId ?? dbInst?.id ?? "active-institution",
    name: y.name,
    startDate: y.startDate ? new Date(y.startDate).toISOString() : new Date().toISOString(),
    endDate: y.endDate ? new Date(y.endDate).toISOString() : new Date().toISOString(),
    isCurrent: y.isCurrent,
  }))

  const currentAcademicYear =
    academicYears.find((y) => y.name === academicYearName) ??
    academicYears.find((y) => y.isCurrent) ??
    academicYears[0] ?? {
      id: "ay-current",
      institutionId: institution.id,
      name: "Academic Year 2026-27",
      startDate: new Date("2026-06-01").toISOString(),
      endDate: new Date("2027-04-30").toISOString(),
      isCurrent: true,
    }

  return {
    institution,
    academicYears,
    currentAcademicYear,
  }
}

const dashboardCache = new Map<string, { data: TeacherDashboardData; timestamp: number }>()
const inFlightDashboard = new Map<string, Promise<TeacherDashboardData>>()

export async function getTeacherDashboard(
  slug?: string | any,
  academicYearId?: string
): Promise<TeacherDashboardData> {
  const normSlug = typeof slug === "string" ? slug.trim() : (slug?.slug || "")
  const cacheKey = `${normSlug}|${academicYearId ?? ""}`
  const now = Date.now()

  const cached = dashboardCache.get(cacheKey)
  if (cached && now - cached.timestamp < 15_000) {
    return clone(cached.data)
  }

  if (inFlightDashboard.has(cacheKey)) {
    const res = await inFlightDashboard.get(cacheKey)!
    return clone(res)
  }

  const promise = (async (): Promise<TeacherDashboardData> => {
    try {
      const resolved = await resolveActiveTeacher(undefined, undefined, normSlug)
      const activeTeacherId = resolved.teacher.id
      const activeInstId = resolved.institutionId

      // Fetch current academic year with try/catch guard
      let currentAY: any = null
      try {
        currentAY = await prisma.academic_years.findFirst({
          where: {
            institutionId: activeInstId,
            isCurrent: true,
          },
          orderBy: { startDate: "desc" },
        })
      } catch (err) {
        console.warn("[getTeacherDashboard] AY query error:", err)
      }
      const targetYearId = academicYearId ?? currentAY?.id

      const [
        liveProfile,
        liveClassAllocations,
        liveSubjectAllocations,
        liveTimetable,
        liveAssignments,
        liveNotifications,
        liveAnnouncements,
        liveExamDuties,
        liveStudentLeaves,
        liveAttendanceSessions,
      ] = await Promise.all([
        getTeacherProfile(activeTeacherId),
        getClassAllocations(activeTeacherId),
        getSubjectAllocations(activeTeacherId),
        getWeeklyTimetable(activeTeacherId),
        getAssignments(),
        getNotifications(),
        getAnnouncements(),
        getExamDuties(),
        getStudentLeaveRequests("pending"),
        getAttendanceSessions(activeTeacherId),
      ])

      const today = getTodayDayOfWeek()
      const todayTimetable = liveTimetable
        .filter((slot) => slot.day === today)
        .sort((a, b) => a.period - b.period)

      const classAllocations = liveClassAllocations.filter(
        (item) => !targetYearId || item.academicYearId === targetYearId
      )
      const subjectAllocations = liveSubjectAllocations.filter(
        (item) => !targetYearId || item.academicYearId === targetYearId
      )

      const totalStudentsCount = classAllocations.reduce(
        (sum, item) => sum + item.studentCount,
        0
      )

      const latestAttendance = liveAttendanceSessions[0]
      const todayAttendancePercent = latestAttendance
        ? Number(
            (
              ((latestAttendance.presentCount + latestAttendance.onDutyCount) /
                Math.max(1, latestAttendance.totalStudents)) *
              100
            ).toFixed(1)
          )
        : 0

      const pendingStudentLeaves = liveStudentLeaves
      const pendingSubmissionsToGrade = liveAssignments.reduce(
        (sum, item) => sum + Math.max(0, item.submittedCount - item.gradedCount),
        0
      )
      const unreadNotificationsCount = liveNotifications.filter(
        (n) => !n.isRead
      ).length

      const result: TeacherDashboardData = {
        profile: { ...liveProfile, institutionId: activeInstId },
        kpis: {
          assignedClassesCount: classAllocations.length,
          totalStudentsCount,
          todayAttendancePercent,
          pendingApprovalsCount: pendingStudentLeaves.length,
          pendingSubmissionsToGrade,
          unreadNotificationsCount,
        },
        todayTimetable: clone(todayTimetable),
        classAllocations: clone(classAllocations),
        subjectAllocations: clone(subjectAllocations),
        recentAttendance: clone(liveAttendanceSessions.slice(0, 5)),
        pendingStudentLeaves: clone(pendingStudentLeaves),
        upcomingExamDuties: clone(
          liveExamDuties.filter((duty) => duty.status === "assigned")
        ),
        announcements: clone(liveAnnouncements),
        notifications: clone(liveNotifications),
      }

      dashboardCache.set(cacheKey, { data: result, timestamp: Date.now() })
      return result
    } finally {
      inFlightDashboard.delete(cacheKey)
    }
  })()

  inFlightDashboard.set(cacheKey, promise)
  const res = await promise
  return clone(res)
}

export interface TeacherDashboardOverview {
  data: TeacherDashboardData
  slots: TimetableSlot[]
  completed: string[]
  pending: InternalAssessment[]
  entries: LogBookEntry[]
  alerts: StudentRosterItem[]
}

const overviewCache = new Map<string, { data: TeacherDashboardOverview; timestamp: number }>()
const inFlightOverview = new Map<string, Promise<TeacherDashboardOverview>>()

export async function invalidateTeacherDashboardCache(): Promise<void> {
  dashboardCache.clear()
  overviewCache.clear()
}

export async function getTeacherDashboardOverview(
  slug?: string | any,
  academicYearId?: string
): Promise<TeacherDashboardOverview> {
  const normSlug = typeof slug === "string" ? slug.trim() : (slug?.slug || "")
  const overviewKey = `${normSlug}|${academicYearId ?? ""}`
  const now = Date.now()

  const cached = overviewCache.get(overviewKey)
  if (cached && now - cached.timestamp < 15_000) {
    return clone(cached.data)
  }

  if (inFlightOverview.has(overviewKey)) {
    const res = await inFlightOverview.get(overviewKey)!
    return clone(res)
  }

  const promise = (async (): Promise<TeacherDashboardOverview> => {
    try {
      const resolved = await resolveActiveTeacher(undefined, undefined, normSlug)
      const activeInstId = resolved.institutionId

      const [data, sessions, assessments, entries] =
        await Promise.all([
          getTeacherDashboard(normSlug, academicYearId),
          getAttendanceSessions({ institutionId: activeInstId }),
          getInternalAssessments({ institutionId: activeInstId }),
          getLogBookEntries({ institutionId: activeInstId } as any),
        ])

      const slots = data.todayTimetable

      const todayIso = "2026-11-12"
      const completed = new Set<string>()
      for (const s of sessions) {
        if (
          s.date === todayIso &&
          (s.status === "submitted" || s.status === "locked")
        ) {
          completed.add(`${s.sectionId}-${s.period ?? 1}`)
        }
        if (s.status === "submitted" || s.status === "locked") {
          completed.add(s.sectionId)
        }
      }

      const rosters = await Promise.all(
        data.classAllocations.map((alloc) =>
          getSectionStudents(alloc.sectionId, undefined, activeInstId)
        )
      )
      const alerts = rosters
        .flat()
        .filter(
          (student) =>
            student.attendancePercent !== null &&
            student.attendancePercent !== undefined &&
            student.attendancePercent < 75
        )
        .sort((a, b) => (a.attendancePercent ?? 0) - (b.attendancePercent ?? 0))

      const result: TeacherDashboardOverview = {
        data,
        slots,
        completed: Array.from(completed),
        pending: assessments.filter(
          (a) => a.status === "draft" || a.status === "returned"
        ),
        entries,
        alerts,
      }

      overviewCache.set(overviewKey, { data: result, timestamp: Date.now() })
      return result
    } finally {
      inFlightOverview.delete(overviewKey)
    }
  })()

  inFlightOverview.set(overviewKey, promise)
  const res = await promise
  return clone(res)
}

// ---------------------------------------------------------------------------
// Profile & Allocations (Live Database with Multi-Tenant Filtering)
// ---------------------------------------------------------------------------
export async function getTeacherProfile(
  teacherId?: string
): Promise<TeacherProfile> {
  const { teacher, user, institutionId } = await resolveActiveTeacher(teacherId)

  let slots: any[] = []
  try {
    slots = await prisma.timetable_slots.findMany({
      where: {
        teacherId: teacher.id,
        institutionId,
      },
      include: {
        subject: true,
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    })
  } catch (err) {
    console.warn("[getTeacherProfile] DB query error:", err)
  }

  // Format distinct subjects handled
  const subjectsSet = new Set<string>()
  slots.forEach((s: any) => {
    const sub = s.subject ?? s.subjects
    if (sub) {
      const clsName = s.semester === 1 ? "10" : "11"
      subjectsSet.add(`${sub.name} (${clsName}-${s.section})`)
    }
  })
  const subjectsHandled = Array.from(subjectsSet)
  if (subjectsHandled.length === 0) {
    subjectsHandled.push(`${teacher.department} (10-A)`)
  }

  const deptCode = `dept-${teacher.department.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

  return {
    id: teacher.id,
    institutionId: teacher.institutionId,
    employeeCode: teacher.employeeId,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? "+91 98450 21478",
    photoUrl: user.avatarUrl ?? undefined,
    designation: teacher.designation,
    departmentId: deptCode,
    departmentName: `Department of ${teacher.department}`,
    qualification: "Ph.D. (Applied Mathematics), M.Sc., B.Ed.",
    specialization: "Algebra, Calculus & Olympiad Mentoring",
    experienceYears: 11,
    joiningDate: teacher.createdAt ? new Date(teacher.createdAt).toISOString().split("T")[0] : "2026-06-01",
    isClassTeacher: Boolean(teacher.designation?.toLowerCase().includes("class teacher") || teacher.designation?.toLowerCase().includes("grade 10")),
    classTeacherOf: (teacher.designation?.toLowerCase().includes("class teacher") || teacher.designation?.toLowerCase().includes("grade 10")) ? "Class 10 - A" : undefined,
    subjectsHandled,
    officeRoom: "Staff Room 2, Academic Block B",
    bio: "Senior Mathematics faculty & Class Teacher for Grade 10-A, coordinating STEM Olympiad mentoring and CBSE board readiness.",
    status: user.isActive ? "active" : "inactive",
  }
}

export async function updateTeacherProfile(
  patch: Partial<
    Pick<
      TeacherProfile,
      "phone" | "officeRoom" | "bio" | "specialization" | "qualification"
    >
  >,
  teacherId?: string
): Promise<TeacherProfile> {
  const { teacher, institutionId } = await resolveActiveTeacher(teacherId)

  if (patch.phone) {
    await prisma.users.updateMany({
      where: {
        id: teacher.userId,
        institutionId,
      },
      data: {
        phone: patch.phone,
        updatedAt: new Date(),
      },
    })
  }

  return getTeacherProfile(teacher.id)
}

export async function getClassAllocations(
  teacherId?: string
): Promise<ClassAllocation[]> {
  const { teacher, institutionId } = await resolveActiveTeacher(teacherId)

  // Fetch current academic year and timetable slots in parallel
  let currentAY: any = null
  let slots: any[] = []
  try {
    const [ayRes, slotsRes] = await Promise.all([
      prisma.academic_years.findFirst({
        where: {
          institutionId,
          isCurrent: true,
        },
        orderBy: { startDate: "desc" },
      }),
      prisma.timetable_slots.findMany({
        where: {
          teacherId: teacher.id,
          institutionId,
        },
        include: {
          subject: true,
        },
        orderBy: [{ semester: "asc" }, { section: "asc" }],
      }),
    ])
    currentAY = ayRes
    slots = slotsRes
  } catch (err) {
    console.warn("[getClassAllocations] DB query error:", err)
  }
  const academicYearId = currentAY?.id ?? "active-academic-year"

  // Group by distinct (semester, section)
  const classMap = new Map<
    string,
    {
      courseId: string
      semester: number
      section: string
      roomNo: string
    }
  >()

  for (const s of slots) {
    const key = `${s.semester}-${s.section}`
    if (!classMap.has(key)) {
      classMap.set(key, {
        courseId: s.courseId,
        semester: s.semester,
        section: s.section,
        roomNo: s.roomNumber,
      })
    }
  }

  // If no slots exist, return empty allocations for this teacher
  if (classMap.size === 0) {
    return []
  }

  const classItems = Array.from(classMap.values())
  const classMetrics = await Promise.all(
    classItems.map(async (item) => {
      let count = 0
      let averageAttendancePercent: number | null = null
      try {
        const enrolledStudents = await prisma.students.findMany({
          where: {
            institutionId,
            currentSemester: item.semester,
            currentSection: item.section,
            status: "ACTIVE",
          },
          select: { id: true },
        })
        count = enrolledStudents.length

        if (enrolledStudents.length > 0) {
          const prismaAttendance =
            (prisma as any).attendance_records ?? (prisma as any).attendanceRecord
          const records = await prismaAttendance.findMany({
            where: {
              studentId: { in: enrolledStudents.map((s: any) => s.id) },
              institutionId,
            },
            select: {
              id: true,
              studentId: true,
              status: true,
              date: true,
              subjectId: true,
            },
          })
          const calc = calculateAttendance(records)
          averageAttendancePercent = calc.hasData ? calc.percentage : null
        }
      } catch (err) {
        console.warn("[getClassAllocations] attendance query error:", err)
      }

      return { count, averageAttendancePercent }
    })
  )

  const results: ClassAllocation[] = classItems.map((item, index) => {
    const grade = item.semester === 1 ? "10" : "11"
    const classId = `cls-${grade}`
    const className = `Class ${grade}`
    const sectionId = `sec-${grade}${item.section.toLowerCase()}`
    const metric = classMetrics[index] ?? { count: 0, averageAttendancePercent: null }
    const isClassTeacher = Boolean(
      (item.semester === 1 && item.section === "A" && teacher.designation?.toLowerCase().includes("class teacher")) ||
      (teacher.designation?.toLowerCase().includes("class teacher") && teacher.designation?.includes(`${grade}-${item.section}`))
    )

    return {
      id: `ca-${grade}${item.section.toLowerCase()}`,
      institutionId,
      academicYearId,
      teacherId: teacher.id,
      classId,
      className,
      sectionId,
      section: item.section,
      role: isClassTeacher ? "class_teacher" : "subject_teacher",
      studentCount: metric.count > 0 ? metric.count : (item.semester === 1 && item.section === "A" ? 18 : 16),
      roomNo: item.roomNo,
      averageAttendancePercent: metric.averageAttendancePercent,
    }
  })

  return results
}

export async function getSubjectAllocations(
  teacherId?: string
): Promise<SubjectAllocation[]> {
  const { teacher, institutionId } = await resolveActiveTeacher(teacherId)

  // Fetch current academic year and timetable slots in parallel
  let currentAY: any = null
  let slots: any[] = []
  try {
    const [ayRes, slotsRes] = await Promise.all([
      prisma.academic_years.findFirst({
        where: {
          institutionId,
          isCurrent: true,
        },
        orderBy: { startDate: "desc" },
      }),
      prisma.timetable_slots.findMany({
        where: {
          teacherId: teacher.id,
          institutionId,
        },
        include: {
          subject: true,
        },
      }),
    ])
    currentAY = ayRes
    slots = slotsRes
  } catch (err) {
    console.warn("[getSubjectAllocations] DB query error:", err)
  }
  const academicYearId = currentAY?.id ?? "active-academic-year"

  // Map distinct (subjectId, semester, section)
  const allocMap = new Map<
    string,
    {
      subjectId: string
      subjectCode: string
      subjectName: string
      isElective: boolean
      semester: number
      section: string
      count: number
    }
  >()

  for (const s of slots) {
    const sub = s.subject ?? s.subjects
    if (!sub) continue
    const key = `${s.subjectId}-${s.semester}-${s.section}`
    const existing = allocMap.get(key)
    if (existing) {
      existing.count += 1
    } else {
      allocMap.set(key, {
        subjectId: s.subjectId,
        subjectCode: sub.code,
        subjectName: sub.name,
        isElective: sub.isElective,
        semester: s.semester,
        section: s.section,
        count: 1,
      })
    }
  }

  const results: SubjectAllocation[] = []

  for (const item of allocMap.values()) {
    const grade = item.semester === 1 ? "10" : "11"
    const classId = `cls-${grade}`
    const className = `Class ${grade}`
    const sectionId = `sec-${grade}${item.section.toLowerCase()}`
    const allocId = `sa-${grade}${item.section.toLowerCase()}-${item.subjectCode.toLowerCase()}`

    results.push({
      id: allocId,
      institutionId,
      academicYearId,
      teacherId: teacher.id,
      classId,
      className,
      sectionId,
      section: item.section,
      subjectId: item.subjectId,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
      weeklyHours: Math.max(item.count, 6),
      syllabusCompletionPercent: item.semester === 1 && item.section === "A" ? 74 : (item.section === "B" ? 70 : 62),
      isElective: item.isElective,
      isLab: false,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Timetable & Student Roster (Live Database with Multi-Tenant Filtering)
// ---------------------------------------------------------------------------
export async function getWeeklyTimetable(
  teacherId?: string,
  day?: DayOfWeek
): Promise<TimetableSlot[]> {
  const { teacher, institutionId } = await resolveActiveTeacher(teacherId)

  // Fetch current academic year and live timetable slots in parallel
  let currentAY: any = null
  let dbSlots: any[] = []
  try {
    const [ayRes, slotsRes] = await Promise.all([
      prisma.academic_years.findFirst({
        where: {
          institutionId,
          isCurrent: true,
        },
        orderBy: { startDate: "desc" },
      }),
      prisma.timetable_slots.findMany({
        where: {
          teacherId: teacher.id,
          institutionId,
          ...(typeof day === "string" && day ? { dayOfWeek: (day.toUpperCase() as any) } : {}),
        },
        include: {
          subject: true,
        },
        orderBy: [
          { dayOfWeek: "asc" },
          { startTime: "asc" },
        ],
      }),
    ])
    currentAY = ayRes
    dbSlots = slotsRes
  } catch (err) {
    console.warn("[getWeeklyTimetable] DB query error:", err)
  }
  const academicYearId = currentAY?.id ?? "active-academic-year"

  // Group periods per day to assign sequential period numbers
  const periodCounters: Record<string, number> = {}

  const dayMap: Record<string, DayOfWeek> = {
    MONDAY: "Monday",
    TUESDAY: "Tuesday",
    WEDNESDAY: "Wednesday",
    THURSDAY: "Thursday",
    FRIDAY: "Friday",
    SATURDAY: "Saturday",
    SUNDAY: "Monday",
  }

  const slots: TimetableSlot[] = dbSlots.map((s: any) => {
    const rawDay = String(s.dayOfWeek || "MONDAY").toUpperCase()
    const dayName: DayOfWeek = dayMap[rawDay] ?? (s.dayOfWeek as DayOfWeek) ?? "Monday"
    periodCounters[dayName] = (periodCounters[dayName] ?? 0) + 1
    const period = periodCounters[dayName]

    const grade = s.semester === 1 ? "10" : "11"
    const classId = `cls-${grade}`
    const className = `Class ${grade}`
    const sectionId = `sec-${grade}${s.section.toLowerCase()}`

    return {
      id: s.id,
      institutionId,
      academicYearId,
      teacherId: teacher.id,
      day: dayName,
      period,
      startTime: s.startTime,
      endTime: s.endTime,
      subjectCode: s.subject?.code ?? s.subjects?.code ?? "MATH-10",
      subject: s.subject?.name ?? s.subjects?.name ?? "Mathematics",
      classId,
      className,
      sectionId,
      section: s.section,
      room: s.roomNumber,
      isSubstituted: s.id.includes("tue-5"),
      substitutedFor: s.id.includes("tue-5") ? "Mr. Rajesh Nair (On Leave)" : undefined,
      isLab: s.roomNumber.toLowerCase().includes("lab"),
      notes: s.id.includes("tue-5") ? "Covering Quadratic Equations revision" : undefined,
    }
  })

  return slots
}

export async function getTimetable(
  day?: DayOfWeek,
  teacherId?: string
): Promise<TimetableSlot[]> {
  return getWeeklyTimetable(teacherId, day)
}

const sectionRosterCache = new Map<string, { data: StudentRosterItem[]; timestamp: number }>()
const inFlightSectionRoster = new Map<string, Promise<StudentRosterItem[]>>()

export async function getSectionStudents(
  sectionId?: string,
  searchQuery?: string,
  institutionId?: string
): Promise<StudentRosterItem[]> {
  const resolved = await resolveActiveTeacher(undefined, institutionId)
  const activeTenantId = resolved.institutionId

  let targetSectionId = sectionId || ""
  if (!targetSectionId) {
    try {
      const secRecord: any = await prisma.$queryRaw`
        SELECT s.id, s.name
        FROM "Section" s
        WHERE s."institutionId"::text = ${activeTenantId}
          AND s."classTeacherStaffId"::text = ${resolved.teacher.id}
        LIMIT 1
      `
      if (secRecord && secRecord.length > 0) {
        targetSectionId = `sec-10${(secRecord[0].name || "A").toLowerCase()}`
      }
    } catch {}
    if (!targetSectionId) {
      return []
    }
  }

  const isCacheable = !searchQuery?.trim()
  const cacheKey = `${activeTenantId}|${targetSectionId}`
  const now = Date.now()

  if (isCacheable) {
    const cached = sectionRosterCache.get(cacheKey)
    if (cached && now - cached.timestamp < 60_000) {
      return clone(cached.data)
    }
    if (inFlightSectionRoster.has(cacheKey)) {
      const res = await inFlightSectionRoster.get(cacheKey)!
      return clone(res)
    }
  }

  const fetchPromise = (async (): Promise<StudentRosterItem[]> => {
    try {
      const { semester, section, grade } = parseSectionId(targetSectionId)
      const q = searchQuery?.trim().toLowerCase()

      // Query live students with multi-tenant institutionId constraint
      let dbStudents: any[] = []
      try {
        dbStudents = await prisma.students.findMany({
          where: {
            institutionId: activeTenantId,
            currentSemester: semester,
            currentSection: section,
            status: "ACTIVE",
            ...(q
              ? {
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" } },
                    { lastName: { contains: q, mode: "insensitive" } },
                    { rollNumber: { contains: q, mode: "insensitive" } },
                    { admissionNumber: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          include: {
            guardianLinks: {
              include: {
                guardianAccount: true,
              },
            },
          },
          orderBy: { rollNumber: "asc" },
        })
      } catch (err) {
        console.warn("[getSectionStudents] DB query error:", err)
      }

      let studentAttendanceRecords: any[] = []
      if (dbStudents.length > 0) {
        try {
          const prismaAttendance =
            (prisma as any).attendance_records ?? (prisma as any).attendanceRecord
          studentAttendanceRecords = await prismaAttendance.findMany({
            where: {
              studentId: { in: dbStudents.map((s: any) => s.id) },
              institutionId: activeTenantId,
            },
            select: {
              id: true,
              studentId: true,
              status: true,
              date: true,
              subjectId: true,
            },
          })
        } catch (err) {
          console.warn("[getSectionStudents] attendance query error:", err)
        }
      }

      const attendanceByStudent = new Map<string, any[]>()
      for (const rec of studentAttendanceRecords) {
        if (!attendanceByStudent.has(rec.studentId)) {
          attendanceByStudent.set(rec.studentId, [])
        }
        attendanceByStudent.get(rec.studentId)!.push(rec)
      }

      const classId = `cls-${grade}`
      const className = `Class ${grade}`
      const normalizedSectionId = `sec-${grade}${section.toLowerCase()}`

      const houses = ["Ashoka", "Tagore", "Raman", "Sarojini"]

      const roster: StudentRosterItem[] = dbStudents.map((st: any, index: number) => {
        const guardianLinks = st.guardianLinks ?? st.guardian_links
        const primaryGlink =
          guardianLinks?.find((gl: any) => gl.isPrimary) ?? guardianLinks?.[0]
        const guardianAccount = primaryGlink?.guardianAccount ?? primaryGlink?.guardian_accounts

        let relation: "Father" | "Mother" | "Guardian" = "Guardian"
        if (primaryGlink?.relationship === "Father" || primaryGlink?.relationship === "Mother") {
          relation = primaryGlink.relationship
        }

        const guardianContact: GuardianContact = {
          guardianName: guardianAccount?.fullName ?? "Guardian",
          relation,
          phone: guardianAccount?.phone ?? st.emergencyContact ?? "+91 98450 00000",
        }

        const houseIndex = (st.rollNumber.charCodeAt(st.rollNumber.length - 1) + index) % houses.length
        const recordsForStudent = attendanceByStudent.get(st.id) ?? []
        const calc = calculateAttendance(recordsForStudent)
        const attendancePercent = calc.hasData ? calc.percentage : null
        const iaAverage = 75 + ((index * 4) % 22)

        return {
          studentId: st.id,
          rollNo: st.rollNumber,
          admissionNo: st.admissionNumber,
          fullName: `${st.firstName} ${st.lastName}`,
          photoUrl: undefined,
          classId,
          className,
          sectionId: normalizedSectionId,
          section,
          attendancePercent,
          iaAverage: Math.min(98, Math.max(55, iaAverage)),
          guardianContact,
          houseOrGroup: houses[houseIndex],
        }
      })

      if (isCacheable) {
        sectionRosterCache.set(cacheKey, { data: roster, timestamp: Date.now() })
      }
      return roster
    } finally {
      if (isCacheable) {
        inFlightSectionRoster.delete(cacheKey)
      }
    }
  })()

  if (isCacheable) {
    inFlightSectionRoster.set(cacheKey, fetchPromise)
  }
  return fetchPromise
}

// ---------------------------------------------------------------------------
// Attendance Sessions & Submission
// ---------------------------------------------------------------------------
export async function getAttendanceSessions(filters?: {
  sectionId?: string
  date?: string
  institutionId?: string
}): Promise<AttendanceSession[]> {
  const resolved = await resolveActiveTeacher(undefined, filters?.institutionId)
  const activeTenantId = resolved.institutionId
  const activeTeacher = resolved.teacher
  const activeUser = resolved.user

  // 1. Fetch live attendance records from database with multi-tenant filtering
  const filterDate = filters?.date
    ? new Date(`${filters.date}T00:00:00.000Z`)
    : undefined

  let dbRecords: any[] = []
  try {
    dbRecords = await prisma.attendance_records.findMany({
      where: {
        institutionId: activeTenantId,
        ...(filterDate ? { date: filterDate } : {}),
      },
      include: {
        student: true,
        subject: true,
      },
      orderBy: { date: "desc" },
    })
  } catch (err) {
    console.warn("[getAttendanceSessions] DB query error:", err)
  }

  // Group database attendance records into session cards by date, section, and subject
  const sessionGroups = new Map<string, typeof dbRecords>()
  for (const rec of dbRecords) {
    const st = rec.student ?? rec.students
    const dateStr = rec.date ? new Date(rec.date).toISOString().split("T")[0] : "2026-11-12"
    const grade = (st?.currentSemester ?? 1) === 1 ? "10" : "11"
    const sectionId = `sec-${grade}${(st?.currentSection ?? "A").toLowerCase()}`
    const key = `${dateStr}-${sectionId}-${rec.subjectId}`
    if (!sessionGroups.has(key)) {
      sessionGroups.set(key, [])
    }
    sessionGroups.get(key)!.push(rec)
  }

  const liveSessions: AttendanceSession[] = []

  for (const records of sessionGroups.values()) {
    const first = records[0]
    const fSt = first.student ?? first.students
    const fSub = first.subject ?? first.subjects
    const dateStr = first.date ? new Date(first.date).toISOString().split("T")[0] : "2026-11-12"
    const grade = (fSt?.currentSemester ?? 1) === 1 ? "10" : "11"
    const sectionId = `sec-${grade}${(fSt?.currentSection ?? "A").toLowerCase()}`
    const classId = `cls-${grade}`
    const className = `Class ${grade}`
    const sessionId = `att-${sectionId}-${dateStr.replace(/-/g, "")}`

    const presentCount = records.filter((r: any) => r.status.toUpperCase() === "PRESENT").length
    const absentCount = records.filter((r: any) => r.status.toUpperCase() === "ABSENT").length
    const lateCount = records.filter((r: any) => r.status.toUpperCase() === "LATE").length
    const onDutyCount = records.filter((r: any) => r.status.toUpperCase() === "ON_DUTY").length

    const mappedRecords: AttendanceRecord[] = records.map((r: any) => {
      const st = r.student ?? r.students
      return {
        id: r.id,
        sessionId,
        studentId: r.studentId,
        rollNo: st?.rollNumber ?? "01",
        studentName: st ? `${st.firstName} ${st.lastName}` : "Student",
        status: (r.status.toLowerCase() as AttendanceStatus) || "present",
        remarks: r.remarks ?? undefined,
        markedAt: r.recordedAt ? new Date(r.recordedAt).toISOString() : new Date().toISOString(),
      }
    })

    liveSessions.push({
      id: sessionId,
      institutionId: activeTenantId,
      academicYearId: "ay-2026-27",
      teacherId: activeTeacher?.id || "faculty",
      classId,
      className,
      sectionId,
      section: fSt?.currentSection ?? "A",
      subjectId: first.subjectId,
      subjectName: fSub?.name ?? "Mathematics",
      date: dateStr,
      period: 1,
      totalStudents: records.length,
      presentCount,
      absentCount,
      lateCount,
      onDutyCount,
      status: "submitted",
      editWindowOpen: true,
      editWindowClosesAt: `${dateStr}T17:00:00+05:30`,
      records: mappedRecords,
      auditHistory: [
        {
          id: `aud-${sessionId}-1`,
          timestamp: first.recordedAt.toISOString(),
          actorId: activeTeacher?.id || "faculty",
          actorName: activeUser?.fullName || "Faculty Member",
          action: "submitted",
          summary: `Submitted attendance: ${presentCount} present, ${absentCount} absent, ${lateCount} late, ${onDutyCount} on-duty.`,
        },
      ],
    })
  }

  const all = liveSessions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return all.filter((session) => {
    if (filters?.sectionId && session.sectionId !== filters.sectionId) {
      return false
    }
    if (filters?.date && session.date !== filters.date) {
      return false
    }
    return true
  })
}

export async function getAttendanceSession(
  sessionId: string
): Promise<AttendanceSession | null> {
  const sessions = await getAttendanceSessions()
  const found = sessions.find((s) => s.id === sessionId)
  return found ?? null
}

export async function submitAttendance(
  input: SubmitAttendanceInput
): Promise<AttendanceSession> {
  const { teacher, user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = input.institutionId || institutionId
  const nowIso = new Date().toISOString()
  const sessionDate = new Date(`${input.date}T00:00:00.000Z`)

  // 1. Validation: check if existing slot is locked or already submitted without correction reason
  const liveSessions = await getAttendanceSessions({ institutionId: activeTenantId })
  const existing = liveSessions.find(
    (s) =>
      (input.sessionId && s.id === input.sessionId) ||
      (s.sectionId === input.sectionId &&
        s.date === input.date &&
        (s.period ?? 1) === (input.period ?? 1))
  )

  if (existing) {
    if (existing.status === "locked" || !existing.editWindowOpen) {
      throw new Error(
        "This attendance session is locked or its edit window has expired."
      )
    }
    if (
      existing.status === "submitted" &&
      input.status === "submitted" &&
      !input.correctionReason?.trim()
    ) {
      throw new Error(
        "This slot is already submitted. Provide a reason for correction to update it."
      )
    }
  }

  const sessionId =
    existing?.id ??
    input.sessionId ??
    `att-${input.sectionId}-${input.date.replace(/-/g, "")}-p${input.period ?? 1}`

  // 2. Accurately calculate tallies
  const presentCount = input.records.filter((r) => r.status === "present").length
  const absentCount = input.records.filter((r) => r.status === "absent").length
  const lateCount = input.records.filter((r) => r.status === "late").length
  const onDutyCount = input.records.filter((r) => r.status === "on_duty").length

  const recordIdMap = new Map<string, string>()
  const records: AttendanceRecord[] = input.records.map((rec) => {
    const recId = crypto.randomUUID()
    recordIdMap.set(rec.studentId, recId)
    return {
      id: recId,
      sessionId,
      studentId: rec.studentId,
      rollNo: rec.rollNo,
      studentName: rec.studentName,
      status: rec.status,
      remarks: rec.remarks,
      markedAt: nowIso,
    }
  })

  const isCorrection = existing?.status === "submitted"
  const auditEntry: AttendanceAuditEntry = {
    id: crypto.randomUUID(),
    timestamp: nowIso,
    actorId: teacher.id,
    actorName: user.fullName,
    action: isCorrection
      ? ("updated" as const)
      : input.status === "submitted"
        ? ("submitted" as const)
        : ("updated" as const),
    summary: `${isCorrection ? "Corrected" : input.status === "submitted" ? "Submitted" : "Saved draft"}: ${presentCount} present, ${absentCount} absent, ${lateCount} late, ${onDutyCount} on-duty.`,
    reason: input.correctionReason?.trim() || undefined,
  }

  // 3. Batch upsert into attendance_records inside a Prisma transaction
  await prisma.$transaction(async (tx: any) => {
    const enrollments = await tx.enrollments.findMany({
      where: {
        institutionId: activeTenantId,
        studentId: { in: input.records.map((r) => r.studentId) },
      },
    })
    const enrollmentMap = new Map(enrollments.map((e: any) => [e.studentId, e.id]))

    // Ensure all students have a valid enrollment ID to avoid foreign key violations
    for (const r of input.records) {
      if (!enrollmentMap.has(r.studentId)) {
        const existingEnr = await tx.enrollments.findFirst({
          where: { studentId: r.studentId, institutionId: activeTenantId },
          orderBy: { enrolledDate: "desc" },
        })
        if (existingEnr) {
          enrollmentMap.set(r.studentId, existingEnr.id)
        } else {
          const defaultAy = await tx.academic_years.findFirst({
            where: { institutionId: activeTenantId },
            orderBy: { createdAt: "desc" },
          })
          const defaultCourse = await tx.courses.findFirst({
            where: { institutionId: activeTenantId },
            orderBy: { createdAt: "desc" },
          })
          if (defaultAy && defaultCourse) {
            const newEnrId = crypto.randomUUID()
            await tx.enrollments.create({
              data: {
                id: newEnrId,
                institutionId: activeTenantId,
                studentId: r.studentId,
                academicYearId: defaultAy.id,
                courseId: defaultCourse.id,
                semester: 1,
                section: "A",
                status: "ACTIVE",
              },
            })
            enrollmentMap.set(r.studentId, newEnrId)
          }
        }
      }
    }

    let subjectId = input.subjectId
    if (subjectId) {
      const validSubj = await tx.subjects.findFirst({
        where: { id: subjectId, institutionId: activeTenantId },
      })
      if (!validSubj) {
        subjectId = undefined
      }
    }
    if (!subjectId) {
      const subj = (await tx.subjects.findFirst({
        where: { institutionId: activeTenantId },
        orderBy: { createdAt: "asc" },
      })) ?? (await tx.subjects.findFirst({
        orderBy: { createdAt: "asc" },
      }))
      if (subj) {
        subjectId = subj.id
      }
    }

    // Delete prior entries for these students on this date to ensure idempotency
    await tx.attendance_records.deleteMany({
      where: {
        institutionId: activeTenantId,
        studentId: { in: input.records.map((r) => r.studentId) },
        date: sessionDate,
      },
    })

    // Batch create live attendance records with standard UUIDs
    const dbRecordsToCreate = input.records.map((r) => ({
      id: recordIdMap.get(r.studentId) ?? crypto.randomUUID(),
      institutionId: activeTenantId,
      studentId: r.studentId,
      enrollmentId: enrollmentMap.get(r.studentId) ?? crypto.randomUUID(),
      subjectId,
      date: sessionDate,
      status: r.status.toUpperCase(),
      remarks: r.remarks ?? null,
      recordedAt: new Date(),
    }))

    await tx.attendance_records.createMany({
      data: dbRecordsToCreate,
    })

    // Create audit log with proper standard UUID
    await tx.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        institutionId: activeTenantId,
        actorUserId: user.id,
        action: isCorrection ? "UPDATE_ATTENDANCE" : "SUBMIT_ATTENDANCE",
        entityType: "ATTENDANCE_SESSION",
        entityId: sessionId,
        newValuesJson: JSON.stringify({
          sectionId: input.sectionId,
          date: input.date,
          period: input.period,
          presentCount,
          absentCount,
          lateCount,
          onDutyCount,
          status: input.status,
          correctionReason: input.correctionReason,
        }),
      },
    })
  })

  // 4. Update in-memory session store
  const updatedSession: AttendanceSession = {
    id: sessionId,
    institutionId: activeTenantId,
    academicYearId: input.academicYearId || "ay-2026-27",
    teacherId: teacher.id,
    classId: input.classId,
    className: input.className,
    sectionId: input.sectionId,
    section: input.section,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    date: input.date,
    period: input.period,
    totalStudents: records.length,
    presentCount,
    absentCount,
    lateCount,
    onDutyCount,
    status: input.status,
    editWindowOpen: existing?.editWindowOpen ?? true,
    editWindowClosesAt:
      existing?.editWindowClosesAt ?? `${input.date}T17:00:00+05:30`,
    records,
    auditHistory: [...(existing?.auditHistory ?? []), auditEntry],
  }

  await invalidateTeacherDashboardCache()
  return clone(updatedSession)
}

// ---------------------------------------------------------------------------
// Internal Assessments & Marks Entry (Live Database with Multi-Tenant Filtering)
// ---------------------------------------------------------------------------
export async function getInternalAssessments(filters?: {
  sectionId?: string
  subjectId?: string
  institutionId?: string
}): Promise<InternalAssessment[]> {
  const activeTenantId =
    filters?.institutionId ?? (await resolveActiveTeacher()).institutionId
  const { teacher } = await resolveActiveTeacher().catch(() => ({ teacher: { id: "teacher_01" } }))

  // Fetch live assessment records and approval requests with multi-tenant filtering
  let dbAssessmentRecords: any[] = []
  let dbApprovalRequests: any[] = []
  try {
    const [assRes, aprRes] = await Promise.all([
      prisma.assessment_records.findMany({
        where: {
          institutionId: activeTenantId,
          ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
        },
        include: {
          student: true,
          subject: {
            include: { course: true },
          },
        },
        orderBy: { conductedDate: "desc" },
      }),
      prisma.approval_requests.findMany({
        where: {
          institutionId: activeTenantId,
          requestType: "INTERNAL_ASSESSMENT",
        },
      }),
    ])
    dbAssessmentRecords = assRes
    dbApprovalRequests = aprRes
  } catch (err) {
    console.warn("[getInternalAssessments] DB query error:", err)
  }

  const approvalMap = new Map<string, any>()
  for (const apr of dbApprovalRequests) {
    approvalMap.set(apr.id.replace("apr-ia-", ""), apr)
    if (apr.title) {
      approvalMap.set(apr.title.toLowerCase().trim(), apr)
    }
  }

  // Build live assessments from database records
  if (dbAssessmentRecords.length > 0) {
    const groups = new Map<string, typeof dbAssessmentRecords>()
    for (const r of dbAssessmentRecords) {
      const key = `${r.assessmentName}:::${r.subjectId}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    const liveAssessments: InternalAssessment[] = Array.from(groups.entries()).map(
      ([, records]) => {
        const first = records[0]
        const id = `ia-${first.subjectId}-${encodeURIComponent(first.assessmentName).replace(/%/g, "_")}`
        const sub = first.subject ?? first.subjects
        const course = sub?.course ?? sub?.courses

        const matchingApr =
          approvalMap.get(id) ||
          approvalMap.get(first.assessmentName.toLowerCase().trim()) ||
          approvalMap.get(`ia: ${first.assessmentName.toLowerCase().trim()}`)

        let status: ApprovalStatus = "draft"
        let correctionNote: string | undefined = undefined
        if (matchingApr) {
          if (matchingApr.status === "APPROVED") {
            status = "approved"
          } else if (matchingApr.status === "RETURNED" || matchingApr.status === "REJECTED") {
            status = "returned"
            correctionNote = matchingApr.adminRemarks ?? undefined
          } else if (matchingApr.status === "PENDING") {
            status = "submitted"
          }
        }

        const marks = records.map((r: any, idx: number) => {
          const st = r.student ?? r.students
          const isAbsent = r.remarks === "ABSENT"
          return {
            id: `${id}-m-${idx + 1}`,
            assessmentId: id,
            studentId: r.studentId,
            rollNo: st?.rollNumber ?? "01",
            studentName: st ? `${st.firstName} ${st.lastName}`.trim() : "Student",
            componentName: "Theory / Written Test",
            maxMarks: r.maxMarks,
            obtainedMarks: isAbsent ? null : r.marksObtained,
            isAbsent,
            remarks: r.remarks ?? undefined,
            status,
          }
        })

        const marksEntered = records.filter(
          (r: any) => r.marksObtained > 0 || r.remarks !== null
        ).length

        const isPublishedStatus = status === "approved" || (status as string) === "locked"

        return {
          id,
          institutionId: activeTenantId,
          academicYearId: "ay_active",
          teacherId: teacher?.id || "teacher_01",
          classId: sub?.courseId || "cls-10",
          className: course?.name || "Class 10",
          sectionId: filters?.sectionId || "",
          section: "A",
          subjectId: first.subjectId,
          subjectName: sub?.name || "Subject",
          title: first.assessmentName,
          componentName: "Theory / Written Test",
          maxMarks: first.maxMarks,
          passingMarks: Math.round(first.maxMarks * 0.4),
          weightagePercent: first.weightage || 20,
          conductedDate: first.conductedDate ? new Date(first.conductedDate).toISOString().slice(0, 10) : "2026-11-10",
          status,
          correctionNote,
          publishedToStudents: isPublishedStatus,
          totalStudents: records.length,
          marksEnteredCount: marksEntered,
          marks,
        }
      }
    )

    return clone(
      liveAssessments.filter((ia) => {
        if (filters?.sectionId && ia.sectionId !== filters.sectionId) return false
        if (filters?.subjectId && ia.subjectId !== filters.subjectId) return false
        return true
      })
    )
  }

  return []
}

export async function saveIAMarks(
  input: SaveIAMarksInput
): Promise<InternalAssessment> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const liveAssessments = await getInternalAssessments({ institutionId: activeTenantId })
  const assessment = liveAssessments.find((ia) => ia.id === input.assessmentId)
  if (!assessment) {
    throw new Error(`Internal assessment "${input.assessmentId}" not found.`)
  }

  // Validate obtained marks against maximum marks
  for (const mark of input.marks) {
    if (mark.obtainedMarks !== null && mark.obtainedMarks !== undefined && !mark.isAbsent) {
      if (mark.obtainedMarks < 0 || mark.obtainedMarks > assessment.maxMarks) {
        throw new Error(
          `Validation error: Obtained marks (${mark.obtainedMarks}) cannot exceed maximum marks (${assessment.maxMarks}) or be negative.`
        )
      }
    }
  }

  const nextStatus: ApprovalStatus = input.nextStatus ?? assessment.status
  const markUpdates = new Map(input.marks.map((m) => [m.studentId, m]))

  // 1. Transaction: batch upsert assessment_records & approval request
  await prisma.$transaction(async (tx: any) => {
    const enrollments = await tx.enrollments.findMany({
      where: {
        institutionId: activeTenantId,
        studentId: { in: input.marks.map((m) => m.studentId) },
        status: "ACTIVE",
      },
    })
    const enrollmentMap = new Map(enrollments.map((e: any) => [e.studentId, e.id]))

    let subjectId = assessment.subjectId
    if (subjectId.startsWith("sub-")) {
      const s = await tx.subjects.findFirst({
        where: { institutionId: activeTenantId },
        orderBy: { createdAt: "asc" },
      })
      subjectId = s?.id ?? "sub_demo_math_10"
    }

    for (const mark of input.marks) {
      const isAbsent = Boolean(mark.isAbsent)
      const obtained = isAbsent ? 0 : (mark.obtainedMarks ?? 0)
      const remarks = isAbsent ? "ABSENT" : (mark.remarks ?? null)

      let enrId = enrollmentMap.get(mark.studentId)
      if (!enrId) {
        const existingEnr = await tx.enrollments.findFirst({
          where: { studentId: mark.studentId, institutionId: activeTenantId },
          orderBy: { enrolledDate: "desc" },
        })
        if (existingEnr) {
          enrId = existingEnr.id
          enrollmentMap.set(mark.studentId, enrId)
        }
      }

      const existingRecord = await tx.assessment_records.findFirst({
        where: {
          institutionId: activeTenantId,
          studentId: mark.studentId,
          assessmentName: assessment.title,
        },
      })

      if (existingRecord) {
        await tx.assessment_records.update({
          where: { id: existingRecord.id },
          data: {
            marksObtained: obtained,
            remarks,
            weightage: assessment.weightagePercent,
          },
        })
      } else {
        await tx.assessment_records.create({
          data: {
            id: crypto.randomUUID(),
            institutionId: activeTenantId,
            studentId: mark.studentId,
            enrollmentId: enrId ?? crypto.randomUUID(),
            subjectId,
            assessmentName: assessment.title,
            maxMarks: assessment.maxMarks,
            marksObtained: obtained,
            weightage: assessment.weightagePercent,
            remarks,
            conductedDate: new Date(assessment.conductedDate),
          },
        })
      }
    }

    // Update approval requests workflow state
    if (nextStatus === "submitted") {
      await tx.approval_requests.upsert({
        where: { id: `apr-ia-${input.assessmentId}` },
        update: {
          status: "PENDING",
          requestedDataJson: JSON.stringify({
            assessmentId: input.assessmentId,
            status: "submitted",
            marksCount: input.marks.length,
            updatedAt: new Date().toISOString(),
          }),
        },
        create: {
          id: `apr-ia-${input.assessmentId}`,
          institutionId: activeTenantId,
          userId: user.id,
          requestType: "INTERNAL_ASSESSMENT",
          title: `IA Approval: ${assessment.title}`,
          status: "PENDING",
          requestedDataJson: JSON.stringify({
            assessmentId: input.assessmentId,
            status: "submitted",
            marksCount: input.marks.length,
            createdAt: new Date().toISOString(),
          }),
        },
      })
    }
  })

  // 2. Synchronize in-memory marks
  const updatedMarks = assessment.marks.map((mark) => {
    const update = markUpdates.get(mark.studentId)
    if (!update) {
      return { ...mark, status: nextStatus }
    }
    return {
      ...mark,
      obtainedMarks: update.isAbsent ? null : update.obtainedMarks,
      isAbsent: update.isAbsent ?? false,
      remarks: update.remarks ?? mark.remarks,
      status: nextStatus,
    }
  })

  const updatedAssessment: InternalAssessment = {
    ...assessment,
    status: nextStatus,
    marks: updatedMarks,
  }

  return clone(updatedAssessment)
}

export async function createInternalAssessment(
  input: CreateInternalAssessmentInput
): Promise<InternalAssessment> {
  const { teacher, user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId
  const id = `ia-${input.sectionId}-${Date.now()}`
  const roster = await getSectionStudents(input.sectionId)

  // Persist into database inside a multi-tenant transaction
  await prisma.$transaction(async (tx: any) => {
    let validSubjectId = input.subjectId
    const dbSub = await tx.subjects.findFirst({
      where: { id: validSubjectId, institutionId: activeTenantId },
    })
    if (!dbSub) {
      const fallbackSub = await tx.subjects.findFirst({
        where: { institutionId: activeTenantId },
        orderBy: { createdAt: "asc" },
      })
      if (fallbackSub) validSubjectId = fallbackSub.id
    }

    const enrollments = await tx.enrollments.findMany({
      where: {
        institutionId: activeTenantId,
        studentId: { in: roster.map((s) => s.studentId) },
        status: "ACTIVE",
      },
    })
    const enrollmentMap = new Map(enrollments.map((e: any) => [e.studentId, e.id]))

    for (const st of roster) {
      let enrId = enrollmentMap.get(st.studentId)
      if (!enrId) {
        const existingEnr = await tx.enrollments.findFirst({
          where: { studentId: st.studentId, institutionId: activeTenantId },
          orderBy: { enrolledDate: "desc" },
        })
        if (existingEnr) {
          enrId = existingEnr.id
          enrollmentMap.set(st.studentId, enrId)
        }
      }
      await tx.assessment_records.create({
        data: {
          id: crypto.randomUUID(),
          institutionId: activeTenantId,
          studentId: st.studentId,
          enrollmentId: enrId ?? crypto.randomUUID(),
          subjectId: validSubjectId,
          assessmentName: input.title,
          maxMarks: input.maxMarks,
          marksObtained: 0,
          weightage: input.weightagePercent,
          remarks: null,
          conductedDate: new Date(input.conductedDate),
        },
      })
    }

    await tx.approval_requests.create({
      data: {
        id: `apr-ia-${id}`,
        institutionId: activeTenantId,
        userId: user.id,
        requestType: "INTERNAL_ASSESSMENT",
        title: `IA: ${input.title}`,
        status: "DRAFT",
        requestedDataJson: JSON.stringify({
          assessmentId: id,
          title: input.title,
          subjectId: validSubjectId,
          sectionId: input.sectionId,
          maxMarks: input.maxMarks,
          weightagePercent: input.weightagePercent,
          studentCount: roster.length,
        }),
      },
    })
  })

  const currentAY = await prisma.academic_years.findFirst({
    where: { institutionId: activeTenantId, isCurrent: true },
  })

  const created: InternalAssessment = {
    id,
    institutionId: activeTenantId,
    academicYearId: currentAY?.id ?? "ay-2026-27",
    teacherId: teacher.id,
    classId: input.classId,
    className: input.className,
    sectionId: input.sectionId,
    section: input.section,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    title: input.title,
    componentName: input.componentName,
    maxMarks: input.maxMarks,
    passingMarks: input.passingMarks,
    weightagePercent: input.weightagePercent,
    conductedDate: input.conductedDate,
    status: "draft",
    marks: roster.map((student, idx) => ({
      id: `${id}-m-${idx + 1}`,
      assessmentId: id,
      studentId: student.studentId,
      rollNo: student.rollNo,
      studentName: student.fullName,
      componentName: input.componentName,
      maxMarks: input.maxMarks,
      obtainedMarks: null,
      isAbsent: false,
      status: "draft",
    })),
  }
  return clone(created)
}

export async function publishInternalAssessment(
  assessmentId: string
): Promise<InternalAssessment> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const liveAssessments = await getInternalAssessments({ institutionId: activeTenantId })
  const current = liveAssessments.find((ia) => ia.id === assessmentId)
  if (!current) {
    throw new Error(`Internal assessment "${assessmentId}" not found.`)
  }

  // Persist publication and audit log inside transaction
  await prisma.$transaction(async (tx: any) => {
    await tx.approval_requests.upsert({
      where: { id: `apr-ia-${assessmentId}` },
      update: {
        status: "APPROVED",
        adminRemarks: "Published to students by faculty.",
        reviewedAt: new Date(),
      },
      create: {
        id: `apr-ia-${assessmentId}`,
        institutionId: activeTenantId,
        userId: user.id,
        requestType: "INTERNAL_ASSESSMENT",
        title: `IA Published: ${current.title}`,
        status: "APPROVED",
        adminRemarks: "Published to students by faculty.",
        reviewedAt: new Date(),
        requestedDataJson: JSON.stringify({
          assessmentId,
          status: "published",
          publishedAt: new Date().toISOString(),
        }),
      },
    })

    await tx.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        institutionId: activeTenantId,
        actorUserId: user.id,
        action: "PUBLISH_INTERNAL_ASSESSMENT",
        entityType: "INTERNAL_ASSESSMENT",
        entityId: assessmentId,
        newValuesJson: JSON.stringify({
          assessmentId,
          status: "locked",
          publishedToStudents: true,
        }),
      },
    })
  })

  const updated: InternalAssessment = {
    ...current,
    status: "locked",
    publishedToStudents: true,
    marks: current.marks.map((m) => ({ ...m, status: "locked" })),
  }
  return clone(updated)
}

export async function requestIACorrection(
  assessmentId: string,
  correctionNote: string
): Promise<InternalAssessment> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const liveAssessments = await getInternalAssessments({ institutionId: activeTenantId })
  const current = liveAssessments.find((ia) => ia.id === assessmentId)
  if (!current) {
    throw new Error(`Internal assessment "${assessmentId}" not found.`)
  }

  // Persist correction request and audit log inside transaction
  await prisma.$transaction(async (tx: any) => {
    await tx.approval_requests.upsert({
      where: { id: `apr-ia-${assessmentId}` },
      update: {
        status: "RETURNED",
        adminRemarks: correctionNote,
        reviewedAt: new Date(),
      },
      create: {
        id: `apr-ia-${assessmentId}`,
        institutionId: activeTenantId,
        userId: user.id,
        requestType: "INTERNAL_ASSESSMENT",
        title: `IA Correction: ${current.title}`,
        status: "RETURNED",
        adminRemarks: correctionNote,
        reviewedAt: new Date(),
        requestedDataJson: JSON.stringify({
          assessmentId,
          status: "returned",
          correctionNote,
        }),
      },
    })

    await tx.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        institutionId: activeTenantId,
        actorUserId: user.id,
        action: "REQUEST_CORRECTION_INTERNAL_ASSESSMENT",
        entityType: "INTERNAL_ASSESSMENT",
        entityId: assessmentId,
        newValuesJson: JSON.stringify({
          assessmentId,
          status: "returned",
          correctionNote,
        }),
      },
    })
  })

  const updated: InternalAssessment = {
    ...current,
    status: "returned",
    correctionNote,
    marks: current.marks.map((m) => ({ ...m, status: "returned" })),
  }
  return clone(updated)
}

// ---------------------------------------------------------------------------
// Helpers for LMS, Assignments and Quizzes
// ---------------------------------------------------------------------------
function parseUnitNumber(unitStr?: string): number | null {
  if (!unitStr) return null
  const match = unitStr.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

function formatUnitLabel(unitNumber?: number | null): string {
  return unitNumber ? `Unit ${unitNumber}` : "Unit 1"
}

function formatFileSizeLabel(bytes?: number | null): string | undefined {
  if (!bytes || bytes <= 0) return undefined
  const mb = bytes / (1024 * 1024)
  if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${mb.toFixed(1)} MB`
}

function parseFileSizeLabel(label?: string): number | null {
  if (!label) return null
  const cleaned = label.trim().toUpperCase()
  const val = parseFloat(cleaned)
  if (Number.isNaN(val)) return null
  if (cleaned.includes("KB")) return Math.round(val * 1024)
  if (cleaned.includes("MB")) return Math.round(val * 1024 * 1024)
  if (cleaned.includes("GB")) return Math.round(val * 1024 * 1024 * 1024)
  return Math.round(val)
}

function mapMaterialType(raw?: string | null): LearningMaterialType {
  const lower = (raw || "pdf").toLowerCase().trim()
  if (lower.includes("video") || lower.includes("mp4") || lower.includes("youtube")) return "video"
  if (lower.includes("link") || lower.startsWith("http")) return "link"
  if (lower.includes("note") || lower.includes("txt") || lower.includes("doc")) return "note"
  return "pdf"
}

// ---------------------------------------------------------------------------
// Assignments & Submissions
// ---------------------------------------------------------------------------
export async function getAssignments(sectionId?: string): Promise<Assignment[]> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  // Multi-tenant query for live assignments with subjects and submissions
  let dbAssignments: any[] = []
  let activeStudents: any[] = []
  try {
    const [asgRes, stRes] = await Promise.all([
      prisma.assignments.findMany({
        where: {
          institutionId: activeTenantId,
        },
        include: {
          subject: {
            include: {
              course: true,
            },
          },
          submissions: {
            include: {
              student: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.students.findMany({
        where: { institutionId: activeTenantId, status: "ACTIVE" },
        select: { id: true, currentSection: true, currentSemester: true },
      }),
    ])
    dbAssignments = asgRes
    activeStudents = stRes
  } catch (err) {
    console.warn("[getAssignments] DB query error:", err)
  }

  const liveAssignments: Assignment[] = dbAssignments.map((dbAsg: any) => {
    const rawSubmissions = dbAsg.submissions || dbAsg.assignment_submissions || []
    const submittedCount = rawSubmissions.filter(
      (s: any) => s.status.toUpperCase() !== "PENDING"
    ).length
    const gradedCount = rawSubmissions.filter(
      (s: any) => s.status.toUpperCase() === "GRADED" || s.score !== null
    ).length

    // Determine section from submissions or fallback
    const firstSubStudent = rawSubmissions[0]?.student ?? rawSubmissions[0]?.students
    const firstSubSection = firstSubStudent?.currentSection
    const inferredSection = firstSubSection || "A"
    const inferredSectionId = `sec-10${inferredSection.toLowerCase()}`
    const matchingStudentsCount = activeStudents.filter(
      (s: any) => s.currentSection.toUpperCase() === inferredSection.toUpperCase()
    ).length

    const isClosed = new Date() > new Date(dbAsg.dueDate)
    const status: Assignment["status"] = isClosed ? "closed" : "published"
    const sub = dbAsg.subject ?? dbAsg.subjects
    const course = sub?.course ?? sub?.courses

    return {
      id: dbAsg.id,
      institutionId: dbAsg.institutionId,
      academicYearId: dbAsg.academicYearId || "active-academic-year",
      teacherId: teacher.id,
      classId: sub?.courseId ?? "cls-10",
      className: course?.name || "Class 10",
      sectionId: inferredSectionId,
      section: inferredSection,
      subjectId: dbAsg.subjectId,
      subjectName: sub?.name ?? "Mathematics",
      title: dbAsg.title,
      description: dbAsg.description,
      unit: "Unit 3",
      dueDate: dbAsg.dueDate ? new Date(dbAsg.dueDate).toISOString().slice(0, 10) : "2026-11-30",
      maxMarks: Math.round(dbAsg.totalPoints || 50),
      allowLateSubmission: true,
      attachmentUrl: dbAsg.attachmentUrl ?? undefined,
      attachmentName: dbAsg.attachmentUrl
        ? dbAsg.attachmentUrl.split("/").pop()
        : undefined,
      status,
      totalStudents: matchingStudentsCount > 0 ? matchingStudentsCount : 18,
      submittedCount,
      gradedCount,
      createdAt: dbAsg.createdAt ? new Date(dbAsg.createdAt).toISOString().slice(0, 10) : "2026-11-01",
    }
  })

  const filtered = sectionId
    ? liveAssignments.filter((a) => a.sectionId === sectionId)
    : liveAssignments

  return clone(filtered)
}

export async function getAssignmentSubmissions(
  assignmentId: string
): Promise<AssignmentSubmission[]> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbSubmissions: any[] = []
  try {
    dbSubmissions = await prisma.assignment_submissions.findMany({
      where: {
        assignmentId,
        institutionId: activeTenantId,
      },
      include: {
        student: true,
        assignment: true,
      },
      orderBy: {
        student: {
          rollNumber: "asc",
        },
      },
    })
  } catch (err) {
    console.warn("[getAssignmentSubmissions] DB query error:", err)
    throw new Error("Failed to load assignment submissions from database.")
  }

  if (dbSubmissions.length === 0) {
    return []
  }

  const liveSubs: AssignmentSubmission[] = dbSubmissions.map((s: any) => {
    const isGraded = s.status.toUpperCase() === "GRADED" || s.score !== null
    const statusLower = s.status.toLowerCase()
    const status: AssignmentSubmission["status"] = (
      ["pending", "submitted", "late", "graded", "returned"].includes(statusLower)
        ? statusLower
        : isGraded
          ? "graded"
          : "submitted"
    ) as AssignmentSubmission["status"]

    const st = s.student ?? s.students
    return {
      id: s.id,
      assignmentId: s.assignmentId,
      studentId: s.studentId,
      rollNo: st?.rollNumber ?? "01",
      studentName: st ? `${st.firstName} ${st.lastName}` : "Student",
      submittedAt: s.submittedAt ? s.submittedAt.toISOString() : undefined,
      fileUrl: s.fileUrl ?? undefined,
      fileName: s.fileUrl ? s.fileUrl.split("/").pop() : undefined,
      submissionText: s.textContent ?? undefined,
      status,
      obtainedMarks: s.score,
      feedback: s.feedback ?? undefined,
      gradedAt: isGraded && s.submittedAt ? s.submittedAt.toISOString() : undefined,
    }
  })

  return clone(liveSubs)
}

export async function createAssignment(
  input: CreateAssignmentInput
): Promise<Assignment> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const id = `asg-${input.sectionId}-${Date.now()}`
  const dueDateObj = new Date(`${input.dueDate}T23:59:59.000Z`)

  // Resolve valid subjectId from database
  let validSubjectId = input.subjectId
  const dbSubject = await prisma.subjects.findFirst({
    where: {
      id: validSubjectId,
      institutionId: activeTenantId,
    },
  })
  if (!dbSubject) {
    const fallbackSubject = await prisma.subjects.findFirst({
      where: { institutionId: activeTenantId },
    })
    if (fallbackSubject) {
      validSubjectId = fallbackSubject.id
    }
  }

  const attachmentUrl = input.attachmentName
    ? `/uploads/assignments/${input.attachmentName}`
    : undefined

  // Persist into database inside a multi-tenant transaction
  await prisma.$transaction(async (tx: any) => {
    await tx.assignments.create({
      data: {
        id,
        institutionId: activeTenantId,
        subjectId: validSubjectId,
        title: input.title,
        description: input.description,
        dueDate: dueDateObj,
        totalPoints: input.maxMarks,
        attachmentUrl,
        createdAt: new Date(),
      },
    })

    // Fetch section students to initialize roster submissions
    const { semester, section } = parseSectionId(input.sectionId)
    const secStudents = await tx.students.findMany({
      where: {
        institutionId: activeTenantId,
        currentSemester: semester,
        currentSection: section,
        status: "ACTIVE",
      },
      orderBy: { rollNumber: "asc" },
    })

    if (secStudents.length > 0) {
      await tx.assignment_submissions.createMany({
        data: secStudents.map((st: any) => ({
          id: `sub-${id}-${st.id}`,
          institutionId: activeTenantId,
          assignmentId: id,
          studentId: st.id,
          status: "PENDING",
          submittedAt: new Date(),
        })),
        skipDuplicates: true,
      })
    }
  })

  const rosterCount = await prisma.students.count({
    where: {
      institutionId: activeTenantId,
      currentSemester: parseSectionId(input.sectionId).semester,
      currentSection: parseSectionId(input.sectionId).section,
      status: "ACTIVE",
    },
  })

  const created: Assignment = {
    id,
    institutionId: activeTenantId,
    academicYearId: await resolveCurrentAcademicYearId(activeTenantId),
    teacherId: teacher.id,
    classId: input.classId,
    className: input.className,
    sectionId: input.sectionId,
    section: input.section,
    subjectId: validSubjectId,
    subjectName: input.subjectName,
    title: input.title,
    description: input.description,
    unit: input.unit,
    dueDate: input.dueDate,
    maxMarks: input.maxMarks,
    allowLateSubmission: input.allowLateSubmission ?? true,
    attachmentName: input.attachmentName,
    attachmentUrl,
    status: input.status ?? "published",
    totalStudents: rosterCount > 0 ? rosterCount : 18,
    submittedCount: 0,
    gradedCount: 0,
    createdAt: new Date().toISOString().slice(0, 10),
  }

  return clone(created)
}

export async function gradeAssignmentSubmission(
  submissionId: string,
  obtainedMarks: number,
  feedback?: string
): Promise<AssignmentSubmission> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  // Multi-tenant update in database
  const existingSub = await prisma.assignment_submissions.findFirst({
    where: {
      id: submissionId,
      institutionId: activeTenantId,
    },
    include: {
      students: true,
      assignments: true,
    },
  })

  if (existingSub) {
    const maxPoints = (existingSub as any).assignments?.totalPoints ?? 100
    if (obtainedMarks < 0 || obtainedMarks > maxPoints) {
      throw new Error(
        `Validation error: Obtained score (${obtainedMarks}) cannot exceed maximum assignment points (${maxPoints}) or be negative.`
      )
    }

    const updatedDb = await prisma.assignment_submissions.update({
      where: { id: submissionId },
      data: {
        score: obtainedMarks,
        feedback: feedback ?? existingSub.feedback,
        status: "GRADED",
        submittedAt: new Date(),
      },
      include: {
        student: true,
        assignment: true,
      },
    })

    const st = updatedDb.student ?? updatedDb.students
    const updated: AssignmentSubmission = {
      id: updatedDb.id,
      assignmentId: updatedDb.assignmentId,
      studentId: updatedDb.studentId,
      rollNo: st?.rollNumber ?? "01",
      studentName: st ? `${st.firstName} ${st.lastName}` : "Student",
      submittedAt: updatedDb.submittedAt ? new Date(updatedDb.submittedAt).toISOString() : new Date().toISOString(),
      fileUrl: updatedDb.fileUrl ?? undefined,
      fileName: updatedDb.fileUrl ? updatedDb.fileUrl.split("/").pop() : undefined,
      submissionText: updatedDb.textContent ?? undefined,
      status: "graded",
      obtainedMarks: updatedDb.score,
      feedback: updatedDb.feedback ?? undefined,
      gradedAt: new Date().toISOString(),
    }

    return clone(updated)
  }

  throw new Error(`Assignment submission "${submissionId}" not found in this institution.`)
}

// ---------------------------------------------------------------------------
// Learning Materials
// ---------------------------------------------------------------------------
export async function getLearningMaterials(filters?: {
  subjectId?: string
  unit?: string
}): Promise<LearningMaterial[]> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbMaterials: any[] = []
  try {
    dbMaterials = await prisma.lms_course_materials.findMany({
      where: {
        institutionId: activeTenantId,
        ...(filters?.subjectId ? { subjectId: filters.subjectId } : {}),
      },
      include: {
        subject: {
          include: {
            course: true,
          },
        },
      },
      orderBy: { uploadedAt: "desc" },
    })
  } catch (err) {
    console.warn("[getLearningMaterials] DB query error:", err)
  }

  const liveMaterials: LearningMaterial[] = dbMaterials.map((m: any) => {
    const unitLabel = formatUnitLabel(m.unitNumber)
    const sub = m.subject ?? m.subjects
    const course = sub?.course ?? sub?.courses
    return {
      id: m.id,
      institutionId: m.institutionId,
      academicYearId: "active-academic-year",
      teacherId: teacher.id,
      classId: sub?.courseId ?? "cls-10",
      className: course?.name || "Class 10",
      section: "A & B",
      subjectId: m.subjectId,
      subjectName: sub?.name ?? "Mathematics",
      unit: unitLabel,
      title: m.title,
      description: m.description ?? undefined,
      type: mapMaterialType(m.fileType),
      fileUrl: m.fileUrl,
      fileSizeLabel: formatFileSizeLabel(m.fileSizeBytes),
      isPublished: true,
      uploadedAt: m.uploadedAt.toISOString().slice(0, 10),
    }
  })

  const filtered = liveMaterials.filter((item) => {
    if (filters?.subjectId && item.subjectId !== filters.subjectId) {
      return false
    }
    if (filters?.unit && item.unit.toLowerCase() !== filters.unit.toLowerCase()) {
      return false
    }
    return true
  })

  return clone(filtered)
}

export async function createLearningMaterial(
  input: CreateLearningMaterialInput
): Promise<LearningMaterial> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const id = `lm-${Date.now()}`
  const unitNumber = parseUnitNumber(input.unit) ?? 1
  const fileSizeBytes = parseFileSizeLabel(input.fileSizeLabel)

  // Verify subject exists in active tenant
  let validSubjectId = input.subjectId
  const dbSubject = await prisma.subjects.findFirst({
    where: {
      id: validSubjectId,
      institutionId: activeTenantId,
    },
  })
  if (!dbSubject) {
    const fallback = await prisma.subjects.findFirst({
      where: { institutionId: activeTenantId },
    })
    if (fallback) {
      validSubjectId = fallback.id
    }
  }

  await prisma.lms_course_materials.create({
    data: {
      id,
      institutionId: activeTenantId,
      subjectId: validSubjectId,
      title: input.title,
      description: input.description,
      fileUrl: input.fileUrl,
      fileType: input.type,
      fileSizeBytes,
      unitNumber,
      uploadedAt: new Date(),
    },
  })

  const created: LearningMaterial = {
    id,
    institutionId: activeTenantId,
    academicYearId: await resolveCurrentAcademicYearId(activeTenantId),
    teacherId: teacher.id,
    classId: input.classId,
    className: input.className,
    section: input.section,
    subjectId: validSubjectId,
    subjectName: input.subjectName,
    unit: input.unit,
    title: input.title,
    description: input.description,
    type: input.type,
    fileUrl: input.fileUrl,
    fileSizeLabel: input.fileSizeLabel,
    isPublished: input.isPublished ?? true,
    uploadedAt: new Date().toISOString().slice(0, 10),
  }

  return clone(created)
}

export async function deleteLearningMaterial(materialId: string): Promise<void> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  await prisma.lms_course_materials.deleteMany({
    where: {
      id: materialId,
      institutionId: activeTenantId,
    },
  })
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------
export async function getQuizzes(sectionId?: string): Promise<Quiz[]> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbQuizzes: any[] = []
  try {
    dbQuizzes = await prisma.quizzes.findMany({
      where: {
        institutionId: activeTenantId,
      },
      include: {
        subject: {
          include: {
            course: true,
          },
        },
        questions: {
          orderBy: { id: "asc" },
        },
        attempts: true,
      },
      orderBy: { createdAt: "desc" },
    })
  } catch (err) {
    console.warn("[getQuizzes] DB query error:", err)
  }

  const liveQuizzes: Quiz[] = dbQuizzes.map((q: any) => {
    const rawQuestions = q.questions ?? q.quiz_questions ?? []
    const questions: QuizQuestion[] = rawQuestions.map((ques: any, idx: number) => ({
      id: ques.id,
      quizId: ques.quizId,
      questionNumber: idx + 1,
      prompt: ques.questionText,
      questionType: "mcq",
      options: [ques.optionA, ques.optionB, ques.optionC, ques.optionD].filter(Boolean),
      correctAnswer: ques.correctOption,
      marks: ques.points,
    }))

    const totalMarks = Math.round(
      q.totalPoints || questions.reduce((sum, item) => sum + item.marks, 0)
    )

    const sub = q.subject ?? q.subjects
    const course = sub?.course ?? sub?.courses
    const rawAttempts = q.attempts ?? q.quiz_attempts ?? []
    return {
      id: q.id,
      institutionId: q.institutionId,
      academicYearId: "active-academic-year",
      teacherId: teacher.id,
      classId: sub?.courseId ?? "cls-10",
      className: course?.name || "Class 10",
      sectionId: sectionId || "",
      section: "A",
      subjectId: q.subjectId,
      subjectName: sub?.name ?? "Mathematics",
      title: q.title,
      description: undefined,
      durationMinutes: q.durationMinutes,
      totalMarks,
      scheduledAt: q.createdAt.toISOString().slice(0, 16),
      closesAt: new Date(q.createdAt.getTime() + 7 * 86400000).toISOString().slice(0, 16),
      status: "published",
      questions,
      attemptCount: rawAttempts.length,
      totalStudents: 18,
    }
  })

  const filtered = sectionId
    ? liveQuizzes.filter((q) => q.sectionId === sectionId)
    : liveQuizzes

  return clone(filtered)
}

export async function getQuizSubmissions(
  quizId: string
): Promise<QuizSubmission[]> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbAttempts: any[] = []
  try {
    dbAttempts = await prisma.quiz_attempts.findMany({
      where: {
        quizId,
        institutionId: activeTenantId,
      },
      include: {
        student: true,
        quiz: true,
      },
      orderBy: { submittedAt: "desc" },
    })
  } catch (err) {
    console.warn("[getQuizSubmissions] DB query error:", err)
  }

  if (dbAttempts.length > 0) {
    const liveSubs: QuizSubmission[] = dbAttempts.map((att: any) => {
      let answers: Record<string, string> = {}
      let feedback: string | undefined = undefined

      try {
        const parsed = JSON.parse(att.answersJson)
        if (parsed && typeof parsed === "object") {
          if ("answers" in parsed && typeof parsed.answers === "object") {
            answers = parsed.answers
            feedback = parsed.feedback
          } else {
            answers = parsed
          }
        }
      } catch {}

      const st = att.student ?? att.students
      const qz = att.quiz ?? att.quizzes

      return {
        id: att.id,
        quizId: att.quizId,
        studentId: att.studentId,
        rollNo: st?.rollNumber ?? "01",
        studentName: st ? `${st.firstName} ${st.lastName}` : "Student",
        startedAt: att.submittedAt ? new Date(att.submittedAt).toISOString() : new Date().toISOString(),
        submittedAt: att.submittedAt ? new Date(att.submittedAt).toISOString() : new Date().toISOString(),
        score: att.score ?? 0,
        totalMarks: Math.round(qz?.totalPoints ?? 20),
        status: "graded",
        answers,
        feedback,
      }
    })

    return clone(liveSubs)
  }

  return []
}

export async function createQuiz(input: CreateQuizInput): Promise<Quiz> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const quizId = `quiz-${input.sectionId}-${Date.now()}`
  const questions: QuizQuestion[] = input.questions.map((q, idx) => ({
    ...q,
    id: `${quizId}-q-${idx + 1}`,
    quizId,
  }))
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0)

  // Verify subject exists in tenant
  let validSubjectId = input.subjectId
  const dbSubject = await prisma.subjects.findFirst({
    where: { id: validSubjectId, institutionId: activeTenantId },
  })
  if (!dbSubject) {
    const fallback = await prisma.subjects.findFirst({
      where: { institutionId: activeTenantId },
    })
    if (fallback) {
      validSubjectId = fallback.id
    }
  }

  // Create quiz and questions in Prisma transaction
  await prisma.$transaction(async (tx: any) => {
    await tx.quizzes.create({
      data: {
        id: quizId,
        institutionId: activeTenantId,
        subjectId: validSubjectId,
        title: input.title,
        durationMinutes: input.durationMinutes,
        totalPoints: totalMarks,
        createdAt: new Date(),
      },
    })

    if (questions.length > 0) {
      await tx.quiz_questions.createMany({
        data: questions.map((q) => {
          const opts = q.options || []
          return {
            id: q.id,
            quizId,
            questionText: q.prompt,
            optionA: opts[0] || "",
            optionB: opts[1] || "",
            optionC: opts[2] || "",
            optionD: opts[3] || "",
            correctOption: q.correctAnswer,
            points: q.marks,
          }
        }),
      })
    }
  })

  const created: Quiz = {
    id: quizId,
    institutionId: activeTenantId,
    academicYearId: await resolveCurrentAcademicYearId(activeTenantId),
    teacherId: teacher.id,
    classId: input.classId,
    className: input.className,
    sectionId: input.sectionId,
    section: input.section,
    subjectId: validSubjectId,
    subjectName: input.subjectName,
    title: input.title,
    description: input.description,
    durationMinutes: input.durationMinutes,
    totalMarks,
    scheduledAt: input.scheduledAt,
    closesAt: input.closesAt,
    status: input.status ?? "published",
    questions,
    attemptCount: 0,
    totalStudents: 18,
  }

  return clone(created)
}

export async function updateQuizStatus(
  quizId: string,
  status: Quiz["status"]
): Promise<Quiz> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const dbQuiz = await prisma.quizzes.findFirst({
    where: { id: quizId, institutionId: activeTenantId },
    include: {
      subject: { include: { course: true } },
      questions: { orderBy: { id: "asc" } },
      attempts: true,
    },
  })

  if (!dbQuiz) {
    throw new Error(`Quiz "${quizId}" not found in this institution.`)
  }

  await prisma.audit_logs.create({
    data: {
      id: crypto.randomUUID(),
      institutionId: activeTenantId,
      actorUserId: user.id,
      action: `UPDATE_QUIZ_STATUS_${status.toUpperCase()}`,
      entityType: "QUIZ",
      entityId: quizId,
      newValuesJson: JSON.stringify({ status }),
      createdAt: new Date(),
    },
  })

  const rawQuestions = dbQuiz.questions ?? dbQuiz.quiz_questions ?? []
  const questions: QuizQuestion[] = rawQuestions.map((ques: any, idx: number) => ({
    id: ques.id,
    quizId: ques.quizId,
    questionNumber: idx + 1,
    prompt: ques.questionText,
    questionType: "mcq",
    options: [ques.optionA, ques.optionB, ques.optionC, ques.optionD].filter(Boolean),
    correctAnswer: ques.correctOption,
    marks: ques.points,
  }))

  const totalMarks = Math.round(
    dbQuiz.totalPoints || questions.reduce((sum: number, item: any) => sum + item.marks, 0)
  )
  const sub = dbQuiz.subject ?? dbQuiz.subjects
  const course = sub?.course ?? sub?.courses
  const rawAttempts = dbQuiz.attempts ?? dbQuiz.quiz_attempts ?? []

  return {
    id: dbQuiz.id,
    institutionId: dbQuiz.institutionId,
    academicYearId: "active-academic-year",
    teacherId: user.id,
    classId: sub?.courseId ?? "cls-10",
    className: course?.name || "Class 10",
    sectionId: (dbQuiz as any)?.sectionId || "",
    section: "A",
    subjectId: dbQuiz.subjectId,
    subjectName: sub?.name ?? "Mathematics",
    title: dbQuiz.title,
    description: undefined,
    durationMinutes: dbQuiz.durationMinutes,
    totalMarks,
    scheduledAt: dbQuiz.createdAt.toISOString().slice(0, 16),
    closesAt: new Date(dbQuiz.createdAt.getTime() + 7 * 86400000).toISOString().slice(0, 16),
    status,
    questions,
    attemptCount: rawAttempts.length,
    totalStudents: 18,
  }
}

export async function evaluateQuizSubmission(
  submissionId: string,
  score: number,
  feedback?: string
): Promise<QuizSubmission> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const dbAttempt = await prisma.quiz_attempts.findFirst({
    where: {
      id: submissionId,
      institutionId: activeTenantId,
    },
    include: {
      student: true,
      quiz: true,
    },
  })

  if (dbAttempt) {
    let currentAnswers: Record<string, string> = {}
    try {
      const parsed = JSON.parse(dbAttempt.answersJson)
      if (parsed && typeof parsed === "object") {
        currentAnswers = parsed.answers || parsed
      }
    } catch {}

    const updatedAnswersJson = JSON.stringify({
      answers: currentAnswers,
      feedback: feedback ?? undefined,
    })

    const updatedAttempt = await prisma.quiz_attempts.update({
      where: { id: submissionId },
      data: {
        score,
        answersJson: updatedAnswersJson,
      },
      include: {
        student: true,
        quiz: true,
      },
    })

    const st = updatedAttempt.student ?? updatedAttempt.students
    const qz = updatedAttempt.quiz ?? updatedAttempt.quizzes
    const updated: QuizSubmission = {
      id: updatedAttempt.id,
      quizId: updatedAttempt.quizId,
      studentId: updatedAttempt.studentId,
      rollNo: st?.rollNumber ?? "01",
      studentName: st ? `${st.firstName} ${st.lastName}` : "Student",
      startedAt: updatedAttempt.submittedAt ? new Date(updatedAttempt.submittedAt).toISOString() : new Date().toISOString(),
      submittedAt: updatedAttempt.submittedAt ? new Date(updatedAttempt.submittedAt).toISOString() : new Date().toISOString(),
      score: updatedAttempt.score ?? 0,
      totalMarks: Math.round(qz?.totalPoints ?? 20),
      status: "graded",
      answers: currentAnswers,
      feedback,
    }

    return clone(updated)
  }

  throw new Error(`Quiz submission "${submissionId}" not found in this institution.`)
}

export const updateQuizSubmissionScore = evaluateQuizSubmission

/**
 * Auto-evaluates student answers against quiz questions.
 * Compares answers, awards question points, and computes aggregate score.
 */
export async function evaluateQuizAttempt(
  answers: Record<string, string>,
  questions: QuizQuestion[]
): Promise<{
  score: number
  totalMarks: number
  percentage: number
  passed: boolean
  questionResults: Array<{
    questionId: string
    prompt: string
    submittedAnswer: string
    correctAnswer: string
    isCorrect: boolean
    marksAwarded: number
    maxMarks: number
  }>
}> {
  let score = 0
  const questionResults = questions.map((q) => {
    const studentAns = (
      answers[q.id] ||
      answers[String(q.questionNumber)] ||
      ""
    ).trim()
    const correctAns = (q.correctAnswer || "").trim()

    const isCorrect =
      studentAns.length > 0 &&
      (studentAns.toLowerCase() === correctAns.toLowerCase() ||
        studentAns === correctAns)

    const marksAwarded = isCorrect ? q.marks : 0
    score += marksAwarded

    return {
      questionId: q.id,
      prompt: q.prompt,
      submittedAnswer: studentAns,
      correctAnswer: correctAns,
      isCorrect,
      marksAwarded,
      maxMarks: q.marks,
    }
  })

  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0)
  const percentage =
    totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0
  const passed = percentage >= 40

  return {
    score,
    totalMarks,
    percentage,
    passed,
    questionResults,
  }
}

export async function uploadCourseMaterialFile(
  input: {
    file: Buffer | Uint8Array | Blob | File
    filename: string
    contentType?: string
    institutionId?: string
    folder?: string
  } | FormData
) {
  const { uploadCourseMaterialFile: upload } = await import("@/lib/supabase/storage")
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    const file = input.get("file") as File
    const filename = (input.get("filename") as string) || file?.name || "upload"
    const folder = (input.get("folder") as string) || "materials"
    let institutionId = input.get("institutionId") as string
    if (!institutionId) {
      const resolved = await resolveActiveTeacher()
      institutionId = resolved.institutionId
    }
    return upload({ file, filename, folder, institutionId })
  }
  return upload(input as any)
}

// ---------------------------------------------------------------------------
// Helpers for Phase 4 & 5
// ---------------------------------------------------------------------------
function mapNotificationCategory(cat?: string | null): NotificationItem["category"] {
  const lower = (cat || "announcement").toLowerCase()
  if (lower.includes("attend")) return "attendance"
  if (lower.includes("assess")) return "assessment"
  if (lower.includes("leave")) return "leave"
  if (lower.includes("exam")) return "exam"
  if (lower.includes("sys")) return "system"
  return "announcement"
}

// ---------------------------------------------------------------------------
// Exams, Invigilation Duties & Result Entries
// ---------------------------------------------------------------------------
export async function getExamDuties(): Promise<ExamDuty[]> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbSlots: any[] = []
  try {
    dbSlots = await prisma.exam_slots.findMany({
      where: {
        examSchedule: {
          institutionId: activeTenantId,
        },
      },
      include: {
        examSchedule: true,
      },
      orderBy: {
        examDate: "asc",
      },
    })
  } catch (err) {
    console.warn("[getExamDuties] DB query error:", err)
  }

  const activeAYId = await resolveCurrentAcademicYearId(activeTenantId)

  const liveDuties: ExamDuty[] = dbSlots.map((slot: any) => {
    const isMorning =
      slot.startTime.includes("09:") ||
      slot.startTime.includes("10:") ||
      slot.startTime.toUpperCase().includes("AM")
    const sched = slot.examSchedule ?? slot.exam_schedules

    return {
      id: `duty-${slot.id}`,
      institutionId: activeTenantId,
      academicYearId: sched?.academicYearId ?? activeAYId,
      teacherId: teacher.id,
      examName: sched?.title ?? "Semester Examination",
      examDate: slot.examDate ? new Date(slot.examDate).toISOString().slice(0, 10) : "2026-11-20",
      session: isMorning ? "Morning" : "Afternoon",
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomNo: slot.roomNumber,
      dutyRole: "Chief Invigilator",
      className: "Class 10",
      subjectName: slot.subjectName,
      status: "assigned",
    }
  })

  return clone(liveDuties)
}

export async function getExamSchedule(): Promise<ExamScheduleItem[]> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbSlots: any[] = []
  try {
    dbSlots = await prisma.exam_slots.findMany({
      where: {
        examSchedule: {
          institutionId: activeTenantId,
        },
      },
      include: {
        examSchedule: true,
      },
      orderBy: {
        examDate: "asc",
      },
    })
  } catch (err) {
    console.warn("[getExamSchedule] DB query error:", err)
  }

  const liveSchedule: ExamScheduleItem[] = dbSlots.map((slot: any) => {
    const sched = slot.examSchedule ?? slot.exam_schedules
    return {
      id: slot.id,
      examName: sched?.title ?? "Semester Examination",
      examDate: slot.examDate ? new Date(slot.examDate).toISOString().slice(0, 10) : "2026-11-20",
      startTime: slot.startTime,
      endTime: slot.endTime,
      className: "Class 10",
      section: "A & B",
      subjectCode: slot.subjectCode,
      subjectName: slot.subjectName,
      maxMarks: 80,
      passingMarks: 27,
      roomNo: slot.roomNumber,
    }
  })

  return clone(liveSchedule)
}

export async function saveExamHallLog(
  dutyId: string,
  log: NonNullable<ExamDuty["hallAttendance"]>
): Promise<ExamDuty> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  await prisma.approval_requests.upsert({
    where: { id: `apr-hall-${dutyId}` },
    update: {
      status: "APPROVED",
      requestedDataJson: JSON.stringify({ dutyId, log }),
      reviewedAt: new Date(),
    },
    create: {
      id: `apr-hall-${dutyId}`,
      institutionId: activeTenantId,
      userId: user.id,
      requestType: "EXAM_HALL_LOG",
      title: `Exam Hall Attendance Log — Duty ${dutyId}`,
      status: "APPROVED",
      requestedDataJson: JSON.stringify({ dutyId, log }),
      reviewedAt: new Date(),
    },
  })

  const liveDuties = await getExamDuties()
  const existing = liveDuties.find((d) => d.id === dutyId)
  if (existing) {
    const updated: ExamDuty = {
      ...existing,
      status: "completed",
      hallAttendance: log,
    }
    return clone(updated)
  }

  const duty: ExamDuty = {
    id: dutyId,
    institutionId: activeTenantId,
    academicYearId: await resolveCurrentAcademicYearId(activeTenantId),
    teacherId: user.id,
    examName: "Mid-Term Examination 2026-27",
    examDate: new Date().toISOString().slice(0, 10),
    session: "Morning",
    startTime: "09:30 AM",
    endTime: "12:30 PM",
    roomNo: "Room 402",
    dutyRole: "Chief Invigilator",
    status: "completed",
    hallAttendance: log,
  }
  return clone(duty)
}

export async function getCampusDuties(): Promise<CampusDuty[]> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const reqs = await prisma.approval_requests.findMany({
    where: {
      institutionId: activeTenantId,
      requestType: "CAMPUS_DUTY",
    },
    orderBy: { createdAt: "desc" },
  })

  return reqs.map((r: any) => {
    try {
      const data = JSON.parse(r.requestedDataJson)
      return {
        id: r.id,
        institutionId: activeTenantId,
        dutyName: r.title,
        dutyType: data.dutyType || "Discipline & Gate",
        location: data.location || "Main Campus",
        date: data.date || r.createdAt.toISOString().slice(0, 10),
        startTime: data.startTime || "08:00 AM",
        endTime: data.endTime || "09:00 AM",
        status: (r.status.toLowerCase() as any) || "scheduled",
      }
    } catch {
      return {
        id: r.id,
        institutionId: activeTenantId,
        dutyName: r.title,
        dutyType: "Campus Duty",
        location: "Main Gate",
        date: r.createdAt.toISOString().slice(0, 10),
        startTime: "08:00 AM",
        endTime: "09:00 AM",
        status: (r.status.toLowerCase() as any) || "scheduled",
      }
    }
  })
}

export async function getResultEntries(): Promise<ResultEntry[]> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbResults: any[] = []
  try {
    dbResults = await prisma.exam_results.findMany({
      where: {
        institutionId: activeTenantId,
      },
      include: {
        student: true,
        subject: {
          include: { course: true },
        },
        examSchedule: true,
      },
      orderBy: {
        student: {
          rollNumber: "asc",
        },
      },
    })
  } catch (err) {
    console.warn("[getResultEntries] DB query error:", err)
  }

  if (dbResults.length > 0) {
    const groups = new Map<string, typeof dbResults>()
    for (const res of dbResults) {
      const key = `${res.examScheduleId}_${res.subjectId}`
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(res)
    }

    const liveEntries: ResultEntry[] = Array.from(groups.entries()).map(
      ([, results]) => {
        const first = results[0]
        const rows: ResultMarkRow[] = results.map((r: any) => {
          const st = r.student ?? r.students
          return {
            studentId: r.studentId,
            rollNo: st?.rollNumber ?? "01",
            studentName: st ? `${st.firstName} ${st.lastName}` : "Student",
            theoryMarks: r.externalMarks,
            practicalMarks: r.internalMarks,
            totalMarks: r.totalMarks,
            grade: r.grade,
            isAbsent: false,
            remarks: r.isPassed ? "Passed" : "Needs Improvement",
          }
        })

        const fSub = first.subject ?? first.subjects
        const fSched = first.examSchedule ?? first.exam_schedules
        const fCourse = fSub?.course ?? fSub?.courses
        return {
          id: `re-${first.examScheduleId}-${first.subjectId}`,
          institutionId: activeTenantId,
          academicYearId: "active-academic-year",
          teacherId: teacher.id,
          examName: fSched?.title ?? "Final Exam",
          classId: fSub?.courseId ?? "cls-10",
          className: fCourse?.name || "Class 10",
          sectionId: (fSched as any)?.sectionId || "",
          section: "A",
          subjectId: first.subjectId,
          subjectName: fSub?.name ?? "Mathematics",
          maxTheoryMarks: 70,
          maxPracticalMarks: 30,
          maxTotalMarks: 100,
          entryStatus: "submitted",
          publicationStatus: fSched?.isPublished ? "published" : "draft",
          submissionDeadline: "2026-12-15",
          lastUpdatedAt: first.publishedAt ? new Date(first.publishedAt).toISOString() : new Date().toISOString(),
          rows,
        }
      }
    )

    return clone(liveEntries)
  }

  return []
}

export async function saveResultMarks(
  input: SaveResultMarksInput
): Promise<ResultEntry> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const liveEntries = await getResultEntries()
  const entry = liveEntries.find((r) => r.id === input.resultEntryId)
  if (!entry) {
    throw new Error(`Result entry "${input.resultEntryId}" not found.`)
  }

  // Resolve valid exam schedule in this institution
  let examScheduleId: string | undefined = undefined
  if (input.resultEntryId.startsWith("re-")) {
    const raw = input.resultEntryId.slice(3)
    const parts = raw.split("-")
    if (parts.length >= 1) {
      const candidateId = parts[0]
      const found = await prisma.exam_schedules.findFirst({
        where: { id: candidateId, institutionId: activeTenantId },
      })
      if (found) examScheduleId = found.id
    }
  }

  if (!examScheduleId) {
    const activeSched = await prisma.exam_schedules.findFirst({
      where: { institutionId: activeTenantId },
      orderBy: { createdAt: "desc" },
    })
    if (activeSched) {
      examScheduleId = activeSched.id
    } else {
      const activeAYId = await resolveCurrentAcademicYearId(activeTenantId)
      const ay = await prisma.academic_years.findFirst({
        where: { institutionId: activeTenantId },
        orderBy: { createdAt: "asc" },
      })
      const newSched = await prisma.exam_schedules.create({
        data: {
          id: `es-${crypto.randomUUID()}`,
          institutionId: activeTenantId,
          academicYearId: ay?.id || activeAYId,
          semester: 1,
          title: "Semester Final Examination",
          examType: "FINAL",
          startDate: new Date(),
          endDate: new Date(),
          isPublished: false,
        },
      })
      examScheduleId = newSched.id
    }
  }

  // PREVENT post-publication modifications without permission
  const scheduleCheck = await prisma.exam_schedules.findFirst({
    where: { id: examScheduleId, institutionId: activeTenantId },
  })
  if (scheduleCheck?.isPublished) {
    throw new Error(
      "Cannot modify marks: This examination result batch has already been published. Post-publication modifications require administrative authorization."
    )
  }

  const updates = new Map(input.rows.map((r) => [r.studentId, r]))

  const updatedRows = entry.rows.map((row) => {
    const update = updates.get(row.studentId)
    if (!update) return row
    if (update.isAbsent) {
      return {
        ...row,
        theoryMarks: null,
        practicalMarks: null,
        totalMarks: null,
        grade: "AB",
        isAbsent: true,
        remarks: update.remarks ?? row.remarks,
      }
    }
    const theory = update.theoryMarks
    const practical = update.practicalMarks

    if (theory !== null && theory !== undefined) {
      if (theory < 0 || theory > entry.maxTheoryMarks) {
        throw new Error(
          `Validation error: Theory marks (${theory}) cannot exceed maximum (${entry.maxTheoryMarks}) or be negative.`
        )
      }
    }
    if (practical !== null && practical !== undefined) {
      if (practical < 0 || practical > entry.maxPracticalMarks) {
        throw new Error(
          `Validation error: Practical marks (${practical}) cannot exceed maximum (${entry.maxPracticalMarks}) or be negative.`
        )
      }
    }

    const total =
      theory !== null && practical !== null
        ? theory + practical
        : theory !== null
          ? theory
          : null

    if (total !== null && total > entry.maxTotalMarks) {
      throw new Error(
        `Validation error: Total marks (${total}) cannot exceed maximum total marks (${entry.maxTotalMarks}).`
      )
    }

    const percent =
      total !== null ? Math.round((total / entry.maxTotalMarks) * 100) : null

    return {
      ...row,
      theoryMarks: theory,
      practicalMarks: practical,
      totalMarks: total,
      grade: percent !== null ? resolveGrade(percent) : undefined,
      isAbsent: false,
      remarks: update.remarks ?? row.remarks,
    }
  })

  await prisma.$transaction(async (tx: any) => {
    // Resolve valid subjectId
    let subjectId = entry.subjectId
    const s = await tx.subjects.findFirst({
      where: { id: subjectId, institutionId: activeTenantId },
    })
    if (!s) {
      const fallback = await tx.subjects.findFirst({
        where: { institutionId: activeTenantId },
        orderBy: { createdAt: "asc" },
      })
      if (fallback) subjectId = fallback.id
    }

    for (const r of updatedRows) {
      const isAbsent = r.isAbsent || r.totalMarks === null
      const total = isAbsent ? 0 : (r.totalMarks ?? 0)
      const grade = r.grade || (isAbsent ? "AB" : "E")
      const gradePoint =
        grade === "A1" || grade === "A+"
          ? 10
          : grade === "A2" || grade === "A"
            ? 9
            : grade === "B1" || grade === "B+"
              ? 8
              : grade === "B2" || grade === "B"
                ? 7
                : grade === "C"
                  ? 6
                  : grade === "P"
                    ? 5
                    : 0

      const recordId = `res-${examScheduleId}-${r.studentId}-${subjectId}`

      await tx.exam_results.upsert({
        where: { id: recordId },
        update: {
          internalMarks: r.practicalMarks ?? 0,
          externalMarks: r.theoryMarks ?? 0,
          totalMarks: total,
          maxMarks: entry.maxTotalMarks,
          grade,
          gradePoint,
          isPassed: !isAbsent && total >= 33,
        },
        create: {
          id: recordId,
          institutionId: activeTenantId,
          examScheduleId,
          studentId: r.studentId,
          subjectId,
          internalMarks: r.practicalMarks ?? 0,
          externalMarks: r.theoryMarks ?? 0,
          totalMarks: total,
          maxMarks: entry.maxTotalMarks,
          grade,
          gradePoint,
          credits: 4,
          isPassed: !isAbsent && total >= 33,
          isSupplementary: isAbsent || total < 33,
          attemptNumber: 1,
          publishedAt: new Date(),
        },
      })
    }

    await tx.approval_requests.upsert({
      where: { id: `apr-res-${input.resultEntryId}` },
      update: {
        status: input.entryStatus ? input.entryStatus.toUpperCase() : "PENDING",
        requestedDataJson: JSON.stringify({
          resultEntryId: input.resultEntryId,
          examScheduleId,
          rowCount: input.rows.length,
          updatedAt: new Date().toISOString(),
        }),
      },
      create: {
        id: `apr-res-${input.resultEntryId}`,
        institutionId: activeTenantId,
        userId: user.id,
        requestType: "RESULT_MODERATION",
        title: `Exam Marks Entry — ${entry.subjectName} (${entry.className})`,
        status: input.entryStatus ? input.entryStatus.toUpperCase() : "PENDING",
        requestedDataJson: JSON.stringify({
          resultEntryId: input.resultEntryId,
          examScheduleId,
          rowCount: input.rows.length,
          updatedAt: new Date().toISOString(),
        }),
      },
    })
  })

  const updatedEntry: ResultEntry = {
    ...entry,
    entryStatus: input.entryStatus ?? entry.entryStatus,
    lastUpdatedAt: new Date().toISOString(),
    rows: updatedRows,
  }

  return clone(updatedEntry)
}

export async function publishResultEntry(
  resultEntryId: string,
  publicationStatus: ResultEntry["publicationStatus"],
  entryStatus?: ApprovalStatus
): Promise<ResultEntry> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const liveEntries = await getResultEntries()
  const current = liveEntries.find((r) => r.id === resultEntryId)
  if (!current) {
    throw new Error(`Result entry "${resultEntryId}" not found.`)
  }

  if (publicationStatus === "published") {
    await prisma.exam_schedules.updateMany({
      where: { institutionId: activeTenantId },
      data: { isPublished: true },
    })
  }

  await prisma.approval_requests.upsert({
    where: { id: `apr-pub-${resultEntryId}` },
    update: {
      status: entryStatus ? entryStatus.toUpperCase() : "APPROVED",
      reviewedAt: new Date(),
    },
    create: {
      id: `apr-pub-${resultEntryId}`,
      institutionId: activeTenantId,
      userId: user.id,
      requestType: "RESULT_PUBLICATION",
      title: `Result Publication — ${current.subjectName}`,
      status: entryStatus ? entryStatus.toUpperCase() : "APPROVED",
      requestedDataJson: JSON.stringify({ resultEntryId, publicationStatus }),
      reviewedAt: new Date(),
    },
  })

  const updated: ResultEntry = {
    ...current,
    publicationStatus,
    entryStatus: entryStatus ?? current.entryStatus,
    lastUpdatedAt: new Date().toISOString(),
  }
  return clone(updated)
}

// ---------------------------------------------------------------------------
// Mentorship
// ---------------------------------------------------------------------------
export async function getMentees(): Promise<Mentee[]> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId
  const activeAYId = await resolveCurrentAcademicYearId(activeTenantId)

  let dbRecords: any[] = []
  try {
    dbRecords = await prisma.mentoring_records.findMany({
      where: {
        institutionId: activeTenantId,
        mentorTeacherId: teacher.id,
      },
      include: {
        student: {
          include: {
            guardianLinks: {
              include: {
                guardianAccount: true,
              },
            },
          },
        },
      },
      orderBy: {
        sessionDate: "desc",
      },
    })
  } catch (err) {
    console.warn("[getMentees] DB query error:", err)
  }

  if (dbRecords.length > 0) {
    const studentMap = new Map<string, typeof dbRecords>()
    for (const r of dbRecords) {
      if (!studentMap.has(r.studentId)) {
        studentMap.set(r.studentId, [])
      }
      studentMap.get(r.studentId)!.push(r)
    }

    let menteeAttendanceRecords: any[] = []
    const menteeStudentIds = Array.from(studentMap.keys())
    if (menteeStudentIds.length > 0) {
      try {
        const prismaAttendance =
          (prisma as any).attendance_records ?? (prisma as any).attendanceRecord
        menteeAttendanceRecords = await prismaAttendance.findMany({
          where: {
            studentId: { in: menteeStudentIds },
            institutionId: activeTenantId,
          },
          select: {
            id: true,
            studentId: true,
            status: true,
            date: true,
            subjectId: true,
          },
        })
      } catch (err) {
        console.warn("[getMentees] attendance query error:", err)
      }
    }

    const attendanceByMentee = new Map<string, any[]>()
    for (const rec of menteeAttendanceRecords) {
      if (!attendanceByMentee.has(rec.studentId)) {
        attendanceByMentee.set(rec.studentId, [])
      }
      attendanceByMentee.get(rec.studentId)!.push(rec)
    }

    const liveMentees: Mentee[] = Array.from(studentMap.entries()).map(
      ([, records]) => {
        const student = records[0].student ?? records[0].students
        const latestPublic = records.find((r: any) => !r.isPrivateNote)
        const latestPrivate = records.find((r: any) => r.isPrivateNote)
        const gLinks = student?.guardianLinks ?? student?.guardian_links ?? []
        const guardian = gLinks[0]?.guardianAccount ?? gLinks[0]?.guardian_accounts

        const recs = attendanceByMentee.get(student.id) ?? []
        const calc = calculateAttendance(recs)
        const attendancePercent = calc.hasData ? calc.percentage : null
        const riskLevel: "on_track" | "watch" | "at_risk" =
          attendancePercent !== null && attendancePercent < 75
            ? "at_risk"
            : attendancePercent !== null && attendancePercent < 82
              ? "watch"
              : "on_track"

        return {
          id: `mentee-${student.id}`,
          institutionId: activeTenantId,
          academicYearId: activeAYId,
          mentorTeacherId: teacher.id,
          studentId: student.id,
          rollNo: student.rollNumber,
          admissionNo: student.admissionNumber,
          fullName: `${student.firstName} ${student.lastName}`,
          className: "Class 10",
          section: student.currentSection,
          attendancePercent,
          iaAverage: 78,
          riskLevel,
          guardianContact: {
            guardianName: guardian?.fullName || "Parent / Guardian",
            phone: guardian?.phone || student.emergencyContact || "",
            relation: "Guardian",
          },
          lastSessionDate: latestPublic?.sessionDate.toISOString().slice(0, 10),
          notesSummary: latestPublic?.topicsDiscussed,
          confidentialNotes: latestPrivate?.mentorNotes ?? undefined,
        }
      }
    )

    return clone(liveMentees)
  }

  return []
}

export async function getMentoringSessions(
  menteeId?: string | any
): Promise<MentoringSession[]> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const targetStudentId =
    typeof menteeId === "string" && menteeId.trim().length > 0
      ? (menteeId.startsWith("mentee-") ? menteeId.replace("mentee-", "") : menteeId.trim())
      : undefined

  let dbRecords: any[] = []
  try {
    dbRecords = await prisma.mentoring_records.findMany({
      where: {
        institutionId: activeTenantId,
        mentorTeacherId: teacher.id,
        isPrivateNote: false,
        ...(targetStudentId ? { studentId: targetStudentId } : {}),
      },
      include: {
        student: true,
      },
      orderBy: {
        sessionDate: "desc",
      },
    })
  } catch (err) {
    console.warn("[getMentoringSessions] DB query error:", err)
  }

  if (dbRecords.length > 0) {
    const liveSessions: MentoringSession[] = dbRecords.map((r: any) => {
      let actionItems: string[] = []
      if (r.studentActionItems) {
        try {
          const parsed = JSON.parse(r.studentActionItems)
          actionItems = Array.isArray(parsed) ? parsed : [r.studentActionItems]
        } catch {
          actionItems = [r.studentActionItems]
        }
      }

      const st = r.student ?? r.students

      return {
        id: r.id,
        menteeId: `mentee-${r.studentId}`,
        studentId: r.studentId,
        studentName: st ? `${st.firstName} ${st.lastName}` : "Student",
        mentorTeacherId: r.mentorTeacherId,
        sessionDate: r.sessionDate.toISOString().slice(0, 10),
        mode: "in_person",
        topic: r.topicsDiscussed,
        observations: r.mentorNotes || "",
        actionItems,
        followUpDate: r.followUpDate ? r.followUpDate.toISOString().slice(0, 10) : undefined,
        status: "completed",
      }
    })

    const filtered = menteeId
      ? liveSessions.filter((s) => s.menteeId === menteeId || s.studentId === targetStudentId)
      : liveSessions
    return clone(filtered)
  }

  return []
}

export async function createMentoringSession(
  input: CreateMentoringSessionInput
): Promise<MentoringSession> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const targetStudentId = input.menteeId.startsWith("mentee-")
    ? input.menteeId.replace("mentee-", "")
    : input.menteeId

  const student = await prisma.students.findFirst({
    where: { id: targetStudentId, institutionId: activeTenantId },
  })

  const id = `ms-${Date.now()}`
  await prisma.mentoring_records.create({
    data: {
      id,
      institutionId: activeTenantId,
      studentId: targetStudentId,
      mentorTeacherId: teacher.id,
      sessionDate: new Date(`${input.sessionDate}T12:00:00.000Z`),
      topicsDiscussed: input.topic,
      studentActionItems: JSON.stringify(input.actionItems),
      followUpDate: input.followUpDate
        ? new Date(`${input.followUpDate}T12:00:00.000Z`)
        : null,
      isPrivateNote: false,
      mentorNotes: input.observations,
      createdAt: new Date(),
    },
  })

  const studentName = student
    ? `${student.firstName} ${student.lastName}`
    : "Mentee Student"

  const created: MentoringSession = {
    id,
    menteeId: input.menteeId,
    studentId: targetStudentId,
    studentName,
    mentorTeacherId: teacher.id,
    sessionDate: input.sessionDate,
    mode: input.mode,
    topic: input.topic,
    observations: input.observations,
    actionItems: input.actionItems,
    followUpDate: input.followUpDate,
    status: input.status ?? "completed",
  }

  return clone(created)
}

export async function saveConfidentialMentorNote(
  menteeId: string,
  note: string
): Promise<Mentee> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const targetStudentId =
    typeof menteeId === "string" && menteeId.startsWith("mentee-")
      ? menteeId.replace("mentee-", "")
      : String(menteeId ?? "")

  await prisma.mentoring_records.create({
    data: {
      id: `mr-conf-${Date.now()}`,
      institutionId: activeTenantId,
      studentId: targetStudentId,
      mentorTeacherId: teacher.id,
      sessionDate: new Date(),
      topicsDiscussed: "Confidential Student Welfare & Medical Observation",
      mentorNotes: note,
      isPrivateNote: true,
      createdAt: new Date(),
    },
  })

  const mentees = await getMentees()
  const mentee = mentees.find((m) => m.id === menteeId || m.studentId === targetStudentId)
  if (mentee) {
    return clone({
      ...mentee,
      confidentialNotes: note,
    })
  }

  throw new Error(`Mentee "${menteeId}" not found in this institution.`)
}

export async function escalateMenteeConcern(
  menteeId: string,
  reason: string
): Promise<Mentee> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  await prisma.approval_requests.create({
    data: {
      id: `apr-esc-${Date.now()}`,
      institutionId: activeTenantId,
      userId: user.id,
      requestType: "MENTOR_ESCALATION",
      title: `Mentee Escalation Concern: ${reason.slice(0, 60)}`,
      status: "PENDING",
      requestedDataJson: JSON.stringify({
        menteeId,
        reason,
        escalatedAt: new Date().toISOString(),
      }),
    },
  })

  const mentees = await getMentees()
  const mentee = mentees.find((m) => m.id === menteeId)
  if (mentee) {
    const updated: Mentee = {
      ...mentee,
      escalated: true,
      escalationReason: reason,
      riskLevel: "at_risk",
    }
    return clone(updated)
  }

  throw new Error(`Mentee "${menteeId}" not found in this institution.`)
}

// ---------------------------------------------------------------------------
// Teacher Logbook
// ---------------------------------------------------------------------------
export async function getLogBookEntries(
  filters?: { subjectId?: string } | string
): Promise<LogBookEntry[]> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId
  const activeAYId = await resolveCurrentAcademicYearId(activeTenantId)

  let dbRequests: any[] = []
  try {
    dbRequests = await prisma.approval_requests.findMany({
      where: {
        institutionId: activeTenantId,
        userId: user.id,
        requestType: "TEACHER_LOGBOOK",
      },
      orderBy: { createdAt: "desc" },
    })
  } catch (err) {
    console.warn("[getLogBookEntries] DB query error:", err)
  }

  const liveEntries: LogBookEntry[] = []
  for (const req of dbRequests) {
    try {
      const data = JSON.parse(req.requestedDataJson)
      liveEntries.push({
        id: data.id || req.id,
        institutionId: activeTenantId,
        academicYearId: activeAYId,
        teacherId: user.id,
        date: data.date,
        period: data.period,
        classId: data.classId,
        className: data.className,
        section: data.section,
        subjectId: data.subjectId,
        subjectName: data.subjectName,
        unit: data.unit,
        topicCovered: data.topicCovered,
        teachingMethod: data.teachingMethod,
        homeworkAssigned: data.homeworkAssigned,
        remarks: data.remarks,
        syllabusProgressPercent: data.syllabusProgressPercent,
        status: (req.status.toLowerCase() as ApprovalStatus) || "submitted",
        verifiedBy: req.reviewedByUserId ? "HoD Mathematics" : undefined,
      })
    } catch {}
  }

  if (typeof filters === "string") {
    return clone(liveEntries.filter((entry) => entry.section === filters))
  }
  if (filters?.subjectId) {
    return clone(liveEntries.filter((entry) => entry.subjectId === filters.subjectId))
  }
  return clone(liveEntries)
}

export async function createLogBookEntry(
  input: CreateLogBookEntryInput
): Promise<LogBookEntry> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId
  const activeAYId = await resolveCurrentAcademicYearId(activeTenantId)

  const id = `lb-${Date.now()}`
  await prisma.approval_requests.create({
    data: {
      id: `apr-${id}`,
      institutionId: activeTenantId,
      userId: user.id,
      requestType: "TEACHER_LOGBOOK",
      title: `Teaching Log: ${input.subjectName} — ${input.topicCovered}`,
      status: input.status === "draft" ? "DRAFT" : "PENDING",
      requestedDataJson: JSON.stringify({
        ...input,
        id,
      }),
    },
  })

  const created: LogBookEntry = {
    id,
    institutionId: activeTenantId,
    academicYearId: activeAYId,
    teacherId: user.id,
    date: input.date,
    period: input.period,
    classId: input.classId,
    className: input.className,
    section: input.section,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    unit: input.unit,
    topicCovered: input.topicCovered,
    teachingMethod: input.teachingMethod,
    homeworkAssigned: input.homeworkAssigned,
    remarks: input.remarks,
    syllabusProgressPercent: input.syllabusProgressPercent,
    status: (input.status as ApprovalStatus) ?? "submitted",
  }

  return clone(created)
}

export async function getStudentLogReviews(): Promise<StudentLogReview[]> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbLogs: any[] = []
  try {
    dbLogs = await prisma.log_book_entries.findMany({
      where: {
        institutionId: activeTenantId,
      },
      include: {
        student: true,
      },
      orderBy: {
        entryDate: "desc",
      },
    })
  } catch (err) {
    console.warn("[getStudentLogReviews] DB query error:", err)
  }

  if (dbLogs.length > 0) {
    const liveReviews: StudentLogReview[] = dbLogs.map((lb: any) => {
      const st = lb.student ?? lb.students
      return {
        id: lb.id,
        studentId: lb.studentId,
        rollNo: st?.rollNumber ?? "01",
        studentName: st ? `${st.firstName} ${st.lastName}` : "Student",
        className: "Class 10",
        section: st?.currentSection ?? "A",
        projectTitle: lb.title,
        weekLabel: "Week 10",
        entryDate: lb.entryDate ? new Date(lb.entryDate).toISOString().slice(0, 10) : "2026-11-12",
        hoursLogged: lb.hoursSpent,
        summary: lb.description,
        teacherRemarks: lb.supervisorFeedback ?? undefined,
        status: lb.status === "APPROVED" ? "locked" : lb.status === "RETURNED" ? "returned" : "pending",
      }
    })

    return clone(liveReviews)
  }

  return []
}

export async function reviewStudentLog(
  reviewId: string,
  decision: "approved" | "returned",
  remarks?: string
): Promise<StudentLogReview> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  await prisma.log_book_entries.updateMany({
    where: { id: reviewId, institutionId: activeTenantId },
    data: {
      status: decision === "approved" ? "APPROVED" : "RETURNED",
      supervisorFeedback: remarks,
    },
  })

  const reviews = await getStudentLogReviews()
  const found = reviews.find((r) => r.id === reviewId)
  if (found) {
    const updated: StudentLogReview = {
      ...found,
      teacherRemarks: remarks ?? found.teacherRemarks,
      status: decision === "approved" ? "locked" : "returned",
    }
    return clone(updated)
  }

  throw new Error(`Student log review "${reviewId}" not found in this institution.`)
}

// ---------------------------------------------------------------------------
// Leave Requests (Teacher & Student)
// ---------------------------------------------------------------------------
export async function getTeacherLeaveRequests(): Promise<TeacherLeaveRequest[]> {
  const { user, teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId
  const activeAYId = await resolveCurrentAcademicYearId(activeTenantId)

  let dbRequests: any[] = []
  try {
    dbRequests = await prisma.approval_requests.findMany({
      where: {
        institutionId: activeTenantId,
        userId: user.id,
        requestType: "LEAVE",
      },
      orderBy: { createdAt: "desc" },
    })
  } catch (err) {
    console.warn("[getTeacherLeaveRequests] DB query error:", err)
  }

  const liveLeaves: TeacherLeaveRequest[] = []
  for (const r of dbRequests) {
    try {
      const data = JSON.parse(r.requestedDataJson)
      liveLeaves.push({
        id: r.id,
        institutionId: activeTenantId,
        academicYearId: activeAYId,
        teacherId: teacher.id,
        teacherName: user.fullName || "Teacher",
        leaveType: data.leaveType || "Casual Leave",
        fromDate: data.fromDate,
        toDate: data.toDate,
        daysCount: data.daysCount,
        reason: data.reason,
        substituteTeacherName: data.substituteTeacherName,
        handoverNotes: data.handoverNotes,
        appliedAt: r.createdAt.toISOString().slice(0, 10),
        status: (r.status.toLowerCase() as ApprovalStatus) || "submitted",
        reviewedBy: r.adminRemarks ? "Principal" : undefined,
        reviewerRemarks: r.adminRemarks ?? undefined,
      })
    } catch {}
  }

  return clone(liveLeaves)
}

export async function createTeacherLeaveRequest(
  input: CreateTeacherLeaveInput
): Promise<TeacherLeaveRequest> {
  const { user, teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId
  const activeAYId = await resolveCurrentAcademicYearId(activeTenantId)

  const id = `tlr-${Date.now()}`
  await prisma.approval_requests.create({
    data: {
      id,
      institutionId: activeTenantId,
      userId: user.id,
      requestType: "LEAVE",
      title: `${input.leaveType}: ${input.fromDate} to ${input.toDate} (${input.daysCount} days)`,
      status: "PENDING",
      requestedDataJson: JSON.stringify({
        ...input,
        id,
        teacherId: teacher.id,
        teacherName: user.fullName || "Teacher",
      }),
    },
  })

  const created: TeacherLeaveRequest = {
    id,
    institutionId: activeTenantId,
    academicYearId: activeAYId,
    teacherId: teacher.id,
    teacherName: user.fullName || "Teacher",
    leaveType: input.leaveType,
    fromDate: input.fromDate,
    toDate: input.toDate,
    daysCount: input.daysCount,
    reason: input.reason,
    substituteTeacherName: input.substituteTeacherName,
    handoverNotes: input.handoverNotes,
    appliedAt: new Date().toISOString().slice(0, 10),
    status: "submitted",
  }

  return clone(created)
}

export async function reviewTeacherLeaveRequest(
  requestId: string,
  decision: "approved" | "rejected",
  substituteTeacherName?: string,
  reviewerRemarks?: string
): Promise<TeacherLeaveRequest> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  await prisma.approval_requests.updateMany({
    where: { id: requestId, institutionId: activeTenantId },
    data: {
      status: decision === "approved" ? "APPROVED" : "REJECTED",
      adminRemarks: reviewerRemarks,
      reviewedByUserId: user.id,
      reviewedAt: new Date(),
    },
  })

  const allReqs = await getTeacherLeaveRequests()
  const found = allReqs.find((r) => r.id === requestId)
  if (found) {
    const updated: TeacherLeaveRequest = {
      ...found,
      status: decision,
      reviewedBy: user.fullName || "Administrator",
      reviewerRemarks: reviewerRemarks ?? found.reviewerRemarks,
      substituteTeacherName: substituteTeacherName || found.substituteTeacherName,
    }
    return clone(updated)
  }

  throw new Error(`Teacher leave request "${requestId}" not found in this institution.`)
}

export async function getStudentLeaveRequests(
  status?: StudentLeaveRequest["status"]
): Promise<StudentLeaveRequest[]> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbRequests: any[] = []
  try {
    dbRequests = await prisma.approval_requests.findMany({
      where: {
        institutionId: activeTenantId,
        requestType: "STUDENT_LEAVE",
      },
      orderBy: { createdAt: "desc" },
    })
  } catch (err) {
    console.warn("[getStudentLeaveRequests] DB query error:", err)
  }

  const liveLeaves: StudentLeaveRequest[] = []
  for (const r of dbRequests) {
    try {
      const data = JSON.parse(r.requestedDataJson)
      liveLeaves.push({
        id: r.id,
        institutionId: activeTenantId,
        academicYearId: "ay_active",
        studentId: data.studentId,
        rollNo: data.rollNo,
        studentName: data.studentName,
        className: data.className || "Class 10",
        section: data.section || "A",
        leaveType: data.leaveType || "Medical",
        fromDate: data.fromDate,
        toDate: data.toDate,
        daysCount: data.daysCount || 1,
        reason: data.reason,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        appliedAt: r.createdAt.toISOString().slice(0, 10),
        status: (r.status.toLowerCase() as StudentLeaveRequest["status"]) || "pending",
        reviewedBy: r.reviewedAt ? "Class Teacher" : undefined,
        reviewerRemarks: r.adminRemarks ?? undefined,
      })
    } catch {}
  }

  const filtered = status ? liveLeaves.filter((req) => req.status === status) : liveLeaves
  return clone(filtered)
}

export async function reviewStudentLeaveRequest(
  requestId: string,
  decision: "approved" | "rejected",
  reviewerRemarks?: string
): Promise<StudentLeaveRequest> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  // 1. Fetch approval request from PostgreSQL
  const dbReq = await prisma.approval_requests.findFirst({
    where: {
      id: requestId,
      institutionId: activeTenantId,
      requestType: "STUDENT_LEAVE",
    },
  })

  let studentId = ""
  let fromDate = ""
  let toDate = ""
  let reason = "Medical"
  let studentName = ""
  let rollNo = ""
  let leaveType = "Medical"
  let guardianName: string | undefined = undefined
  let guardianPhone: string | undefined = undefined

  if (dbReq) {
    try {
      const parsed = JSON.parse(dbReq.requestedDataJson)
      studentId = parsed.studentId
      fromDate = parsed.fromDate
      toDate = parsed.toDate
      reason = parsed.reason || "Medical"
      studentName = parsed.studentName || ""
      rollNo = parsed.rollNo || ""
      leaveType = parsed.leaveType || "Medical"
      guardianName = parsed.guardianName
      guardianPhone = parsed.guardianPhone
    } catch (err) {
      console.warn("[reviewStudentLeaveRequest] JSON parse error:", err)
    }
  } else {
    throw new Error(`Student leave request "${requestId}" not found in this institution.`)
  }

  if (!studentId || !fromDate || !toDate) {
    throw new Error(`Student leave request "${requestId}" not found or lacks required dates.`)
  }

  // IDOR & Multi-tenant boundary check: verify student belongs to active institution
  const studentRecord = await prisma.students.findFirst({
    where: { id: studentId, institutionId: activeTenantId },
    select: { id: true },
  })
  if (!studentRecord) {
    throw new Error(`Student "${studentId}" not found in this institution.`)
  }

  // 2. Validate leave date range safely
  const startDate = new Date(fromDate)
  const endDate = new Date(toDate)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error(`Invalid date format for leave request "${requestId}".`)
  }

  if (startDate > endDate) {
    throw new Error(`Invalid date range: fromDate (${fromDate}) cannot be after toDate (${toDate}).`)
  }

  // Bound to full day UTC: start of fromDate to end of toDate
  startDate.setUTCHours(0, 0, 0, 0)
  endDate.setUTCHours(23, 59, 59, 999)

  // 3. Atomically update approval request and attendance records in one database transaction
  await prisma.$transaction(async (tx: any) => {
    // Update approval request status
    await tx.approval_requests.updateMany({
      where: { id: requestId, institutionId: activeTenantId, requestType: "STUDENT_LEAVE" },
      data: {
        status: decision === "approved" ? "APPROVED" : "REJECTED",
        adminRemarks: reviewerRemarks ?? null,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
      },
    })

    // Update attendance ONLY if approved, ONLY for the correct student,
    // ONLY within the active institution, and ONLY strictly within the leave date range
    if (decision === "approved") {
      await tx.attendance_records.updateMany({
        where: {
          institutionId: activeTenantId,
          studentId: studentId,
          status: "ABSENT",
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        data: {
          status: "PRESENT",
          remarks: `On-Duty / Leave Approved: ${reason}`,
        },
      })
    }
  })

  const daysCount = Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 3600 * 24)) + 1)

  const updated: StudentLeaveRequest = {
    id: requestId,
    institutionId: activeTenantId,
    academicYearId: "ay_active",
    studentId,
    rollNo,
    studentName,
    className: "Class 10",
    section: "A",
    leaveType: (leaveType as any) || "Medical",
    fromDate,
    toDate,
    daysCount,
    reason,
    guardianName: guardianName || "Parent / Guardian",
    guardianPhone: guardianPhone || "+91 98765 43210",
    status: decision,
    reviewedBy: user.fullName || "Class Teacher",
    reviewerRemarks,
    appliedAt: dbReq ? dbReq.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  }

  return clone(updated)
}

// ---------------------------------------------------------------------------
// Notifications & Announcements
// ---------------------------------------------------------------------------
export async function getNotifications(): Promise<NotificationItem[]> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbRecipients: any[] = []
  try {
    dbRecipients = await prisma.notificationRecipient.findMany({
      where: {
        userId: user.id,
      },
      include: {
        notification: true,
      },
      orderBy: {
        id: "desc",
      },
    })
  } catch (err) {
    console.warn("[getNotifications] DB query error:", err)
  }

  const liveNotifs: NotificationItem[] = dbRecipients.map((rec: any) => {
    const notif = rec.notification ?? rec.notifications
    return {
      id: rec.id,
      institutionId: notif?.institutionId ?? activeTenantId,
      title: notif?.title ?? "Notification",
      message: notif?.message ?? "",
      category: mapNotificationCategory(notif?.category),
      createdAt: notif?.createdAt ? new Date(notif.createdAt).toISOString() : new Date().toISOString(),
      isRead: rec.isRead,
    }
  })

  return clone(liveNotifs)
}

export async function markNotificationRead(
  notificationId: string
): Promise<NotificationItem[]> {
  const { user } = await resolveActiveTeacher()

  await prisma.notificationRecipient.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { isRead: true, readAt: new Date() },
  })

  return getNotifications()
}

export async function markAllNotificationsRead(): Promise<NotificationItem[]> {
  const { user } = await resolveActiveTeacher()

  await prisma.notificationRecipient.updateMany({
    where: { userId: user.id },
    data: { isRead: true, readAt: new Date() },
  })

  return getNotifications()
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const { institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let dbAnnouncements: any[] = []
  try {
    dbAnnouncements = await prisma.notification.findMany({
      where: {
        institutionId: activeTenantId,
        category: "ANNOUNCEMENT",
      },
      orderBy: { createdAt: "desc" },
    })
  } catch (err) {
    console.warn("[getAnnouncements] DB query error:", err)
    throw new Error("Failed to load announcements from database.")
  }

  const liveAnn: Announcement[] = dbAnnouncements.map((n: any) => ({
    id: n.id,
    institutionId: n.institutionId,
    academicYearId: "ay_active",
    title: n.title,
    content: n.message,
    audience: "All Staff",
    authorName: "School Administration",
    authorRole: "Principal / Academic Office",
    publishedAt: n.createdAt.toISOString().slice(0, 10),
    isPinned: false,
    priority: "normal",
  }))

  return clone(liveAnn)
}

export async function createAnnouncement(
  input: CreateAnnouncementInput
): Promise<Announcement> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const id = crypto.randomUUID()
  const audienceRole =
    input.audience === "All Staff"
      ? "STAFF"
      : input.audience === "Class & Parents"
      ? "ALL"
      : "TEACHER"

  await prisma.notification.create({
    data: {
      id,
      institutionId: activeTenantId,
      title: input.title,
      message: input.content,
      category: "ANNOUNCEMENT",
      audienceRole,
      createdAt: new Date(),
    },
  })

  // Resolve recipients strictly within active institution
  const recipientUserIds = new Set<string>()
  recipientUserIds.add(user.id) // Teacher author recipient

  if (input.audience === "All Staff" || input.audience === "Class Teachers" || input.audience === "Department") {
    // Resolve staff/teachers in this institution
    const staff = await prisma.user.findMany({
      where: {
        institutionId: activeTenantId,
        role: { in: ["TEACHER", "ADMIN", "STAFF"] },
      },
      select: { id: true },
    })
    for (const s of staff) {
      recipientUserIds.add(s.id)
    }
  } else {
    // Audience is "Class & Parents": resolve students and linked parents in this institution
    const dbStudents = await prisma.students.findMany({
      where: {
        institutionId: activeTenantId,
      },
      select: {
        id: true,
        userId: true,
        currentSection: true,
        guardianLinks: {
          where: {
            institutionId: activeTenantId,
            isVerified: true,
            canAccessPortal: true,
          },
          select: {
            guardianAccount: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    })

    let eligibleStudents = dbStudents
    if (input.targetClasses && input.targetClasses.length > 0) {
      const classFilters = input.targetClasses.map((c: string) => c.toLowerCase())
      eligibleStudents = dbStudents.filter((s: any) => {
        const sec = (s.currentSection || "").toLowerCase()
        return classFilters.some((cf: string) => cf.includes(sec) || sec.includes(cf) || cf.includes("10") || cf.includes("class"))
      })
      if (eligibleStudents.length === 0) {
        eligibleStudents = dbStudents
      }
    }

    for (const st of eligibleStudents) {
      if (st.userId) {
        recipientUserIds.add(st.userId)
      }
      if (st.guardianLinks) {
        for (const gl of st.guardianLinks) {
          if (gl.guardianAccount?.userId) {
            recipientUserIds.add(gl.guardianAccount.userId)
          }
        }
      }
    }
  }

  // Create notificationRecipient records with valid UUIDs
  const recipientData = Array.from(recipientUserIds).map((uid) => ({
    id: crypto.randomUUID(),
    notificationId: id,
    userId: uid,
    isRead: false,
  }))

  if (recipientData.length > 0) {
    await prisma.notificationRecipient.createMany({
      data: recipientData,
      skipDuplicates: true,
    })
  }

  const created: Announcement = {
    id,
    institutionId: activeTenantId,
    academicYearId: await resolveCurrentAcademicYearId(activeTenantId),
    title: input.title,
    content: input.content,
    audience: input.audience,
    targetClasses: input.targetClasses,
    authorName: user.fullName || "Teacher",
    authorRole: "Class Teacher (10-A)",
    publishedAt: new Date().toISOString().slice(0, 10),
    isPinned: input.isPinned ?? false,
    priority: input.priority ?? "normal",
  }

  return clone(created)
}

// ---------------------------------------------------------------------------
// Phase 4 & 5: Department Faculty Load & HoD Oversight
// ---------------------------------------------------------------------------
export async function getDepartmentFacultyLoad(): Promise<
  DepartmentFacultyLoad[]
> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  let deptTeachers: any[] = []
  try {
    deptTeachers = await prisma.teachers.findMany({
      where: {
        institutionId: activeTenantId,
        department: teacher.department,
      },
      include: {
        user: true,
        timetableSlots: {
          include: {
            subject: true,
          },
        },
      },
    })
  } catch (err) {
    console.warn("[getDepartmentFacultyLoad] DB query error:", err)
  }

  const result: DepartmentFacultyLoad[] = deptTeachers.map((t: any) => {
    const slots = t.timetableSlots ?? t.timetable_slots ?? []
    const subjectNames = Array.from(new Set(slots.map((s: any) => s.subject?.name).filter(Boolean))) as string[]
    const weeklyHours = slots.length > 0 ? slots.length : 18

    return {
      teacherId: t.id,
      fullName: t.user?.fullName || "Faculty Member",
      designation: t.designation || "Assistant Professor",
      subjects: subjectNames.length > 0 ? subjectNames : [t.department || "General"],
      sectionsCount: Math.max(1, new Set(slots.map((s: any) => s.sectionId)).size),
      weeklyHours,
      syllabusAveragePercent: 80,
      attendanceAveragePercent: 90,
    }
  })

  return clone(result)
}

export async function updateInternalAssessmentStatus(
  assessmentId: string,
  status: ApprovalStatus,
  correctionNote?: string
): Promise<InternalAssessment> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  await prisma.approval_requests.updateMany({
    where: {
      institutionId: activeTenantId,
      requestedDataJson: {
        contains: assessmentId,
      },
    },
    data: {
      status: status.toUpperCase(),
      adminRemarks: correctionNote,
      reviewedByUserId: user.id,
      reviewedAt: new Date(),
    },
  })

  const allAssessments = await getInternalAssessments({ institutionId: activeTenantId })
  const current = allAssessments.find((ia) => ia.id === assessmentId)
  if (!current) {
    throw new Error(`Internal assessment "${assessmentId}" not found.`)
  }
  const updated: InternalAssessment = {
    ...current,
    status,
    correctionNote:
      correctionNote !== undefined ? correctionNote : current.correctionNote,
    publishedToStudents:
      status === "locked" ? true : current.publishedToStudents,
    marks: current.marks.map((m) => ({ ...m, status })),
  }
  return clone(updated)
}

