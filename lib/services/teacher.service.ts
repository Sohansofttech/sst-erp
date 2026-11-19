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
import {
  ACADEMIC_YEARS_MOCK,
  ANNOUNCEMENTS_MOCK,
  ASSIGNMENTS_MOCK,
  ASSIGNMENT_SUBMISSIONS_MOCK,
  ATTENDANCE_SESSIONS_MOCK,
  CAMPUS_DUTIES_MOCK,
  CLASS_ALLOCATIONS_MOCK,
  DEPARTMENT_FACULTY_LOAD_MOCK,
  EXAM_DUTIES_MOCK,
  EXAM_SCHEDULE_MOCK,
  INSTITUTION_MOCK,
  INTERNAL_ASSESSMENTS_MOCK,
  LEARNING_MATERIALS_MOCK,
  LOGBOOK_ENTRIES_MOCK,
  MENTEES_MOCK,
  MENTORING_SESSIONS_MOCK,
  NOTIFICATIONS_MOCK,
  QUIZZES_MOCK,
  QUIZ_SUBMISSIONS_MOCK,
  RESULT_ENTRIES_MOCK,
  STUDENT_LEAVE_REQUESTS_MOCK,
  STUDENT_LOG_REVIEWS_MOCK,
  STUDENT_ROSTER_MOCK,
  SUBJECT_ALLOCATIONS_MOCK,
  TEACHER_LEAVE_REQUESTS_MOCK,
  TEACHER_PROFILE_MOCK,
  TIMETABLE_MOCK,
} from "@/mocks/teacher.mock"
import { prisma } from "@/lib/prisma"
import { getTeacherSession } from "@/lib/auth/teacher-session"
import { calculateAttendance, RawAttendanceRecord } from "@/lib/services/attendance-calculator"

// ---------------------------------------------------------------------------
// Multi-tenant Active Teacher Resolution (with in-memory cache & deduplication)
// ---------------------------------------------------------------------------
interface ResolvedTeacher {
  teacher: any
  user: any
  institutionId: string
}

const teacherCache = new Map<string, { data: ResolvedTeacher; timestamp: number }>()
const inFlightResolutions = new Map<string, Promise<ResolvedTeacher>>()

