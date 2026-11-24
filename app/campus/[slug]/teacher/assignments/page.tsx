"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Plus,
  Upload,
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  createAssignment,
  getAssignments,
  getAssignmentSubmissions,
  getSubjectAllocations,
  gradeAssignmentSubmission,
} from "@/lib/services/teacher.service"
import type {
  Assignment,
  AssignmentSubmission,
  SubjectAllocation,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const createAssignmentSchema = z.object({
  subjectAllocationId: z.string().min(1, "Select class & subject"),
  title: z.string().min(3, "Title must be at least 3 characters"),
  unit: z.string().optional(),
  description: z.string().min(10, "Provide clear instructions (min 10 chars)"),
  dueDate: z.string().min(1, "Due date is required"),
  maxMarks: z
    .number({ error: "Enter valid maximum marks" })
    .min(1, "Minimum 1 mark")
    .max(200, "Maximum 200 marks"),
  allowLateSubmission: z.boolean(),
})

type CreateAssignmentValues = z.infer<typeof createAssignmentSchema>

export default function TeacherAssignmentsPage() {
  const { academicYear } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [assignments, setAssignments] = React.useState<Assignment[]>([])
  const [subjectAllocs, setSubjectAllocs] = React.useState<SubjectAllocation[]>(
    []
  )
  const [sectionFilter, setSectionFilter] = React.useState("all")

  // Create Assignment Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [attachmentName, setAttachmentName] = React.useState("")
  const [attachmentError, setAttachmentError] = React.useState<string | null>(
    null
  )

  // Review Submissions state
  const [reviewingAssignment, setReviewingAssignment] =
    React.useState<Assignment | null>(null)
  const [submissions, setSubmissions] = React.useState<AssignmentSubmission[]>(
    []
  )
  const [loadingSubmissions, setLoadingSubmissions] = React.useState(false)
  const [gradeInputs, setGradeInputs] = React.useState<
    Record<string, { marks: string; feedback: string }>
  >({})
  const [gradeErrors, setGradeErrors] = React.useState<Record<string, string>>(
    {}
  )
  const [savingSubmissionId, setSavingSubmissionId] = React.useState<
    string | null
  >(null)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors: formErrors, isSubmitting },
  } = useForm<CreateAssignmentValues>({
    resolver: zodResolver(createAssignmentSchema),
    defaultValues: {
      subjectAllocationId: "",
      title: "",
      unit: "",
      description: "",
      dueDate: "2026-11-22",
      maxMarks: 20,
      allowLateSubmission: true,
    },
  })

  const selectedAllocId = useWatch({ control, name: "subjectAllocationId" })
  const allowLate = useWatch({ control, name: "allowLateSubmission" })

  const fetchInitial = React.useCallback(async () => {
    const [asgList, allocs] = await Promise.all([
      getAssignments(),
      getSubjectAllocations(),
    ])
    return { asgList, allocs }
  }, [])

  const retryLoad = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { asgList, allocs } = await fetchInitial()
      setAssignments(asgList)
      setSubjectAllocs(allocs)
      if (allocs[0]) setValue("subjectAllocationId", allocs[0].id)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load assignments."
      )
    } finally {
      setLoading(false)
    }
  }, [fetchInitial, setValue])

  React.useEffect(() => {
    let active = true
    fetchInitial()
      .then(({ asgList, allocs }) => {
        if (!active) return
        setAssignments(asgList)
        setSubjectAllocs(allocs)
        if (allocs[0]) setValue("subjectAllocationId", allocs[0].id)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load assignments."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchInitial, setValue])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setAttachmentName("")
      setAttachmentError(null)
      return
    }
    const maxBytes = 10 * 1024 * 1024
    if (file.size > maxBytes) {
      setAttachmentError("File exceeds 10 MB limit.")
      setAttachmentName("")
      return
    }
    setAttachmentError(null)
    setAttachmentName(file.name)
  }

  const onCreateAssignment = async (values: CreateAssignmentValues) => {
    const alloc = subjectAllocs.find((s) => s.id === values.subjectAllocationId)
    if (!alloc) return
    try {
      const created = await createAssignment({
        classId: alloc.classId,
        className: alloc.className,
        sectionId: alloc.sectionId,
        section: alloc.section,
        subjectId: alloc.subjectId,
        subjectName: alloc.subjectName,
        title: values.title,
        unit: values.unit?.trim() || undefined,
        description: values.description,
        dueDate: values.dueDate,
        maxMarks: values.maxMarks,
        allowLateSubmission: values.allowLateSubmission,
        attachmentName: attachmentName || undefined,
        status: "published",
      })
      setAssignments((prev) => [created, ...prev])
      setCreateOpen(false)
      setAttachmentName("")
      reset({
        subjectAllocationId: alloc.id,
        title: "",
        unit: "",
        description: "",
        dueDate: "2026-11-22",
        maxMarks: 20,
        allowLateSubmission: true,
      })
      toast.success(`Assignment "${created.title}" published`)
    } catch {
      toast.error("Failed to create assignment.")
    }
  }

  const openReviewSubmissions = async (assignment: Assignment) => {
    setReviewingAssignment(assignment)
    setLoadingSubmissions(true)
    setGradeErrors({})
    try {
      const subs = await getAssignmentSubmissions(assignment.id)
      setSubmissions(subs)
      const initialInputs: Record<string, { marks: string; feedback: string }> =
        {}
      for (const s of subs) {
        initialInputs[s.id] = {
          marks:
            s.obtainedMarks !== null && s.obtainedMarks !== undefined
              ? String(s.obtainedMarks)
              : "",
          feedback: s.feedback ?? "",
        }
      }
      setGradeInputs(initialInputs)
    } catch {
      toast.error("Unable to load student submissions.")
    } finally {
      setLoadingSubmissions(false)
    }
  }

  const handleGradeSubmission = async (sub: AssignmentSubmission) => {
    if (!reviewingAssignment) return
    const input = gradeInputs[sub.id]
    const raw = input?.marks?.trim() ?? ""
    const parsed = Number(raw)
    if (
      raw === "" ||
      Number.isNaN(parsed) ||
      parsed < 0 ||
      parsed > reviewingAssignment.maxMarks
    ) {
      setGradeErrors((prev) => ({
        ...prev,
        [sub.id]: `Enter 0 – ${reviewingAssignment.maxMarks}`,
      }))
      return
    }

    setSavingSubmissionId(sub.id)
    try {
      const updated = await gradeAssignmentSubmission(
        sub.id,
        parsed,
        input?.feedback?.trim() || undefined
      )
      setSubmissions((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      )
      if (sub.status !== "graded") {
        setAssignments((prev) =>
          prev.map((a) =>
            a.id === reviewingAssignment.id
              ? { ...a, gradedCount: a.gradedCount + 1 }
              : a
          )
        )
        setReviewingAssignment((prev) =>
          prev ? { ...prev, gradedCount: prev.gradedCount + 1 } : prev
        )
      }
      setGradeErrors((prev) => {
        const next = { ...prev }
        delete next[sub.id]
        return next
      })
      toast.success(`Graded ${updated.studentName} (${parsed}/${reviewingAssignment.maxMarks})`)
    } catch {
      toast.error("Failed to save grade.")
    } finally {
      setSavingSubmissionId(null)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Assignments"
        description="Fetching class assignments and student submission progress..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load assignments"
        description={error}
        onRetry={() => void retryLoad()}
      />
    )
  }

  // Review Submissions Screen
  if (reviewingAssignment) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Review Submissions — ${reviewingAssignment.title}`}
          subtitle={`${reviewingAssignment.className}-${reviewingAssignment.section} · ${reviewingAssignment.subjectName} · Max Marks: ${reviewingAssignment.maxMarks} · Due ${reviewingAssignment.dueDate}`}
          badge={
            <StatusBadge
              status={
                reviewingAssignment.status === "published"
                  ? "Published"
                  : reviewingAssignment.status === "closed"
                    ? "Locked"
                    : "Draft"
              }
            />
          }
          action={
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setReviewingAssignment(null)}
            >
              <ArrowLeft className="size-4" />
              Back to Assignments
            </Button>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Student Submissions</CardTitle>
            <CardDescription>
              {reviewingAssignment.submittedCount}/
              {reviewingAssignment.totalStudents} submitted ·{" "}
              {reviewingAssignment.gradedCount} graded
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSubmissions ? (
              <LoadingState compact title="Loading submissions..." />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24 sticky left-0 bg-white z-10 shadow-xs">Roll No</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Attachment</TableHead>
                      <TableHead className="w-36">
                        Marks (/{reviewingAssignment.maxMarks})
                      </TableHead>
                      <TableHead>Teacher Feedback</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((sub) => {
                      const entry = gradeInputs[sub.id] ?? {
                        marks: "",
                        feedback: "",
                      }
                      const err = gradeErrors[sub.id]
                      const isPending = sub.status === "pending"
                      return (
                        <TableRow key={sub.id}>
                          <TableCell className="font-mono text-[13px] font-semibold sticky left-0 bg-white z-10 shadow-xs">
                            {sub.rollNo}
                          </TableCell>
                          <TableCell className="font-medium">
                            {sub.studentName}
                          </TableCell>
                          <TableCell>
                            {sub.status === "graded" ? (
                              <StatusBadge status="Approved" />
                            ) : sub.status === "late" ? (
                              <StatusBadge status="Late" />
                            ) : sub.status === "submitted" ? (
                              <StatusBadge status="Published" />
                            ) : (
                              <StatusBadge status="Pending" />
                            )}
                          </TableCell>
                          <TableCell>
                            {sub.fileName ? (
                              <button
                                type="button"
                                onClick={() =>
                                  toast.info(`Previewing ${sub.fileName}`, {
                                    description: `Submitted on ${sub.submittedAt?.slice(0, 10) ?? "—"}`,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
                              >
                                <FileText className="size-3.5" />
                                <span className="max-w-36 truncate">
                                  {sub.fileName}
                                </span>
                                <ExternalLink className="size-3" />
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not uploaded
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                type="number"
                                disabled={isPending}
                                value={entry.marks}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setGradeInputs((prev) => ({
                                    ...prev,
                                    [sub.id]: { ...entry, marks: val },
                                  }))
                                  setGradeErrors((prev) => {
                                    const next = { ...prev }
                                    delete next[sub.id]
                                    return next
                                  })
                                }}
                                placeholder={isPending ? "—" : "Marks"}
                                className={cn(
                                  "h-8 w-24 font-mono",
                                  err && "border-[#DC2626]"
                                )}
                              />
                              {err && (
                                <p className="text-[11px] font-semibold text-[#DC2626]">
                                  {err}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              disabled={isPending}
                              value={entry.feedback}
                              onChange={(e) => {
                                const val = e.target.value
                                setGradeInputs((prev) => ({
                                  ...prev,
                                  [sub.id]: { ...entry, feedback: val },
                                }))
                              }}
                              placeholder={
                                isPending
                                  ? "Awaiting submission"
                                  : "Add feedback..."
                              }
                              className="h-8 min-w-44"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="xs"
                              disabled={
                                isPending || savingSubmissionId === sub.id
                              }
                              onClick={() => void handleGradeSubmission(sub)}
                            >
                              {savingSubmissionId === sub.id
                                ? "Saving..."
                                : sub.status === "graded"
                                  ? "Update"
                                  : "Save Grade"}
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
      </div>
    )
  }

  const filteredAssignments =
    sectionFilter === "all"
      ? assignments
      : assignments.filter((a) => a.sectionId === sectionFilter)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignment Management"
        subtitle={`Create class assignments, track submission progress, and grade student work · AY ${academicYear}`}
        action={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create Assignment
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card className="py-4 rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardContent className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 px-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            <Label htmlFor="asg-filter" className="whitespace-nowrap">Class & Subject:</Label>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger id="asg-filter" className="w-full sm:w-64">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assigned Sections</SelectItem>
                {subjectAllocs.map((alloc) => (
                  <SelectItem key={alloc.sectionId} value={alloc.sectionId}>
                    {alloc.className} - {alloc.section} ({alloc.subjectName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary">
            {filteredAssignments.length} Assignments
          </Badge>
        </CardContent>
      </Card>

      {/* Assignment Cards */}
      {filteredAssignments.length === 0 ? (
        <EmptyState
          title="No assignments found"
          description="Create your first assignment for this class and section."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create Assignment
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredAssignments.map((asg) => {
            const pct =
              asg.totalStudents > 0
                ? Math.round((asg.submittedCount / asg.totalStudents) * 100)
                : 0
            return (
              <Card key={asg.id} className="flex flex-col justify-between rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="brand" className="rounded-full bg-[#123B5A]/10 text-[#123B5A] border-[#123B5A]/20 font-bold">
                          {asg.className}-{asg.section}
                        </Badge>
                        <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936] font-semibold">{asg.subjectName}</Badge>
                        {asg.allowLateSubmission !== false && (
                          <Badge variant="outline" className="rounded-full border-[#E5E9EF] text-[#788391]">Late Allowed</Badge>
                        )}
                      </div>
                      <CardTitle className="pt-1 text-[#202936]">{asg.title}</CardTitle>
                    </div>
                    <StatusBadge
                      status={
                        asg.status === "published"
                          ? "Published"
                          : asg.status === "closed"
                            ? "Locked"
                            : "Draft"
                      }
                    />
                  </div>
                  <CardDescription className="text-[#788391]">{asg.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#788391]">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      Due: <strong className="text-[#202936]">{asg.dueDate}</strong>
                    </span>
                    <span>
                      Max Marks:{" "}
                      <strong className="text-[#202936]">{asg.maxMarks}</strong>
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-bold text-[#202936]">
                        Submission Progress
                      </span>
                      <span className="font-bold text-[#F5A000]">
                        {asg.submittedCount}/{asg.totalStudents} submitted ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEF1F5]">
                      <div
                        className="h-full rounded-full bg-[#F5A000] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[12px] text-[#788391]">
                      {asg.gradedCount} of {asg.submittedCount} submissions graded
                    </p>
                  </div>
                </CardContent>

                <CardFooter className="border-t pt-4">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void openReviewSubmissions(asg)}
                  >
                    <ClipboardList className="size-4" />
                    Review Submissions
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create Assignment Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:max-w-lg">
          <form onSubmit={handleSubmit(onCreateAssignment)}>
            <DialogHeader>
              <DialogTitle>Create Assignment</DialogTitle>
              <DialogDescription>
                Publish a new coursework task to students with due date and max marks.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="asg-alloc">Class & Subject</Label>
                <Select
                  value={selectedAllocId}
                  onValueChange={(val) =>
                    setValue("subjectAllocationId", val, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="asg-alloc" className="w-full">
                    <SelectValue placeholder="Select class & subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjectAllocs.map((alloc) => (
                      <SelectItem key={alloc.id} value={alloc.id}>
                        {alloc.className}-{alloc.section} · {alloc.subjectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.subjectAllocationId && (
                  <p className="text-xs font-medium text-error">
                    {formErrors.subjectAllocationId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asg-title">Assignment Title</Label>
                <Input
                  id="asg-title"
                  placeholder="e.g., Coordinate Geometry Problem Set"
                  {...register("title")}
                />
                {formErrors.title && (
                  <p className="text-xs font-medium text-error">
                    {formErrors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asg-unit">Unit / Chapter (Optional)</Label>
                <Input
                  id="asg-unit"
                  placeholder="e.g., Unit 7: Coordinate Geometry"
                  {...register("unit")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asg-desc">Instructions</Label>
                <Textarea
                  id="asg-desc"
                  rows={3}
                  placeholder="Describe submission format, problem numbers, and rubric..."
                  {...register("description")}
                />
                {formErrors.description && (
                  <p className="text-xs font-medium text-error">
                    {formErrors.description.message}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="asg-due">Due Date</Label>
                  <Input id="asg-due" type="date" {...register("dueDate")} />
                  {formErrors.dueDate && (
                    <p className="text-xs font-medium text-error">
                      {formErrors.dueDate.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="asg-max">Max Marks</Label>
                  <Input
                    id="asg-max"
                    type="number"
                    {...register("maxMarks", { valueAsNumber: true })}
                  />
                  {formErrors.maxMarks && (
                    <p className="text-xs font-medium text-error">
                      {formErrors.maxMarks.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-lg border p-3">
                <Checkbox
                  id="asg-late"
                  checked={allowLate}
                  onCheckedChange={(checked) =>
                    setValue("allowLateSubmission", checked === true)
                  }
                />
                <Label htmlFor="asg-late" className="cursor-pointer">
                  Allow late submissions after due date
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asg-file">Attachment (Optional, max 10 MB)</Label>
                <label
                  htmlFor="asg-file"
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed px-3.5 py-2.5 text-[13px] transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Upload className="size-4 text-primary" />
                    {attachmentName || "Click to attach worksheet PDF/DOCX"}
                  </span>
                  {attachmentName && (
                    <CheckCircle2 className="size-4 text-success" />
                  )}
                  <input
                    id="asg-file"
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
                {attachmentError && (
                  <p className="text-xs font-medium text-error">
                    {attachmentError}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? "Publishing..." : "Publish Assignment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

