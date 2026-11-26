"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock,
  Send,
  UserCheck,
  X,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createTeacherLeaveRequest,
  getStudentLeaveRequests,
  getTeacherLeaveRequests,
  reviewStudentLeaveRequest,
} from "@/lib/services/teacher.service"
import type { ApprovalStatus } from "@/types/common"
import type {
  StudentLeaveRequest,
  TeacherLeaveRequest,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const teacherLeaveSchema = z
  .object({
    leaveType: z.enum([
      "Casual Leave",
      "Sick Leave",
      "Earned Leave",
      "On-Duty",
      "Academic Leave",
    ]),
    fromDate: z.string().min(1, "Select start date."),
    toDate: z.string().min(1, "Select end date."),
    reason: z
      .string()
      .trim()
      .min(8, "Provide a clear reason (at least 8 characters)."),
    substituteTeacherName: z.string().optional(),
    handoverNotes: z.string().optional(),
  })
  .refine((v) => v.toDate >= v.fromDate, {
    message: "End date cannot be earlier than start date.",
    path: ["toDate"],
  })

type TeacherLeaveFormValues = z.infer<typeof teacherLeaveSchema>

const SUBSTITUTE_OPTIONS = [
  "Mr. Arvind Deshpande",
  "Ms. Nandini Iyer",
  "Mr. Rohan Kulkarni",
  "Ms. Deepa Krishnan",
]

function computeInclusiveDays(from: string, to: string): number {
  if (!from || !to) return 1
  const d1 = new Date(from)
  const d2 = new Date(to)
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1
  return Math.max(1, diff)
}

function mapStatusBadge(status: ApprovalStatus | StudentLeaveRequest["status"]) {
  if (status === "approved") return "Approved" as const
  if (status === "rejected" || status === "returned") return "Rejected" as const
  if (status === "locked") return "Locked" as const
  if (status === "submitted" || status === "in_review" || status === "pending")
    return "Pending" as const
  return "Draft" as const
}

const getTodayDate = () => new Date().toISOString().split("T")[0]

export default function TeacherLeavePage() {
  const { role, slug, user, academicYear } = useTeacherRole()
  const homeroomName = user?.homeroomClass || "Assigned Homeroom"
  const [teacherLeaves, setTeacherLeaves] = React.useState<
    TeacherLeaveRequest[]
  >([])
  const [studentLeaves, setStudentLeaves] = React.useState<
    StudentLeaveRequest[]
  >([])
  const [studentFilter, setStudentFilter] = React.useState<string>("all")
  const [remarksMap, setRemarksMap] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [reviewingId, setReviewingId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<TeacherLeaveFormValues>({
    resolver: zodResolver(teacherLeaveSchema),
    defaultValues: {
      leaveType: "Casual Leave",
      fromDate: getTodayDate(),
      toDate: getTodayDate(),
      reason: "",
      substituteTeacherName: SUBSTITUTE_OPTIONS[0],
      handoverNotes: "",
    },
  })

  const fromDateVal = useWatch({ control: form.control, name: "fromDate" })
  const toDateVal = useWatch({ control: form.control, name: "toDate" })
  const leaveTypeVal = useWatch({ control: form.control, name: "leaveType" })
  const subTeacherVal = useWatch({
    control: form.control,
    name: "substituteTeacherName",
  })

  const calculatedDays = computeInclusiveDays(fromDateVal, toDateVal)

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([getTeacherLeaveRequests(), getStudentLeaveRequests()])
      .then(([tRes, sRes]) => {
        setTeacherLeaves(tRes)
        setStudentLeaves(sRes)
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load leave module."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([getTeacherLeaveRequests(), getStudentLeaveRequests()])
      .then(([tRes, sRes]) => {
        if (!active) return
        setTeacherLeaves(tRes)
        setStudentLeaves(sRes)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load leave module."
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

  const handleApplyLeave = form.handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      const days = computeInclusiveDays(values.fromDate, values.toDate)
      const created = await createTeacherLeaveRequest({
        leaveType: values.leaveType,
        fromDate: values.fromDate,
        toDate: values.toDate,
        daysCount: days,
        reason: values.reason,
        substituteTeacherName:
          values.substituteTeacherName === "none"
            ? undefined
            : values.substituteTeacherName,
        handoverNotes: values.handoverNotes?.trim() || undefined,
      })
      setTeacherLeaves((prev) => [created, ...prev])
      form.reset({
        leaveType: "Casual Leave",
        fromDate: getTodayDate(),
        toDate: getTodayDate(),
        reason: "",
        substituteTeacherName: SUBSTITUTE_OPTIONS[0],
        handoverNotes: "",
      })
      toast.success("Leave request submitted and routed for HoD / Principal review.")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit leave request."
      )
    } finally {
      setSubmitting(false)
    }
  })

  const handleStudentDecision = async (
    requestId: string,
    decision: "approved" | "rejected"
  ) => {
    setReviewingId(requestId)
    try {
      const updated = await reviewStudentLeaveRequest(
        requestId,
        decision,
        remarksMap[requestId]?.trim() || undefined
      )
      setStudentLeaves((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      )
      toast.success(
        `Student request ${decision === "approved" ? "approved" : "rejected"} for ${updated.studentName}.`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not process student leave."
      )
    } finally {
      setReviewingId(null)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading leave & substitution records"
        description={`Fetching your leave applications and ${homeroomName} student leave requests...`}
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load leave workspace"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const pendingTeacher = teacherLeaves.filter(
    (l) => l.status === "submitted" || l.status === "in_review"
  ).length
  const approvedDays = teacherLeaves
    .filter((l) => l.status === "approved")
    .reduce((sum, l) => sum + l.daysCount, 0)
  const pendingStudent = studentLeaves.filter(
    (l) => l.status === "pending"
  ).length

  const filteredStudentLeaves =
    studentFilter === "all"
      ? studentLeaves
      : studentLeaves.filter((s) => s.status === studentFilter)

  const canApproveStudentLeaves = role === "class_teacher" || role === "hod"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave & Substitution Management"
        subtitle={`Apply for faculty leave with class substitution handover, track approvals, and process ${homeroomName} student leave or on-duty requests.`}
        action={
          <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
            <Link href={`/campus/${slug}/teacher/timetable`}>
              <CalendarCheck className="size-4" />
              View Timetable & Schedule
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Casual Leave Balance"
          value={`${Math.max(0, 12 - approvedDays)} / 12`}
          icon={<CalendarPlus />}
          variant="dark"
          tone="darkNavy"
          description={`Academic Year ${academicYear}`}
        />
        <StatCard
          label="My Pending Requests"
          value={pendingTeacher}
          icon={<Clock />}
          tone="warning"
          description="Awaiting HoD / Principal action"
        />
        <StatCard
          label="Student Leave Queue"
          value={pendingStudent}
          icon={<UserCheck />}
          tone="teal"
          description={`${homeroomName} pending approvals`}
        />
        <StatCard
          label="Approved Leave Days"
          value={approvedDays}
          icon={<CalendarCheck />}
          tone="success"
          description={`${teacherLeaves.length} total applications`}
        />
      </div>

      <Tabs defaultValue="my-leave" className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-2 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5] p-1">
            <TabsTrigger value="my-leave" className="shrink-0 rounded-lg data-[state=active]:bg-[#123B5A] data-[state=active]:text-white data-[state=active]:font-semibold">
              Apply & Track My Leave ({teacherLeaves.length})
            </TabsTrigger>
            <TabsTrigger value="student-leave" className="shrink-0 rounded-lg data-[state=active]:bg-[#123B5A] data-[state=active]:text-white data-[state=active]:font-semibold">
              Student Leave / On-Duty Approvals ({pendingStudent} pending)
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="my-leave">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Application Form */}
            <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs lg:col-span-5">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-[#202936]">
                  Apply for Faculty Leave
                </CardTitle>
                <CardDescription className="text-sm text-[#788391]">
                  Nominate a substitute colleague and leave lesson handover notes to keep classes uninterrupted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleApplyLeave} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="leaveType" className="text-xs font-semibold text-[#202936]">Leave Category</Label>
                    <Select
                      value={leaveTypeVal}
                      onValueChange={(val) =>
                        form.setValue(
                          "leaveType",
                          val as TeacherLeaveFormValues["leaveType"]
                        )
                      }
                    >
                      <SelectTrigger id="leaveType" className="rounded-xl border-[#E5E9EF] bg-white text-[#202936]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[#E5E9EF]">
                        <SelectItem value="Casual Leave">
                          Casual Leave
                        </SelectItem>
                        <SelectItem value="Sick Leave">
                          Sick / Medical Leave
                        </SelectItem>
                        <SelectItem value="Earned Leave">
                          Earned Leave
                        </SelectItem>
                        <SelectItem value="On-Duty">
                          Official On-Duty (OD)
                        </SelectItem>
                        <SelectItem value="Academic Leave">
                          Academic / Workshop Leave
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="fromDate" className="text-xs font-semibold text-[#202936]">From Date</Label>
                      <Input
                        id="fromDate"
                        type="date"
                        className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                        {...form.register("fromDate")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="toDate" className="text-xs font-semibold text-[#202936]">To Date</Label>
                      <Input
                        id="toDate"
                        type="date"
                        className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                        {...form.register("toDate")}
                      />
                      {form.formState.errors.toDate && (
                        <p className="text-xs text-rose-600">
                          {form.formState.errors.toDate.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/50 px-3 py-2 text-xs">
                    <span className="text-[#788391]">
                      Calculated Duration
                    </span>
                    <span className="font-bold text-[#202936]">
                      {calculatedDays} day(s)
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="substituteTeacherName" className="text-xs font-semibold text-[#202936]">
                      Suggested Substitute Teacher
                    </Label>
                    <Select
                      value={subTeacherVal ?? "none"}
                      onValueChange={(val) =>
                        form.setValue("substituteTeacherName", val)
                      }
                    >
                      <SelectTrigger id="substituteTeacherName" className="rounded-xl border-[#E5E9EF] bg-white text-[#202936]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[#E5E9EF]">
                        {SUBSTITUTE_OPTIONS.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                        <SelectItem value="none">
                          No substitution needed
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reason" className="text-xs font-semibold text-[#202936]">Reason for Leave</Label>
                    <Textarea
                      id="reason"
                      rows={3}
                      placeholder="Specify purpose of leave or official academic duty..."
                      className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                      {...form.register("reason")}
                    />
                    {form.formState.errors.reason && (
                      <p className="text-xs text-rose-600">
                        {form.formState.errors.reason.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="handoverNotes" className="text-xs font-semibold text-[#202936]">
                      Lesson / Worksheet Handover Notes (optional)
                    </Label>
                    <Textarea
                      id="handoverNotes"
                      rows={2}
                      placeholder="e.g. Share Trigonometry practice sheet stored in Staff Room drawer 2..."
                      className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                      {...form.register("handoverNotes")}
                    />
                  </div>

                  <Button type="submit" className="w-full rounded-xl bg-[#F5A000] text-[#123B5A] font-bold hover:bg-[#E09200]" disabled={submitting}>
                    <Send className="size-4" />
                    {submitting
                      ? "Submitting Application..."
                      : "Submit Leave Request"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Leave Status Timeline */}
            <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs lg:col-span-7">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-[#202936]">
                  My Leave History & Approval Timeline
                </CardTitle>
                <CardDescription className="text-sm text-[#788391]">
                  Track progression from submission through HoD / Principal review and substitute confirmation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {teacherLeaves.length === 0 ? (
                  <EmptyState
                    title="No leave applications"
                    description="Submitted faculty leave applications will appear here."
                  />
                ) : (
                  teacherLeaves.map((leave) => {
                    const isRejected = leave.status === "rejected"
                    const stage =
                      leave.status === "approved" || leave.status === "rejected"
                        ? 2
                        : leave.status === "in_review"
                          ? 1
                          : 0

                    return (
                      <div
                        key={leave.id}
                        className="rounded-xl border border-[#E5E9EF] p-4 bg-white hover:border-[#123B5A]/30 transition-all"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-[#202936]">
                                {leave.leaveType}
                              </span>
                              <Badge variant="outline" className="border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-semibold">
                                {leave.daysCount} day(s)
                              </Badge>
                              <StatusBadge
                                status={mapStatusBadge(leave.status)}
                              />
                            </div>
                            <div className="mt-1 text-xs text-[#788391]">
                              {leave.fromDate} to {leave.toDate} • Applied on{" "}
                              {leave.appliedAt.slice(0, 10)}
                            </div>
                          </div>
                          {leave.substituteTeacherName && (
                            <Badge
                              variant="outline"
                              className="border-[#123B5A]/25 bg-[#123B5A]/8 text-[#123B5A] font-semibold"
                            >
                              Sub: {leave.substituteTeacherName}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-2.5 text-sm text-[#202936]">
                          {leave.reason}
                        </p>

                        {leave.handoverNotes && (
                          <div className="mt-2 rounded-xl bg-[#EEF1F5]/60 border border-[#E5E9EF] px-3 py-1.5 text-xs text-[#788391]">
                            <span className="font-bold text-[#202936]">
                              Handover:{" "}
                            </span>
                            {leave.handoverNotes}
                          </div>
                        )}

                        {/* Approval Timeline */}
                        <div className="mt-4 flex flex-wrap sm:grid sm:grid-cols-3 gap-2">
                          {[
                            "Submitted",
                            "In Review",
                            isRejected ? "Rejected" : "Approved",
                          ].map((label, idx) => {
                            const reached = idx <= stage
                            const finalError = idx === 2 && isRejected
                            return (
                              <div
                                key={`${leave.id}-${label}`}
                                className={cn(
                                  "flex-1 min-w-[90px] flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold",
                                  finalError
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : reached
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-[#E5E9EF] bg-[#EEF1F5] text-[#788391]"
                                )}
                              >
                                <span
                                  className={cn(
                                    "size-2 rounded-full",
                                    finalError
                                      ? "bg-rose-500"
                                      : reached
                                        ? "bg-emerald-500"
                                        : "bg-slate-300"
                                  )}
                                />
                                {label}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="student-leave" className="space-y-4">
          {!canApproveStudentLeaves && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You are viewing in <strong>Subject Teacher</strong> mode. Switch
              the top header role selector to <strong>Class Teacher</strong> or{" "}
              <strong>HoD</strong> to approve or reject {homeroomName} student leave
              requests.
            </div>
          )}

          <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-[#202936]">
                  {homeroomName} Student Leave & On-Duty Queue
                </CardTitle>
                <CardDescription className="text-sm text-[#788391]">
                  Review parent-submitted medical, family, and official school On-Duty (OD) applications.
                </CardDescription>
              </div>
              <div className="w-full sm:w-48">
                <Select value={studentFilter} onValueChange={setStudentFilter}>
                  <SelectTrigger className="rounded-xl border-[#E5E9EF] bg-white text-[#202936]" aria-label="Filter student requests">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[#E5E9EF]">
                    <SelectItem value="all">All Requests</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredStudentLeaves.length === 0 ? (
                <EmptyState
                  title="No student leave requests"
                  description="No requests match the selected status filter."
                />
              ) : (
                filteredStudentLeaves.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-xl border border-[#E5E9EF] p-4 bg-white"
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[#202936]">
                            {req.studentName}
                          </span>
                          <Badge variant="outline" className="border-[#E5E9EF] bg-[#EEF1F5] text-[#202936] font-semibold">{req.rollNo}</Badge>
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-700 font-semibold"
                          >
                            {req.leaveType}
                          </Badge>
                          <StatusBadge status={mapStatusBadge(req.status)} />
                        </div>
                        <div className="text-xs text-[#788391]">
                          {req.className} - {req.section} • {req.fromDate} to{" "}
                          {req.toDate} ({req.daysCount} day) • Applied:{" "}
                          {req.appliedAt.slice(0, 10)}
                        </div>
                        <p className="pt-1 text-sm text-[#202936]">
                          {req.reason}
                        </p>
                        {req.reviewerRemarks && (
                          <div className="text-xs text-[#788391]">
                            <span className="font-bold text-[#202936]">
                              Decision Remarks:{" "}
                            </span>
                            {req.reviewerRemarks}
                          </div>
                        )}
                      </div>

                      {req.status === "pending" && (
                        <div className="flex w-full flex-col gap-2 sm:w-72">
                          <Input
                            placeholder="Optional decision remarks..."
                            value={remarksMap[req.id] ?? ""}
                            disabled={!canApproveStudentLeaves}
                            onChange={(e) =>
                              setRemarksMap((prev) => ({
                                ...prev,
                                [req.id]: e.target.value,
                              }))
                            }
                            className="h-8 text-xs rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                              disabled={
                                !canApproveStudentLeaves ||
                                reviewingId === req.id
                              }
                              onClick={() =>
                                handleStudentDecision(req.id, "approved")
                              }
                            >
                              <Check className="size-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50"
                              disabled={
                                !canApproveStudentLeaves ||
                                reviewingId === req.id
                              }
                              onClick={() =>
                                handleStudentDecision(req.id, "rejected")
                              }
                            >
                              <X className="size-3.5" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
