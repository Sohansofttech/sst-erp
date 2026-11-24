"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Globe,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  type StatusType,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createInternalAssessment,
  getInternalAssessments,
  getSubjectAllocations,
  publishInternalAssessment,
  requestIACorrection,
  saveIAMarks,
} from "@/lib/services/teacher.service"
import type { ApprovalStatus } from "@/types/common"
import type { InternalAssessment, SubjectAllocation } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const defineIASchema = z
  .object({
    subjectAllocationId: z.string().min(1, "Select a class & subject"),
    title: z.string().min(3, "Assessment title must be at least 3 characters"),
    componentName: z.string().min(2, "Component name is required (e.g. IA-2)"),
    maxMarks: z
      .number({ error: "Enter maximum marks" })
      .min(5, "Minimum 5 marks")
      .max(200, "Maximum 200 marks"),
    passingMarks: z
      .number({ error: "Enter passing marks" })
      .min(1, "Minimum 1 mark"),
    weightagePercent: z
      .number({ error: "Enter weightage %" })
      .min(1, "Minimum 1%")
      .max(100, "Maximum 100%"),
    conductedDate: z.string().min(1, "Conducted date is required"),
  })
  .refine((data) => data.passingMarks <= data.maxMarks, {
    message: "Passing marks cannot exceed maximum marks",
    path: ["passingMarks"],
  })

type DefineIAFormValues = z.infer<typeof defineIASchema>

interface LocalMarkRow {
  studentId: string
  rollNo: string
  studentName: string
  obtainedMarks: string
  isAbsent: boolean
  remarks: string
}

function mapApprovalToStatusBadge(status: ApprovalStatus): StatusType {
  switch (status) {
    case "draft":
      return "Draft"
    case "submitted":
    case "in_review":
      return "Pending"
    case "returned":
    case "rejected":
      return "Rejected"
    case "approved":
      return "Approved"
    case "locked":
      return "Locked"
    default:
      return "Draft"
  }
}

