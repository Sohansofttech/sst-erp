"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Lock,
  Plus,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createLogBookEntry,
  getLogBookEntries,
  getStudentLogReviews,
  getSubjectAllocations,
  reviewStudentLog,
} from "@/lib/services/teacher.service"
import type { ApprovalStatus } from "@/types/common"
import type {
  LogBookEntry,
  StudentLogReview,
  SubjectAllocation,
} from "@/types/teacher"

const logEntrySchema = z.object({
  allocationId: z.string().min(1, "Select class & subject."),
  date: z.string().min(1, "Select date."),
  period: z
    .number({ error: "Enter period number." })
    .int()
    .min(1, "Period 1–8")
    .max(8, "Period 1–8"),
  unit: z.string().trim().min(2, "Enter chapter / unit name."),
  topicCovered: z
    .string()
    .trim()
    .min(5, "Describe topic covered (min 5 chars)."),
  teachingMethod: z.enum([
    "Lecture",
    "Lab Demo",
    "Interactive",
    "Activity",
    "Assessment",
  ]),
  homeworkAssigned: z.string().optional(),
  remarks: z.string().optional(),
  syllabusProgressPercent: z
    .number({ error: "Enter syllabus progress %." })
    .min(0, "0–100")
    .max(100, "0–100"),
})

type LogEntryFormValues = z.infer<typeof logEntrySchema>

function mapApprovalStatus(status: ApprovalStatus | StudentLogReview["status"]) {
  if (status === "approved") return "Approved" as const
  if (status === "locked") return "Locked" as const
  if (status === "returned" || status === "rejected") return "Rejected" as const
  if (status === "submitted" || status === "in_review" || status === "pending")
    return "Pending" as const
  return "Draft" as const
}

