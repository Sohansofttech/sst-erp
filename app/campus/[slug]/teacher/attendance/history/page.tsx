"use client"

import * as React from "react"
import Link from "next/link"
import {
  CalendarCheck,
  Clock,
  Edit3,
  Eye,
  History,
  Lock,
  Save,
  Search,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  submitAttendance,
} from "@/lib/services/teacher.service"
import type {
  AttendanceSession,
  AttendanceStatus,
  ClassAllocation,
} from "@/types/teacher"
import { useTeacherRole } from "../../teacher-role-context"

const STATUS_TOGGLES: Array<{
  value: AttendanceStatus
  label: string
  activeClass: string
}> = [
  {
    value: "present",
    label: "Present",
    activeClass: "border-[#16A34A] bg-[#16A34A] text-white",
  },
  {
    value: "absent",
    label: "Absent",
    activeClass: "border-[#DC2626] bg-[#DC2626] text-white",
  },
  {
    value: "late",
    label: "Late",
    activeClass: "border-[#F59E0B] bg-[#F59E0B] text-white",
  },
  {
    value: "on_duty",
    label: "On-Duty",
    activeClass: "border-[#2563EB] bg-[#2563EB] text-white",
  },
]

function isSessionEditable(
  session: AttendanceSession,
  academicYear: string
): boolean {
  return (
    academicYear === "2026-27" &&
    session.status !== "locked" &&
    session.editWindowOpen
  )
}