export default function TeacherAssessmentsPage() {
  const { academicYear } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [assessments, setAssessments] = React.useState<InternalAssessment[]>(
    []
  )
  const [subjectAllocs, setSubjectAllocs] = React.useState<SubjectAllocation[]>(
    []
  )
  const [activeTab, setActiveTab] = React.useState("enter")

  // Marks entry selection & editable state
  const [selectedSectionFilter, setSelectedSectionFilter] =
    React.useState("all")
  const [selectedAssessmentId, setSelectedAssessmentId] = React.useState("")
  const [markRows, setMarkRows] = React.useState<LocalMarkRow[]>([])
  const [markErrors, setMarkErrors] = React.useState<Record<string, string>>(
    {}
  )
  const [savingMarks, setSavingMarks] = React.useState(false)

  // Correction request dialog
  const [correctionTarget, setCorrectionTarget] =
    React.useState<InternalAssessment | null>(null)
  const [correctionNote, setCorrectionNote] = React.useState("")

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors: formErrors, isSubmitting: creatingIA },
  } = useForm<DefineIAFormValues>({
    resolver: zodResolver(defineIASchema),
    defaultValues: {
      subjectAllocationId: "",
      title: "",
      componentName: "",
      maxMarks: 40,
      passingMarks: 14,
      weightagePercent: 20,
      conductedDate: "2026-11-18",
    },
  })

  const selectedAllocId = useWatch({ control, name: "subjectAllocationId" })

  const syncLocalRows = React.useCallback((ia?: InternalAssessment) => {
    if (!ia) {
      setMarkRows([])
      setMarkErrors({})
      return
    }
    setMarkRows(
      ia.marks.map((m) => ({
        studentId: m.studentId,
        rollNo: m.rollNo,
        studentName: m.studentName,
        obtainedMarks:
          m.obtainedMarks !== null && m.obtainedMarks !== undefined
            ? String(m.obtainedMarks)
            : "",
        isAbsent: Boolean(m.isAbsent),
        remarks: m.remarks ?? "",
      }))
    )
    setMarkErrors({})
  }, [])

  const fetchAssessments = React.useCallback(async () => {
    const [iaList, subs] = await Promise.all([
      getInternalAssessments(),
      getSubjectAllocations(),
    ])
    return { iaList, subs }
  }, [])

  const retryLoad = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { iaList, subs } = await fetchAssessments()
      setAssessments(iaList)
      setSubjectAllocs(subs)
      if (subs[0]) {
        setValue("subjectAllocationId", subs[0].id)
      }
      const defaultIA = iaList.find((a) => a.status === "draft") ?? iaList[0]
      if (defaultIA) {
        setSelectedAssessmentId(defaultIA.id)
        syncLocalRows(defaultIA)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load internal assessments."
      )
    } finally {
      setLoading(false)
    }
  }, [fetchAssessments, setValue, syncLocalRows])

  React.useEffect(() => {
    let active = true
    fetchAssessments()
      .then(({ iaList, subs }) => {
        if (!active) return
        setAssessments(iaList)
        setSubjectAllocs(subs)
        if (subs[0]) {
          setValue("subjectAllocationId", subs[0].id)
        }
        const defaultIA = iaList.find((a) => a.status === "draft") ?? iaList[0]
        if (defaultIA) {
          setSelectedAssessmentId(defaultIA.id)
          syncLocalRows(defaultIA)
        }
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load internal assessments."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchAssessments, setValue, syncLocalRows])

  const filteredAssessments = React.useMemo(() => {
    if (selectedSectionFilter === "all") return assessments
    return assessments.filter((a) => a.sectionId === selectedSectionFilter)
  }, [assessments, selectedSectionFilter])

  const activeAssessment = React.useMemo(
    () => assessments.find((a) => a.id === selectedAssessmentId) ?? null,
    [assessments, selectedAssessmentId]
  )

  const handleSelectAssessment = (iaId: string) => {
    setSelectedAssessmentId(iaId)
    const found = assessments.find((a) => a.id === iaId)
    syncLocalRows(found)
  }

  const validateSingleMark = (
    raw: string,
    absent: boolean,
    maxMarks: number
  ): string | null => {
    if (absent) return null
    if (raw.trim() === "") return null
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return "Enter a valid number"
    if (parsed < 0) return "Marks cannot be < 0"
    if (parsed > maxMarks) return `Cannot exceed ${maxMarks}`
    return null
  }

  const handleMarkChange = (studentId: string, raw: string) => {
    if (!activeAssessment) return
    setMarkRows((prev) =>
      prev.map((row) =>
        row.studentId === studentId ? { ...row, obtainedMarks: raw } : row
      )
    )
    const err = validateSingleMark(raw, false, activeAssessment.maxMarks)
    setMarkErrors((prev) => {
      const next = { ...prev }
      if (err) {
        next[studentId] = err
      } else {
        delete next[studentId]
      }
      return next
    })
  }

  const handleAbsentToggle = (studentId: string, checked: boolean) => {
    setMarkRows((prev) =>
      prev.map((row) =>
        row.studentId === studentId
          ? {
              ...row,
              isAbsent: checked,
              obtainedMarks: checked ? "" : row.obtainedMarks,
            }
          : row
      )
    )
    if (checked) {
      setMarkErrors((prev) => {
        const next = { ...prev }
        delete next[studentId]
        return next
      })
    }
  }

  const handleSaveMarks = async (
    targetStatus: "draft" | "submitted",
    requireAllFilled: boolean
  ) => {
    if (!activeAssessment) return

    const errorsFound: Record<string, string> = {}
    for (const row of markRows) {
      const err = validateSingleMark(
        row.obtainedMarks,
        row.isAbsent,
        activeAssessment.maxMarks
      )
      if (err) {
        errorsFound[row.studentId] = err
      } else if (
        requireAllFilled &&
        !row.isAbsent &&
        row.obtainedMarks.trim() === ""
      ) {
        errorsFound[row.studentId] = "Required before submission"
      }
    }

    if (Object.keys(errorsFound).length > 0) {
      setMarkErrors(errorsFound)
      toast.error("Please fix invalid or missing marks highlighted in red.")
      return
    }

    setSavingMarks(true)
    try {
      const updated = await saveIAMarks({
        assessmentId: activeAssessment.id,
        nextStatus: targetStatus,
        marks: markRows.map((row) => ({
          studentId: row.studentId,
          obtainedMarks:
            row.isAbsent || row.obtainedMarks.trim() === ""
              ? null
              : Number(row.obtainedMarks),
          isAbsent: row.isAbsent,
          remarks: row.remarks.trim() || undefined,
        })),
      })

      setAssessments((prev) =>
        prev.map((ia) => (ia.id === updated.id ? updated : ia))
      )
      syncLocalRows(updated)
      toast.success(
        targetStatus === "submitted"
          ? `${updated.componentName} marks submitted for HoD approval`
          : `${updated.componentName} marks saved as draft`
      )
    } catch {
      toast.error("Could not save IA marks.")
    } finally {
      setSavingMarks(false)
    }
  }

  const handlePublishToStudents = async () => {
    if (!activeAssessment) return
    if (Object.keys(markErrors).length > 0) {
      toast.error("Fix validation errors before publishing.")
      return
    }
    setSavingMarks(true)
    try {
      const published = await publishInternalAssessment(activeAssessment.id)
      setAssessments((prev) =>
        prev.map((ia) => (ia.id === published.id ? published : ia))
      )
      syncLocalRows(published)
      toast.success(
        `${published.title} published to students and locked against edits.`
      )
    } catch {
      toast.error("Failed to publish assessment.")
    } finally {
      setSavingMarks(false)
    }
  }

  const onCreateComponent = async (values: DefineIAFormValues) => {
    const alloc = subjectAllocs.find((s) => s.id === values.subjectAllocationId)
    if (!alloc) return
    try {
      const created = await createInternalAssessment({
        classId: alloc.classId,
        className: alloc.className,
        sectionId: alloc.sectionId,
        section: alloc.section,
        subjectId: alloc.subjectId,
        subjectName: alloc.subjectName,
        title: values.title,
        componentName: values.componentName,
        maxMarks: values.maxMarks,
        passingMarks: values.passingMarks,
        weightagePercent: values.weightagePercent,
        conductedDate: values.conductedDate,
      })
      setAssessments((prev) => [created, ...prev])
      setSelectedAssessmentId(created.id)
      syncLocalRows(created)
      reset({
        subjectAllocationId: alloc.id,
        title: "",
        componentName: "",
        maxMarks: 40,
        passingMarks: 14,
        weightagePercent: 20,
        conductedDate: "2026-11-18",
      })
      toast.success(`Defined IA component "${created.componentName}"`, {
        description: `Ready for marks entry in ${created.className}-${created.section}.`,
      })
      setActiveTab("enter")
    } catch {
      toast.error("Could not create IA component.")
    }
  }

  const handleRequestCorrection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!correctionTarget || !correctionNote.trim()) {
      toast.error("Please enter a correction reason.")
      return
    }
    try {
      const updated = await requestIACorrection(
        correctionTarget.id,
        correctionNote.trim()
      )
      setAssessments((prev) =>
        prev.map((ia) => (ia.id === updated.id ? updated : ia))
      )
      if (selectedAssessmentId === updated.id) {
        syncLocalRows(updated)
      }
      setCorrectionTarget(null)
      setCorrectionNote("")
      toast.success("Correction request logged and marks re-opened.")
    } catch {
      toast.error("Could not submit correction request.")
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Internal Assessments"
        description="Fetching IA components, student marksheets, and approval statuses..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load assessments"
        description={error}
        onRetry={() => void retryLoad()}
      />
    )
  }

  const isLocked =
    academicYear !== "2026-27" || activeAssessment?.status === "locked"

  const correctionAssessments = assessments.filter(
    (a) => a.status === "returned" || Boolean(a.correctionNote)
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Internal Assessments (IA)"
        subtitle={`Define IA components, enter student marks with live range validation, and manage approvals · AY ${academicYear}`}
        badge={
          activeAssessment ? (
            <StatusBadge
              status={mapApprovalToStatusBadge(activeAssessment.status)}
            />
          ) : undefined
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:max-w-xl sm:grid-cols-3">
            <TabsTrigger value="define" className="shrink-0">Define IA Components</TabsTrigger>
            <TabsTrigger value="enter" className="shrink-0">Enter Marks</TabsTrigger>
            <TabsTrigger value="corrections" className="shrink-0">
              Correction Requests ({correctionAssessments.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Define IA Components */}
        <TabsContent value="define" className="mt-4 grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2 rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
            <form onSubmit={handleSubmit(onCreateComponent)}>
              <CardHeader className="border-b border-[#E5E9EF] pb-4">
                <CardTitle className="text-[#202936]">Define New IA Component</CardTitle>
                <CardDescription className="text-[#788391]">
                  Create an internal test, quiz weightage, or lab evaluation component.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ia-alloc">Class & Subject</Label>
                  <Select
                    value={selectedAllocId}
                    onValueChange={(val) =>
                      setValue("subjectAllocationId", val, {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger id="ia-alloc" className="w-full">
                      <SelectValue placeholder="Select class & subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectAllocs.map((alloc) => (
                        <SelectItem key={alloc.id} value={alloc.id}>
                          {alloc.className}-{alloc.section} ·{" "}
                          {alloc.subjectName}
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
                  <Label htmlFor="ia-title">Assessment Title</Label>
                  <Input
                    id="ia-title"
                    placeholder="e.g., Periodic Test 3 — Triangles & Circles"
                    {...register("title")}
                  />
                  {formErrors.title && (
                    <p className="text-xs font-medium text-error">
                      {formErrors.title.message}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ia-comp">Component Code</Label>
                    <Input
                      id="ia-comp"
                      placeholder="IA-2 / Lab Test"
                      {...register("componentName")}
                    />
                    {formErrors.componentName && (
                      <p className="text-xs font-medium text-error">
                        {formErrors.componentName.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ia-date">Conducted Date</Label>
                    <Input
                      id="ia-date"
                      type="date"
                      {...register("conductedDate")}
                    />
                    {formErrors.conductedDate && (
                      <p className="text-xs font-medium text-error">
                        {formErrors.conductedDate.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ia-max">Max Marks</Label>
                    <Input
                      id="ia-max"
                      type="number"
                      {...register("maxMarks", { valueAsNumber: true })}
                    />
                    {formErrors.maxMarks && (
                      <p className="text-xs font-medium text-error">
                        {formErrors.maxMarks.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ia-pass">Passing</Label>
                    <Input
                      id="ia-pass"
                      type="number"
                      {...register("passingMarks", { valueAsNumber: true })}
                    />
                    {formErrors.passingMarks && (
                      <p className="text-xs font-medium text-error">
                        {formErrors.passingMarks.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ia-weight">Weightage %</Label>
                    <Input
                      id="ia-weight"
                      type="number"
                      {...register("weightagePercent", { valueAsNumber: true })}
                    />
                    {formErrors.weightagePercent && (
                      <p className="text-xs font-medium text-error">
                        {formErrors.weightagePercent.message}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-4">
                <Button type="submit" disabled={creatingIA} className="w-full">
                  <Plus className="size-4" />
                  {creatingIA ? "Creating..." : "Create IA Component"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card className="lg:col-span-3 rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
            <CardHeader className="border-b border-[#E5E9EF] pb-4">
              <CardTitle className="text-[#202936]">Configured IA Components</CardTitle>
              <CardDescription className="text-[#788391]">
                Click any component to jump directly to marks entry.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              {assessments.map((ia) => (
                <div
                  key={ia.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/30 p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {ia.componentName}
                      </Badge>
                      <span className="text-[14.5px] font-semibold text-foreground">
                        {ia.title}
                      </span>
                      <StatusBadge
                        status={mapApprovalToStatusBadge(ia.status)}
                      />
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      {ia.className}-{ia.section} · {ia.subjectName} · Max{" "}
                      {ia.maxMarks} marks (Pass {ia.passingMarks}) · Weightage{" "}
                      {ia.weightagePercent}%
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleSelectAssessment(ia.id)
                      setActiveTab("enter")
                    }}
                  >
                    Open Marks
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Enter Marks */}
        <TabsContent value="enter" className="mt-4 space-y-4">
          <Card className="py-4 rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
            <CardContent className="grid gap-4 px-5 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="filter-sec">Filter by Class & Section</Label>
                <Select
                  value={selectedSectionFilter}
                  onValueChange={(val) => {
                    setSelectedSectionFilter(val)
                    const matching =
                      val === "all"
                        ? assessments[0]
                        : assessments.find((a) => a.sectionId === val)
                    if (matching) {
                      handleSelectAssessment(matching.id)
                    }
                  }}
                >
                  <SelectTrigger id="filter-sec" className="w-full">
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes & Subjects</SelectItem>
                    {subjectAllocs.map((alloc) => (
                      <SelectItem
                        key={alloc.sectionId}
                        value={alloc.sectionId}
                      >
                        {alloc.className} - {alloc.section} ({alloc.subjectName}
                        )
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="select-ia">Select Assessment</Label>
                <Select
                  value={selectedAssessmentId}
                  onValueChange={handleSelectAssessment}
                >
                  <SelectTrigger id="select-ia" className="w-full">
                    <SelectValue placeholder="Select IA component" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredAssessments.map((ia) => (
                      <SelectItem key={ia.id} value={ia.id}>
                        [{ia.componentName}] {ia.title} ({ia.className}-
                        {ia.section})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {activeAssessment ? (
            <>
              {isLocked && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-brand/25 bg-brand/8 p-4 text-[13.5px] text-brand"
                >
                  <Lock className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Assessment Locked — Read-Only Mode
                    </p>
                    <p className="mt-0.5 text-slate-700">
                      This assessment has been published and locked. Request a correction in the &quot;Correction Requests&quot; tab if marks need revision.
                    </p>
                  </div>
                </div>
              )}

              {activeAssessment.status === "returned" &&
                activeAssessment.correctionNote && (
                  <div
                    role="status"
                    className="flex items-start gap-3 rounded-xl border border-error/30 bg-error/10 p-4 text-[13.5px] text-red-900"
                  >
                    <AlertCircle className="mt-0.5 size-5 shrink-0 text-error" />
                    <div>
                      <p className="font-semibold">
                        Returned for Correction
                      </p>
                      <p className="mt-0.5">{activeAssessment.correctionNote}</p>
                    </div>
                  </div>
                )}

              <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5E9EF] pb-4">
                  <div>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-[#202936]">
                      <ClipboardCheck className="size-4 text-[#F5A000]" />
                      {activeAssessment.title}
                      <StatusBadge
                        status={mapApprovalToStatusBadge(
                          activeAssessment.status
                        )}
                      />
                      {activeAssessment.publishedToStudents && (
                        <Badge className="rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">Published to Students</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-[#788391]">
                      {activeAssessment.className}-{activeAssessment.section} ·{" "}
                      {activeAssessment.subjectName} · Max Marks:{" "}
                      {activeAssessment.maxMarks} · Passing:{" "}
                      {activeAssessment.passingMarks}
                    </CardDescription>
                  </div>

                  {!isLocked && (
                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                        disabled={savingMarks}
                        onClick={() => void handleSaveMarks("draft", false)}
                      >
                        <Save className="size-4" />
                        Save Draft
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-auto rounded-xl"
                        disabled={savingMarks}
                        onClick={() => void handleSaveMarks("submitted", true)}
                      >
                        <Send className="size-4" />
                        Submit for HoD Approval
                      </Button>
                      <Button
                        type="button"
                        className="w-full sm:w-auto rounded-xl bg-[#F5A000] text-white font-bold hover:bg-[#E09200]"
                        disabled={savingMarks}
                        onClick={() => void handlePublishToStudents()}
                      >
                        <Globe className="size-4" />
                        Publish to Students
                      </Button>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="pt-5">
                  <div className="overflow-x-auto rounded-xl border border-[#E5E9EF]">
                    <Table className="min-w-[680px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24 sticky left-0 bg-white z-10 shadow-xs">Roll No</TableHead>
                          <TableHead>Student Name</TableHead>
                          <TableHead className="w-24">Max Marks</TableHead>
                          <TableHead className="w-48">Marks Obtained</TableHead>
                          <TableHead className="w-24 text-center">
                            Absent
                          </TableHead>
                          <TableHead>Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {markRows.map((row) => {
                          const rowErr = markErrors[row.studentId]
                          return (
                            <TableRow key={row.studentId}>
                              <TableCell className="font-mono text-[13px] font-semibold sticky left-0 bg-white z-10 shadow-xs">
                                {row.rollNo}
                              </TableCell>
                              <TableCell className="font-medium">
                                {row.studentName}
                              </TableCell>
                              <TableCell className="font-mono text-muted-foreground">
                                {activeAssessment.maxMarks}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Input
                                    type="number"
                                    step="0.5"
                                    disabled={isLocked || row.isAbsent}
                                    value={row.isAbsent ? "" : row.obtainedMarks}
                                    placeholder={
                                      row.isAbsent
                                        ? "AB"
                                        : `0 – ${activeAssessment.maxMarks}`
                                    }
                                    aria-invalid={Boolean(rowErr)}
                                    onChange={(e) =>
                                      handleMarkChange(
                                        row.studentId,
                                        e.target.value
                                      )
                                    }
                                    className={cn(
                                      "h-8 w-32 font-mono",
                                      rowErr &&
                                        "border-[#DC2626] focus-visible:border-[#DC2626] focus-visible:ring-[#DC2626]/25"
                                    )}
                                  />
                                  {rowErr && (
                                    <p className="text-[11.5px] font-semibold text-[#DC2626]">
                                      {rowErr}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  disabled={isLocked}
                                  checked={row.isAbsent}
                                  onCheckedChange={(checked) =>
                                    handleAbsentToggle(
                                      row.studentId,
                                      checked === true
                                    )
                                  }
                                  aria-label={`Mark ${row.studentName} absent`}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  disabled={isLocked}
                                  value={row.remarks}
                                  onChange={(e) =>
                                    setMarkRows((prev) =>
                                      prev.map((r) =>
                                        r.studentId === row.studentId
                                          ? { ...r, remarks: e.target.value }
                                          : r
                                      )
                                    )
                                  }
                                  placeholder="Optional remark..."
                                  className="h-8"
                                />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              compact
              title="No assessment selected"
              description="Select or create an IA component to begin entering marks."
            />
          )}
        </TabsContent>

        {/* Tab 3: Correction Requests */}
        <TabsContent value="corrections" className="mt-4 space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
              <CardHeader className="border-b border-[#E5E9EF] pb-4">
                <CardTitle className="text-[#202936]">Active Correction Queue</CardTitle>
                <CardDescription className="text-[#788391]">
                  Assessments returned by HoD or flagged for marks correction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-5">
                {correctionAssessments.length === 0 ? (
                  <EmptyState
                    compact
                    title="No pending corrections"
                    description="All internal assessment records are clean."
                  />
                ) : (
                  correctionAssessments.map((ia) => (
                    <div
                      key={ia.id}
                      className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[14.5px] font-bold text-[#202936]">
                            {ia.title}
                          </p>
                          <p className="text-[12.5px] text-[#788391]">
                            {ia.className}-{ia.section} · {ia.subjectName}
                          </p>
                        </div>
                        <StatusBadge status="Rejected" />
                      </div>
                      {ia.correctionNote && (
                        <p className="text-[13px] text-rose-700">
                          {ia.correctionNote}
                        </p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-xl bg-[#F5A000] text-white font-bold hover:bg-[#E09200]"
                        onClick={() => {
                          handleSelectAssessment(ia.id)
                          setActiveTab("enter")
                        }}
                      >
                        Edit & Resubmit Marks
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
              <CardHeader className="border-b border-[#E5E9EF] pb-4">
                <CardTitle className="text-[#202936]">Request Re-open for Locked / Approved IA</CardTitle>
                <CardDescription className="text-[#788391]">
                  Submit a correction request to re-open a locked or approved marksheet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {assessments
                  .filter(
                    (a) => a.status === "locked" || a.status === "approved"
                  )
                  .map((ia) => (
                    <div
                      key={ia.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border p-3.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-foreground">
                          {ia.title}
                        </p>
                        <p className="text-[12.5px] text-muted-foreground">
                          {ia.className}-{ia.section} · {ia.componentName}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setCorrectionTarget(ia)
                          setCorrectionNote("")
                        }}
                      >
                        <RotateCcw className="size-3.5" />
                        Request Correction
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Request Correction Modal */}
      <Dialog
        open={Boolean(correctionTarget)}
        onOpenChange={(open) => {
          if (!open) setCorrectionTarget(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto w-[calc(100vw-2rem)] sm:max-w-md">
          <form onSubmit={(e) => void handleRequestCorrection(e)}>
            <DialogHeader>
              <DialogTitle>Request Marks Correction</DialogTitle>
              <DialogDescription>
                {correctionTarget?.title} ({correctionTarget?.className}-
                {correctionTarget?.section})
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="corr-note">Reason for correction</Label>
              <Textarea
                id="corr-note"
                rows={3}
                className="mt-1.5"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                placeholder="Specify student roll no(s) and verification reason..."
              />
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setCorrectionTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" className="w-full sm:w-auto">
                <CheckCircle2 className="size-4" />
                Re-open for Correction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