export default function TeacherLogBookPage() {
  const [entries, setEntries] = React.useState<LogBookEntry[]>([])
  const [reviews, setReviews] = React.useState<StudentLogReview[]>([])
  const [allocations, setAllocations] = React.useState<SubjectAllocation[]>([])

  const [sectionFilter, setSectionFilter] = React.useState<string>("all")
  const [reviewFilter, setReviewFilter] = React.useState<string>("all")

  const [addOpen, setAddOpen] = React.useState(false)
  const [savingEntry, setSavingEntry] = React.useState(false)

  const [activeReview, setActiveReview] =
    React.useState<StudentLogReview | null>(null)
  const [reviewRemarks, setReviewRemarks] = React.useState("")
  const [savingReview, setSavingReview] = React.useState(false)

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<LogEntryFormValues>({
    resolver: zodResolver(logEntrySchema),
    defaultValues: {
      allocationId: "",
      date: "2026-11-12",
      period: 1,
      unit: "",
      topicCovered: "",
      teachingMethod: "Lecture",
      homeworkAssigned: "",
      remarks: "",
      syllabusProgressPercent: 75,
    },
  })

  const selectedMethod = useWatch({
    control: form.control,
    name: "teachingMethod",
  })

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getLogBookEntries(),
      getStudentLogReviews(),
      getSubjectAllocations(),
    ])
      .then(([logRes, revRes, allocRes]) => {
        setEntries(logRes)
        setReviews(revRes)
        setAllocations(allocRes)
        if (allocRes[0]) {
          form.setValue("allocationId", allocRes[0].id)
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load log book."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [form])

  React.useEffect(() => {
    let active = true
    Promise.all([
      getLogBookEntries(),
      getStudentLogReviews(),
      getSubjectAllocations(),
    ])
      .then(([logRes, revRes, allocRes]) => {
        if (!active) return
        setEntries(logRes)
        setReviews(revRes)
        setAllocations(allocRes)
        if (allocRes[0]) {
          form.setValue("allocationId", allocRes[0].id)
        }
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load log book."
        )
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [form])

  const handleAddEntry = form.handleSubmit(async (values) => {
    const alloc = allocations.find((a) => a.id === values.allocationId)
    if (!alloc) return

    setSavingEntry(true)
    try {
      const created = await createLogBookEntry({
        date: values.date,
        period: values.period,
        classId: alloc.sectionId,
        className: alloc.className,
        section: alloc.section,
        subjectId: alloc.subjectId,
        subjectName: alloc.subjectName,
        unit: values.unit,
        topicCovered: values.topicCovered,
        teachingMethod: values.teachingMethod,
        homeworkAssigned: values.homeworkAssigned?.trim() || undefined,
        remarks: values.remarks?.trim() || undefined,
        syllabusProgressPercent: values.syllabusProgressPercent,
        status: "submitted",
      })
      setEntries((prev) => [created, ...prev])
      setAddOpen(false)
      form.reset({
        allocationId: alloc.id,
        date: "2026-11-12",
        period: 1,
        unit: "",
        topicCovered: "",
        teachingMethod: "Lecture",
        homeworkAssigned: "",
        remarks: "",
        syllabusProgressPercent: alloc.syllabusCompletionPercent,
      })
      toast.success("Teaching log entry submitted for HoD verification.")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create log entry."
      )
    } finally {
      setSavingEntry(false)
    }
  })

  const openReviewModal = (item: StudentLogReview) => {
    setActiveReview(item)
    setReviewRemarks(item.teacherRemarks ?? "")
  }

  const handleStudentReview = async (decision: "approved" | "returned") => {
    if (!activeReview) return
    if (decision === "returned" && reviewRemarks.trim().length < 5) {
      toast.error("Please enter clear correction remarks before returning.")
      return
    }
    setSavingReview(true)
    try {
      const updated = await reviewStudentLog(
        activeReview.id,
        decision,
        reviewRemarks.trim() || undefined
      )
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      setActiveReview(null)
      toast.success(
        decision === "approved"
          ? `Log approved and locked for ${updated.studentName}.`
          : `Log returned to ${updated.studentName} for revision.`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update student review."
      )
    } finally {
      setSavingReview(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading academic log books"
        description="Fetching daily lecture logs and student project log reviews..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load log book"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const verifiedCount = entries.filter(
    (e) => e.status === "approved" || e.status === "locked"
  ).length
  const pendingStudentReviews = reviews.filter(
    (r) => r.status === "pending"
  ).length
  const lockedStudentReviews = reviews.filter(
    (r) => r.status === "locked" || r.status === "approved"
  ).length

  const filteredEntries =
    sectionFilter === "all"
      ? entries
      : entries.filter((e) => e.classId === sectionFilter)

  const filteredReviews =
    reviewFilter === "all"
      ? reviews
      : reviews.filter((r) => r.status === reviewFilter)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teaching & Project Log Book"
        subtitle="Maintain daily lecture/lab syllabus logs and review periodic student project & internship logs."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Log Lecture / Lab Topic
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="My Log Entries"
          value={entries.length}
          icon={<BookOpen />}
          tone="brand"
          description="Current term records"
        />
        <StatCard
          label="Verified by HoD"
          value={verifiedCount}
          icon={<CheckCircle2 />}
          tone="success"
          description="Syllabus progress audited"
        />
        <StatCard
          label="Pending Log Reviews"
          value={pendingStudentReviews}
          icon={<Clock />}
          tone="warning"
          description="Student project logs awaiting review"
        />
        <StatCard
          label="Approved & Locked"
          value={lockedStudentReviews}
          icon={<Lock />}
          tone="teal"
          description="Immutable student log records"
        />
      </div>

      <Tabs defaultValue="teaching" className="space-y-4">
        <TabsList>
          <TabsTrigger value="teaching">
            My Teaching / Lab Log Book ({entries.length})
          </TabsTrigger>
          <TabsTrigger value="student-reviews">
            Student Project / Internship Log Reviews ({reviews.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teaching" className="space-y-4">
          <Card className="bg-white">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Daily Lecture & Practical Register
                </CardTitle>
                <CardDescription>
                  Track unit-wise topics, pedagogy method, and cumulative syllabus completion.
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Select value={sectionFilter} onValueChange={setSectionFilter}>
                  <SelectTrigger aria-label="Filter by class">
                    <SelectValue placeholder="All Classes & Subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes & Subjects</SelectItem>
                    {allocations.map((a) => (
                      <SelectItem key={a.id} value={a.sectionId}>
                        {a.className} - {a.section} • {a.subjectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredEntries.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No log entries found"
                    description="Add a new lecture or lab log entry to record syllabus progress."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Period</TableHead>
                      <TableHead>Class & Subject</TableHead>
                      <TableHead>Unit & Topic Covered</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {entry.date}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Period {entry.period}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {entry.className} - {entry.section}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.subjectName}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="text-xs font-semibold text-brand">
                            {entry.unit}
                          </div>
                          <div className="text-sm text-foreground">
                            {entry.topicCovered}
                          </div>
                          {entry.homeworkAssigned && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              HW: {entry.homeworkAssigned}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.teachingMethod}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full bg-teal"
                                style={{
                                  width: `${entry.syllabusProgressPercent}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                              {entry.syllabusProgressPercent}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={mapApprovalStatus(entry.status)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="student-reviews" className="space-y-4">
          <Card className="bg-white">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Periodic Student Project & Internship Logs
                </CardTitle>
                <CardDescription>
                  Review weekly logs, leave formative remarks, return for revision, or approve & lock entries.
                </CardDescription>
              </div>
              <div className="w-full sm:w-52">
                <Select value={reviewFilter} onValueChange={setReviewFilter}>
                  <SelectTrigger aria-label="Filter student logs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Log Entries</SelectItem>
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                    <SelectItem value="locked">Approved & Locked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredReviews.length === 0 ? (
                <EmptyState
                  title="No student log submissions match filter"
                  description="Switch the filter above to view other project log entries."
                />
              ) : (
                filteredReviews.map((item) => {
                  const isLocked =
                    item.status === "locked" || item.status === "approved"
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {item.studentName}
                          </span>
                          <Badge variant="outline">{item.rollNo}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {item.weekLabel} • {item.hoursLogged} hrs logged
                          </span>
                          <StatusBadge status={mapApprovalStatus(item.status)} />
                        </div>
                        <div className="text-sm font-medium text-brand">
                          {item.projectTitle}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.summary}
                        </p>
                        {item.teacherRemarks && (
                          <div className="rounded-md bg-slate-50 px-3 py-1.5 text-xs text-foreground">
                            <span className="font-semibold">
                              Reviewer Remarks:{" "}
                            </span>
                            {item.teacherRemarks}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0">
                        <Button
                          size="sm"
                          variant={isLocked ? "outline" : "default"}
                          onClick={() => openReviewModal(item)}
                        >
                          {isLocked ? (
                            <>
                              <Lock className="size-3.5" />
                              View Locked Log
                            </>
                          ) : (
                            <>
                              <ClipboardCheck className="size-3.5" />
                              Review Entry
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Teaching Log Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Teaching / Lab Log Entry</DialogTitle>
            <DialogDescription>
              Log daily topic delivery and cumulative syllabus progress.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddEntry} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="allocationId">Class & Subject</Label>
              <Select
                value={form.getValues("allocationId")}
                onValueChange={(val) => form.setValue("allocationId", val)}
              >
                <SelectTrigger id="allocationId">
                  <SelectValue placeholder="Select class & subject" />
                </SelectTrigger>
                <SelectContent>
                  {allocations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.className} - {a.section} • {a.subjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="log-date">Date</Label>
                <Input id="log-date" type="date" {...form.register("date")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-period">Period (1–8)</Label>
                <Input
                  id="log-period"
                  type="number"
                  min={1}
                  max={8}
                  {...form.register("period", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-progress">Syllabus %</Label>
                <Input
                  id="log-progress"
                  type="number"
                  min={0}
                  max={100}
                  {...form.register("syllabusProgressPercent", {
                    valueAsNumber: true,
                  })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="log-unit">Unit / Chapter</Label>
                <Input
                  id="log-unit"
                  placeholder="e.g. Unit 5: Coordinate Geometry"
                  {...form.register("unit")}
                />
                {form.formState.errors.unit && (
                  <p className="text-xs text-error">
                    {form.formState.errors.unit.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-method">Teaching Method</Label>
                <Select
                  value={selectedMethod}
                  onValueChange={(val) =>
                    form.setValue(
                      "teachingMethod",
                      val as LogEntryFormValues["teachingMethod"]
                    )
                  }
                >
                  <SelectTrigger id="log-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lecture">Lecture</SelectItem>
                    <SelectItem value="Lab Demo">Lab Demo</SelectItem>
                    <SelectItem value="Interactive">Interactive</SelectItem>
                    <SelectItem value="Activity">Activity</SelectItem>
                    <SelectItem value="Assessment">Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="topicCovered">Topic Covered</Label>
              <Textarea
                id="topicCovered"
                rows={2}
                placeholder="Key theorems, solved examples, or practical demonstration..."
                {...form.register("topicCovered")}
              />
              {form.formState.errors.topicCovered && (
                <p className="text-xs text-error">
                  {form.formState.errors.topicCovered.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="homeworkAssigned">
                Homework / Follow-up Task (optional)
              </Label>
              <Input
                id="homeworkAssigned"
                placeholder="e.g. Exercise 7.2 Q1–Q6"
                {...form.register("homeworkAssigned")}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEntry}>
                {savingEntry ? "Submitting..." : "Submit Log Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Review Student Project Log Dialog */}
      <Dialog
        open={Boolean(activeReview)}
        onOpenChange={(open) => {
          if (!open) setActiveReview(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Student Project Log Review</DialogTitle>
            <DialogDescription>
              {activeReview
                ? `${activeReview.studentName} (${activeReview.rollNo}) • ${activeReview.weekLabel}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {activeReview && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-semibold text-brand">
                  {activeReview.projectTitle}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Submitted: {activeReview.entryDate} • Hours:{" "}
                  {activeReview.hoursLogged}h
                </div>
                <p className="mt-2 text-foreground">{activeReview.summary}</p>
              </div>

              {activeReview.status === "locked" ||
              activeReview.status === "approved" ? (
                <div className="flex items-start gap-2 rounded-lg border border-brand/25 bg-brand/8 p-3 text-xs text-brand">
                  <Lock className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <div className="font-semibold">
                      Entry Approved & Locked
                    </div>
                    <p className="mt-0.5">
                      {activeReview.teacherRemarks ||
                        "Approved without additional remarks."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="student-review-remarks">
                    Mentor / Guide Remarks
                  </Label>
                  <Textarea
                    id="student-review-remarks"
                    rows={3}
                    value={reviewRemarks}
                    onChange={(e) => setReviewRemarks(e.target.value)}
                    placeholder="Provide feedback on methodology, calculations, or missing evidence..."
                  />
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveReview(null)}
                >
                  Close
                </Button>
                {activeReview.status !== "locked" &&
                  activeReview.status !== "approved" && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-warning/40 text-amber-700 hover:bg-warning/10"
                        disabled={savingReview}
                        onClick={() => handleStudentReview("returned")}
                      >
                        <RotateCcw className="size-4" />
                        Return for Changes
                      </Button>
                      <Button
                        type="button"
                        disabled={savingReview}
                        onClick={() => handleStudentReview("approved")}
                      >
                        <Lock className="size-4" />
                        Approve & Lock
                      </Button>
                    </>
                  )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
