import { db } from "./db"

const modelMapping: Record<string, string> = {
  teachers: "teacher",
  users: "user",
  institutions: "institution",
  academic_years: "academicYear",
  courses: "course",
  subjects: "subject",
  students: "student",
  student_documents: "studentDocument",
  guardian_accounts: "guardianAccount",
  guardian_links: "guardianLink",
  enrollments: "enrollment",
  timetable_slots: "timetableSlot",
  attendance_records: "attendanceRecord",
  campus_in_out_logs: "campusInOutLog",
  assessment_records: "assessmentRecord",
  exam_schedules: "examSchedule",
  exam_slots: "examSlot",
  exam_admit_cards: "examAdmitCard",
  exam_results: "examResult",
  fee_invoices: "feeInvoice",
  fee_invoice_items: "feeInvoiceItem",
  fee_payments: "feePayment",
  fee_receipts: "feeReceipt",
  lms_course_materials: "lmsCourseMaterial",
  assignments: "assignment",
  assignment_submissions: "assignmentSubmission",
  quizzes: "quiz",
  quiz_questions: "quizQuestion",
  quiz_attempts: "quizAttempt",
  elective_courses: "electiveCourse",
  elective_selections: "electiveSelection",
  hostel_allocations: "hostelAllocation",
  transport_allocations: "transportAllocation",
  events: "event",
  resource_bookings: "resourceBooking",
  mentoring_records: "mentoringRecord",
  log_book_entries: "logBookEntry",
  feedback: "feedback",
  notifications: "notification",
  notification_recipients: "notificationRecipient",
  approval_requests: "approvalRequest",
  audit_logs: "auditLog",
}

export function wrapWithMapping(client: any): any {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        const origTransaction = target.$transaction.bind(target)
        return async (arg: any, options?: any) => {
          if (typeof arg === "function") {
            return origTransaction((tx: any) => arg(wrapWithMapping(tx)), options)
          }
          return origTransaction(arg, options)
        }
      }
      if (typeof prop === "string" && modelMapping[prop]) {
        return target[modelMapping[prop]]
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = wrapWithMapping(db)
export { db }
export default prisma