async function resolveActiveTeacher(
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

  const normSlug = resolvedSlug || "demo-school"
  const cacheKey = `${resolvedTeacherId ?? ""}|${resolvedInstId ?? ""}|${normSlug}`
  const now = Date.now()

  // 1. Direct cache check
  const cached = teacherCache.get(cacheKey)
  if (cached && now - cached.timestamp < 60_000) {
    return cached.data
  }

  // 2. Secondary cache checks
  if (resolvedTeacherId) {
    const idCached = teacherCache.get(`${resolvedTeacherId}||`)
    if (idCached && now - idCached.timestamp < 60_000) {
      return idCached.data
    }
  } else {
    const slugCached = teacherCache.get(`||${normSlug}`) ?? teacherCache.get(`||demo-school`)
    if (slugCached && now - slugCached.timestamp < 60_000) {
      return slugCached.data
    }
  }

  // 3. In-flight promise deduplication
  const dedupKey = resolvedTeacherId ? `id:${resolvedTeacherId}` : `slug:${normSlug}`
  if (inFlightResolutions.has(dedupKey)) {
    return inFlightResolutions.get(dedupKey)!
  }

  const promise = (async (): Promise<ResolvedTeacher> => {
    try {
      let result: ResolvedTeacher | null = null

      if (resolvedTeacherId) {
        try {
          const teacher = await prisma.teachers.findFirst({
            where: {
              id: resolvedTeacherId,
              ...(resolvedInstId ? { institutionId: resolvedInstId } : {}),
            },
            include: {
              user: true,
              institution: true,
            },
          })
          if (teacher) {
            const u = teacher.user ?? (teacher as any).users
            result = { teacher, user: u, institutionId: teacher.institutionId }
          }
        } catch (err) {
          console.warn("[resolveActiveTeacher] Direct ID lookup error:", err)
        }
      }

      if (!result) {
        // Attempt to resolve from active session or demo-school baseline
        try {
          const session = await getTeacherSession(normSlug)
          if (session) {
            result = { teacher: session.teacher, user: session.user, institutionId: session.institution.id }
          }
        } catch (err) {
          console.warn("[resolveActiveTeacher] Session resolution error:", err)
        }
      }

      if (!result) {
        try {
          const fallback = await prisma.teachers.findFirst({
            where: {
              ...(resolvedInstId ? { institutionId: resolvedInstId } : {}),
              user: { isActive: true },
            },
            include: {
              user: true,
              institution: true,
            },
            orderBy: { createdAt: "asc" },
          })
          if (fallback) {
            const u = fallback.user ?? (fallback as any).users
            result = { teacher: fallback, user: u, institutionId: fallback.institutionId }
          }
        } catch (err) {
          console.warn("[resolveActiveTeacher] DB fallback lookup error:", err)
        }
      }

      if (!result) {
        // Safe memory fallback to guarantee zero crash during DB network spikes
        result = {
          teacher: {
            id: "teacher_demo_042",
            institutionId: "inst_demo_school",
            userId: "user_teacher_demo_042",
            employeeId: "VNPS-TCH-042",
            department: "Mathematics",
            designation: "Senior PGT — Mathematics",
            createdAt: new Date("2026-06-01"),
          },
          user: {
            id: "user_teacher_demo_042",
            institutionId: "inst_demo_school",
            email: "ananya.sharma@vidyaniketan.edu.in",
            fullName: "Dr. Ananya Sharma",
            phone: "+91 98450 21478",
            avatarUrl: null,
            isActive: true,
            role: "TEACHER",
            createdAt: new Date("2026-06-01"),
          },
          institutionId: resolvedInstId || "inst_demo_school",
        }
      }

      const entry = { data: result, timestamp: Date.now() }
      teacherCache.set(cacheKey, entry)
      teacherCache.set(`${result.teacher.id}||`, entry)
      teacherCache.set(`||${normSlug}`, entry)
      teacherCache.set(`||demo-school`, entry)
      teacherCache.set(`||`, entry)

      return result
    } finally {
      inFlightResolutions.delete(dedupKey)
    }
  })()

  inFlightResolutions.set(dedupKey, promise)
  return promise
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

interface TeacherSessionStore {
  institution: Institution
  academicYears: AcademicYear[]
  profile: TeacherProfile
  classAllocations: ClassAllocation[]
  subjectAllocations: SubjectAllocation[]
  students: StudentRosterItem[]
  timetable: TimetableSlot[]
  attendanceSessions: AttendanceSession[]
  internalAssessments: InternalAssessment[]
  assignments: Assignment[]
  assignmentSubmissions: AssignmentSubmission[]
  learningMaterials: LearningMaterial[]
  quizzes: Quiz[]
  quizSubmissions: QuizSubmission[]
  examDuties: ExamDuty[]
  campusDuties: CampusDuty[]
  examSchedule: ExamScheduleItem[]
  resultEntries: ResultEntry[]
  mentees: Mentee[]
  mentoringSessions: MentoringSession[]
  logBookEntries: LogBookEntry[]
  studentLogReviews: StudentLogReview[]
  departmentFacultyLoad: DepartmentFacultyLoad[]
  teacherLeaveRequests: TeacherLeaveRequest[]
  studentLeaveRequests: StudentLeaveRequest[]
  notifications: NotificationItem[]
  announcements: Announcement[]
}

function createInitialStore(): TeacherSessionStore {
  return {
    institution: clone(INSTITUTION_MOCK),
    academicYears: clone(ACADEMIC_YEARS_MOCK),
    profile: clone(TEACHER_PROFILE_MOCK),
    classAllocations: clone(CLASS_ALLOCATIONS_MOCK),
    subjectAllocations: clone(SUBJECT_ALLOCATIONS_MOCK),
    students: clone(STUDENT_ROSTER_MOCK),
    timetable: clone(TIMETABLE_MOCK),
    attendanceSessions: clone(ATTENDANCE_SESSIONS_MOCK),
    internalAssessments: clone(INTERNAL_ASSESSMENTS_MOCK),
    assignments: clone(ASSIGNMENTS_MOCK),
    assignmentSubmissions: clone(ASSIGNMENT_SUBMISSIONS_MOCK),
    learningMaterials: clone(LEARNING_MATERIALS_MOCK),
    quizzes: clone(QUIZZES_MOCK),
    quizSubmissions: clone(QUIZ_SUBMISSIONS_MOCK),
    examDuties: clone(EXAM_DUTIES_MOCK),
    campusDuties: clone(CAMPUS_DUTIES_MOCK),
    examSchedule: clone(EXAM_SCHEDULE_MOCK),
    resultEntries: clone(RESULT_ENTRIES_MOCK),
    mentees: clone(MENTEES_MOCK),
    mentoringSessions: clone(MENTORING_SESSIONS_MOCK),
    logBookEntries: clone(LOGBOOK_ENTRIES_MOCK),
    studentLogReviews: clone(STUDENT_LOG_REVIEWS_MOCK),
    departmentFacultyLoad: clone(DEPARTMENT_FACULTY_LOAD_MOCK),
    teacherLeaveRequests: clone(TEACHER_LEAVE_REQUESTS_MOCK),
    studentLeaveRequests: clone(STUDENT_LEAVE_REQUESTS_MOCK),
    notifications: clone(NOTIFICATIONS_MOCK),
    announcements: clone(ANNOUNCEMENTS_MOCK),
  }
}

let store: TeacherSessionStore = createInitialStore()

export async function resetTeacherMockSession(): Promise<void> {
  store = createInitialStore()
}

function formatSlugName(slug?: string | any): string {
  const str = typeof slug === "string" ? slug : slug?.slug || "demo-school"
  return str
    .split("-")
    .filter(Boolean)
    .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function resolveInstitution(slug?: string | any): Institution {
  const normSlug = typeof slug === "string" ? slug : slug?.slug || store.institution.slug
  if (!normSlug || normSlug === store.institution.slug) {
    return clone(store.institution)
  }
  return {
    ...clone(store.institution),
    slug: normSlug,
    name: formatSlugName(normSlug),
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
  const normSlug = typeof slug === "string" ? slug : slug?.slug || "demo-school"
  await delay(60)
  const institution = resolveInstitution(normSlug)
  const academicYears = clone(store.academicYears)
  const currentAcademicYear =
    academicYears.find((y) => y.name === academicYearName) ??
    academicYears.find((y) => y.isCurrent) ??
    academicYears[0]

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
  const normSlug = typeof slug === "string" ? (slug.trim() || "demo-school") : (slug?.slug || "demo-school")
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
      const targetYearId = academicYearId ?? currentAY?.id ?? store.academicYears[0]?.id

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

      const latestAttendance = store.attendanceSessions[0]
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
        recentAttendance: clone(store.attendanceSessions.slice(0, 5)),
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
  const normSlug = typeof slug === "string" ? (slug.trim() || "demo-school") : (slug?.slug || "demo-school")
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

      const slots =
        data.todayTimetable.length > 0
          ? data.todayTimetable
          : store.timetable.filter((s) => s.day === "Monday")

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
    isClassTeacher: true,
    classTeacherOf: "Class 10 - A",
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

  store.profile = { ...store.profile, ...patch }
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
  const academicYearId = currentAY?.id ?? "ay_demo_2026_27"

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

  // If no slots exist, populate baseline classes
  if (classMap.size === 0) {
    classMap.set("1-A", { courseId: "course_demo_cls_10", semester: 1, section: "A", roomNo: "B-204" })
    classMap.set("1-B", { courseId: "course_demo_cls_10", semester: 1, section: "B", roomNo: "B-205" })
    classMap.set("2-A", { courseId: "course_demo_cls_11", semester: 2, section: "A", roomNo: "C-102" })
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
    const isClassTeacher = item.semester === 1 && item.section === "A"

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
  const academicYearId = currentAY?.id ?? "ay_demo_2026_27"

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

  // Fallback to standard 3 baseline allocations if slots not populated
  if (results.length === 0) {
    results.push(
      {
        id: "sa-10a-math",
        institutionId,
        academicYearId,
        teacherId: teacher.id,
        classId: "cls-10",
        className: "Class 10",
        sectionId: "sec-10a",
        section: "A",
        subjectId: "sub_demo_math_10",
        subjectCode: "MATH-10",
        subjectName: "Mathematics",
        weeklyHours: 6,
        syllabusCompletionPercent: 74,
      },
      {
        id: "sa-10b-math",
        institutionId,
        academicYearId,
        teacherId: teacher.id,
        classId: "cls-10",
        className: "Class 10",
        sectionId: "sec-10b",
        section: "B",
        subjectId: "sub_demo_math_10",
        subjectCode: "MATH-10",
        subjectName: "Mathematics",
        weeklyHours: 6,
        syllabusCompletionPercent: 70,
      },
      {
        id: "sa-11a-math",
        institutionId,
        academicYearId,
        teacherId: teacher.id,
        classId: "cls-11",
        className: "Class 11",
        sectionId: "sec-11a",
        section: "A",
        subjectId: "sub_demo_math_11",
        subjectCode: "MATH-041",
        subjectName: "Core Mathematics",
        weeklyHours: 6,
        syllabusCompletionPercent: 62,
      }
    )
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
  const academicYearId = currentAY?.id ?? "ay_demo_2026_27"

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

  // If no slots found in database, fallback to mock timetable
  if (slots.length === 0) {
    const items = day
      ? store.timetable.filter((slot) => slot.day === day)
      : store.timetable
    return clone(items.sort((a, b) => a.period - b.period))
  }

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
  sectionId: string,
  searchQuery?: string,
  institutionId?: string
): Promise<StudentRosterItem[]> {
  const activeTenantId =
    (typeof institutionId === "string" && institutionId.trim().length > 0 ? institutionId.trim() : undefined) ??
    (await resolveActiveTeacher()).institutionId

  const isCacheable = !searchQuery?.trim()
  const cacheKey = `${activeTenantId}|${sectionId}`
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
      const { semester, section, grade } = parseSectionId(sectionId)
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

      // If no DB students found matching query, check store fallback to avoid blank screens
      if (roster.length === 0 && !searchQuery) {
        const fallbackFiltered = store.students.filter(
          (s) => s.sectionId === sectionId || s.sectionId === normalizedSectionId
        )
        if (fallbackFiltered.length > 0) {
          const res = clone(fallbackFiltered)
          if (isCacheable) {
            sectionRosterCache.set(cacheKey, { data: res, timestamp: Date.now() })
          }
          return res
        }
      }

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
  const activeTenantId =
    filters?.institutionId ?? (await resolveActiveTeacher()).institutionId

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
      teacherId: "teacher_demo_042",
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
          actorId: "teacher_demo_042",
          actorName: "Dr. Ananya Sharma",
          action: "submitted",
          summary: `Submitted attendance: ${presentCount} present, ${absentCount} absent, ${lateCount} late, ${onDutyCount} on-duty.`,
        },
      ],
    })
  }

  // Merge live database sessions with store.attendanceSessions
  const mergedMap = new Map<string, AttendanceSession>()
  for (const s of store.attendanceSessions) {
    mergedMap.set(`${s.date}-${s.sectionId}-${s.period ?? 1}`, s)
  }
  for (const s of liveSessions) {
    mergedMap.set(`${s.date}-${s.sectionId}-${s.period ?? 1}`, s)
  }

  const all = Array.from(mergedMap.values()).sort(
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
  const existingBySlotIndex = store.attendanceSessions.findIndex(
    (s) =>
      (input.sessionId && s.id === input.sessionId) ||
      (s.sectionId === input.sectionId &&
        s.date === input.date &&
        (s.period ?? 1) === (input.period ?? 1))
  )

  const existing =
    existingBySlotIndex >= 0
      ? store.attendanceSessions[existingBySlotIndex]
      : undefined

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

  const records: AttendanceRecord[] = input.records.map((rec, idx) => ({
    id: `${sessionId}-rec-${idx + 1}`,
    sessionId,
    studentId: rec.studentId,
    rollNo: rec.rollNo,
    studentName: rec.studentName,
    status: rec.status,
    remarks: rec.remarks,
    markedAt: nowIso,
  }))

  const isCorrection = existing?.status === "submitted"
  const auditEntry: AttendanceAuditEntry = {
    id: `${sessionId}-aud-${Date.now()}`,
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
        status: "ACTIVE",
      },
    })
    const enrollmentMap = new Map(enrollments.map((e: any) => [e.studentId, e.id]))

    let subjectId = input.subjectId
    if (!subjectId) {
      const subj = await tx.subjects.findFirst({
        where: { institutionId: activeTenantId },
        orderBy: { createdAt: "asc" },
      })
      subjectId = subj?.id ?? "sub_demo_math_10"
    }

    // Delete prior entries for these students on this date to ensure idempotency
    await tx.attendance_records.deleteMany({
      where: {
        institutionId: activeTenantId,
        studentId: { in: input.records.map((r) => r.studentId) },
        date: sessionDate,
      },
    })

    // Batch create live attendance records
    const dbRecordsToCreate = input.records.map((r) => ({
      id: `att-rec-${r.studentId}-${input.date.replace(/-/g, "")}-p${input.period ?? 1}`,
      institutionId: activeTenantId,
      studentId: r.studentId,
      enrollmentId: enrollmentMap.get(r.studentId) ?? `enr-${r.studentId}`,
      subjectId,
      date: sessionDate,
      status: r.status.toUpperCase(),
      remarks: r.remarks ?? null,
      recordedAt: new Date(),
    }))

    await tx.attendance_records.createMany({
      data: dbRecordsToCreate,
    })

    // Create audit log
    await tx.audit_logs.create({
      data: {
        id: `aud-${sessionId}-${Date.now()}`,
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

  if (existingBySlotIndex >= 0) {
    store.attendanceSessions[existingBySlotIndex] = updatedSession
  } else {
    store.attendanceSessions.unshift(updatedSession)
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
        },
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

  const approvalMap = new Map<string, any>(
    dbApprovalRequests.map((apr: any) => [apr.id.replace("apr-ia-", ""), apr])
  )

  // Sync database state into in-memory assessments
  if (dbAssessmentRecords.length > 0) {
    for (const ia of store.internalAssessments) {
      const matchingApr: any = approvalMap.get(ia.id)
      if (matchingApr) {
        if (matchingApr.status === "APPROVED") {
          ia.status = "approved"
        } else if (matchingApr.status === "RETURNED") {
          ia.status = "returned"
          ia.correctionNote = matchingApr.adminRemarks ?? undefined
        } else if (matchingApr.status === "PENDING") {
          ia.status = "submitted"
        }
      }

      // Sync marks from assessment_records
      const recsForIa = dbAssessmentRecords.filter(
        (r: any) =>
          r.assessmentName === ia.title ||
          r.id.startsWith(`rec-${ia.id}-`)
      )
      if (recsForIa.length > 0) {
        const markMap = new Map<string, any>(recsForIa.map((r: any) => [r.studentId, r]))
        ia.marks = ia.marks.map((m) => {
          const dbRec: any = markMap.get(m.studentId)
          if (!dbRec) return m
          return {
            ...m,
            obtainedMarks: dbRec.remarks === "ABSENT" ? null : dbRec.marksObtained,
            isAbsent: dbRec.remarks === "ABSENT",
            status: ia.status,
          }
        })
      }
    }
  }

  return clone(
    store.internalAssessments.filter((ia) => {
      if (filters?.sectionId && ia.sectionId !== filters.sectionId) return false
      if (filters?.subjectId && ia.subjectId !== filters.subjectId) return false
      return true
    })
  )
}

export async function saveIAMarks(
  input: SaveIAMarksInput
): Promise<InternalAssessment> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const index = store.internalAssessments.findIndex(
    (ia) => ia.id === input.assessmentId
  )
  if (index === -1) {
    throw new Error(`Internal assessment "${input.assessmentId}" not found.`)
  }

  const assessment = store.internalAssessments[index]
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
      const recordId = `rec-${input.assessmentId}-${mark.studentId}`
      const isAbsent = Boolean(mark.isAbsent)
      const obtained = isAbsent ? 0 : (mark.obtainedMarks ?? 0)
      const remarks = isAbsent ? "ABSENT" : (mark.remarks ?? null)

      await tx.assessment_records.upsert({
        where: { id: recordId },
        update: {
          marksObtained: obtained,
          remarks,
          weightage: assessment.weightagePercent,
        },
        create: {
          id: recordId,
          institutionId: activeTenantId,
          studentId: mark.studentId,
          enrollmentId: enrollmentMap.get(mark.studentId) ?? `enr-${mark.studentId}`,
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

  store.internalAssessments[index] = updatedAssessment
  return clone(updatedAssessment)
}

export async function createInternalAssessment(
  input: CreateInternalAssessmentInput
): Promise<InternalAssessment> {
  await delay(140)
  const id = `ia-${input.sectionId}-${Date.now()}`
  const roster = await getSectionStudents(input.sectionId)
  const created: InternalAssessment = {
    id,
    institutionId: store.institution.id,
    academicYearId: store.academicYears[0]?.id ?? "ay-2026-27",
    teacherId: store.profile.id,
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
  store.internalAssessments.unshift(created)
  return clone(created)
}

export async function publishInternalAssessment(
  assessmentId: string
): Promise<InternalAssessment> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const idx = store.internalAssessments.findIndex((ia) => ia.id === assessmentId)
  if (idx === -1) {
    throw new Error(`Internal assessment "${assessmentId}" not found.`)
  }
  const current = store.internalAssessments[idx]

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
        id: `aud-pub-${assessmentId}-${Date.now()}`,
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
  store.internalAssessments[idx] = updated
  return clone(updated)
}

export async function requestIACorrection(
  assessmentId: string,
  correctionNote: string
): Promise<InternalAssessment> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const idx = store.internalAssessments.findIndex((ia) => ia.id === assessmentId)
  if (idx === -1) {
    throw new Error(`Internal assessment "${assessmentId}" not found.`)
  }
  const current = store.internalAssessments[idx]

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
        id: `aud-ret-${assessmentId}-${Date.now()}`,
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
  store.internalAssessments[idx] = updated
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
    const rawSubmissions = dbAsg.assignment_submissions || []
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
      academicYearId: "ay_demo_2026_27",
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

  // Deduplicate and merge with store.assignments
  const liveMap = new Map<string, Assignment>()
  for (const asg of liveAssignments) {
    liveMap.set(asg.id, asg)
  }
  for (const storeAsg of store.assignments) {
    if (!liveMap.has(storeAsg.id)) {
      liveMap.set(storeAsg.id, storeAsg)
    }
  }

  const merged = Array.from(liveMap.values())
  store.assignments = merged

  const filtered = sectionId
    ? merged.filter((a) => a.sectionId === sectionId)
    : merged

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
  }

  if (dbSubmissions.length > 0) {
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

    // Sync into store
    for (const sub of liveSubs) {
      const idx = store.assignmentSubmissions.findIndex((x) => x.id === sub.id)
      if (idx >= 0) {
        store.assignmentSubmissions[idx] = sub
      } else {
        store.assignmentSubmissions.push(sub)
      }
    }

    return clone(liveSubs)
  }

  // Fallback if not found in DB: check store or seed dynamically
  const existingInStore = store.assignmentSubmissions.filter(
    (s) => s.assignmentId === assignmentId
  )
  if (existingInStore.length > 0) {
    return clone(existingInStore)
  }

  const assignment = store.assignments.find((a) => a.id === assignmentId)
  if (!assignment) return []
  const roster = store.students.filter(
    (s) => s.sectionId === assignment.sectionId
  )
  const seeded: AssignmentSubmission[] = roster.map((student, idx) => {
    const isSubmitted = idx < assignment.submittedCount
    const isGraded = idx < assignment.gradedCount
    const isLate = isSubmitted && idx === assignment.submittedCount - 1
    return {
      id: `sub-${assignmentId}-${idx + 1}`,
      assignmentId,
      studentId: student.studentId,
      rollNo: student.rollNo,
      studentName: student.fullName,
      submittedAt: isSubmitted ? "2026-11-11T16:15:00+05:30" : undefined,
      fileName: isSubmitted
        ? `${student.rollNo}_${assignment.title.slice(0, 14).replace(/\s+/g, "_")}.pdf`
        : undefined,
      fileUrl: isSubmitted
        ? `/uploads/assignments/${student.rollNo}_submission.pdf`
        : undefined,
      status: !isSubmitted
        ? "pending"
        : isGraded
          ? "graded"
          : isLate
            ? "late"
            : "submitted",
      obtainedMarks: isGraded
        ? Math.min(
            assignment.maxMarks,
            Math.max(10, Math.round((student.iaAverage / 100) * assignment.maxMarks))
          )
        : null,
      feedback: isGraded ? "Well structured solution steps." : undefined,
      gradedAt: isGraded ? "2026-11-12T10:00:00+05:30" : undefined,
    }
  })
  store.assignmentSubmissions.push(...seeded)
  return clone(seeded)
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
    academicYearId: "ay_demo_2026_27",
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

  store.assignments.unshift(created)
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

    // Sync in store
    const storeIdx = store.assignmentSubmissions.findIndex((s) => s.id === submissionId)
    if (storeIdx >= 0) {
      store.assignmentSubmissions[storeIdx] = updated
    } else {
      store.assignmentSubmissions.push(updated)
    }

    const asgIdx = store.assignments.findIndex((a) => a.id === updated.assignmentId)
    if (asgIdx >= 0) {
      const prevGraded = store.assignments[asgIdx].gradedCount
      store.assignments[asgIdx] = {
        ...store.assignments[asgIdx],
        gradedCount: prevGraded + 1,
      }
    }

    return clone(updated)
  }

  // Fallback to store if not in DB
  const idx = store.assignmentSubmissions.findIndex((s) => s.id === submissionId)
  if (idx === -1) {
    throw new Error(`Submission "${submissionId}" not found.`)
  }

  const prev = store.assignmentSubmissions[idx]
  const wasGraded = prev.status === "graded"

  const updated: AssignmentSubmission = {
    ...prev,
    obtainedMarks,
    feedback: feedback ?? prev.feedback,
    status: "graded",
    gradedAt: new Date().toISOString(),
  }
  store.assignmentSubmissions[idx] = updated

  if (!wasGraded) {
    const asgIdx = store.assignments.findIndex((a) => a.id === updated.assignmentId)
    if (asgIdx >= 0) {
      store.assignments[asgIdx] = {
        ...store.assignments[asgIdx],
        gradedCount: store.assignments[asgIdx].gradedCount + 1,
      }
    }
  }

  return clone(updated)
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
      academicYearId: "ay_demo_2026_27",
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

  // Merge with store.learningMaterials
  const liveMap = new Map<string, LearningMaterial>()
  for (const item of liveMaterials) {
    liveMap.set(item.id, item)
  }
  for (const item of store.learningMaterials) {
    if (!liveMap.has(item.id)) {
      liveMap.set(item.id, item)
    }
  }

  const merged = Array.from(liveMap.values())
  store.learningMaterials = merged

  const filtered = merged.filter((item) => {
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
    academicYearId: "ay_demo_2026_27",
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

  store.learningMaterials.unshift(created)
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

  store.learningMaterials = store.learningMaterials.filter(
    (m) => m.id !== materialId
  )
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
      academicYearId: "ay_demo_2026_27",
      teacherId: teacher.id,
      classId: sub?.courseId ?? "cls-10",
      className: course?.name || "Class 10",
      sectionId: sectionId || "sec-10a",
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

  // Merge with store.quizzes
  const liveMap = new Map<string, Quiz>()
  for (const q of liveQuizzes) {
    liveMap.set(q.id, q)
  }
  for (const q of store.quizzes) {
    if (!liveMap.has(q.id)) {
      liveMap.set(q.id, q)
    }
  }

  const merged = Array.from(liveMap.values())
  store.quizzes = merged

  const filtered = sectionId
    ? merged.filter((q) => q.sectionId === sectionId)
    : merged

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

    // Sync into store
    for (const sub of liveSubs) {
      const idx = store.quizSubmissions.findIndex((s) => s.id === sub.id)
      if (idx >= 0) {
        store.quizSubmissions[idx] = sub
      } else {
        store.quizSubmissions.push(sub)
      }
    }

    return clone(liveSubs)
  }

  return clone(store.quizSubmissions.filter((s) => s.quizId === quizId))
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
    academicYearId: "ay_demo_2026_27",
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

  store.quizzes.unshift(created)
  return clone(created)
}

export async function updateQuizStatus(
  quizId: string,
  status: Quiz["status"]
): Promise<Quiz> {
  const idx = store.quizzes.findIndex((q) => q.id === quizId)
  if (idx === -1) {
    throw new Error(`Quiz "${quizId}" not found.`)
  }
  store.quizzes[idx] = { ...store.quizzes[idx], status }
  return clone(store.quizzes[idx])
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
      students: true,
      quizzes: true,
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

    const idx = store.quizSubmissions.findIndex((s) => s.id === submissionId)
    if (idx >= 0) {
      store.quizSubmissions[idx] = updated
    } else {
      store.quizSubmissions.push(updated)
    }

    return clone(updated)
  }

  const idx = store.quizSubmissions.findIndex((s) => s.id === submissionId)
  if (idx === -1) {
    throw new Error(`Quiz submission "${submissionId}" not found.`)
  }
  const updated: QuizSubmission = {
    ...store.quizSubmissions[idx],
    score,
    feedback: feedback ?? store.quizSubmissions[idx].feedback,
    status: "graded",
  }
  store.quizSubmissions[idx] = updated
  return clone(updated)
}

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
    const institutionId = (input.get("institutionId") as string) || "inst_demo_school"
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

  const liveDuties: ExamDuty[] = dbSlots.map((slot: any) => {
    const isMorning =
      slot.startTime.includes("09:") ||
      slot.startTime.includes("10:") ||
      slot.startTime.toUpperCase().includes("AM")
    const sched = slot.examSchedule ?? slot.exam_schedules

    return {
      id: `duty-${slot.id}`,
      institutionId: activeTenantId,
      academicYearId: "ay_demo_2026_27",
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

  const dutyMap = new Map<string, ExamDuty>()
  for (const d of liveDuties) {
    dutyMap.set(d.id, d)
  }
  for (const d of store.examDuties) {
    if (!dutyMap.has(d.id)) {
      dutyMap.set(d.id, d)
    }
  }

  const merged = Array.from(dutyMap.values())
  store.examDuties = merged
  return clone(merged)
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

  const schedMap = new Map<string, ExamScheduleItem>()
  for (const s of liveSchedule) {
    schedMap.set(s.id, s)
  }
  for (const s of store.examSchedule) {
    if (!schedMap.has(s.id)) {
      schedMap.set(s.id, s)
    }
  }

  const merged = Array.from(schedMap.values())
  store.examSchedule = merged
  return clone(merged)
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

  const idx = store.examDuties.findIndex((d) => d.id === dutyId)
  if (idx >= 0) {
    const updated: ExamDuty = {
      ...store.examDuties[idx],
      status: "completed",
      hallAttendance: log,
    }
    store.examDuties[idx] = updated
    return clone(updated)
  }

  const duty: ExamDuty = {
    id: dutyId,
    institutionId: activeTenantId,
    academicYearId: "ay_demo_2026_27",
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
  store.examDuties.push(duty)
  return clone(duty)
}

export async function getCampusDuties(): Promise<CampusDuty[]> {
  await delay(60)
  return clone(store.campusDuties)
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
          academicYearId: "ay_demo_2026_27",
          teacherId: teacher.id,
          examName: fSched?.title ?? "Final Exam",
          classId: fSub?.courseId ?? "cls-10",
          className: fCourse?.name || "Class 10",
          sectionId: "sec-10a",
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

    const entryMap = new Map<string, ResultEntry>()
    for (const e of liveEntries) {
      entryMap.set(e.id, e)
    }
    for (const e of store.resultEntries) {
      if (!entryMap.has(e.id)) {
        entryMap.set(e.id, e)
      }
    }

    const merged = Array.from(entryMap.values())
    store.resultEntries = merged
    return clone(merged)
  }

  return clone(store.resultEntries)
}

export async function saveResultMarks(
  input: SaveResultMarksInput
): Promise<ResultEntry> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const idx = store.resultEntries.findIndex((r) => r.id === input.resultEntryId)
  if (idx === -1) {
    throw new Error(`Result entry "${input.resultEntryId}" not found.`)
  }

  const entry = store.resultEntries[idx]
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
    const total =
      theory !== null && practical !== null
        ? theory + practical
        : theory !== null
          ? theory
          : null
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
    for (const r of updatedRows) {
      const isAbsent = r.isAbsent || r.totalMarks === null
      const total = isAbsent ? 0 : r.totalMarks ?? 0
      const grade = r.grade || (isAbsent ? "AB" : "E")
      const gradePoint =
        grade === "A1" ? 10 : grade === "A2" ? 9 : grade === "B1" ? 8 : grade === "B2" ? 7 : 6

      await tx.exam_results.upsert({
        where: { id: `res-midterm-${r.studentId}` },
        update: {
          internalMarks: r.practicalMarks ?? 0,
          externalMarks: r.theoryMarks ?? 0,
          totalMarks: total,
          grade,
          gradePoint,
          isPassed: !isAbsent && total >= 33,
        },
        create: {
          id: `res-midterm-${r.studentId}`,
          institutionId: activeTenantId,
          examScheduleId: "es-midterm-2026",
          studentId: r.studentId,
          subjectId: entry.subjectId,
          internalMarks: r.practicalMarks ?? 0,
          externalMarks: r.theoryMarks ?? 0,
          totalMarks: total,
          maxMarks: entry.maxTotalMarks,
          grade,
          gradePoint,
          credits: 4,
          isPassed: !isAbsent && total >= 33,
        },
      })
    }

    await tx.approval_requests.upsert({
      where: { id: `apr-res-${input.resultEntryId}` },
      update: {
        status: input.entryStatus ? input.entryStatus.toUpperCase() : "PENDING",
        requestedDataJson: JSON.stringify({
          resultEntryId: input.resultEntryId,
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

  store.resultEntries[idx] = updatedEntry
  return clone(updatedEntry)
}

export async function publishResultEntry(
  resultEntryId: string,
  publicationStatus: ResultEntry["publicationStatus"],
  entryStatus?: ApprovalStatus
): Promise<ResultEntry> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const idx = store.resultEntries.findIndex((r) => r.id === resultEntryId)
  if (idx === -1) {
    throw new Error(`Result entry "${resultEntryId}" not found.`)
  }
  const current = store.resultEntries[idx]

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
  store.resultEntries[idx] = updated
  return clone(updated)
}

// ---------------------------------------------------------------------------
// Mentorship
// ---------------------------------------------------------------------------
export async function getMentees(): Promise<Mentee[]> {
  const { teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

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
          academicYearId: "ay_demo_2026_27",
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
            phone: guardian?.phone || student.emergencyContact || "+91 98765 43210",
            relation: "Guardian",
          },
          lastSessionDate: latestPublic?.sessionDate.toISOString().slice(0, 10),
          notesSummary: latestPublic?.topicsDiscussed,
          confidentialNotes: latestPrivate?.mentorNotes ?? undefined,
        }
      }
    )

    const menteeMap = new Map<string, Mentee>()
    for (const m of liveMentees) {
      menteeMap.set(m.id, m)
    }
    for (const m of store.mentees) {
      if (!menteeMap.has(m.id)) {
        menteeMap.set(m.id, m)
      }
    }

    const merged = Array.from(menteeMap.values())
    store.mentees = merged
    return clone(merged)
  }

  return clone(store.mentees)
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

    const sessMap = new Map<string, MentoringSession>()
    for (const s of liveSessions) {
      sessMap.set(s.id, s)
    }
    for (const s of store.mentoringSessions) {
      if (!sessMap.has(s.id)) {
        sessMap.set(s.id, s)
      }
    }

    const merged = Array.from(sessMap.values())
    store.mentoringSessions = merged
    const filtered = menteeId
      ? merged.filter((s) => s.menteeId === menteeId || s.studentId === targetStudentId)
      : merged
    return clone(filtered)
  }

  const items = menteeId
    ? store.mentoringSessions.filter((s) => s.menteeId === menteeId)
    : store.mentoringSessions
  return clone(items)
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

  store.mentoringSessions.unshift(created)

  const menteeIdx = store.mentees.findIndex((m) => m.id === input.menteeId)
  if (menteeIdx >= 0) {
    store.mentees[menteeIdx] = {
      ...store.mentees[menteeIdx],
      lastSessionDate: input.sessionDate,
      notesSummary: input.topic,
    }
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

  const idx = store.mentees.findIndex((m) => m.id === menteeId)
  if (idx >= 0) {
    store.mentees[idx] = {
      ...store.mentees[idx],
      confidentialNotes: note,
    }
    return clone(store.mentees[idx])
  }

  throw new Error(`Mentee "${menteeId}" not found.`)
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

  const idx = store.mentees.findIndex((m) => m.id === menteeId)
  if (idx >= 0) {
    const updated: Mentee = {
      ...store.mentees[idx],
      escalated: true,
      escalationReason: reason,
      riskLevel: "at_risk",
    }
    store.mentees[idx] = updated
    return clone(updated)
  }

  throw new Error(`Mentee "${menteeId}" not found.`)
}

// ---------------------------------------------------------------------------
// Teacher Logbook
// ---------------------------------------------------------------------------
export async function getLogBookEntries(
  filters?: { subjectId?: string } | string
): Promise<LogBookEntry[]> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

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
        academicYearId: "ay_demo_2026_27",
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

  const logMap = new Map<string, LogBookEntry>()
  for (const e of liveEntries) {
    logMap.set(e.id, e)
  }
  for (const e of store.logBookEntries) {
    if (!logMap.has(e.id)) {
      logMap.set(e.id, e)
    }
  }

  const merged = Array.from(logMap.values())
  store.logBookEntries = merged

  if (typeof filters === "string") {
    return clone(merged.filter((entry) => entry.section === filters))
  }
  if (filters?.subjectId) {
    return clone(merged.filter((entry) => entry.subjectId === filters.subjectId))
  }
  return clone(merged)
}

export async function createLogBookEntry(
  input: CreateLogBookEntryInput
): Promise<LogBookEntry> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

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
    academicYearId: "ay_demo_2026_27",
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

  store.logBookEntries.unshift(created)
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

    const revMap = new Map<string, StudentLogReview>()
    for (const r of liveReviews) {
      revMap.set(r.id, r)
    }
    for (const r of store.studentLogReviews) {
      if (!revMap.has(r.id)) {
        revMap.set(r.id, r)
      }
    }

    const merged = Array.from(revMap.values())
    store.studentLogReviews = merged
    return clone(merged)
  }

  return clone(store.studentLogReviews)
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

  const idx = store.studentLogReviews.findIndex((r) => r.id === reviewId)
  if (idx >= 0) {
    const updated: StudentLogReview = {
      ...store.studentLogReviews[idx],
      teacherRemarks: remarks ?? store.studentLogReviews[idx].teacherRemarks,
      status: decision === "approved" ? "locked" : "returned",
    }
    store.studentLogReviews[idx] = updated
    return clone(updated)
  }

  throw new Error(`Student log review "${reviewId}" not found.`)
}

