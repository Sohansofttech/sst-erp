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
  AttendanceSession,
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
  InternalAssessment,
  LearningMaterial,
  LogBookEntry,
  Mentee,
  MentoringSession,
  NotificationItem,
  Quiz,
  QuizSubmission,
  ResultEntry,
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

export function resetTeacherMockSession(): void {
  store = createInitialStore()
}

function formatSlugName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function resolveInstitution(slug?: string): Institution {
  if (!slug || slug === store.institution.slug) {
    return clone(store.institution)
  }
  return {
    ...clone(store.institution),
    slug,
    name: formatSlugName(slug),
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
  slug?: string,
  academicYearName?: string
): Promise<TenantContext> {
  await delay(60)
  const institution = resolveInstitution(slug)
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

export async function getTeacherDashboard(
  slug?: string,
  academicYearId?: string
): Promise<TeacherDashboardData> {
  await delay()
  const institution = resolveInstitution(slug)
  const targetYearId =
    academicYearId ??
    store.academicYears.find((y) => y.isCurrent)?.id ??
    store.academicYears[0]?.id

  const today = getTodayDayOfWeek()
  const todayTimetable = store.timetable
    .filter((slot) => slot.day === today)
    .sort((a, b) => a.period - b.period)

  const classAllocations = store.classAllocations.filter(
    (item) => !targetYearId || item.academicYearId === targetYearId
  )
  const subjectAllocations = store.subjectAllocations.filter(
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

  const pendingStudentLeaves = store.studentLeaveRequests.filter(
    (req) => req.status === "pending"
  )
  const pendingSubmissionsToGrade = store.assignments.reduce(
    (sum, item) => sum + Math.max(0, item.submittedCount - item.gradedCount),
    0
  )
  const unreadNotificationsCount = store.notifications.filter(
    (n) => !n.isRead
  ).length

  return {
    profile: { ...clone(store.profile), institutionId: institution.id },
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
      store.examDuties.filter((duty) => duty.status === "assigned")
    ),
    announcements: clone(store.announcements),
    notifications: clone(store.notifications),
  }
}

// ---------------------------------------------------------------------------
// Profile & Allocations
// ---------------------------------------------------------------------------
export async function getTeacherProfile(): Promise<TeacherProfile> {
  await delay(80)
  return clone(store.profile)
}

export async function updateTeacherProfile(
  patch: Partial<
    Pick<
      TeacherProfile,
      "phone" | "officeRoom" | "bio" | "specialization" | "qualification"
    >
  >
): Promise<TeacherProfile> {
  await delay()
  store.profile = { ...store.profile, ...patch }
  return clone(store.profile)
}

export async function getClassAllocations(): Promise<ClassAllocation[]> {
  await delay(80)
  return clone(store.classAllocations)
}

export async function getSubjectAllocations(): Promise<SubjectAllocation[]> {
  await delay(80)
  return clone(store.subjectAllocations)
}

// ---------------------------------------------------------------------------
// Timetable & Student Roster
// ---------------------------------------------------------------------------
export async function getTimetable(day?: DayOfWeek): Promise<TimetableSlot[]> {
  await delay(90)
  const items = day
    ? store.timetable.filter((slot) => slot.day === day)
    : store.timetable
  return clone(items.sort((a, b) => a.period - b.period))
}

export async function getSectionStudents(
  sectionId: string,
  searchQuery?: string
): Promise<StudentRosterItem[]> {
  await delay(90)
  const q = searchQuery?.trim().toLowerCase()
  const filtered = store.students.filter((student) => {
    if (student.sectionId !== sectionId) return false
    if (!q) return true
    return (
      student.fullName.toLowerCase().includes(q) ||
      student.rollNo.toLowerCase().includes(q) ||
      student.admissionNo.toLowerCase().includes(q)
    )
  })
  return clone(filtered)
}

// ---------------------------------------------------------------------------
// Attendance Sessions & Submission
// ---------------------------------------------------------------------------
export async function getAttendanceSessions(filters?: {
  sectionId?: string
  date?: string
}): Promise<AttendanceSession[]> {
  await delay(90)
  return clone(
    store.attendanceSessions.filter((session) => {
      if (filters?.sectionId && session.sectionId !== filters.sectionId) {
        return false
      }
      if (filters?.date && session.date !== filters.date) {
        return false
      }
      return true
    })
  )
}

export async function getAttendanceSession(
  sessionId: string
): Promise<AttendanceSession | null> {
  await delay(80)
  const found = store.attendanceSessions.find((s) => s.id === sessionId)
  return found ? clone(found) : null
}

export async function submitAttendance(
  input: SubmitAttendanceInput
): Promise<AttendanceSession> {
  await delay(160)
  const nowIso = new Date().toISOString()

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

  const records = input.records.map((rec, idx) => ({
    id: `${sessionId}-rec-${idx + 1}`,
    sessionId,
    studentId: rec.studentId,
    rollNo: rec.rollNo,
    studentName: rec.studentName,
    status: rec.status,
    remarks: rec.remarks,
    markedAt: nowIso,
  }))

  const presentCount = records.filter((r) => r.status === "present").length
  const absentCount = records.filter((r) => r.status === "absent").length
  const lateCount = records.filter((r) => r.status === "late").length
  const onDutyCount = records.filter((r) => r.status === "on_duty").length

  const isCorrection = existing?.status === "submitted"
  const auditEntry = {
    id: `${sessionId}-aud-${Date.now()}`,
    timestamp: nowIso,
    actorId: store.profile.id,
    actorName: store.profile.fullName,
    action: isCorrection
      ? ("updated" as const)
      : input.status === "submitted"
        ? ("submitted" as const)
        : ("updated" as const),
    summary: `${isCorrection ? "Corrected" : input.status === "submitted" ? "Submitted" : "Saved draft"}: ${presentCount} present, ${absentCount} absent, ${lateCount} late, ${onDutyCount} on-duty.`,
    reason: input.correctionReason?.trim() || undefined,
  }

  const updatedSession: AttendanceSession = {
    id: sessionId,
    institutionId: input.institutionId,
    academicYearId: input.academicYearId,
    teacherId: store.profile.id,
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

  return clone(updatedSession)
}

// ---------------------------------------------------------------------------
// Internal Assessments & Marks Entry
// ---------------------------------------------------------------------------
export async function getInternalAssessments(filters?: {
  sectionId?: string
  subjectId?: string
}): Promise<InternalAssessment[]> {
  await delay(90)
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
  await delay(160)
  const index = store.internalAssessments.findIndex(
    (ia) => ia.id === input.assessmentId
  )
  if (index === -1) {
    throw new Error(`Internal assessment "${input.assessmentId}" not found.`)
  }

  const assessment = store.internalAssessments[index]
  const nextStatus: ApprovalStatus = input.nextStatus ?? assessment.status
  const markUpdates = new Map(input.marks.map((m) => [m.studentId, m]))

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
  const roster = store.students.filter((s) => s.sectionId === input.sectionId)
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
  await delay(140)
  const idx = store.internalAssessments.findIndex((ia) => ia.id === assessmentId)
  if (idx === -1) {
    throw new Error(`Internal assessment "${assessmentId}" not found.`)
  }
  const current = store.internalAssessments[idx]
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
  await delay(130)
  const idx = store.internalAssessments.findIndex((ia) => ia.id === assessmentId)
  if (idx === -1) {
    throw new Error(`Internal assessment "${assessmentId}" not found.`)
  }
  const current = store.internalAssessments[idx]
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
// Assignments & Submissions
// ---------------------------------------------------------------------------
export async function getAssignments(sectionId?: string): Promise<Assignment[]> {
  await delay(90)
  const items = sectionId
    ? store.assignments.filter((a) => a.sectionId === sectionId)
    : store.assignments
  return clone(items)
}

export async function getAssignmentSubmissions(
  assignmentId: string
): Promise<AssignmentSubmission[]> {
  await delay(90)
  const existing = store.assignmentSubmissions.filter(
    (s) => s.assignmentId === assignmentId
  )
  if (existing.length > 0) {
    return clone(existing)
  }

  // Dynamically seed realistic rows if an assignment didn't have pre-seeded submissions yet
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
  await delay(150)
  const roster = store.students.filter((s) => s.sectionId === input.sectionId)
  const id = `asg-${input.sectionId}-${Date.now()}`
  const created: Assignment = {
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
    description: input.description,
    unit: input.unit,
    dueDate: input.dueDate,
    maxMarks: input.maxMarks,
    allowLateSubmission: input.allowLateSubmission ?? true,
    attachmentName: input.attachmentName,
    attachmentUrl: input.attachmentName
      ? `/uploads/assignments/${input.attachmentName}`
      : undefined,
    status: input.status ?? "published",
    totalStudents: roster.length,
    submittedCount: 0,
    gradedCount: 0,
    createdAt: new Date().toISOString().slice(0, 10),
  }

  store.assignments.unshift(created)

  // Seed pending submission rows for the section roster
  const newSubmissions: AssignmentSubmission[] = roster.map((student, idx) => ({
    id: `sub-${id}-${idx + 1}`,
    assignmentId: id,
    studentId: student.studentId,
    rollNo: student.rollNo,
    studentName: student.fullName,
    status: "pending",
    obtainedMarks: null,
  }))
  store.assignmentSubmissions.push(...newSubmissions)

  return clone(created)
}

export async function gradeAssignmentSubmission(
  submissionId: string,
  obtainedMarks: number,
  feedback?: string
): Promise<AssignmentSubmission> {
  await delay(140)
  const idx = store.assignmentSubmissions.findIndex(
    (s) => s.id === submissionId
  )
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
    const asgIdx = store.assignments.findIndex(
      (a) => a.id === updated.assignmentId
    )
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
  await delay(80)
  return clone(
    store.learningMaterials.filter((item) => {
      if (filters?.subjectId && item.subjectId !== filters.subjectId) {
        return false
      }
      if (filters?.unit && item.unit !== filters.unit) return false
      return true
    })
  )
}

export async function createLearningMaterial(
  input: CreateLearningMaterialInput
): Promise<LearningMaterial> {
  await delay(140)
  const created: LearningMaterial = {
    id: `lm-${Date.now()}`,
    institutionId: store.institution.id,
    academicYearId: store.academicYears[0]?.id ?? "ay-2026-27",
    teacherId: store.profile.id,
    classId: input.classId,
    className: input.className,
    section: input.section,
    subjectId: input.subjectId,
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
  await delay(100)
  store.learningMaterials = store.learningMaterials.filter(
    (m) => m.id !== materialId
  )
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------
export async function getQuizzes(sectionId?: string): Promise<Quiz[]> {
  await delay(90)
  const items = sectionId
    ? store.quizzes.filter((q) => q.sectionId === sectionId)
    : store.quizzes
  return clone(items)
}

export async function getQuizSubmissions(
  quizId: string
): Promise<QuizSubmission[]> {
  await delay(80)
  return clone(store.quizSubmissions.filter((s) => s.quizId === quizId))
}

export async function createQuiz(input: CreateQuizInput): Promise<Quiz> {
  await delay(150)
  const quizId = `quiz-${input.sectionId}-${Date.now()}`
  const roster = store.students.filter((s) => s.sectionId === input.sectionId)
  const questions = input.questions.map((q, idx) => ({
    ...q,
    id: `${quizId}-q-${idx + 1}`,
    quizId,
  }))
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0)

  const created: Quiz = {
    id: quizId,
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
    description: input.description,
    durationMinutes: input.durationMinutes,
    totalMarks,
    scheduledAt: input.scheduledAt,
    closesAt: input.closesAt,
    status: input.status ?? "draft",
    questions,
    attemptCount: 0,
    totalStudents: roster.length,
  }
  store.quizzes.unshift(created)
  return clone(created)
}

export async function updateQuizStatus(
  quizId: string,
  status: Quiz["status"]
): Promise<Quiz> {
  await delay(110)
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
  await delay(130)
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

// ---------------------------------------------------------------------------
// Exams, Invigilation Duties & Result Entries
// ---------------------------------------------------------------------------
export async function getExamDuties(): Promise<ExamDuty[]> {
  await delay(80)
  return clone(store.examDuties)
}

export async function getExamSchedule(): Promise<ExamScheduleItem[]> {
  await delay(80)
  return clone(store.examSchedule)
}

export async function getResultEntries(): Promise<ResultEntry[]> {
  await delay(90)
  return clone(store.resultEntries)
}

export async function saveResultMarks(
  input: SaveResultMarksInput
): Promise<ResultEntry> {
  await delay(160)
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

  const updatedEntry: ResultEntry = {
    ...entry,
    entryStatus: input.entryStatus ?? entry.entryStatus,
    lastUpdatedAt: new Date().toISOString(),
    rows: updatedRows,
  }

  store.resultEntries[idx] = updatedEntry
  return clone(updatedEntry)
}

// ---------------------------------------------------------------------------
// Mentorship
// ---------------------------------------------------------------------------
export async function getMentees(): Promise<Mentee[]> {
  await delay(80)
  return clone(store.mentees)
}

export async function getMentoringSessions(
  menteeId?: string
): Promise<MentoringSession[]> {
  await delay(80)
  const items = menteeId
    ? store.mentoringSessions.filter((s) => s.menteeId === menteeId)
    : store.mentoringSessions
  return clone(items)
}

export async function createMentoringSession(
  input: CreateMentoringSessionInput
): Promise<MentoringSession> {
  await delay(140)
  const menteeIdx = store.mentees.findIndex((m) => m.id === input.menteeId)
  if (menteeIdx === -1) {
    throw new Error(`Mentee "${input.menteeId}" not found.`)
  }
  const mentee = store.mentees[menteeIdx]
  const created: MentoringSession = {
    id: `ms-${Date.now()}`,
    menteeId: mentee.id,
    studentId: mentee.studentId,
    studentName: mentee.fullName,
    mentorTeacherId: store.profile.id,
    sessionDate: input.sessionDate,
    mode: input.mode,
    topic: input.topic,
    observations: input.observations,
    actionItems: input.actionItems,
    followUpDate: input.followUpDate,
    status: input.status ?? "completed",
  }

  store.mentoringSessions.unshift(created)
  store.mentees[menteeIdx] = {
    ...mentee,
    lastSessionDate: input.sessionDate,
    notesSummary: input.topic,
  }

  return clone(created)
}

// ---------------------------------------------------------------------------
// Teacher Logbook
// ---------------------------------------------------------------------------
export async function getLogBookEntries(
  sectionId?: string
): Promise<LogBookEntry[]> {
  await delay(80)
  const items = sectionId
    ? store.logBookEntries.filter((entry) => entry.section === sectionId)
    : store.logBookEntries
  return clone(items)
}

export async function createLogBookEntry(
  input: CreateLogBookEntryInput
): Promise<LogBookEntry> {
  await delay(140)
  const created: LogBookEntry = {
    id: `lb-${Date.now()}`,
    institutionId: store.institution.id,
    academicYearId: store.academicYears[0]?.id ?? "ay-2026-27",
    teacherId: store.profile.id,
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
    status: input.status ?? "submitted",
  }
  store.logBookEntries.unshift(created)
  return clone(created)
}

// ---------------------------------------------------------------------------
// Leave Requests (Teacher & Student)
// ---------------------------------------------------------------------------
export async function getTeacherLeaveRequests(): Promise<
  TeacherLeaveRequest[]
> {
  await delay(80)
  return clone(store.teacherLeaveRequests)
}

export async function createTeacherLeaveRequest(
  input: CreateTeacherLeaveInput
): Promise<TeacherLeaveRequest> {
  await delay(140)
  const created: TeacherLeaveRequest = {
    id: `tlr-${Date.now()}`,
    institutionId: store.institution.id,
    academicYearId: store.academicYears[0]?.id ?? "ay-2026-27",
    teacherId: store.profile.id,
    teacherName: store.profile.fullName,
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

export async function getStudentLeaveRequests(
  status?: StudentLeaveRequest["status"]
): Promise<StudentLeaveRequest[]> {
  await delay(80)
  const items = status
    ? store.studentLeaveRequests.filter((req) => req.status === status)
    : store.studentLeaveRequests
  return clone(items)
}

export async function reviewStudentLeaveRequest(
  requestId: string,
  decision: "approved" | "rejected",
  reviewerRemarks?: string
): Promise<StudentLeaveRequest> {
  await delay(140)
  const idx = store.studentLeaveRequests.findIndex((r) => r.id === requestId)
  if (idx === -1) {
    throw new Error(`Student leave request "${requestId}" not found.`)
  }
  const updated: StudentLeaveRequest = {
    ...store.studentLeaveRequests[idx],
    status: decision,
    reviewedBy: store.profile.fullName,
    reviewerRemarks: reviewerRemarks ?? store.studentLeaveRequests[idx].reviewerRemarks,
  }
  store.studentLeaveRequests[idx] = updated
  return clone(updated)
}

// ---------------------------------------------------------------------------
// Notifications & Announcements
// ---------------------------------------------------------------------------
export async function getNotifications(): Promise<NotificationItem[]> {
  await delay(60)
  return clone(store.notifications)
}

export async function markNotificationRead(
  notificationId: string
): Promise<NotificationItem[]> {
  await delay(60)
  store.notifications = store.notifications.map((n) =>
    n.id === notificationId ? { ...n, isRead: true } : n
  )
  return clone(store.notifications)
}

export async function markAllNotificationsRead(): Promise<NotificationItem[]> {
  await delay(60)
  store.notifications = store.notifications.map((n) => ({
    ...n,
    isRead: true,
  }))
  return clone(store.notifications)
}

export async function getAnnouncements(): Promise<Announcement[]> {
  await delay(80)
  return clone(store.announcements)
}

export async function createAnnouncement(
  input: CreateAnnouncementInput
): Promise<Announcement> {
  await delay(140)
  const created: Announcement = {
    id: `ann-${Date.now()}`,
    institutionId: store.institution.id,
    academicYearId: store.academicYears[0]?.id ?? "ay-2026-27",
    title: input.title,
    content: input.content,
    audience: input.audience,
    targetClasses: input.targetClasses,
    authorName: store.profile.fullName,
    authorRole: store.profile.isClassTeacher
      ? `Class Teacher (${store.profile.classTeacherOf})`
      : store.profile.designation,
    publishedAt: new Date().toISOString().slice(0, 10),
    isPinned: input.isPinned ?? false,
    priority: input.priority ?? "normal",
  }
  store.announcements.unshift(created)
  return clone(created)
}

// ---------------------------------------------------------------------------
// Phase 4 & 5: Exams Hall Log, Campus Duties, Results Moderation, Mentoring,
// Student Log Reviews & HoD Oversight
// ---------------------------------------------------------------------------
export async function saveExamHallLog(
  dutyId: string,
  log: NonNullable<ExamDuty["hallAttendance"]>
): Promise<ExamDuty> {
  await delay(130)
  const idx = store.examDuties.findIndex((d) => d.id === dutyId)
  if (idx === -1) {
    throw new Error(`Exam duty "${dutyId}" not found.`)
  }
  const updated: ExamDuty = {
    ...store.examDuties[idx],
    status: "completed",
    hallAttendance: log,
  }
  store.examDuties[idx] = updated
  return clone(updated)
}

export async function getCampusDuties(): Promise<CampusDuty[]> {
  await delay(80)
  return clone(store.campusDuties)
}

export async function publishResultEntry(
  resultEntryId: string,
  publicationStatus: ResultEntry["publicationStatus"],
  entryStatus?: ApprovalStatus
): Promise<ResultEntry> {
  await delay(140)
  const idx = store.resultEntries.findIndex((r) => r.id === resultEntryId)
  if (idx === -1) {
    throw new Error(`Result entry "${resultEntryId}" not found.`)
  }
  const current = store.resultEntries[idx]
  const updated: ResultEntry = {
    ...current,
    publicationStatus,
    entryStatus: entryStatus ?? current.entryStatus,
    lastUpdatedAt: new Date().toISOString(),
  }
  store.resultEntries[idx] = updated
  return clone(updated)
}

export async function saveConfidentialMentorNote(
  menteeId: string,
  note: string
): Promise<Mentee> {
  await delay(120)
  const idx = store.mentees.findIndex((m) => m.id === menteeId)
  if (idx === -1) {
    throw new Error(`Mentee "${menteeId}" not found.`)
  }
  const updated: Mentee = {
    ...store.mentees[idx],
    confidentialNotes: note,
  }
  store.mentees[idx] = updated
  return clone(updated)
}

export async function escalateMenteeConcern(
  menteeId: string,
  reason: string
): Promise<Mentee> {
  await delay(140)
  const idx = store.mentees.findIndex((m) => m.id === menteeId)
  if (idx === -1) {
    throw new Error(`Mentee "${menteeId}" not found.`)
  }
  const current = store.mentees[idx]
  const updated: Mentee = {
    ...current,
    escalated: true,
    escalationReason: reason,
    riskLevel: "at_risk",
  }
  store.mentees[idx] = updated
  return clone(updated)
}

export async function getStudentLogReviews(): Promise<StudentLogReview[]> {
  await delay(90)
  return clone(store.studentLogReviews)
}

export async function reviewStudentLog(
  reviewId: string,
  decision: "approved" | "returned",
  remarks?: string
): Promise<StudentLogReview> {
  await delay(130)
  const idx = store.studentLogReviews.findIndex((r) => r.id === reviewId)
  if (idx === -1) {
    throw new Error(`Student log review "${reviewId}" not found.`)
  }
  const current = store.studentLogReviews[idx]
  if (current.status === "locked") {
    throw new Error("Approved student log entries are locked and cannot be edited.")
  }
  const updated: StudentLogReview = {
    ...current,
    teacherRemarks: remarks ?? current.teacherRemarks,
    status: decision === "approved" ? "locked" : "returned",
  }
  store.studentLogReviews[idx] = updated
  return clone(updated)
}

export async function getDepartmentFacultyLoad(): Promise<
  DepartmentFacultyLoad[]
> {
  await delay(90)
  return clone(store.departmentFacultyLoad)
}

export async function updateInternalAssessmentStatus(
  assessmentId: string,
  status: ApprovalStatus,
  correctionNote?: string
): Promise<InternalAssessment> {
  await delay(130)
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

