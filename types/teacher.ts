import type { ApprovalStatus, DayOfWeek } from "./common"

// ---------------------------------------------------------------------------
// 1. Teacher Profile & Department (teachers, teacher_profiles, teacher_departments)
// ---------------------------------------------------------------------------
export interface TeacherProfile {
  id: string
  institutionId: string
  employeeCode: string
  fullName: string
  email: string
  phone: string
  photoUrl?: string
  designation: string
  departmentId: string
  departmentName: string
  qualification: string
  specialization?: string
  experienceYears: number
  joiningDate: string
  isClassTeacher: boolean
  classTeacherOf?: string
  subjectsHandled: string[]
  officeRoom?: string
  bio?: string
  status: "active" | "on_leave" | "inactive"
}

// ---------------------------------------------------------------------------
// 2. Class & Subject Allocations
//    (teacher_class_allocations, teacher_subject_allocations)
// ---------------------------------------------------------------------------
export interface ClassAllocation {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  classId: string
  className: string
  sectionId: string
  section: string
  role: "class_teacher" | "co_class_teacher" | "subject_teacher"
  studentCount: number
  roomNo: string
  averageAttendancePercent: number
}

export interface SubjectAllocation {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectCode: string
  subjectName: string
  weeklyHours: number
  syllabusCompletionPercent: number
  isElective?: boolean
  isLab?: boolean
}

// ---------------------------------------------------------------------------
// 3. Student Roster (strictly NO Aadhaar, PAN, bank, or income fields)
// ---------------------------------------------------------------------------
export interface GuardianContact {
  guardianName: string
  relation: "Father" | "Mother" | "Guardian"
  phone: string
}

export interface StudentRosterItem {
  studentId: string
  rollNo: string
  admissionNo: string
  fullName: string
  photoUrl?: string
  classId: string
  className: string
  sectionId: string
  section: string
  attendancePercent: number
  iaAverage: number
  guardianContact: GuardianContact
  houseOrGroup?: string
}

// ---------------------------------------------------------------------------
// 4. Weekly Timetable (teacher_timetable)
// ---------------------------------------------------------------------------
export interface TimetableSlot {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  day: DayOfWeek
  period: number
  startTime: string
  endTime: string
  subjectCode?: string
  subject: string
  classId: string
  className: string
  sectionId: string
  section: string
  room: string
  isSubstituted: boolean
  substitutedFor?: string
  isLab?: boolean
  notes?: string
}

// ---------------------------------------------------------------------------
// 5. Attendance (teacher_attendance_records)
// ---------------------------------------------------------------------------
export type AttendanceStatus = "present" | "absent" | "late" | "on_duty"

export interface AttendanceAuditEntry {
  id: string
  timestamp: string
  actorId: string
  actorName: string
  action: "created" | "updated" | "submitted" | "locked"
  summary: string
  reason?: string
}

export interface AttendanceRecord {
  id: string
  sessionId: string
  studentId: string
  rollNo: string
  studentName: string
  status: AttendanceStatus
  remarks?: string
  markedAt: string
}

export interface AttendanceSession {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId?: string
  subjectName?: string
  date: string
  period?: number
  totalStudents: number
  presentCount: number
  absentCount: number
  lateCount: number
  onDutyCount: number
  status: "draft" | "submitted" | "locked"
  editWindowOpen: boolean
  editWindowClosesAt?: string
  records: AttendanceRecord[]
  auditHistory: AttendanceAuditEntry[]
}

export interface SubmitAttendanceInput {
  sessionId?: string
  institutionId: string
  academicYearId: string
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId?: string
  subjectName?: string
  date: string
  period?: number
  status: "draft" | "submitted"
  correctionReason?: string
  records: Array<{
    studentId: string
    rollNo: string
    studentName: string
    status: AttendanceStatus
    remarks?: string
  }>
}

// ---------------------------------------------------------------------------
// 6. Internal Assessments (internal_assessments, assessment_marks)
// ---------------------------------------------------------------------------
export interface AssessmentMark {
  id: string
  assessmentId: string
  studentId: string
  rollNo: string
  studentName: string
  componentName: string
  maxMarks: number
  obtainedMarks: number | null
  isAbsent?: boolean
  remarks?: string
  status: ApprovalStatus
}