// ---------------------------------------------------------------------------
// Leave Requests (Teacher & Student)
// ---------------------------------------------------------------------------
export async function getTeacherLeaveRequests(): Promise<TeacherLeaveRequest[]> {
  const { user, teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

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
        academicYearId: "ay_demo_2026_27",
        teacherId: teacher.id,
        teacherName: user.fullName || "Dr. Ananya Sharma",
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

  const leaveMap = new Map<string, TeacherLeaveRequest>()
  for (const l of liveLeaves) {
    leaveMap.set(l.id, l)
  }
  for (const l of store.teacherLeaveRequests) {
    if (!leaveMap.has(l.id)) {
      leaveMap.set(l.id, l)
    }
  }

  const merged = Array.from(leaveMap.values())
  store.teacherLeaveRequests = merged
  return clone(merged)
}

export async function createTeacherLeaveRequest(
  input: CreateTeacherLeaveInput
): Promise<TeacherLeaveRequest> {
  const { user, teacher, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

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
        teacherName: user.fullName || "Dr. Ananya Sharma",
      }),
    },
  })

  const created: TeacherLeaveRequest = {
    id,
    institutionId: activeTenantId,
    academicYearId: "ay_demo_2026_27",
    teacherId: teacher.id,
    teacherName: user.fullName || "Dr. Ananya Sharma",
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

  store.teacherLeaveRequests.unshift(created)
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

  const idx = store.teacherLeaveRequests.findIndex((r) => r.id === requestId)
  if (idx >= 0) {
    const updated: TeacherLeaveRequest = {
      ...store.teacherLeaveRequests[idx],
      status: decision,
      reviewedBy: user.fullName || "Dr. Ananya Sharma (HoD)",
      reviewerRemarks: reviewerRemarks ?? store.teacherLeaveRequests[idx].reviewerRemarks,
      substituteTeacherName: substituteTeacherName || store.teacherLeaveRequests[idx].substituteTeacherName || "Prof. Rajesh Verma",
    }
    store.teacherLeaveRequests[idx] = updated
    return clone(updated)
  }

  throw new Error(`Teacher leave request "${requestId}" not found.`)
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
        academicYearId: "ay_demo_2026_27",
        studentId: data.studentId,
        rollNo: data.rollNo,
        studentName: data.studentName,
        className: data.className || "Class 10",
        section: data.section || "A",
        leaveType: data.leaveType || "Medical",
        fromDate: data.fromDate,
        toDate: data.toDate,
        daysCount: data.daysCount,
        reason: data.reason,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        appliedAt: r.createdAt.toISOString().slice(0, 10),
        status: (r.status.toLowerCase() as StudentLeaveRequest["status"]) || "pending",
        reviewedBy: r.reviewedAt ? "Dr. Ananya Sharma (Class Teacher)" : undefined,
        reviewerRemarks: r.adminRemarks ?? undefined,
      })
    } catch {}
  }

  const map = new Map<string, StudentLeaveRequest>()
  for (const l of liveLeaves) {
    map.set(l.id, l)
  }
  for (const l of store.studentLeaveRequests) {
    if (!map.has(l.id)) {
      map.set(l.id, l)
    }
  }

  const merged = Array.from(map.values())
  store.studentLeaveRequests = merged

  const filtered = status ? merged.filter((req) => req.status === status) : merged
  return clone(filtered)
}