function formatAuditTimestamp(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function TeacherAttendanceHistoryPage() {
  const { academicYear, slug } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [sessions, setSessions] = React.useState<AttendanceSession[]>([])
  const [classAllocs, setClassAllocs] = React.useState<ClassAllocation[]>([])

  // Table filters
  const [searchQuery, setSearchQuery] = React.useState("")
  const [sectionFilter, setSectionFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [dateFilter, setDateFilter] = React.useState("")

  // Detail / Edit Sheet state
  const [activeSession, setActiveSession] =
    React.useState<AttendanceSession | null>(null)
  const [editedStatuses, setEditedStatuses] = React.useState<
    Record<string, AttendanceStatus>
  >({})
  const [correctionReason, setCorrectionReason] = React.useState("")
  const [savingEdit, setSavingEdit] = React.useState(false)

  const fetchHistory = React.useCallback(async () => {
    const [allSessions, classes] = await Promise.all([
      getAttendanceSessions(),
      getClassAllocations(),
    ])
    return { allSessions, classes }
  }, [])

  const retryLoad = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { allSessions, classes } = await fetchHistory()
      setSessions(allSessions)
      setClassAllocs(classes)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load attendance history."
      )
    } finally {
      setLoading(false)
    }
  }, [fetchHistory])

  React.useEffect(() => {
    let active = true
    fetchHistory()
      .then(({ allSessions, classes }) => {
        if (!active) return
        setSessions(allSessions)
        setClassAllocs(classes)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load attendance history."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchHistory])

  const openSessionSheet = (session: AttendanceSession) => {
    const statusMap: Record<string, AttendanceStatus> = {}
    for (const rec of session.records) {
      statusMap[rec.studentId] = rec.status
    }
    setEditedStatuses(statusMap)
    setCorrectionReason("")
    setActiveSession(session)
  }

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSession) return

    if (
      activeSession.status === "submitted" &&
      !correctionReason.trim()
    ) {
      toast.error("Mandatory: Please provide a reason for correction.")
      return
    }

    setSavingEdit(true)
    try {
      const updated = await submitAttendance({
        sessionId: activeSession.id,
        institutionId: activeSession.institutionId,
        academicYearId: activeSession.academicYearId,
        classId: activeSession.classId,
        className: activeSession.className,
        sectionId: activeSession.sectionId,
        section: activeSession.section,
        subjectId: activeSession.subjectId,
        subjectName: activeSession.subjectName,
        date: activeSession.date,
        period: activeSession.period,
        status: "submitted",
        correctionReason:
          correctionReason.trim() || "Finalized draft attendance session",
        records: activeSession.records.map((rec) => ({
          studentId: rec.studentId,
          rollNo: rec.rollNo,
          studentName: rec.studentName,
          status: editedStatuses[rec.studentId] ?? rec.status,
          remarks: rec.remarks,
        })),
      })

      setSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      setActiveSession(updated)
      setCorrectionReason("")
      toast.success("Attendance correction saved and logged in Audit Trail")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update attendance."
      )
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Attendance History"
        description="Fetching past attendance sessions and audit logs..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load attendance history"
        description={error}
        onRetry={() => void retryLoad()}
      />
    )
  }

  const filteredSessions = sessions.filter((session) => {
    if (sectionFilter !== "all" && session.sectionId !== sectionFilter) {
      return false
    }
    if (dateFilter && session.date !== dateFilter) {
      return false
    }
    const editable = isSessionEditable(session, academicYear)
    if (statusFilter === "editable" && !editable) return false
    if (statusFilter === "locked" && editable) return false
    if (statusFilter === "draft" && session.status !== "draft") return false

    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      `${session.className} ${session.section}`.toLowerCase().includes(q) ||
      (session.subjectName ?? "").toLowerCase().includes(q) ||
      session.date.includes(q)
    )
  })

  const sheetEditable = activeSession
    ? isSessionEditable(activeSession, academicYear)
    : false

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance History & Audit Trail"
        subtitle={`Review past submitted sessions, apply permitted corrections, and inspect modification history · AY ${academicYear}`}
        action={
          <Button asChild>
            <Link href={`/campus/${slug}/teacher/attendance`}>
              <CalendarCheck className="size-4" />
              Mark Attendance
            </Link>
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card className="py-4">
        <CardContent className="grid gap-3 px-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search class, subject, date..."
              className="pl-9"
            />
          </div>

          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes & Sections</SelectItem>
              {classAllocs.map((alloc) => (
                <SelectItem key={alloc.sectionId} value={alloc.sectionId}>
                  {alloc.className} - Section {alloc.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="editable">Editable</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            {(searchQuery ||
              sectionFilter !== "all" ||
              statusFilter !== "all" ||
              dateFilter) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("")
                  setSectionFilter("all")
                  setStatusFilter("all")
                  setDateFilter("")
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            Submitted & Saved Attendance Sessions
          </CardTitle>
          <CardDescription>
            Showing {filteredSessions.length} of {sessions.length} recorded sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <EmptyState
              compact
              title="No matching attendance sessions"
              description="Try adjusting your class, date, or status filters."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Slot</TableHead>
                    <TableHead>Present / Absent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session) => {
                    const editable = isSessionEditable(session, academicYear)
                    return (
                      <TableRow key={session.id}>
                        <TableCell className="font-mono text-[13px]">
                          {session.date}
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">
                          {session.className} - {session.section}
                        </TableCell>
                        <TableCell>{session.subjectName ?? "—"}</TableCell>
                        <TableCell>Period {session.period ?? 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-success">
                              {session.presentCount} P
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="font-semibold text-error">
                              {session.absentCount} A
                            </span>
                            {(session.lateCount > 0 ||
                              session.onDutyCount > 0) && (
                              <span className="text-xs text-muted-foreground">
                                ({session.lateCount}L · {session.onDutyCount}OD)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {editable ? (
                              <Badge variant="teal">Editable</Badge>
                            ) : (
                              <StatusBadge status="Locked" />
                            )}
                            {session.status === "draft" && (
                              <StatusBadge status="Draft" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => openSessionSheet(session)}
                          >
                            {editable ? (
                              <>
                                <Edit3 className="size-3.5" />
                                View / Edit
                              </>
                            ) : (
                              <>
                                <Eye className="size-3.5" />
                                View / Edit
                              </>
                            )}
                          </Button>
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

      {/* Session View / Edit & Audit Trail Sheet */}
      <Sheet
        open={Boolean(activeSession)}
        onOpenChange={(open) => {
          if (!open) setActiveSession(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          {activeSession && (
            <>
              <SheetHeader className="border-b pb-4">
                <div className="flex flex-wrap items-center gap-2 pr-6">
                  <SheetTitle>
                    {activeSession.className} - {activeSession.section} ·{" "}
                    {activeSession.subjectName}
                  </SheetTitle>
                  {sheetEditable ? (
                    <Badge variant="teal">Editable</Badge>
                  ) : (
                    <StatusBadge status="Locked" />
                  )}
                </div>
                <SheetDescription>
                  {activeSession.date} · Period {activeSession.period ?? 1} ·{" "}
                  {activeSession.presentCount} Present /{" "}
                  {activeSession.absentCount} Absent /{" "}
                  {activeSession.lateCount} Late /{" "}
                  {activeSession.onDutyCount} On-Duty
                </SheetDescription>
              </SheetHeader>

              <form
                onSubmit={(e) => void handleSaveCorrection(e)}
                className="space-y-6 p-4"
              >
                {!sheetEditable && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-brand/25 bg-brand/8 p-3.5 text-[13px] text-brand">
                    <Lock className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <span className="font-semibold">Session Locked:</span>{" "}
                      {academicYear !== "2026-27"
                        ? `Academic year ${academicYear} is closed.`
                        : "The edit window for this attendance session has closed."}
                    </div>
                  </div>
                )}

                {/* Student Records List */}
                <div className="space-y-2.5">
                  <h4 className="text-[14px] font-semibold text-foreground">
                    Student Attendance Records ({activeSession.records.length})
                  </h4>
                  <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border p-2.5">
                    {activeSession.records.map((rec) => {
                      const current =
                        editedStatuses[rec.studentId] ?? rec.status
                      return (
                        <div
                          key={rec.id}
                          className="flex flex-col justify-between gap-2 rounded-lg border bg-card px-3 py-2 sm:flex-row sm:items-center"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs font-semibold text-muted-foreground">
                              {rec.rollNo}
                            </span>
                            <span className="text-[13.5px] font-medium text-foreground">
                              {rec.studentName}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {STATUS_TOGGLES.map((opt) => {
                              const active = current === opt.value
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  disabled={!sheetEditable}
                                  onClick={() =>
                                    setEditedStatuses((prev) => ({
                                      ...prev,
                                      [rec.studentId]: opt.value,
                                    }))
                                  }
                                  className={cn(
                                    "rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-65",
                                    active
                                      ? opt.activeClass
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
                </div>

                {/* Mandatory Correction Reason when editable */}
                {sheetEditable && (
                  <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="history-correction-reason">
                        Reason for correction{" "}
                        {activeSession.status === "submitted" && (
                          <span className="text-error">*</span>
                        )}
                      </Label>
                      <Textarea
                        id="history-correction-reason"
                        rows={2}
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        placeholder="Mandatory audit reason (e.g., Late medical certificate verified by Class Teacher)"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setActiveSession(null)}
                      >
                        Close
                      </Button>
                      <Button type="submit" disabled={savingEdit}>
                        <Save className="size-4" />
                        {savingEdit ? "Saving..." : "Save Correction"}
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Audit Trail Log */}
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                    <Clock className="size-4 text-primary" />
                    Audit Trail ({activeSession.auditHistory.length})
                  </h4>

                  <ol className="space-y-2.5">
                    {[...activeSession.auditHistory]
                      .reverse()
                      .map((entry) => (
                        <li
                          key={entry.id}
                          className="rounded-xl border bg-background p-3 text-[13px]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-foreground">
                              {entry.actorName}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[11px] capitalize"
                            >
                              {entry.action}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {entry.summary}
                          </p>
                          {entry.reason && (
                            <p className="mt-1 rounded-md bg-warning/10 px-2.5 py-1 text-[12px] text-amber-900">
                              <span className="font-semibold">Reason:</span>{" "}
                              {entry.reason}
                            </p>
                          )}
                          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                            {formatAuditTimestamp(entry.timestamp)}
                          </p>
                        </li>
                      ))}
                  </ol>
                </div>
              </form>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