export interface InternalAssessment {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectName: string
  title: string
  componentName: string
  maxMarks: number
  passingMarks: number
  weightagePercent: number
  conductedDate: string
  status: ApprovalStatus
  publishedToStudents?: boolean
  correctionNote?: string
  marks: AssessmentMark[]
}

export interface CreateInternalAssessmentInput {
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectName: string
  title: string
  componentName: string
  maxMarks: number
  passingMarks: number
  weightagePercent: number
  conductedDate: string
}

export interface SaveIAMarksInput {
  assessmentId: string
  marks: Array<{
    studentId: string
    obtainedMarks: number | null
    isAbsent?: boolean
    remarks?: string
  }>
  nextStatus?: ApprovalStatus
}

// ---------------------------------------------------------------------------
// 7. Assignments & Submissions (assignments, assignment_submissions)
// ---------------------------------------------------------------------------
export interface Assignment {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectName: string
  title: string
  description: string
  unit?: string
  dueDate: string
  maxMarks: number
  allowLateSubmission?: boolean
  attachmentUrl?: string
  attachmentName?: string
  status: "draft" | "published" | "closed"
  totalStudents: number
  submittedCount: number
  gradedCount: number
  createdAt: string
}

export interface AssignmentSubmission {
  id: string
  assignmentId: string
  studentId: string
  rollNo: string
  studentName: string
  submittedAt?: string
  fileUrl?: string
  fileName?: string
  submissionText?: string
  status: "pending" | "submitted" | "late" | "graded" | "returned"
  obtainedMarks: number | null
  feedback?: string
  gradedAt?: string
}

export interface CreateAssignmentInput {
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectName: string
  title: string
  description: string
  unit?: string
  dueDate: string
  maxMarks: number
  allowLateSubmission?: boolean
  attachmentName?: string
  status?: "draft" | "published"
}

// ---------------------------------------------------------------------------
// 8. Learning Materials (learning_materials)
// ---------------------------------------------------------------------------
export type LearningMaterialType = "pdf" | "video" | "link" | "note"

export interface LearningMaterial {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  classId: string
  className: string
  section: string
  subjectId: string
  subjectName: string
  unit: string
  title: string
  description?: string
  type: LearningMaterialType
  fileUrl: string
  fileSizeLabel?: string
  isPublished: boolean
  uploadedAt: string
}

export interface CreateLearningMaterialInput {
  classId: string
  className: string
  section: string
  subjectId: string
  subjectName: string
  unit: string
  title: string
  description?: string
  type: LearningMaterialType
  fileUrl: string
  fileSizeLabel?: string
  isPublished?: boolean
}

// ---------------------------------------------------------------------------
// 9. Quizzes (quizzes, quiz_questions, quiz_submissions)
// ---------------------------------------------------------------------------
export interface QuizQuestion {
  id: string
  quizId: string
  questionNumber: number
  prompt: string
  questionType: "mcq" | "true_false" | "short_answer"
  options?: string[]
  correctAnswer: string
  marks: number
  explanation?: string
}

export interface Quiz {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectName: string
  title: string
  description?: string
  durationMinutes: number
  totalMarks: number
  scheduledAt: string
  closesAt: string
  status: "draft" | "published" | "closed"
  questions: QuizQuestion[]
  attemptCount: number
  totalStudents: number
}

export interface QuizSubmission {
  id: string
  quizId: string
  studentId: string
  rollNo: string
  studentName: string
  startedAt: string
  submittedAt?: string
  score: number | null
  totalMarks: number
  status: "in_progress" | "submitted" | "graded"
  answers: Record<string, string>
  feedback?: string
}

export interface CreateQuizInput {
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectName: string
  title: string
  description?: string
  durationMinutes: number
  scheduledAt: string
  closesAt: string
  status?: "draft" | "published"
  questions: Array<Omit<QuizQuestion, "id" | "quizId">>
}