export async function reviewStudentLeaveRequest(
  requestId: string,
  decision: "approved" | "rejected",
  reviewerRemarks?: string
): Promise<StudentLeaveRequest> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const idx = store.studentLeaveRequests.findIndex((r) => r.id === requestId)
  const leaveReq = idx >= 0 ? store.studentLeaveRequests[idx] : null

  // Approving student leave and updating attendance records must run in one atomic DB transaction
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.approval_requests.updateMany({
        where: { id: requestId, institutionId: activeTenantId },
        data: {
          status: decision === "approved" ? "APPROVED" : "REJECTED",
          adminRemarks: reviewerRemarks,
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      })

      if (decision === "approved" && leaveReq) {
        await tx.attendance_records.updateMany({
          where: {
            studentId: leaveReq.studentId,
            status: "ABSENT",
          },
          data: {
            status: "PRESENT",
            remarks: `On-Duty / Leave Approved: ${leaveReq.reason}`,
          },
        })
      }
    })
  } catch (err) {
    console.warn("[reviewStudentLeaveRequest] DB transaction notice:", err)
  }

  if (idx >= 0 && leaveReq) {
    const updated: StudentLeaveRequest = {
      ...leaveReq,
      status: decision,
      reviewedBy: user.fullName || "Dr. Ananya Sharma",
      reviewerRemarks: reviewerRemarks ?? leaveReq.reviewerRemarks,
    }
    store.studentLeaveRequests[idx] = updated

    if (decision === "approved") {
      const student = store.students.find(
        (s: StudentRosterItem) => s.studentId === leaveReq.studentId || s.rollNo === leaveReq.rollNo
      )
      if (student && student.attendancePercent !== null && student.attendancePercent < 98) {
        student.attendancePercent = Math.min(100, student.attendancePercent + 2)
      }
    }

    return clone(updated)
  }

  throw new Error(`Student leave request "${requestId}" not found.`)
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

  const map = new Map<string, NotificationItem>()
  for (const n of liveNotifs) {
    map.set(n.id, n)
  }
  for (const n of store.notifications) {
    if (!map.has(n.id)) {
      map.set(n.id, n)
    }
  }

  const merged = Array.from(map.values())
  store.notifications = merged
  return clone(merged)
}

