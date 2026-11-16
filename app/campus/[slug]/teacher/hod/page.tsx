"use client"

import * as React from "react"
import {
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Lock,
  RotateCcw,
  ShieldCheck,
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
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  getDepartmentFacultyLoad,
  getInternalAssessments,
  getSubjectAllocations,
  updateInternalAssessmentStatus,
} from "@/lib/services/teacher.service"
import type { ApprovalStatus } from "@/types/common"
import type {
  DepartmentFacultyLoad,
  InternalAssessment,
  SubjectAllocation,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

function mapIAStatus(status: ApprovalStatus) {
  if (status === "approved") return "Approved" as const
  if (status === "locked") return "Locked" as const
  if (status === "returned" || status === "rejected") return "Rejected" as const
  if (status === "submitted" || status === "in_review") return "Pending" as const
  return "Draft" as const
}

export default function HodOversightPage() {
  const { role, setRole } = useTeacherRole()
  const [facultyLoad, setFacultyLoad] = React.useState<DepartmentFacultyLoad[]>(
    []
  )
  const [allocations, setAllocations] = React.useState<SubjectAllocation[]>([])
  const [assessments, setAssessments] = React.useState<InternalAssessment[]>(
    []
  )
  const [returnTarget, setReturnTarget] =
    React.useState<InternalAssessment | null>(null)
  const [returnNote, setReturnNote] = React.useState("")
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getDepartmentFacultyLoad(),
      getSubjectAllocations(),
      getInternalAssessments(),
    ])
      .then(([facRes, allocRes, iaRes]) => {
        setFacultyLoad(facRes)
        setAllocations(allocRes)
        setAssessments(iaRes)
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load HoD dashboard."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([
      getDepartmentFacultyLoad(),
      getSubjectAllocations(),
      getInternalAssessments(),
    ])
      .then(([facRes, allocRes, iaRes]) => {
        if (!active) return
        setFacultyLoad(facRes)
        setAllocations(allocRes)
        setAssessments(iaRes)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load HoD dashboard."
        )
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleIAStatus = async (
    ia: InternalAssessment,
    nextStatus: ApprovalStatus,
    note?: string
  ) => {
    setBusyId(ia.id)
    try {
      const updated = await updateInternalAssessmentStatus(
        ia.id,
        nextStatus,
        note
      )
      setAssessments((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      )
      toast.success(
        nextStatus === "locked"
          ? `${ia.title} (${ia.className}-${ia.section}) approved & locked.`
          : nextStatus === "approved"
            ? `${ia.title} (${ia.className}-${ia.section}) approved by HoD.`
            : `${ia.title} returned to faculty for correction.`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update IA status."
      )
    } finally {
      setBusyId(null)
    }
  }

  const submitReturn = async () => {
    if (!returnTarget) return
    if (returnNote.trim().length < 5) {
      toast.error("Provide a clear reason for returning IA marks.")
      return
    }
    await handleIAStatus(returnTarget, "returned", returnNote.trim())
    setReturnTarget(null)
    setReturnNote("")
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading HoD Oversight Console"
        description="Aggregating Department of Mathematics faculty workload and IA approval queues..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load HoD Oversight"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const totalWeeklyHours = facultyLoad.reduce(
    (sum, f) => sum + f.weeklyHours,
    0
  )
  const pendingApprovals = assessments.filter(
    (ia) => ia.status === "submitted" || ia.status === "in_review"
  ).length
  const deptAvgAttendance =
    facultyLoad.length > 0
      ? Math.round(
          (facultyLoad.reduce(
            (sum, f) => sum + f.attendanceAveragePercent,
            0
          ) /
            facultyLoad.length) *
            10
        ) / 10
      : 0
  const deptAvgSyllabus =
    facultyLoad.length > 0
      ? Math.round(
          (facultyLoad.reduce((sum, f) => sum + f.syllabusAveragePercent, 0) /
            facultyLoad.length) *
            10
        ) / 10
      : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="HoD Oversight — Department of Mathematics"
        subtitle="Department-scoped course allocation, faculty workload balance, Internal Assessment lock & approval queue, and academic attendance/result summary."
      />

      {role !== "hod" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/25 bg-brand/8 px-4 py-3 text-sm text-brand">
          <span>
            Viewing <strong>Department of Mathematics</strong> oversight.
            Switch the demo role toggle to <strong>HoD</strong> to approve or
            lock department IA submissions.
          </span>
          <Button size="sm" onClick={() => setRole("hod")}>
            Switch to HoD Role
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Department Faculty"
          value={facultyLoad.length}
          icon={<Users />}
          tone="brand"
          description="Mathematics Wing"
        />
        <StatCard
          label="Dept Weekly Hours"
          value={`${totalWeeklyHours} hrs`}
          icon={<Clock />}
          tone="teal"
          description={`Avg ${(totalWeeklyHours / Math.max(1, facultyLoad.length)).toFixed(1)}h / faculty`}
        />
        <StatCard
          label="IA Approval Queue"
          value={pendingApprovals}
          icon={<ShieldCheck />}
          tone="warning"
          description="Submitted marks awaiting HoD lock"
        />
        <StatCard
          label="Dept Avg Attendance"
          value={`${deptAvgAttendance}%`}
          icon={<BarChart3 />}
          tone="success"
          description={`Avg syllabus: ${deptAvgSyllabus}%`}
        />
      </div>

      <Tabs defaultValue="ia-queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ia-queue">
            IA Marks Lock & Approval Queue ({assessments.length})
          </TabsTrigger>
          <TabsTrigger value="workload">
            Course Allocations & Faculty Workload ({facultyLoad.length})
          </TabsTrigger>
          <TabsTrigger value="summary">
            Department Attendance & Result Summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ia-queue" className="space-y-4">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">
                Internal Assessment Moderation & Lock Queue
              </CardTitle>
              <CardDescription>
                Approve submitted IA marks, lock finalized sheets for report cards, or return sheets with correction remarks.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {assessments.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No IA cycles found"
                    description="Internal assessments submitted by department faculty will appear here."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assessment</TableHead>
                      <TableHead>Class & Subject</TableHead>
                      <TableHead>Entries</TableHead>
                      <TableHead>Section Mean</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">HoD Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assessments.map((ia) => {
                      const scored = ia.marks.filter(
                        (m) => !m.isAbsent && m.obtainedMarks !== null
                      )
                      const mean =
                        scored.length > 0
                          ? Math.round(
                              (scored.reduce(
                                (sum, m) => sum + (m.obtainedMarks ?? 0),
                                0
                              ) /
                                scored.length) *
                                10
                            ) / 10
                          : 0
                      const isLocked = ia.status === "locked"

                      return (
                        <TableRow key={ia.id}>
                          <TableCell>
                            <div className="font-medium text-foreground">
                              {ia.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Date: {ia.conductedDate} • Max: {ia.maxMarks}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">
                              {ia.className} - {ia.section}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {ia.subjectName}
                            </div>
                          </TableCell>
                          <TableCell>
                            {scored.length}/{ia.marks.length} graded
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {mean}/{ia.maxMarks}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={mapIAStatus(ia.status)} />
                          </TableCell>
                          <TableCell className="text-right">
                            {isLocked ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                                <Lock className="size-3.5" />
                                Locked & Published
                              </span>
                            ) : (
                              <div className="inline-flex flex-wrap justify-end gap-1.5">
                                {ia.status !== "approved" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      role !== "hod" || busyId === ia.id
                                    }
                                    onClick={() =>
                                      handleIAStatus(ia, "approved")
                                    }
                                  >
                                    <CheckCircle2 className="size-3.5" />
                                    Approve
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  disabled={role !== "hod" || busyId === ia.id}
                                  onClick={() => handleIAStatus(ia, "locked")}
                                >
                                  <Lock className="size-3.5" />
                                  Lock Marks
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-warning/40 text-amber-700 hover:bg-warning/10"
                                  disabled={role !== "hod" || busyId === ia.id}
                                  onClick={() => {
                                    setReturnTarget(ia)
                                    setReturnNote(ia.correctionNote ?? "")
                                  }}
                                >
                                  <RotateCcw className="size-3.5" />
                                  Return
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workload" className="space-y-4">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">
                Faculty Workload Balance (Weekly Hours vs 22h Norm)
              </CardTitle>
              <CardDescription>
                Compare weekly period load, section allocation, and syllabus pacing across Department of Mathematics faculty.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {facultyLoad.map((fac) => {
                const loadPct = Math.min(
                  100,
                  Math.round((fac.weeklyHours / 22) * 100)
                )
                return (
                  <div
                    key={fac.teacherId}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div>
                        <div className="font-semibold text-foreground">
                          {fac.fullName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fac.designation} • {fac.subjects.join(" • ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {fac.sectionsCount} sections
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            fac.weeklyHours >= 21
                              ? "border-warning/35 bg-warning/12 text-amber-700"
                              : "border-primary/25 bg-primary/8 text-primary"
                          )}
                        >
                          {fac.weeklyHours} / 22 hrs/wk
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            Teaching Load Utilization
                          </span>
                          <span className="font-semibold text-foreground">
                            {loadPct}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              fac.weeklyHours >= 21 ? "bg-warning" : "bg-primary"
                            )}
                            style={{ width: `${loadPct}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            Syllabus Completion Avg
                          </span>
                          <span className="font-semibold text-foreground">
                            {fac.syllabusAveragePercent}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-teal"
                            style={{ width: `${fac.syllabusAveragePercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">
                Active Course Allocations
              </CardTitle>
              <CardDescription>
                Curriculum codes, assigned sections, and weekly timetable periods.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject Code</TableHead>
                    <TableHead>Course Title</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Weekly Periods</TableHead>
                    <TableHead>Syllabus %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-brand">
                        {a.subjectCode}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {a.subjectName}
                      </TableCell>
                      <TableCell>
                        {a.className} - {a.section}
                      </TableCell>
                      <TableCell>{a.weeklyHours} hrs/wk</TableCell>
                      <TableCell className="font-semibold text-foreground">
                        {a.syllabusCompletionPercent}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {facultyLoad.map((fac) => (
              <Card key={fac.teacherId} className="bg-white">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">
                        {fac.fullName}
                      </CardTitle>
                      <CardDescription>{fac.subjects.join(", ")}</CardDescription>
                    </div>
                    <BookOpenCheck className="size-4 text-teal" />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md bg-slate-50 p-2.5">
                    <div className="text-[11px] text-muted-foreground">
                      Attendance Avg
                    </div>
                    <div className="mt-0.5 text-lg font-bold text-foreground">
                      {fac.attendanceAveragePercent}%
                    </div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2.5">
                    <div className="text-[11px] text-muted-foreground">
                      Syllabus Pacing
                    </div>
                    <div className="mt-0.5 text-lg font-bold text-teal">
                      {fac.syllabusAveragePercent}%
                    </div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2.5">
                    <div className="text-[11px] text-muted-foreground">
                      Sections
                    </div>
                    <div className="mt-0.5 text-lg font-bold text-brand">
                      {fac.sectionsCount}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Return IA Marks Dialog */}
      <Dialog
        open={Boolean(returnTarget)}
        onOpenChange={(open) => {
          if (!open) setReturnTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Return IA Marks for Correction</DialogTitle>
            <DialogDescription>
              {returnTarget
                ? `${returnTarget.title} • ${returnTarget.className} - ${returnTarget.section}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="hod-return-note">Correction Instructions</Label>
            <Textarea
              id="hod-return-note"
              rows={3}
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder="Specify missing re-test marks or rounding discrepancies..."
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReturnTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!returnTarget || busyId === returnTarget?.id}
              onClick={submitReturn}
            >
              Confirm Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