// ---------------------------------------------------------------------------
// 10. Exams, Invigilation Duties & Result Entries (exam_duties, results)
// ---------------------------------------------------------------------------
export interface ExamDuty {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  examName: string
  examDate: string
  session: "Morning" | "Afternoon"
  startTime: string
  endTime: string
  roomNo: string
  dutyRole: "Invigilator" | "Chief Invigilator" | "Squad" | "Evaluator"
  className?: string
  subjectName?: string
  status: "assigned" | "completed" | "excused"
  hallAttendance?: {
    registeredCount: number
    presentCount: number
    absentRollNos: string[]
    malpracticeCount: number
    malpracticeNotes?: string
    submittedAt: string
  }
}

export interface CampusDuty {
  id: string
  title: string
  category: "Assembly" | "Discipline" | "Club" | "Transport" | "Lab Supervision"
  schedule: string
  location: string
  assignedBy: string
  status: "active" | "completed"
}

export interface ExamScheduleItem {
  id: string
  examName: string
  examDate: string
  startTime: string
  endTime: string
  className: string
  section: string
  subjectCode: string
  subjectName: string
  maxMarks: number
  passingMarks: number
  roomNo: string
}

export interface ResultMarkRow {
  studentId: string
  rollNo: string
  studentName: string
  theoryMarks: number | null
  practicalMarks: number | null
  totalMarks: number | null
  grade?: string
  isAbsent?: boolean
  remarks?: string
}

export interface ResultEntry {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  examName: string
  classId: string
  className: string
  sectionId: string
  section: string
  subjectId: string
  subjectName: string
  maxTheoryMarks: number
  maxPracticalMarks: number
  maxTotalMarks: number
  entryStatus: ApprovalStatus
  publicationStatus: "draft" | "published" | "locked"
  submissionDeadline: string
  lastUpdatedAt: string
  rows: ResultMarkRow[]
}

export interface SaveResultMarksInput {
  resultEntryId: string
  rows: Array<{
    studentId: string
    theoryMarks: number | null
    practicalMarks: number | null
    isAbsent?: boolean
    remarks?: string
  }>
  entryStatus?: ApprovalStatus
}

// ---------------------------------------------------------------------------
// 11. Mentorship (teacher_mentorships)
// ---------------------------------------------------------------------------
export interface Mentee {
  id: string
  institutionId: string
  academicYearId: string
  mentorTeacherId: string
  studentId: string
  rollNo: string
  admissionNo: string
  fullName: string
  className: string
  section: string
  photoUrl?: string
  attendancePercent: number
  iaAverage: number
  iaTrend?: "up" | "down" | "stable"
  riskLevel: "on_track" | "watch" | "at_risk"
  guardianContact: GuardianContact
  lastSessionDate?: string
  notesSummary?: string
  confidentialNotes?: string
  escalated?: boolean
  escalationReason?: string
}

export interface MentoringSession {
  id: string
  menteeId: string
  studentId: string
  studentName: string
  mentorTeacherId: string
  sessionDate: string
  mode: "in_person" | "parent_call" | "online"
  topic: string
  observations: string
  actionItems: string[]
  followUpDate?: string
  status: "scheduled" | "completed" | "cancelled"
}

export interface CreateMentoringSessionInput {
  menteeId: string
  sessionDate: string
  mode: "in_person" | "parent_call" | "online"
  topic: string
  observations: string
  actionItems: string[]
  followUpDate?: string
  status?: "scheduled" | "completed"
}

// ---------------------------------------------------------------------------
// 12. Teacher Logbook (teacher_logbooks)
// ---------------------------------------------------------------------------
export interface LogBookEntry {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  date: string
  period: number
  classId: string
  className: string
  section: string
  subjectId: string
  subjectName: string
  unit: string
  topicCovered: string
  teachingMethod:
    | "Lecture"
    | "Lab Demo"
    | "Interactive"
    | "Activity"
    | "Assessment"
  homeworkAssigned?: string
  remarks?: string
  syllabusProgressPercent: number
  status: ApprovalStatus
  verifiedBy?: string
}

