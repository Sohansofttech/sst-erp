"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircle,
  CalendarCheck,
  CheckCheck,
  Clock,
  History,
  Lock,
  Save,
  Search,
  Send,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "@/components/shared"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  getAttendanceSessions,
  getClassAllocations,
  getSectionStudents,
  getSubjectAllocations,
  getTimetable,
  submitAttendance,
} from "@/lib/services/teacher.service"
import type {
  AttendanceSession,
  AttendanceStatus,
  ClassAllocation,
  StudentRosterItem,
  SubjectAllocation,
  TimetableSlot,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const STATUS_PILLS: Array<{
  value: AttendanceStatus
  label: string
  activeClass: string
  hoverClass: string
}> = [
  {
    value: "present",
    label: "Present",
    activeClass: "border-emerald-600 bg-emerald-600 text-white shadow-xs",
    hoverClass: "hover:border-emerald-500 hover:text-emerald-700",
  },
  {
    value: "absent",
    label: "Absent",
    activeClass: "border-rose-600 bg-rose-600 text-white shadow-xs",
    hoverClass: "hover:border-rose-500 hover:text-rose-700",
  },
  {
    value: "late",
    label: "Late",
    activeClass: "border-amber-500 bg-[#F5A000] text-white shadow-xs",
    hoverClass: "hover:border-[#F5A000] hover:text-amber-800",
  },
  {
    value: "on_duty",
    label: "On-Duty",
    activeClass: "border-[#123B5A] bg-[#123B5A] text-white shadow-xs",
    hoverClass: "hover:border-[#123B5A] hover:text-[#123B5A]",
  },
]

const PERIOD_OPTIONS = [
  { period: 1, label: "Period 1 (08:30 – 09:15)" },
  { period: 2, label: "Period 2 (09:15 – 10:00)" },
  { period: 3, label: "Period 3 (10:15 – 11:00)" },
  { period: 4, label: "Period 4 (11:00 – 11:45)" },
  { period: 5, label: "Period 5 (11:45 – 12:30)" },
  { period: 6, label: "Period 6 (13:15 – 14:00)" },
  { period: 7, label: "Period 7 (14:00 – 14:45)" },
]

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

function buildDefaultStatuses(
  students: StudentRosterItem[],
  matchingSession?: AttendanceSession
): Record<string, AttendanceStatus> {
  const next: Record<string, AttendanceStatus> = {}
  const recordMap = new Map(
    matchingSession?.records.map((r) => [r.studentId, r.status]) ?? []
  )
  for (const s of students) {
    next[s.studentId] = recordMap.get(s.studentId) ?? "present"
  }
  return next
}

export default function TeacherAttendancePage() {
  const { academicYear, slug } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [classAllocs, setClassAllocs] = React.useState<ClassAllocation[]>([])
  const [subjectAllocs, setSubjectAllocs] = React.useState<SubjectAllocation[]>(
    []
  )
  const [timetable, setTimetable] = React.useState<TimetableSlot[]>([])
  const [sessions, setSessions] = React.useState<AttendanceSession[]>([])

  // Filter bar state
  const [selectedSectionId, setSelectedSectionId] = React.useState("sec-10b")
  const [selectedSubjectId, setSelectedSubjectId] =
    React.useState("sub-math-10")
  const [selectedDate, setSelectedDate] = React.useState("2026-11-12")
  const [selectedPeriod, setSelectedPeriod] = React.useState("2")

  // Student roster & marking state
  const [students, setStudents] = React.useState<StudentRosterItem[]>([])
  const [loadingStudents, setLoadingStudents] = React.useState(false)
  const [statuses, setStatuses] = React.useState<
    Record<string, AttendanceStatus>
  >({})
  const [searchQuery, setSearchQuery] = React.useState("")

  // Submission & confirmation modal state
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [correctionReason, setCorrectionReason] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const fetchInitialData = React.useCallback(async () => {
    const [classes, subjects, tt, allSessions, initialRoster] =
      await Promise.all([
        getClassAllocations(),
        getSubjectAllocations(),
        getTimetable(),
        getAttendanceSessions(),
        getSectionStudents("sec-10b"),
      ])
    return { classes, subjects, tt, allSessions, initialRoster }
  }, [])

  const retryInitial = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { classes, subjects, tt, allSessions, initialRoster } =
        await fetchInitialData()
      setClassAllocs(classes)
      setSubjectAllocs(subjects)
      setTimetable(tt)
      setSessions(allSessions)
      setStudents(initialRoster)
      const matching = allSessions.find(
        (s) =>
          s.sectionId === "sec-10b" &&
          s.date === "2026-11-12" &&
          (s.period ?? 1) === 2
      )
      setStatuses(buildDefaultStatuses(initialRoster, matching))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load attendance workspace."
      )
    } finally {
      setLoading(false)
    }
  }, [fetchInitialData])

  React.useEffect(() => {
    let active = true
    fetchInitialData()
      .then(({ classes, subjects, tt, allSessions, initialRoster }) => {
        if (!active) return
        setClassAllocs(classes)
        setSubjectAllocs(subjects)
        setTimetable(tt)
        setSessions(allSessions)
        setStudents(initialRoster)
        const matching = allSessions.find(
          (s) =>
            s.sectionId === "sec-10b" &&
            s.date === "2026-11-12" &&
            (s.period ?? 1) === 2
        )
        setStatuses(buildDefaultStatuses(initialRoster, matching))
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load attendance workspace."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchInitialData])

  const matchingSession = React.useMemo(() => {
    const periodNum = Number(selectedPeriod)
    return sessions.find(
      (s) =>
        s.sectionId === selectedSectionId &&
        s.date === selectedDate &&
        (s.period ?? 1) === periodNum
    )
  }, [sessions, selectedSectionId, selectedDate, selectedPeriod])

  const handleSectionChange = async (nextSectionId: string) => {
    setSelectedSectionId(nextSectionId)
    const sectionSub = subjectAllocs.find((s) => s.sectionId === nextSectionId)
    if (sectionSub) {
      setSelectedSubjectId(sectionSub.subjectId)
    }
    setLoadingStudents(true)
    try {
      const roster = await getSectionStudents(nextSectionId)
      const periodNum = Number(selectedPeriod)
      const match = sessions.find(
        (s) =>
          s.sectionId === nextSectionId &&
          s.date === selectedDate &&
          (s.period ?? 1) === periodNum
      )
      setStudents(roster)
      setStatuses(buildDefaultStatuses(roster, match))
    } catch {
      toast.error("Could not load students for selected section.")
    } finally {
      setLoadingStudents(false)
    }
  }

  // Re-sync default statuses whenever date or period changes
  const handleSlotOrDateChange = (nextDate: string, nextPeriod: string) => {
    setSelectedDate(nextDate)
    setSelectedPeriod(nextPeriod)
    const periodNum = Number(nextPeriod)
    const match = sessions.find(
      (s) =>
        s.sectionId === selectedSectionId &&
        s.date === nextDate &&
        (s.period ?? 1) === periodNum
    )
    setStatuses(buildDefaultStatuses(students, match))
  }

  const isAcademicYearClosed = academicYear !== "2026-27"
  const isSessionLocked = Boolean(
    matchingSession &&
      (matchingSession.status === "locked" || !matchingSession.editWindowOpen)
  )
  const isAlreadySubmittedEditable = Boolean(
    matchingSession &&
      matchingSession.status === "submitted" &&
      matchingSession.editWindowOpen &&
      !isAcademicYearClosed
  )
  const isReadOnly = isAcademicYearClosed || isSessionLocked

  const handleMarkAllPresent = () => {
    if (isReadOnly) return
    const next: Record<string, AttendanceStatus> = {}
    for (const s of students) {
      next[s.studentId] = "present"
    }
    setStatuses(next)
    toast.success(`Marked all ${students.length} students Present`)
  }

  const performSave = async (targetStatus: "draft" | "submitted") => {
    const activeClass = classAllocs.find(
      (c) => c.sectionId === selectedSectionId
    )
    const activeSubject = subjectAllocs.find(
      (s) =>
        s.sectionId === selectedSectionId && s.subjectId === selectedSubjectId
    )
    if (!activeClass) return

    if (
      targetStatus === "submitted" &&
      isAlreadySubmittedEditable &&
      !correctionReason.trim()
    ) {
      toast.error("Please enter a reason for modifying this submitted slot.")
      return
    }

    setSubmitting(true)
    try {
      const saved = await submitAttendance({
        sessionId: matchingSession?.id,
        institutionId: activeClass.institutionId,
        academicYearId: "ay-2026-27",
        classId: activeClass.classId,
        className: activeClass.className,
        sectionId: activeClass.sectionId,
        section: activeClass.section,
        subjectId: activeSubject?.subjectId,
        subjectName: activeSubject?.subjectName ?? "Mathematics",
        date: selectedDate,
        period: Number(selectedPeriod),
        status: targetStatus,
        correctionReason: isAlreadySubmittedEditable
          ? correctionReason.trim()
          : undefined,
        records: students.map((student) => ({
          studentId: student.studentId,
          rollNo: student.rollNo,
          studentName: student.fullName,
          status: statuses[student.studentId] ?? "present",
        })),
      })

      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id)
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = saved
          return copy
        }
        return [saved, ...prev]
      })

      setConfirmOpen(false)
      setCorrectionReason("")
      toast.success(
        targetStatus === "submitted"
          ? `Attendance submitted for ${saved.className}-${saved.section} (Period ${saved.period})`
          : `Draft saved for ${saved.className}-${saved.section} (Period ${saved.period})`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save attendance."
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Attendance Register"
        description="Fetching assigned sections, timetable slots, and student rosters..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load attendance register"
        description={error}
        onRetry={() => void retryInitial()}
      />
    )
  }

  const sectionSubjects = subjectAllocs.filter(
    (s) => s.sectionId === selectedSectionId
  )
  const sectionSlots = timetable.filter(
    (t) => t.sectionId === selectedSectionId
  )

  const filteredStudents = students.filter((student) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      student.fullName.toLowerCase().includes(q) ||
      student.rollNo.toLowerCase().includes(q)
    )
  })

  const totalCount = students.length
  const presentCount = students.filter(
    (s) => (statuses[s.studentId] ?? "present") === "present"
  ).length
  const absentStudents = students.filter(
    (s) => statuses[s.studentId] === "absent"
  )
  const lateCount = students.filter(
    (s) => statuses[s.studentId] === "late"
  ).length
  const onDutyCount = students.filter(
    (s) => statuses[s.studentId] === "on_duty"
  ).length

  const activeClass = classAllocs.find((c) => c.sectionId === selectedSectionId)
  const activeSubject = subjectAllocs.find(
    (s) =>
      s.sectionId === selectedSectionId && s.subjectId === selectedSubjectId
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mark Daily Attendance"
        subtitle="Select class, subject, date, and timetable slot to record student attendance."
        badge={
          matchingSession ? (
            <StatusBadge
              status={
                matchingSession.status === "locked"
                  ? "Locked"
                  : matchingSession.status === "submitted"
                    ? "Published"
                    : "Draft"
              }
            />
          ) : (
            <Badge variant="outline">New Session</Badge>
          )
        }
        action={
          <Button variant="outline" asChild>
            <Link href={`/campus/${slug}/teacher/attendance/history`}>
              <History className="size-4" />
              Attendance History
            </Link>
          </Button>
        }
      />

      {/* Top Filter Bar */}
      <Card className="py-4">
        <CardContent className="grid gap-4 px-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="att-section">Class & Section</Label>
            <Select
              value={selectedSectionId}
              onValueChange={(val) => void handleSectionChange(val)}
            >
              <SelectTrigger id="att-section" className="w-full">
                <SelectValue placeholder="Select class & section" />
              </SelectTrigger>
              <SelectContent>
                {classAllocs.map((alloc) => (
                  <SelectItem key={alloc.sectionId} value={alloc.sectionId}>
                    {alloc.className} - Section {alloc.section} (
                    {alloc.studentCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="att-subject">Subject</Label>
            <Select
              value={selectedSubjectId}
              onValueChange={setSelectedSubjectId}
            >
              <SelectTrigger id="att-subject" className="w-full">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {sectionSubjects.map((sub) => (
                  <SelectItem key={sub.subjectId} value={sub.subjectId}>
                    {sub.subjectName} ({sub.subjectCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="att-date">Date</Label>
            <Input
              id="att-date"
              type="date"
              value={selectedDate}
              onChange={(e) =>
                handleSlotOrDateChange(e.target.value, selectedPeriod)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="att-slot">Timetable Slot</Label>
            <Select
              value={selectedPeriod}
              onValueChange={(val) =>
                handleSlotOrDateChange(selectedDate, val)
              }
            >
              <SelectTrigger id="att-slot" className="w-full">
                <SelectValue placeholder="Select slot" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => {
                  const mapped = sectionSlots.find(
                    (s) => s.period === opt.period
                  )
                  return (
                    <SelectItem key={opt.period} value={String(opt.period)}>
                      {opt.label}
                      {mapped ? ` · ${mapped.day.slice(0, 3)}` : ""}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lock / Duplicate Submission Rule Banners */}
      {isAcademicYearClosed && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-error/30 bg-error/10 p-4 text-[13.5px] text-red-900"
        >
          <Lock className="mt-0.5 size-5 shrink-0 text-error" />
          <div>
            <p className="font-semibold">
              Academic Year {academicYear} is Closed (Read-Only)
            </p>
            <p className="mt-0.5 text-red-800/90">
              Attendance registers for past academic years are permanently locked. Switch back to AY 2026-27 in the header to mark or edit attendance.
            </p>
          </div>
        </div>
      )}

      {!isAcademicYearClosed && isSessionLocked && matchingSession && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-brand/25 bg-brand/8 p-4 text-[13.5px] text-brand"
        >
          <Lock className="mt-0.5 size-5 shrink-0 text-brand" />
          <div>
            <p className="font-semibold">
              Slot Locked — Duplicate Submission Blocked
            </p>
            <p className="mt-0.5 text-slate-700">
              Attendance for {matchingSession.className}-
              {matchingSession.section} on {matchingSession.date} (Period{" "}
              {matchingSession.period}) is{" "}
              {matchingSession.status === "locked"
                ? "locked by administration"
                : "past its edit window"}
              . Modifications require Campus Admin unlock.
            </p>
          </div>
        </div>
      )}

      {!isAcademicYearClosed && isAlreadySubmittedEditable && matchingSession && (
        <div
          role="status"
          className="flex flex-col justify-between gap-3 rounded-xl border border-warning/35 bg-warning/10 p-4 text-[13.5px] text-amber-950 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">
                Already Submitted — Edit Window Open
              </p>
              <p className="mt-0.5 text-amber-900">
                Duplicate submissions are prevented. You may submit a correction while the edit window is open (mandatory correction reason required).
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="shrink-0 bg-card">
            <Link href={`/campus/${slug}/teacher/attendance/history`}>
              View Audit Log
            </Link>
          </Button>
        </div>
      )}

      {/* Quick Actions Bar + Live Summary Counter */}
      <Card className="py-4">
        <CardContent className="flex flex-col gap-4 px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={isReadOnly || loadingStudents}
              onClick={handleMarkAllPresent}
            >
              <CheckCheck className="size-4 text-success" />
              Mark All Present
            </Button>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search student or roll no..."
                className="pl-9"
              />
            </div>
          </div>

          <div
            aria-label="Live Attendance Summary"
            className="flex flex-wrap items-center gap-2"
          >
            <Badge variant="secondary" className="px-2.5 py-1 text-xs rounded-full bg-[#EEF1F5] text-[#202936]">
              Total: {totalCount}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
            >
              Present: {presentCount}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"
            >
              Absent: {absentStudents.length}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
            >
              Late: {lateCount}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#123B5A]"
            >
              On-Duty: {onDutyCount}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Fast Student Grid / Table */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="size-4 text-primary" />
              {activeClass
                ? `${activeClass.className} - Section ${activeClass.section}`
                : "Section Register"}{" "}
              · {activeSubject?.subjectName ?? "Subject"}
            </CardTitle>
            <CardDescription>
              {selectedDate} · Period {selectedPeriod} · Toggle status pills for rapid attendance marking.
            </CardDescription>
          </div>
          {!isReadOnly && (
            <div className="flex items-center gap-2">
              {!isAlreadySubmittedEditable && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting || loadingStudents}
                  onClick={() => void performSave("draft")}
                >
                  <Save className="size-4" />
                  Save Draft
                </Button>
              )}
              <Button
                type="button"
                disabled={submitting || loadingStudents || students.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                <Send className="size-4" />
                {isAlreadySubmittedEditable
                  ? "Submit Correction"
                  : "Submit Attendance"}
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {loadingStudents ? (
            <LoadingState compact title="Loading section roster..." />
          ) : filteredStudents.length === 0 ? (
            <EmptyState
              compact
              title="No matching students"
              description="No students matched your search filter in this section."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Roll No</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Term Attendance
                    </TableHead>
                    <TableHead className="text-right">Status Toggle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => {
                    const current = statuses[student.studentId] ?? "present"
                    return (
                      <TableRow key={student.studentId}>
                        <TableCell className="font-mono text-[13px] font-semibold">
                          {student.rollNo}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar size="sm">
                              <AvatarFallback className="bg-brand/12 text-[11px] font-semibold text-brand">
                                {getInitials(student.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-[13.5px] font-semibold text-foreground">
                                {student.fullName}
                              </p>
                              <p className="font-mono text-[11.5px] text-muted-foreground">
                                {student.admissionNo}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span
                            className={cn(
                              "text-[13px] font-semibold",
                              student.attendancePercent < 75
                                ? "text-error"
                                : "text-muted-foreground"
                            )}
                          >
                            {student.attendancePercent}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            role="group"
                            aria-label={`Attendance status for ${student.fullName}`}
                            className="inline-flex flex-wrap justify-end gap-1.5"
                          >
                            {STATUS_PILLS.map((pill) => {
                              const active = current === pill.value
                              return (
                                <button
                                  key={pill.value}
                                  type="button"
                                  disabled={isReadOnly}
                                  aria-pressed={active}
                                  onClick={() =>
                                    setStatuses((prev) => ({
                                      ...prev,
                                      [student.studentId]: pill.value,
                                    }))
                                  }
                                  className={cn(
                                    "rounded-full border px-3 py-1 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60",
                                    active
                                      ? pill.activeClass
                                      : cn(
                                          "border-border bg-card text-muted-foreground",
                                          pill.hoverClass
                                        )
                                  )}
                                >
                                  {pill.label}
                                </button>
                              )
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isAlreadySubmittedEditable
                ? "Confirm Attendance Correction"
                : "Confirm Attendance Submission"}
            </DialogTitle>
            <DialogDescription>
              {activeClass?.className} - Section {activeClass?.section} ·{" "}
              {activeSubject?.subjectName} · {selectedDate} (Period{" "}
              {selectedPeriod})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 rounded-xl border bg-muted/40 p-3 text-center text-xs">
              <div>
                <p className="text-muted-foreground">Present</p>
                <p className="mt-0.5 text-lg font-bold text-success">
                  {presentCount}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Absent</p>
                <p className="mt-0.5 text-lg font-bold text-error">
                  {absentStudents.length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Late</p>
                <p className="mt-0.5 text-lg font-bold text-amber-600">
                  {lateCount}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">On-Duty</p>
                <p className="mt-0.5 text-lg font-bold text-primary">
                  {onDutyCount}
                </p>
              </div>
            </div>

            <div className="rounded-xl border p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-foreground">
                  Total Absent Students: {absentStudents.length}
                </p>
                {absentStudents.length === 0 && (
                  <Badge
                    variant="outline"
                    className="border-success/30 bg-success/10 text-success"
                  >
                    100% Present
                  </Badge>
                )}
              </div>
              {absentStudents.length > 0 && (
                <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[13px] text-muted-foreground">
                  {absentStudents.map((s) => (
                    <li key={s.studentId} className="flex items-center gap-2">
                      <AlertCircle className="size-3.5 shrink-0 text-error" />
                      <span className="font-mono text-xs">{s.rollNo}</span>
                      <span className="font-medium text-foreground">
                        {s.fullName}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isAlreadySubmittedEditable && (
              <div className="space-y-1.5">
                <Label htmlFor="correction-reason">
                  Reason for correction <span className="text-error">*</span>
                </Label>
                <Textarea
                  id="correction-reason"
                  rows={2}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g., Student arrived with medical slip / On-Duty verification updated"
                />
              </div>
            )}

            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Clock className="size-3.5" />
              Once submitted, edits remain open until the end-of-day edit window closes.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void performSave("submitted")}
            >
              {submitting ? "Submitting..." : "Confirm & Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

