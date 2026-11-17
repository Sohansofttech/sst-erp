"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  MapPin,
  Megaphone,
  Phone,
  Pin,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  getAttendanceSessions,
  getInternalAssessments,
  getLogBookEntries,
  getSectionStudents,
  getTeacherDashboard,
  getTeacherDashboardOverview,
  getTimetable,
  reviewStudentLeaveRequest,
  submitAttendance,
} from "@/lib/services/teacher.service"
import type {
  AttendanceStatus,
  InternalAssessment,
  LogBookEntry,
  StudentRosterItem,
  TeacherDashboardData,
  TimetableSlot,
} from "@/types/teacher"
import { useTeacherRole } from "./teacher-role-context"

const ATTENDANCE_STATUS_OPTIONS: Array<{
  value: AttendanceStatus
  label: string
}> = [
    { value: "present", label: "Present" },
    { value: "absent", label: "Absent" },
    { value: "late", label: "Late" },
    { value: "on_duty", label: "On-Duty" },
  ]

export default function TeacherDashboardPage() {
  const { role, academicYear, slug } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [dashboard, setDashboard] = React.useState<TeacherDashboardData | null>(
    null
  )
  const [todaySlots, setTodaySlots] = React.useState<TimetableSlot[]>([])
  const [completedSectionIds, setCompletedSectionIds] = React.useState<
    Set<string>
  >(new Set())
  const [pendingAssessments, setPendingAssessments] = React.useState<
    InternalAssessment[]
  >([])
  const [logBooks, setLogBooks] = React.useState<LogBookEntry[]>([])
  const [lowAttendanceStudents, setLowAttendanceStudents] = React.useState<
    StudentRosterItem[]
  >([])
  const [processingLeaveId, setProcessingLeaveId] = React.useState<
    string | null
  >(null)

  // Quick Mark Attendance Dialog state
  const [attendanceSlot, setAttendanceSlot] =
    React.useState<TimetableSlot | null>(null)
  const [slotRoster, setSlotRoster] = React.useState<StudentRosterItem[]>([])
  const [slotStatuses, setSlotStatuses] = React.useState<
    Record<string, AttendanceStatus>
  >({})
  const [loadingRoster, setLoadingRoster] = React.useState(false)
  const [submittingAttendance, setSubmittingAttendance] = React.useState(false)

  const fetchDashboardData = React.useCallback(async () => {
    const result = await getTeacherDashboardOverview(slug)
    return {
      ...result,
      completed: new Set(result.completed),
    }
  }, [slug])

  const loadDashboard = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDashboardData()
      setDashboard(result.data)
      setTodaySlots(result.slots)
      setCompletedSectionIds(result.completed)
      setPendingAssessments(result.pending)
      setLogBooks(result.entries)
      setLowAttendanceStudents(result.alerts)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load teacher dashboard."
      )
    } finally {
      setLoading(false)
    }
  }, [fetchDashboardData])

  React.useEffect(() => {
    let active = true
    fetchDashboardData()
      .then((result) => {
        if (!active) return
        setDashboard(result.data)
        setTodaySlots(result.slots)
        setCompletedSectionIds(result.completed)
        setPendingAssessments(result.pending)
        setLogBooks(result.entries)
        setLowAttendanceStudents(result.alerts)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load teacher dashboard."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchDashboardData])

  const openMarkAttendance = async (slot: TimetableSlot) => {
    setAttendanceSlot(slot)
    setLoadingRoster(true)
    try {
      const students = await getSectionStudents(slot.sectionId)
      const initial: Record<string, AttendanceStatus> = {}
      for (const s of students) {
        initial[s.studentId] = "present"
      }
      setSlotRoster(students)
      setSlotStatuses(initial)
    } catch {
      toast.error("Could not load section roster.")
      setAttendanceSlot(null)
    } finally {
      setLoadingRoster(false)
    }
  }

  const handleSaveSlotAttendance = async () => {
    if (!attendanceSlot || !dashboard) return
    setSubmittingAttendance(true)
    try {
      await submitAttendance({
        institutionId: dashboard.profile.institutionId,
        academicYearId: "ay-2026-27",
        classId: attendanceSlot.classId,
        className: attendanceSlot.className,
        sectionId: attendanceSlot.sectionId,
        section: attendanceSlot.section,
        subjectName: attendanceSlot.subject,
        date: "2026-11-12",
        period: attendanceSlot.period,
        status: "submitted",
        records: slotRoster.map((student) => ({
          studentId: student.studentId,
          rollNo: student.rollNo,
          studentName: student.fullName,
          status: slotStatuses[student.studentId] ?? "present",
        })),
      })

      setCompletedSectionIds((prev) => {
        const next = new Set(prev)
        next.add(`${attendanceSlot.sectionId}-${attendanceSlot.period}`)
        next.add(attendanceSlot.sectionId)
        return next
      })
      toast.success(
        `Attendance submitted for ${attendanceSlot.className} - ${attendanceSlot.section} (Period ${attendanceSlot.period})`
      )
      setAttendanceSlot(null)
    } catch {
      toast.error("Failed to submit attendance.")
    } finally {
      setSubmittingAttendance(false)
    }
  }

  const handleLeaveDecision = async (
    requestId: string,
    decision: "approved" | "rejected"
  ) => {
    setProcessingLeaveId(requestId)
    try {
      await reviewStudentLeaveRequest(
        requestId,
        decision,
        decision === "approved"
          ? "Approved by Class Teacher."
          : "Requires parent confirmation."
      )
      setDashboard((prev) =>
        prev
          ? {
            ...prev,
            pendingStudentLeaves: prev.pendingStudentLeaves.filter(
              (l) => l.id !== requestId
            ),
            kpis: {
              ...prev.kpis,
              pendingApprovalsCount: Math.max(
                0,
                prev.kpis.pendingApprovalsCount - 1
              ),
            },
          }
          : prev
      )
      toast.success(
        `Student leave request ${decision === "approved" ? "approved" : "rejected"}.`
      )
    } catch {
      toast.error("Unable to update leave request.")
    } finally {
      setProcessingLeaveId(null)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Teacher Dashboard"
        description="Fetching today's schedule, attendance slots, and pending approvals..."
      />
    )
  }

  if (error || !dashboard) {
    return (
      <ErrorState
        title="Unable to load dashboard"
        description={error ?? "An unexpected error occurred."}
        onRetry={() => void loadDashboard()}
      />
    )
  }

  const pendingAttendanceCount = todaySlots.filter(
    (slot) =>
      !completedSectionIds.has(`${slot.sectionId}-${slot.period}`) &&
      !completedSectionIds.has(slot.sectionId)
  ).length

  const base = `/campus/${slug}/teacher`
  const pendingLogbooks = logBooks.filter(
    (entry) => entry.status === "submitted" || entry.status === "draft"
  )

  return (
    <div className="space-y-6">
      {/* Dashboard Hero / Welcome Banner */}
      <section
        aria-label="Welcome Banner"
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#123B5A] via-[#16466C] to-[#123B5A] p-6 sm:p-8 text-white shadow-sm border border-[#16466C]"
      >
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
                Academic Year {academicYear}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F5A000] px-3 py-1 text-xs font-bold text-white shadow-xs">
                {role === "hod" ? (
                  <>
                    <ShieldCheck className="size-3" /> HoD Oversight
                  </>
                ) : role === "class_teacher" ? (
                  <>
                    <UserCheck className="size-3" /> Class Teacher (10-A)
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3" /> Active Teacher
                  </>
                )}
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Welcome back, {dashboard.profile.fullName}!
              </h1>
              <p className="mt-1 text-[13.5px] font-medium text-white/80 sm:text-[14.5px]">
                Employee ID: {dashboard.profile.employeeCode ?? "EMP-1042"} · {dashboard.profile.designation} · {dashboard.profile.departmentName}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              asChild
              className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link href={`${base}/timetable`}>
                <Clock className="size-4" />
                View Timetable
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-xl bg-[#F5A000] text-white font-bold hover:bg-[#E09200] shadow-sm"
            >
              <Link href={`${base}/attendance`}>
                <ClipboardCheck className="size-4" />
                Take Today&apos;s Attendance
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Top 4 KPI StatCards */}
      <section
        aria-label="Key Metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {/* Dark Highlight KPI Card */}
        <StatCard
          label="Today's Classes"
          value={todaySlots.length}
          icon={<BookOpen />}
          variant="dark"
          tone="darkNavy"
          description={`${todaySlots.length - pendingAttendanceCount} attendance done`}
        />
        <StatCard
          label="Pending Attendance Slots"
          value={pendingAttendanceCount}
          icon={<ClipboardCheck />}
          tone={pendingAttendanceCount > 0 ? "warning" : "success"}
          trend={
            pendingAttendanceCount === 0
              ? { value: "All Clear", direction: "up", label: "for today" }
              : {
                value: `${pendingAttendanceCount} open`,
                direction: "neutral",
                label: "submit before 5 PM",
              }
          }
        />
        <StatCard
          label="Pending Assignment Reviews"
          value={dashboard.kpis.pendingSubmissionsToGrade}
          icon={<FileCheck2 />}
          tone="primary"
          description="Submissions awaiting grading"
        />
        <StatCard
          label="Upcoming Exam Duties"
          value={dashboard.upcomingExamDuties.length}
          icon={<CalendarClock />}
          tone="brand"
          description={
            dashboard.upcomingExamDuties[0]
              ? `Next: ${dashboard.upcomingExamDuties[0].examDate}`
              : "No duties scheduled"
          }
        />
      </section>

      {/* Role-specific demo banner for Class Teacher or HoD */}
      {role !== "teacher" && (
        <Card className="rounded-2xl border-[#E5E9EF] bg-white py-4 shadow-xs">
          <CardContent className="flex flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#123B5A]/10 text-[#123B5A]">
                {role === "hod" ? (
                  <ShieldCheck className="size-5" />
                ) : (
                  <UserCheck className="size-5" />
                )}
              </div>
              <div>
                <p className="text-[14px] font-bold text-[#202936]">
                  {role === "hod"
                    ? "HoD Oversight Active — Department of Mathematics"
                    : "Class Teacher Mode Active — Class 10 - Section A"}
                </p>
                <p className="text-[13px] text-[#788391]">
                  {role === "hod"
                    ? `${pendingLogbooks.length} teacher log book entries and ${pendingAssessments.length} internal assessment draft(s) are queued for departmental oversight.`
                    : "You have direct approval authority for Class 10-A student leave requests and low-attendance parent outreach."}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit rounded-full border-[#F5A000]/30 bg-amber-50 text-[#F5A000] font-bold">
              Demo Role: {role === "hod" ? "HoD" : "Class Teacher"}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Main 2-column grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's Schedule Timeline Widget */}
        <Card className="lg:col-span-2 rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-[#E5E9EF] pb-4">
            <div>
              <CardTitle className="text-[#202936]">Today&apos;s Schedule</CardTitle>
              <CardDescription className="text-[#788391]">
                Period-by-period timeline with quick attendance marking.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-[#F5A000] hover:text-[#E09200] hover:bg-amber-50">
              <Link href={`${base}/timetable`} className="gap-1 font-bold">
                Full Timetable
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-5">
            {todaySlots.length === 0 ? (
              <EmptyState
                compact
                title="No classes scheduled today"
                description="Your timetable has no teaching slots assigned for today."
              />
            ) : (
              <ol className="relative space-y-4 before:absolute before:top-3 before:bottom-3 before:left-[15px] before:w-px before:bg-[#E5E9EF]">
                {todaySlots.map((slot) => {
                  const isDone =
                    completedSectionIds.has(`${slot.sectionId}-${slot.period}`) ||
                    completedSectionIds.has(slot.sectionId)

                  return (
                    <li key={slot.id} className="relative flex gap-4 pl-10">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute top-2 left-1.5 flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                          isDone
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                            : "border-[#123B5A] bg-[#123B5A] text-white"
                        )}
                      >
                        {slot.period}
                      </span>

                      <div
                        className={cn(
                          "flex flex-1 flex-col justify-between gap-3 rounded-2xl border border-[#E5E9EF] bg-white p-4 transition-colors sm:flex-row sm:items-center shadow-xs",
                          slot.isSubstituted && "border-amber-200 bg-amber-50/40"
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14.5px] font-bold text-[#202936]">
                              {slot.subject}
                            </span>
                            <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936] text-xs font-semibold">
                              {slot.className} - {slot.section}
                            </Badge>
                            {slot.isLab && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-[#123B5A]/20 bg-[#123B5A]/5 text-[#123B5A] font-semibold"
                              >
                                Lab
                              </Badge>
                            )}
                            {slot.isSubstituted && (
                              <Badge className="rounded-full bg-amber-100 text-amber-800 border-amber-200">Substituted</Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#788391]">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3.5" />
                              {slot.startTime} – {slot.endTime}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" />
                              Room {slot.room}
                            </span>
                          </div>
                          {slot.substitutedFor && (
                            <p className="text-[12.5px] text-[#123B5A] font-medium">
                              Covering for {slot.substitutedFor}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {isDone ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                              <CheckCircle2 className="size-3.5" />
                              Completed
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-xl bg-[#F5A000] text-white font-bold hover:bg-[#E09200]"
                              onClick={() => void openMarkAttendance(slot)}
                            >
                              Mark Attendance
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Action Required / Pending Approvals Card */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="border-b border-[#E5E9EF] pb-4">
            <CardTitle className="text-[#202936]">Action Required</CardTitle>
            <CardDescription className="text-[#788391]">
              Pending approvals, IA corrections, and log book reviews.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {/* Student Leave Approvals */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-[#202936]">
                  Student Leave Requests
                </p>
                <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936]">
                  {dashboard.pendingStudentLeaves.length} pending
                </Badge>
              </div>

              {dashboard.pendingStudentLeaves.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#E5E9EF] p-3 text-[13px] text-[#788391]">
                  All student leave requests have been reviewed.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {dashboard.pendingStudentLeaves.map((leave) => (
                    <div
                      key={leave.id}
                      className="rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/40 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[13.5px] font-bold text-[#202936]">
                            {leave.studentName}
                          </p>
                          <p className="text-[12px] text-[#788391]">
                            {leave.className}-{leave.section} · {leave.leaveType}{" "}
                            ({leave.daysCount}d · {leave.fromDate})
                          </p>
                        </div>
                        <StatusBadge status="Pending" />
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-[#788391]">
                        {leave.reason}
                      </p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button
                          type="button"
                          size="xs"
                          className="rounded-lg bg-[#123B5A] text-white font-bold hover:bg-[#1B4D70]"
                          disabled={processingLeaveId === leave.id}
                          onClick={() =>
                            void handleLeaveDecision(leave.id, "approved")
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          className="rounded-lg border-[#E5E9EF] text-[#788391] hover:text-[#202936] hover:bg-white"
                          disabled={processingLeaveId === leave.id}
                          onClick={() =>
                            void handleLeaveDecision(leave.id, "rejected")
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* IA Correction / Draft Assessments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-[#202936]">
                  IA Marks & Corrections
                </p>
                <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936]">{pendingAssessments.length}</Badge>
              </div>
              {pendingAssessments.map((ia) => (
                <div
                  key={ia.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/30 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-[#202936]">
                      {ia.title}
                    </p>
                    <p className="text-[12px] text-[#788391]">
                      {ia.className}-{ia.section} · Max {ia.maxMarks} marks
                    </p>
                  </div>
                  <StatusBadge status={ia.status === "draft" ? "Draft" : "Pending"} />
                </div>
              ))}
            </div>

            <Separator className="bg-[#E5E9EF]" />

            {/* Log Book Reviews */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-[#202936]">
                  Log Book Reviews {role === "hod" && "(HoD Queue)"}
                </p>
                <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936]">{pendingLogbooks.length}</Badge>
              </div>
              {pendingLogbooks.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/30 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-[#202936]">
                      {entry.topicCovered}
                    </p>
                    <p className="text-[12px] text-[#788391]">
                      {entry.className}-{entry.section} · {entry.date} (P
                      {entry.period})
                    </p>
                  </div>
                  <StatusBadge
                    status={entry.status === "submitted" ? "Pending" : "Draft"}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom 2-column grid: Low Attendance Alerts & Announcements */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Low Attendance Alerts (< 75%) */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-[#E5E9EF] pb-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-[#202936]">
                <AlertTriangle className="size-4 text-rose-600" />
                Low Attendance Alerts
              </CardTitle>
              <CardDescription className="text-[#788391]">
                Students currently below the 75% minimum attendance threshold.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="rounded-full border-rose-200 bg-rose-50 text-rose-700 font-bold"
            >
              {lowAttendanceStudents.length} Flagged
            </Badge>
          </CardHeader>
          <CardContent className="pt-5">
            {lowAttendanceStudents.length === 0 ? (
              <EmptyState
                compact
                title="No attendance alerts"
                description="All students across your assigned sections are at or above 75% attendance."
              />
            ) : (
              <div className="space-y-3">
                {lowAttendanceStudents.map((student) => (
                  <div
                    key={student.studentId}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/30 p-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-[#202936]">
                          {student.fullName}
                        </span>
                        <Badge variant="secondary" className="rounded-full font-mono text-[11px] bg-[#EEF1F5] text-[#202936]">
                          {student.rollNo}
                        </Badge>
                      </div>
                      <p className="text-[12.5px] text-[#788391]">
                        {student.className} - {student.section} · Guardian:{" "}
                        {student.guardianContact.guardianName} (
                        {student.guardianContact.relation})
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-[15px] font-extrabold text-rose-600">
                          {student.attendancePercent}%
                        </p>
                        <p className="text-[11px] text-[#788391]">
                          IA Avg: {student.iaAverage}%
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg border-[#E5E9EF] text-[#202936] hover:bg-white"
                        onClick={() =>
                          toast.info(
                            `Guardian contact: ${student.guardianContact.guardianName}`,
                            {
                              description: student.guardianContact.phone,
                            }
                          )
                        }
                      >
                        <Phone className="size-3.5" />
                        Contact
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Announcements & Events Feed */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-[#E5E9EF] pb-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-[#202936]">
                <Megaphone className="size-4 text-[#F5A000]" />
                Announcements & Events
              </CardTitle>
              <CardDescription className="text-[#788391]">
                Institutional notices and parent–teacher updates.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-[#F5A000] hover:text-[#E09200] hover:bg-amber-50">
              <Link href={`${base}/classes`} className="gap-1 font-bold">
                Rosters
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {dashboard.announcements.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  item.isPinned ? "border-[#F5A000]/40 bg-amber-50/30" : "border-[#E5E9EF] bg-white"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.isPinned && (
                      <Pin className="size-3.5 shrink-0 text-[#F5A000]" />
                    )}
                    <h3 className="text-[14.5px] font-bold text-[#202936]">
                      {item.title}
                    </h3>
                  </div>
                  <Badge
                    variant={
                      item.priority === "important" ? "brand" : "secondary"
                    }
                    className="rounded-full"
                  >
                    {item.audience}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#788391]">
                  {item.content}
                </p>
                <div className="mt-2.5 flex items-center justify-between text-[12px] text-[#788391]">
                  <span>
                    {item.authorName} · {item.authorRole}
                  </span>
                  <span>{item.publishedAt}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick Mark Attendance Dialog */}
      <Dialog
        open={Boolean(attendanceSlot)}
        onOpenChange={(open) => {
          if (!open) setAttendanceSlot(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl rounded-2xl border-[#E5E9EF] bg-white shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-[#202936] text-lg font-bold">
              Mark Attendance — {attendanceSlot?.className}{" "}
              {attendanceSlot?.section}
            </DialogTitle>
            <DialogDescription className="text-[#788391]">
              Period {attendanceSlot?.period} · {attendanceSlot?.subject} (
              {attendanceSlot?.startTime} – {attendanceSlot?.endTime})
            </DialogDescription>
          </DialogHeader>

          {loadingRoster ? (
            <LoadingState compact title="Loading section roster..." />
          ) : (
            <div className="space-y-2.5">
              {slotRoster.map((student) => {
                const currentStatus =
                  slotStatuses[student.studentId] ?? "present"
                return (
                  <div
                    key={student.studentId}
                    className="flex flex-col justify-between gap-2 rounded-xl border border-[#E5E9EF] bg-white px-3 py-2 sm:flex-row sm:items-center shadow-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-[#788391]">
                        {student.rollNo}
                      </span>
                      <span className="text-[13.5px] font-bold text-[#202936]">
                        {student.fullName}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {ATTENDANCE_STATUS_OPTIONS.map((opt) => {
                        const active = currentStatus === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setSlotStatuses((prev) => ({
                                ...prev,
                                [student.studentId]: opt.value,
                              }))
                            }
                            className={cn(
                              "rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors",
                              active
                                ? opt.value === "present"
                                  ? "border-emerald-600 bg-emerald-600 text-white"
                                  : opt.value === "absent"
                                    ? "border-rose-600 bg-rose-600 text-white"
                                    : opt.value === "late"
                                      ? "border-amber-500 bg-[#F5A000] text-white"
                                      : "border-[#123B5A] bg-[#123B5A] text-white"
                                : "border-[#E5E9EF] bg-[#EEF1F5] text-[#788391] hover:bg-slate-200"
                            )}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <DialogFooter className="border-t border-[#E5E9EF] pt-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
              onClick={() => setAttendanceSlot(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-[#F5A000] text-white font-bold hover:bg-[#E09200]"
              disabled={loadingRoster || submittingAttendance}
              onClick={() => void handleSaveSlotAttendance()}
            >
              {submittingAttendance ? "Submitting..." : "Submit Attendance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