export interface StudentLogReview {
  id: string
  studentId: string
  rollNo: string
  studentName: string
  className: string
  section: string
  projectTitle: string
  weekLabel: string
  entryDate: string
  hoursLogged: number
  summary: string
  teacherRemarks?: string
  status: "pending" | "returned" | "approved" | "locked"
}

export interface CreateLogBookEntryInput {
  date: string
  period: number
  classId: string
  className: string
  section: string
  subjectId: string
  subjectName: string
  unit: string
  topicCovered: string
  teachingMethod: LogBookEntry["teachingMethod"]
  homeworkAssigned?: string
  remarks?: string
  syllabusProgressPercent: number
  status?: "draft" | "submitted"
}

// ---------------------------------------------------------------------------
// 13. Leave Requests (teacher_leave_requests & student leave approvals)
// ---------------------------------------------------------------------------
export interface TeacherLeaveRequest {
  id: string
  institutionId: string
  academicYearId: string
  teacherId: string
  teacherName: string
  leaveType:
    | "Casual Leave"
    | "Earned Leave"
    | "Sick Leave"
    | "On-Duty"
    | "Academic Leave"
  fromDate: string
  toDate: string
  daysCount: number
  reason: string
  substituteTeacherName?: string
  handoverNotes?: string
  appliedAt: string
  status: ApprovalStatus
  reviewedBy?: string
  reviewerRemarks?: string
}

export interface CreateTeacherLeaveInput {
  leaveType: TeacherLeaveRequest["leaveType"]
  fromDate: string
  toDate: string
  daysCount: number
  reason: string
  substituteTeacherName?: string
  handoverNotes?: string
}

export interface StudentLeaveRequest {
  id: string
  institutionId: string
  academicYearId: string
  studentId: string
  rollNo: string
  studentName: string
  className: string
  section: string
  leaveType: "Medical" | "Family" | "On-Duty" | "Co-Curricular"
  fromDate: string
  toDate: string
  daysCount: number
  reason: string
  guardianName: string
  guardianPhone: string
  attachmentUrl?: string
  appliedAt: string
  status: "pending" | "approved" | "rejected"
  reviewedBy?: string
  reviewerRemarks?: string
}

// ---------------------------------------------------------------------------
// 14. Notifications & Announcements
// ---------------------------------------------------------------------------
export interface NotificationItem {
  id: string
  institutionId: string
  title: string
  message: string
  category:
    | "attendance"
    | "assessment"
    | "leave"
    | "exam"
    | "announcement"
    | "system"
  createdAt: string
  isRead: boolean
  actionHref?: string
}

export interface Announcement {
  id: string
  institutionId: string
  academicYearId: string
  title: string
  content: string
  audience: "All Staff" | "Class Teachers" | "Class & Parents" | "Department"
  targetClasses?: string[]
  authorName: string
  authorRole: string
  publishedAt: string
  isPinned: boolean
  priority: "normal" | "important" | "urgent"
}

export interface CreateAnnouncementInput {
  title: string
  content: string
  audience: Announcement["audience"]
  targetClasses?: string[]
  priority?: Announcement["priority"]
  isPinned?: boolean
}

export interface DepartmentFacultyLoad {
  teacherId: string
  fullName: string
  designation: string
  subjects: string[]
  sectionsCount: number
  weeklyHours: number
  syllabusAveragePercent: number
  attendanceAveragePercent: number
}

// ---------------------------------------------------------------------------
// 15. Teacher Dashboard Aggregate
// ---------------------------------------------------------------------------
export interface TeacherDashboardData {
  profile: TeacherProfile
  kpis: {
    assignedClassesCount: number
    totalStudentsCount: number
    todayAttendancePercent: number
    pendingApprovalsCount: number
    pendingSubmissionsToGrade: number
    unreadNotificationsCount: number
  }
  todayTimetable: TimetableSlot[]
  classAllocations: ClassAllocation[]
  subjectAllocations: SubjectAllocation[]
  recentAttendance: AttendanceSession[]
  pendingStudentLeaves: StudentLeaveRequest[]
  upcomingExamDuties: ExamDuty[]
  announcements: Announcement[]
  notifications: NotificationItem[]
}

