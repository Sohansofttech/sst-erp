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
          <Button onClick={() => setAddOpen(true)} className="w-full sm:w-auto rounded-xl bg-[#F5A000] text-white hover:bg-[#E09200]">
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
          variant="dark"
          tone="darkNavy"
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
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-2 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5] p-1">
            <TabsTrigger value="teaching" className="shrink-0 rounded-lg data-[state=active]:bg-[#123B5A] data-[state=active]:text-white data-[state=active]:font-semibold">
              My Teaching / Lab Log Book ({entries.length})
            </TabsTrigger>
            <TabsTrigger value="student-reviews" className="shrink-0 rounded-lg data-[state=active]:bg-[#123B5A] data-[state=active]:text-white data-[state=active]:font-semibold">
              Student Project / Internship Log Reviews ({reviews.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="teaching" className="space-y-4">
          <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-[#202936]">
                  Daily Lecture & Practical Register
                </CardTitle>
                <CardDescription className="text-sm text-[#788391]">
                  Track unit-wise topics, pedagogy method, and cumulative syllabus completion.
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Select value={sectionFilter} onValueChange={setSectionFilter}>
                  <SelectTrigger className="rounded-xl border-[#E5E9EF] bg-white text-[#202936]" aria-label="Filter by class">
                    <SelectValue placeholder="All Classes & Subjects" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[#E5E9EF]">
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
                <div className="overflow-x-auto">
                  <Table className="w-full">
                    <TableHeader className="bg-[#EEF1F5]/80">
                      <TableRow className="border-b border-[#E5E9EF]">
                        <TableHead className="font-bold text-[#788391]">Date & Period</TableHead>
                        <TableHead className="font-bold text-[#788391]">Class & Subject</TableHead>
                        <TableHead className="font-bold text-[#788391]">Unit & Topic Covered</TableHead>
                        <TableHead className="font-bold text-[#788391]">Method</TableHead>
                        <TableHead className="font-bold text-[#788391]">Progress</TableHead>
                        <TableHead className="font-bold text-[#788391]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-[#E5E9EF]">
                      {filteredEntries.map((entry) => (
                        <TableRow key={entry.id} className="border-b border-[#E5E9EF] hover:bg-[#EEF1F5]/50 transition-colors">
                          <TableCell>
                            <div className="font-bold text-[#202936]">
                              {entry.date}
                            </div>
                            <div className="text-xs text-[#788391]">
                              Period {entry.period}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-bold text-[#202936]">
                              {entry.className} - {entry.section}
                            </div>
                            <div className="text-xs text-[#788391]">
                              {entry.subjectName}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div className="text-xs font-bold text-[#123B5A]">
                              {entry.unit}
                            </div>
                            <div className="text-sm font-medium text-[#202936]">
                              {entry.topicCovered}
                            </div>
                            {entry.homeworkAssigned && (
                              <div className="mt-1 text-xs text-[#788391]">
                                HW: {entry.homeworkAssigned}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-[#E5E9EF] bg-[#EEF1F5] text-[#202936]">
                              {entry.teachingMethod}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-16 overflow-hidden rounded-full bg-[#EEF1F5]">
                                <div
                                  className="h-full bg-[#F5A000]"
                                  style={{
                                    width: `${entry.syllabusProgressPercent}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-bold text-[#202936]">
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
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="student-reviews" className="space-y-4">
          <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-[#202936]">
                  Periodic Student Project & Internship Logs
                </CardTitle>
                <CardDescription className="text-sm text-[#788391]">
                  Review weekly logs, leave formative remarks, return for revision, or approve & lock entries.
                </CardDescription>
              </div>
              <div className="w-full sm:w-52">
                <Select value={reviewFilter} onValueChange={setReviewFilter}>
                  <SelectTrigger className="rounded-xl border-[#E5E9EF] bg-white text-[#202936]" aria-label="Filter student logs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[#E5E9EF]">
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
                      className="flex flex-col justify-between gap-4 rounded-xl border border-[#E5E9EF] p-4 bg-white sm:flex-row sm:items-center hover:border-[#123B5A]/30 transition-all"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[#202936]">
                            {item.studentName}
                          </span>
                          <Badge variant="outline" className="border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-semibold">{item.rollNo}</Badge>
                          <span className="text-xs text-[#788391]">
                            {item.weekLabel} • {item.hoursLogged} hrs logged
                          </span>
                          <StatusBadge status={mapApprovalStatus(item.status)} />
                        </div>
                        <div className="text-sm font-bold text-[#123B5A]">
                          {item.projectTitle}
                        </div>
                        <p className="text-sm text-[#788391]">
                          {item.summary}
                        </p>
                        {item.teacherRemarks && (
                          <div className="rounded-xl bg-[#EEF1F5]/60 border border-[#E5E9EF] px-3 py-1.5 text-xs text-[#202936]">
                            <span className="font-bold text-[#123B5A]">
                              Reviewer Remarks:{" "}
                            </span>
                            {item.teacherRemarks}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 w-full sm:w-auto">
                        <Button
                          size="sm"
                          variant={isLocked ? "outline" : "default"}
                          onClick={() => openReviewModal(item)}
                          className={cn(
                            "w-full sm:w-auto rounded-xl",
                            isLocked
                              ? "border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                              : "bg-[#F5A000] text-white hover:bg-[#E09200]"
                          )}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] rounded-2xl border-[#E5E9EF] bg-white shadow-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#202936]">New Teaching / Lab Log Entry</DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              Log daily topic delivery and cumulative syllabus progress.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddEntry} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="allocationId" className="text-xs font-semibold text-[#202936]">Class & Subject</Label>
              <Select
                value={form.getValues("allocationId")}
                onValueChange={(val) => form.setValue("allocationId", val)}
              >
                <SelectTrigger id="allocationId" className="rounded-xl border-[#E5E9EF] bg-white text-[#202936]">
                  <SelectValue placeholder="Select class & subject" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[#E5E9EF]">
                  {allocations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.className} - {a.section} • {a.subjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="log-date" className="text-xs font-semibold text-[#202936]">Date</Label>
                <Input id="log-date" type="date" className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]" {...form.register("date")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-period" className="text-xs font-semibold text-[#202936]">Period (1–8)</Label>
                <Input
                  id="log-period"
                  type="number"
                  min={1}
                  max={8}
                  className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                  {...form.register("period", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-progress" className="text-xs font-semibold text-[#202936]">Syllabus %</Label>
                <Input
                  id="log-progress"
                  type="number"
                  min={0}
                  max={100}
                  className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                  {...form.register("syllabusProgressPercent", {
                    valueAsNumber: true,
                  })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="log-unit" className="text-xs font-semibold text-[#202936]">Unit / Chapter</Label>
                <Input
                  id="log-unit"
                  placeholder="e.g. Unit 5: Coordinate Geometry"
                  className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                  {...form.register("unit")}
                />
                {form.formState.errors.unit && (
                  <p className="text-xs text-rose-600">
                    {form.formState.errors.unit.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-method" className="text-xs font-semibold text-[#202936]">Teaching Method</Label>
                <Select
                  value={selectedMethod}
                  onValueChange={(val) =>
                    form.setValue(
                      "teachingMethod",
                      val as LogEntryFormValues["teachingMethod"]
                    )
                  }
                >
                  <SelectTrigger id="log-method" className="rounded-xl border-[#E5E9EF] bg-white text-[#202936]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[#E5E9EF]">
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
              <Label htmlFor="topicCovered" className="text-xs font-semibold text-[#202936]">Topic Covered</Label>
              <Textarea
                id="topicCovered"
                rows={2}
                placeholder="Key theorems, solved examples, or practical demonstration..."
                className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                {...form.register("topicCovered")}
              />
              {form.formState.errors.topicCovered && (
                <p className="text-xs text-rose-600">
                  {form.formState.errors.topicCovered.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="homeworkAssigned" className="text-xs font-semibold text-[#202936]">
                Homework / Follow-up Task (optional)
              </Label>
              <Input
                id="homeworkAssigned"
                placeholder="e.g. Exercise 7.2 Q1–Q6"
                className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                {...form.register("homeworkAssigned")}
              />
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEntry} className="w-full sm:w-auto rounded-xl bg-[#F5A000] text-white hover:bg-[#E09200]">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] rounded-2xl border-[#E5E9EF] bg-white shadow-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#202936]">Student Project Log Review</DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              {activeReview
                ? `${activeReview.studentName} (${activeReview.rollNo}) • ${activeReview.weekLabel}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {activeReview && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/50 p-3.5 text-sm">
                <div className="font-bold text-[#123B5A]">
                  {activeReview.projectTitle}
                </div>
                <div className="mt-1 text-xs text-[#788391]">
                  Submitted: {activeReview.entryDate} • Hours:{" "}
                  {activeReview.hoursLogged}h
                </div>
                <p className="mt-2 text-[#202936]">{activeReview.summary}</p>
              </div>

              {activeReview.status === "locked" ||
              activeReview.status === "approved" ? (
                <div className="flex items-start gap-2 rounded-xl border border-[#123B5A]/25 bg-[#123B5A]/8 p-3 text-xs text-[#123B5A]">
                  <Lock className="mt-0.5 size-4 shrink-0 text-[#123B5A]" />
                  <div>
                    <div className="font-bold">
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
                  <Label htmlFor="student-review-remarks" className="text-xs font-semibold text-[#202936]">
                    Mentor / Guide Remarks
                  </Label>
                  <Textarea
                    id="student-review-remarks"
                    rows={3}
                    value={reviewRemarks}
                    onChange={(e) => setReviewRemarks(e.target.value)}
                    placeholder="Provide feedback on methodology, calculations, or missing evidence..."
                    className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                  />
                </div>
              )}

              <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
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
                        className="w-full sm:w-auto rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
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
                        className="w-full sm:w-auto rounded-xl bg-[#123B5A] text-white hover:bg-[#1B4D70]"
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
