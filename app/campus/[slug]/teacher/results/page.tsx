"use client"

import * as React from "react"
import Link from "next/link"
import {
  CheckCircle2,
  ClipboardList,
  Globe,
  Lock,
  Save,
  Search,
  Send,
  ShieldCheck,
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  getResultEntries,
  publishResultEntry,
  saveResultMarks,
} from "@/lib/services/teacher.service"
import type { ApprovalStatus } from "@/types/common"
import type { ResultEntry } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

interface EditableMarkRow {
  studentId: string
  rollNo: string
  studentName: string
  theoryMarks: string
  practicalMarks: string
  isAbsent: boolean
  remarks: string
}

function computeGrade(
  theory: number,
  practical: number,
  maxTotal: number,
  isAbsent: boolean
): string {
  if (isAbsent) return "AB"
  if (maxTotal <= 0) return "-"
  const pct = ((theory + practical) / maxTotal) * 100
  if (pct >= 91) return "A1"
  if (pct >= 81) return "A2"
  if (pct >= 71) return "B1"
  if (pct >= 61) return "B2"
  if (pct >= 51) return "C1"
  if (pct >= 41) return "C2"
  if (pct >= 33) return "D"
  return "E"
}

function mapModerationBadge(status: ApprovalStatus) {
  switch (status) {
    case "approved":
      return "Approved" as const
    case "locked":
      return "Locked" as const
    case "rejected":
    case "returned":
      return "Rejected" as const
    case "submitted":
    case "in_review":
      return "Pending" as const
    default:
      return "Draft" as const
  }
}

function mapPublicationBadge(status: ResultEntry["publicationStatus"]) {
  if (status === "published") return "Published" as const
  if (status === "locked") return "Locked" as const
  return "Draft" as const
}

function buildRowsFromEntry(entry: ResultEntry): EditableMarkRow[] {
  return entry.rows.map((r) => ({
    studentId: r.studentId,
    rollNo: r.rollNo,
    studentName: r.studentName,
    theoryMarks: r.theoryMarks !== null ? String(r.theoryMarks) : "",
    practicalMarks: r.practicalMarks !== null ? String(r.practicalMarks) : "",
    isAbsent: Boolean(r.isAbsent),
    remarks: r.remarks ?? "",
  }))
}

