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
    const [data, sessions, assessments, entries, allTimetable] =
      await Promise.all([
        getTeacherDashboard(slug),
        getAttendanceSessions(),
        getInternalAssessments(),
        getLogBookEntries(),
        getTimetable(),
      ])

    const slots =
      data.todayTimetable.length > 0
        ? data.todayTimetable
        : allTimetable.filter((s) => s.day === "Monday")

    const todayIso = "2026-11-12"
    const completed = new Set(
      sessions
        .filter(
          (s) =>
            s.date === todayIso &&
            (s.status === "submitted" || s.status === "locked")
        )
        .map((s) => `${s.sectionId}-${s.period ?? 1}`)
    )
    for (const s of sessions) {
      if (s.status === "submitted" || s.status === "locked") {
        completed.add(s.sectionId)
      }
    }

    const rosters = await Promise.all(
      data.classAllocations.map((alloc) => getSectionStudents(alloc.sectionId))
    )
    const alerts = rosters
      .flat()
      .filter((student) => student.attendancePercent < 75)
      .sort((a, b) => a.attendancePercent - b.attendancePercent)

    return {
      data,
      slots,
      completed,
      pending: assessments.filter(
        (a) => a.status === "draft" || a.status === "returned"
      ),
      entries,
      alerts,
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
      <PageHeader
        title={`Welcome back, ${dashboard.profile.fullName}`}
        subtitle={`${dashboard.profile.designation} · ${dashboard.profile.departmentName} · AY ${academicYear}`}
        badge={
          <Badge
            variant={role === "hod" ? "brand" : "teal"}
            className="gap-1 font-medium"
          >
            {role === "hod" ? (
              <>
                <ShieldCheck className="size-3" /> HoD Oversight View
              </>
            ) : role === "class_teacher" ? (
              <>
                <UserCheck className="size-3" /> Class Teacher (10-A)
              </>
            ) : (
              <>
                <Sparkles className="size-3" /> Subject Faculty View
              </>
            )}
          </Badge>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`${base}/timetable`}>View Timetable</Link>
            </Button>
            <Button asChild>
              <Link href={`${base}/classes`}>
                <Users className="size-4" />
                My Classes
              </Link>
            </Button>
          </div>
        }
      />

      {/* Top 4 KPI StatCards */}
      <section
        aria-label="Key Metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Today's Classes"
          value={todaySlots.length}
          icon={<BookOpen />}
          tone="brand"
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
          tone="teal"
          description={
            dashboard.upcomingExamDuties[0]
              ? `Next: ${dashboard.upcomingExamDuties[0].examDate}`
              : "No duties scheduled"
          }
        />
      </section>

      {/* Role-specific demo banner for Class Teacher or HoD */}
      {role !== "teacher" && (
        <Card className="border-teal/30 bg-teal/5 py-4 shadow-none">
          <CardContent className="flex flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal/15 text-teal-700">
                {role === "hod" ? (
                  <ShieldCheck className="size-5" />
                ) : (
                  <UserCheck className="size-5" />
                )}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">
                  {role === "hod"
                    ? "HoD Oversight Active — Department of Mathematics"
                    : "Class Teacher Mode Active — Class 10 - Section A"}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {role === "hod"
                    ? `${pendingLogbooks.length} teacher log book entries and ${pendingAssessments.length} internal assessment draft(s) are queued for departmental oversight.`
                    : "You have direct approval authority for Class 10-A student leave requests and low-attendance parent outreach."}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit border-teal/40 bg-card text-brand">
              Demo Role: {role === "hod" ? "HoD" : "Class Teacher"}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Main 2-column grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's Schedule Timeline Widget */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Today&apos;s Schedule</CardTitle>
              <CardDescription>
                Period-by-period timeline with quick attendance marking.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/timetable`} className="gap-1 text-primary">
                Full Timetable
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {todaySlots.length === 0 ? (
              <EmptyState
                compact
                title="No classes scheduled today"
                description="Your timetable has no teaching slots assigned for today."
              />
            ) : (
              <ol className="relative space-y-4 before:absolute before:top-3 before:bottom-3 before:left-[15px] before:w-px before:bg-border">
                {todaySlots.map((slot) => {
                  const isDone =
                    completedSectionIds.has(`${slot.sectionId}-${slot.period}`) ||
                    completedSectionIds.has(slot.sectionId)

                  return (
                    <li key={slot.id} className="relative flex gap-4 pl-10">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute top-2 left-1.5 flex size-5 items-center justify-center rounded-full border-2 bg-card text-[10px] font-bold",
                          isDone
                            ? "border-success text-success"
                            : "border-primary text-primary"
                        )}
                      >
                        {slot.period}
                      </span>

                      <div
                        className={cn(
                          "flex flex-1 flex-col justify-between gap-3 rounded-xl border bg-card p-4 transition-colors sm:flex-row sm:items-center",
                          slot.isSubstituted && "border-teal/40 bg-teal/5"
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14.5px] font-semibold text-foreground">
                              {slot.subject}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {slot.className} - {slot.section}
                            </Badge>
                            {slot.isLab && (
                              <Badge
                                variant="outline"
                                className="border-primary/30 text-primary"
                              >
                                Lab
                              </Badge>
                            )}
                            {slot.isSubstituted && (
                              <Badge variant="teal">Substituted</Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground">
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
                            <p className="text-[12.5px] text-teal-700">
                              Covering for {slot.substitutedFor}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {isDone ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                              <CheckCircle2 className="size-3.5" />
                              Completed
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
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
        <Card>
          <CardHeader>
            <CardTitle>Action Required</CardTitle>
            <CardDescription>
              Pending approvals, IA corrections, and log book reviews.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Student Leave Approvals */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-foreground">
                  Student Leave Requests
                </p>
                <Badge variant="secondary">
                  {dashboard.pendingStudentLeaves.length} pending
                </Badge>
              </div>

              {dashboard.pendingStudentLeaves.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-[13px] text-muted-foreground">
                  All student leave requests have been reviewed.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {dashboard.pendingStudentLeaves.map((leave) => (
                    <div
                      key={leave.id}
                      className="rounded-lg border bg-background/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[13.5px] font-semibold text-foreground">
                            {leave.studentName}
                          </p>
                          <p className="text-[12px] text-muted-foreground">
                            {leave.className}-{leave.section} · {leave.leaveType}{" "}
                            ({leave.daysCount}d · {leave.fromDate})
                          </p>
                        </div>
                        <StatusBadge status="Pending" />
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                        {leave.reason}
                      </p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button
                          type="button"
                          size="xs"
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
                <p className="text-[13px] font-semibold text-foreground">
                  IA Marks & Corrections
                </p>
                <Badge variant="secondary">{pendingAssessments.length}</Badge>
              </div>
              {pendingAssessments.map((ia) => (
                <div
                  key={ia.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {ia.title}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {ia.className}-{ia.section} · Max {ia.maxMarks} marks
                    </p>
                  </div>
                  <StatusBadge status={ia.status === "draft" ? "Draft" : "Pending"} />
                </div>
              ))}
            </div>

            <Separator />

            {/* Log Book Reviews */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-foreground">
                  Log Book Reviews {role === "hod" && "(HoD Queue)"}
                </p>
                <Badge variant="secondary">{pendingLogbooks.length}</Badge>
              </div>
              {pendingLogbooks.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {entry.topicCovered}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-error" />
                Low Attendance Alerts
              </CardTitle>
              <CardDescription>
                Students currently below the 75% minimum attendance threshold.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="border-error/30 bg-error/10 text-error"
            >
              {lowAttendanceStudents.length} Flagged
            </Badge>
          </CardHeader>
          <CardContent>
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
                    className="flex flex-col justify-between gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-foreground">
                          {student.fullName}
                        </span>
                        <Badge variant="secondary" className="font-mono text-[11px]">
                          {student.rollNo}
                        </Badge>
                      </div>
                      <p className="text-[12.5px] text-muted-foreground">
                        {student.className} - {student.section} · Guardian:{" "}
                        {student.guardianContact.guardianName} (
                        {student.guardianContact.relation})
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-[15px] font-bold text-error">
                          {student.attendancePercent}%
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          IA Avg: {student.iaAverage}%
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="size-4 text-primary" />
                Announcements & Events
              </CardTitle>
              <CardDescription>
                Institutional notices and parent–teacher updates.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/classes`} className="gap-1 text-primary">
                Rosters
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.announcements.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border p-4",
                  item.isPinned && "border-primary/25 bg-primary/[0.03]"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.isPinned && (
                      <Pin className="size-3.5 shrink-0 text-primary" />
                    )}
                    <h3 className="text-[14.5px] font-semibold text-foreground">
                      {item.title}
                    </h3>
                  </div>
                  <Badge
                    variant={
                      item.priority === "important" ? "brand" : "secondary"
                    }
                  >
                    {item.audience}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                  {item.content}
                </p>
                <div className="mt-2.5 flex items-center justify-between text-[12px] text-muted-foreground">
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Mark Attendance — {attendanceSlot?.className}{" "}
              {attendanceSlot?.section}
            </DialogTitle>
            <DialogDescription>
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
                    className="flex flex-col justify-between gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        {student.rollNo}
                      </span>
                      <span className="text-[13.5px] font-medium text-foreground">
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
                              "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
                              active
                                ? opt.value === "present"
                                  ? "border-success bg-success text-white"
                                  : opt.value === "absent"
                                    ? "border-error bg-error text-white"
                                    : opt.value === "late"
                                      ? "border-warning bg-warning text-white"
                                      : "border-teal bg-teal text-white"
                                : "border-border bg-card text-muted-foreground hover:bg-muted"
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAttendanceSlot(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
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