export async function markNotificationRead(
  notificationId: string
): Promise<NotificationItem[]> {
  const { user } = await resolveActiveTeacher()

  await prisma.notificationRecipient.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { isRead: true, readAt: new Date() },
  })

  store.notifications = store.notifications.map((n) =>
    n.id === notificationId ? { ...n, isRead: true } : n
  )
  return clone(store.notifications)
}

export async function markAllNotificationsRead(): Promise<NotificationItem[]> {
  const { user } = await resolveActiveTeacher()

  await prisma.notificationRecipient.updateMany({
    where: { userId: user.id },
    data: { isRead: true, readAt: new Date() },
  })

  store.notifications = store.notifications.map((n) => ({
    ...n,
    isRead: true,
  }))
  return clone(store.notifications)
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
  }

  const liveAnn: Announcement[] = dbAnnouncements.map((n: any) => ({
    id: n.id,
    institutionId: n.institutionId,
    academicYearId: "ay_demo_2026_27",
    title: n.title,
    content: n.message,
    audience: "All Staff",
    authorName: "School Administration",
    authorRole: "Principal / Academic Office",
    publishedAt: n.createdAt.toISOString().slice(0, 10),
    isPinned: false,
    priority: "normal",
  }))

  const map = new Map<string, Announcement>()
  for (const a of liveAnn) {
    map.set(a.id, a)
  }
  for (const a of store.announcements) {
    if (!map.has(a.id)) {
      map.set(a.id, a)
    }
  }

  const merged = Array.from(map.values())
  store.announcements = merged
  return clone(merged)
}