export default function TeacherResultsPage() {
  const { slug } = useTeacherRole()
  const [entries, setEntries] = React.useState<ResultEntry[]>([])
  const [selectedId, setSelectedId] = React.useState<string>("")
  const [draftRows, setDraftRows] = React.useState<EditableMarkRow[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const syncSelection = React.useCallback(
    (list: ResultEntry[], preferredId?: string) => {
      const target =
        list.find((e) => e.id === preferredId) ?? list[0] ?? undefined
      if (target) {
        setSelectedId(target.id)
        setDraftRows(buildRowsFromEntry(target))
      }
    },
    []
  )

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    getResultEntries()
      .then((res) => {
        setEntries(res)
        syncSelection(res)
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load result sheets."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [syncSelection])

  React.useEffect(() => {
    let active = true
    getResultEntries()
      .then((res) => {
        if (!active) return
        setEntries(res)
        syncSelection(res)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load result sheets."
        )
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [syncSelection])

  const activeEntry = entries.find((e) => e.id === selectedId) ?? null

  const handleEntryChange = (newId: string) => {
    const next = entries.find((e) => e.id === newId)
    if (!next) return
    setSelectedId(newId)
    setDraftRows(buildRowsFromEntry(next))
  }

  const updateRow = (
    studentId: string,
    patch: Partial<EditableMarkRow>
  ) => {
    setDraftRows((prev) =>
      prev.map((row) => (row.studentId === studentId ? { ...row, ...patch } : row))
    )
  }

  const getRowValidation = (row: EditableMarkRow, entry: ResultEntry) => {
    if (row.isAbsent) {
      return { theoryErr: null, practicalErr: null }
    }
    let theoryErr: string | null = null
    let practicalErr: string | null = null

    if (row.theoryMarks.trim() !== "") {
      const num = Number(row.theoryMarks)
      if (Number.isNaN(num) || num < 0 || num > entry.maxTheoryMarks) {
        theoryErr = `0 – ${entry.maxTheoryMarks}`
      }
    }
    if (entry.maxPracticalMarks > 0 && row.practicalMarks.trim() !== "") {
      const num = Number(row.practicalMarks)
      if (Number.isNaN(num) || num < 0 || num > entry.maxPracticalMarks) {
        practicalErr = `0 – ${entry.maxPracticalMarks}`
      }
    }
    return { theoryErr, practicalErr }
  }

  const handleSave = async (targetStatus: ApprovalStatus) => {
    if (!activeEntry) return

    const invalid = draftRows.some((row) => {
      const { theoryErr, practicalErr } = getRowValidation(row, activeEntry)
      return Boolean(theoryErr || practicalErr)
    })

    if (invalid) {
      toast.error("Fix highlighted mark validation errors before saving.")
      return
    }

    if (targetStatus === "submitted") {
      const missingMarks = draftRows.some(
        (r) => !r.isAbsent && r.theoryMarks.trim() === ""
      )
      if (missingMarks) {
        toast.error(
          "Enter theory marks or mark Absent for every student before submitting for moderation."
        )
        return
      }
    }

    setSaving(true)
    try {
      const updated = await saveResultMarks({
        resultEntryId: activeEntry.id,
        entryStatus: targetStatus,
        rows: draftRows.map((row) => ({
          studentId: row.studentId,
          theoryMarks:
            row.isAbsent || row.theoryMarks.trim() === ""
              ? null
              : Number(row.theoryMarks),
          practicalMarks:
            activeEntry.maxPracticalMarks === 0 || row.isAbsent
              ? activeEntry.maxPracticalMarks === 0
                ? 0
                : null
              : row.practicalMarks.trim() === ""
                ? null
                : Number(row.practicalMarks),
          isAbsent: row.isAbsent,
          remarks: row.remarks.trim() || undefined,
        })),
      })

      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
      setDraftRows(buildRowsFromEntry(updated))
      toast.success(
        targetStatus === "submitted"
          ? "Marks submitted for Examination Moderation."
          : "Result draft saved."
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save result marks."
      )
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!activeEntry) return
    setSaving(true)
    try {
      const updated = await publishResultEntry(
        activeEntry.id,
        "published",
        "approved"
      )
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
      toast.success(
        `Results published for ${updated.className} - ${updated.section} (${updated.subjectName}).`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not publish results."
      )
    } finally {
      setSaving(false)
    }
  }

  const handleLock = async () => {
    if (!activeEntry) return
    setSaving(true)
    try {
      const updated = await publishResultEntry(
        activeEntry.id,
        "locked",
        "locked"
      )
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
      toast.success("Result register locked permanently for transcript issue.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not lock results.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading final result registers"
        description="Fetching permitted mark entry sheets and moderation trackers..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load results workspace"
        description={error}
        onRetry={loadData}
      />
    )
  }

  if (!activeEntry) {
    return (
      <EmptyState
        title="No permitted result sheets"
        description="No final examination mark entry registers are currently assigned to you."
      />
    )
  }

  const isLocked =
    activeEntry.entryStatus === "locked" ||
    activeEntry.publicationStatus === "locked"

  const filteredRows = draftRows.filter(
    (r) =>
      r.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const enteredCount = draftRows.filter(
    (r) => r.isAbsent || r.theoryMarks.trim() !== ""
  ).length

  const computedTotals = draftRows
    .filter((r) => !r.isAbsent && r.theoryMarks.trim() !== "")
    .map((r) => Number(r.theoryMarks) + (Number(r.practicalMarks) || 0))
  const classAverage =
    computedTotals.length > 0
      ? Math.round(
          (computedTotals.reduce((a, b) => a + b, 0) / computedTotals.length) *
            10
        ) / 10
      : 0

  const stepStage =
    activeEntry.publicationStatus === "locked"
      ? 4
      : activeEntry.publicationStatus === "published"
        ? 3
        : activeEntry.entryStatus === "approved"
          ? 2
          : activeEntry.entryStatus === "submitted" ||
              activeEntry.entryStatus === "in_review"
            ? 1
            : 0

  const pipelineSteps = [
    "Draft Marks Entry",
    "Submitted for Moderation",
    "Moderated & Approved",
    "Published to Portal",
    "Locked Register",
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Final Results & Moderation Tracker"
        subtitle="Enter final theory & practical examination marks, track moderation status, and publish approved registers."
        action={
          <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
            <Link href={`/campus/${slug}/teacher/results`}>
              <ClipboardList className="size-4 mr-1.5" />
              Back to Results Overview
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Permitted Registers"
          value={entries.length}
          icon={<ClipboardList />}
          variant="dark"
          tone="darkNavy"
          description="Assigned final subjects"
        />
        <StatCard
          label="Students Entered"
          value={`${enteredCount}/${draftRows.length}`}
          icon={<CheckCircle2 />}
          tone="success"
          description={`${activeEntry.className} - ${activeEntry.section}`}
        />
        <StatCard
          label="Current Section Avg"
          value={`${classAverage}/${activeEntry.maxTotalMarks}`}
          icon={<ShieldCheck />}
          tone="primary"
          description={activeEntry.subjectName}
        />
        <StatCard
          label="Submission Deadline"
          value={activeEntry.submissionDeadline}
          icon={<Globe />}
          tone="warning"
          description={activeEntry.examName}
        />
      </div>

      {/* Selector & Pipeline Status Card */}
      <Card className="bg-white rounded-2xl border-[#E5E9EF] shadow-xs">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[#E5E9EF] pb-4">
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold text-[#202936]">
              Active Subject Result Sheet
            </CardTitle>
            <CardDescription className="text-[#788391]">
              Max Theory: {activeEntry.maxTheoryMarks} • Max Practical:{" "}
              {activeEntry.maxPracticalMarks} • Total Max:{" "}
              {activeEntry.maxTotalMarks}
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:flex-wrap">
            <div className="w-full sm:w-72">
              <Select value={activeEntry.id} onValueChange={handleEntryChange}>
                <SelectTrigger aria-label="Select result register" className="w-full rounded-xl border-[#E5E9EF] bg-white text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[#E5E9EF]">
                  {entries.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id} className="text-xs">
                      {entry.className}-{entry.section} • {entry.subjectName} (
                      {entry.examName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-[#788391]">
                  Moderation:
                </span>
                <StatusBadge
                  status={mapModerationBadge(activeEntry.entryStatus)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-[#788391]">
                  Publication:
                </span>
                <StatusBadge
                  status={mapPublicationBadge(activeEntry.publicationStatus)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 lg:grid-cols-5">
            {pipelineSteps.map((step, idx) => {
              const reached = idx <= stepStage
              return (
                <div
                  key={step}
                  className={cn(
                    "flex shrink-0 min-w-[150px] sm:min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
                    reached
                      ? "border-[#123B5A]/30 bg-[#123B5A]/8 text-[#123B5A]"
                      : "border-[#E5E9EF] bg-[#EEF1F5] text-[#788391]"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      reached
                        ? "bg-[#123B5A] text-white"
                        : "bg-white text-[#788391]"
                    )}
                  >
                    {idx + 1}
                  </span>
                  <span className="truncate">{step}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {isLocked && (
        <div className="flex items-center gap-3 rounded-xl border border-brand/25 bg-brand/8 px-4 py-3 text-sm text-brand">
          <Lock className="size-4 shrink-0" />
          <span>
            This final result register is <strong>Locked</strong> for official
            transcript printing. Contact the Examination Controller to reopen.
          </span>
        </div>
      )}

      {/* Final Marks Table */}
      <Card className="bg-white rounded-2xl border-[#E5E9EF] shadow-xs">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5E9EF] pb-4">
          <div>
            <CardTitle className="text-lg font-bold text-[#202936]">
              {activeEntry.className} - {activeEntry.section} •{" "}
              {activeEntry.subjectName}
            </CardTitle>
            <CardDescription className="text-xs text-[#788391]">
              Last updated: {activeEntry.lastUpdatedAt.slice(0, 10)}
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-[#788391]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student or roll no..."
              className="pl-9 rounded-xl border-[#E5E9EF] text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader className="bg-[#EEF1F5]/80">
                <TableRow className="border-b border-[#E5E9EF]">
                  <TableHead className="w-24 font-bold text-[#788391] sticky left-0 bg-[#EEF1F5] z-10 shadow-xs">Roll No</TableHead>
                  <TableHead className="font-bold text-[#788391] sticky left-24 bg-[#EEF1F5] z-10 shadow-xs">Student Name</TableHead>
                  <TableHead className="w-36 font-bold text-[#788391]">
                    Theory (/ {activeEntry.maxTheoryMarks})
                  </TableHead>
                  {activeEntry.maxPracticalMarks > 0 && (
                    <TableHead className="w-36 font-bold text-[#788391]">
                      Practical (/ {activeEntry.maxPracticalMarks})
                    </TableHead>
                  )}
                  <TableHead className="w-24 font-bold text-[#788391]">Total</TableHead>
                  <TableHead className="w-20 font-bold text-[#788391]">Grade</TableHead>
                  <TableHead className="w-24 text-center font-bold text-[#788391]">Absent</TableHead>
                  <TableHead className="font-bold text-[#788391]">Moderator / Teacher Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E5E9EF]">
                {filteredRows.map((row) => {
                  const { theoryErr, practicalErr } = getRowValidation(
                    row,
                    activeEntry
                  )
                  const theoryNum =
                    row.theoryMarks.trim() !== "" ? Number(row.theoryMarks) : 0
                  const practicalNum =
                    activeEntry.maxPracticalMarks > 0 &&
                    row.practicalMarks.trim() !== ""
                      ? Number(row.practicalMarks)
                      : 0
                  const hasAnyMark =
                    !row.isAbsent && row.theoryMarks.trim() !== ""
                  const total = row.isAbsent ? null : hasAnyMark ? theoryNum + practicalNum : null
                  const grade =
                    hasAnyMark || row.isAbsent
                      ? computeGrade(
                          theoryNum,
                          practicalNum,
                          activeEntry.maxTotalMarks,
                          row.isAbsent
                        )
                      : "-"

                  return (
                    <TableRow key={row.studentId} className="hover:bg-[#EEF1F5]/40 transition-colors">
                      <TableCell className="font-bold font-mono text-xs text-[#123B5A] sticky left-0 bg-white z-10 shadow-xs">
                        {row.rollNo}
                      </TableCell>
                      <TableCell className="font-bold text-[#202936] sticky left-24 bg-white z-10 shadow-xs whitespace-nowrap">
                        {row.studentName}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            type="number"
                            min={0}
                            max={activeEntry.maxTheoryMarks}
                            disabled={isLocked || row.isAbsent}
                            value={row.isAbsent ? "" : row.theoryMarks}
                            placeholder={row.isAbsent ? "AB" : "0"}
                            className={cn(
                              "h-8 w-24 rounded-lg text-xs",
                              theoryErr && "border-rose-500 focus-visible:ring-rose-500"
                            )}
                            onChange={(e) =>
                              updateRow(row.studentId, {
                                theoryMarks: e.target.value,
                              })
                            }
                          />
                          {theoryErr && (
                            <p className="text-[11px] font-medium text-rose-600">
                              {theoryErr}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      {activeEntry.maxPracticalMarks > 0 && (
                        <TableCell>
                          <div className="space-y-1">
                            <Input
                              type="number"
                              min={0}
                              max={activeEntry.maxPracticalMarks}
                              disabled={isLocked || row.isAbsent}
                              value={row.isAbsent ? "" : row.practicalMarks}
                              placeholder={row.isAbsent ? "AB" : "0"}
                              className={cn(
                                "h-8 w-24 rounded-lg text-xs",
                                practicalErr &&
                                  "border-rose-500 focus-visible:ring-rose-500"
                              )}
                              onChange={(e) =>
                                updateRow(row.studentId, {
                                  practicalMarks: e.target.value,
                                })
                              }
                            />
                            {practicalErr && (
                              <p className="text-[11px] font-medium text-rose-600">
                                {practicalErr}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="font-semibold text-xs text-[#202936]">
                        {row.isAbsent
                          ? "AB"
                          : total !== null
                            ? `${total}/${activeEntry.maxTotalMarks}`
                            : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full text-xs font-bold",
                            grade === "AB" || grade === "E"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-[#E5E9EF] bg-[#EEF1F5] text-[#202936]"
                          )}
                        >
                          {grade}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex items-center justify-center">
                          <Checkbox
                            aria-label={`Mark ${row.studentName} absent`}
                            disabled={isLocked}
                            checked={row.isAbsent}
                            onCheckedChange={(checked) =>
                              updateRow(row.studentId, {
                                isAbsent: Boolean(checked),
                                theoryMarks: checked ? "" : row.theoryMarks,
                                practicalMarks: checked ? "" : row.practicalMarks,
                              })
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Label
                          htmlFor={`remarks-${row.studentId}`}
                          className="sr-only"
                        >
                          Remarks for {row.studentName}
                        </Label>
                        <Input
                          id={`remarks-${row.studentId}`}
                          disabled={isLocked}
                          value={row.remarks}
                          placeholder="Optional moderation note..."
                          className="h-8 min-w-36 rounded-lg text-xs"
                          onChange={(e) =>
                            updateRow(row.studentId, { remarks: e.target.value })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#E5E9EF] bg-[#EEF1F5]/40 px-4 sm:px-6 py-4">
          <div className="text-xs text-[#788391]">
            Grade calculation follows institutional CBSE / Term standard slabs.
          </div>
          <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={isLocked || saving}
              onClick={() => handleSave("draft")}
              className="flex-1 sm:flex-initial rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-white"
            >
              <Save className="size-4 mr-1.5" />
              Save Draft
            </Button>
            <Button
              variant="secondary"
              disabled={isLocked || saving}
              onClick={() => handleSave("submitted")}
              className="flex-1 sm:flex-initial rounded-xl"
            >
              <Send className="size-4 mr-1.5" />
              Submit for Moderation
            </Button>
            {activeEntry.publicationStatus !== "published" &&
              activeEntry.publicationStatus !== "locked" && (
                <Button
                  disabled={isLocked || saving}
                  onClick={handlePublish}
                  className="w-full sm:w-auto rounded-xl bg-[#F5A000] text-white font-bold hover:bg-[#E09200]"
                >
                  <Globe className="size-4 mr-1.5" />
                  Publish Results
                </Button>
              )}
            {activeEntry.publicationStatus === "published" && (
              <Button
                variant="default"
                className="w-full sm:w-auto rounded-xl bg-[#123B5A] text-white hover:bg-[#1B4D70]"
                disabled={saving}
                onClick={handleLock}
              >
                <Lock className="size-4 mr-1.5" />
                Lock Register
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