export async function createAnnouncement(
  input: CreateAnnouncementInput
): Promise<Announcement> {
  const { user, institutionId } = await resolveActiveTeacher()
  const activeTenantId = institutionId

  const id = `ann-${Date.now()}`
  await prisma.notification.create({
    data: {
      id,
      institutionId: activeTenantId,
      title: input.title,
      message: input.content,
      category: "ANNOUNCEMENT",
      audienceRole: input.audience === "All Staff" ? "STAFF" : "TEACHER",
      createdAt: new Date(),
    },
  })

  await prisma.notificationRecipient.create({
    data: {
      id: `rec-${id}-${user.id}`,
      notificationId: id,
      userId: user.id,
      isRead: false,
    },
  })

  const created: Announcement = {
    id,
    institutionId: activeTenantId,
    academicYearId: "ay_demo_2026_27",
    title: input.title,
    content: input.content,
    audience: input.audience,
    targetClasses: input.targetClasses,
    authorName: user.fullName || "Dr. Ananya Sharma",
    authorRole: "Class Teacher (10-A)",
    publishedAt: new Date().toISOString().slice(0, 10),
    isPinned: input.isPinned ?? false,
    priority: input.priority ?? "normal",
  }

  store.announcements.unshift(created)
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
      },
    })
  } catch (err) {
    console.warn("[getDepartmentFacultyLoad] DB query error:", err)
  }

  // Baseline from verified 5 faculty seeds (93 weekly hours, 79.4% avg syllabus)
  const baseline = clone(DEPARTMENT_FACULTY_LOAD_MOCK)
  const map = new Map<string, DepartmentFacultyLoad>()
  for (const l of baseline) {
    map.set(l.teacherId, l)
  }

  // Update names from DB if available
  for (const t of deptTeachers) {
    const existing = map.get(t.id)
    if (existing && t.user?.fullName) {
      existing.fullName = t.user.fullName
      if (t.designation) existing.designation = t.designation
    }
  }

  const result = Array.from(map.values())
  store.departmentFacultyLoad = result
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

  const idx = store.internalAssessments.findIndex((ia) => ia.id === assessmentId)
  if (idx === -1) {
    throw new Error(`Internal assessment "${assessmentId}" not found.`)
  }
  const current = store.internalAssessments[idx]
  const updated: InternalAssessment = {
    ...current,
    status,
    correctionNote:
      correctionNote !== undefined ? correctionNote : current.correctionNote,
    publishedToStudents:
      status === "locked" ? true : current.publishedToStudents,
    marks: current.marks.map((m) => ({ ...m, status })),
  }
  store.internalAssessments[idx] = updated
  return clone(updated)
}

