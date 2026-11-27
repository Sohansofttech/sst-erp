"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldCheck,
  UserCheck2,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getTeacherLeaveRequests,
  reviewTeacherLeaveRequest,
  getDepartmentFacultyLoad,
} from "@/lib/services/teacher.service"
import type { TeacherLeaveRequest, DepartmentFacultyLoad } from "@/types/teacher"
import { useTeacherRole } from "../../teacher-role-context"

export default function HodFacultyLeaveApprovalsPage() {
  const { slug, user } = useTeacherRole()
  const deptName = user?.department || "Department"
  const [facultyLeaves, setFacultyLeaves] = React.useState<TeacherLeaveRequest[]>([])
  const [facultyLoad, setFacultyLoad] = React.useState<DepartmentFacultyLoad[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Review Dialog State
  const [selectedLeave, setSelectedLeave] = React.useState<TeacherLeaveRequest | null>(null)
  const [decision, setDecision] = React.useState<"approved" | "rejected">("approved")
  const [substituteTeacher, setSubstituteTeacher] = React.useState("")
  const [remarks, setRemarks] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [allLeaves, facs] = await Promise.all([
        getTeacherLeaveRequests(),
        getDepartmentFacultyLoad(),
      ])

      // CRITICAL REQUIREMENT: HoD's own leave must not appear in their own approval queue (route to Principal).
      const deptFacultyLeaves = allLeaves.filter(
        (l) =>
          l.teacherId !== user.employeeId &&
          l.teacherName?.toLowerCase() !== user.name.toLowerCase()
      )

      setFacultyLeaves(deptFacultyLeaves)
      setFacultyLoad(facs)
    } catch (err: any) {
      setError(err?.message || "Failed to load faculty leave applications.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const openDecisionModal = (leave: TeacherLeaveRequest, action: "approved" | "rejected") => {
    setSelectedLeave(leave)
    setDecision(action)
    setSubstituteTeacher(leave.substituteTeacherName || "Prof. Rajesh Verma")
    setRemarks(
      action === "approved"
        ? `Approved by HoD. Scheduled lecture periods assigned to ${leave.substituteTeacherName || "Prof. Rajesh Verma"} for timetable coverage.`
        : "Rejected due to department term assessment clash."
    )
  }

  const handleConfirmDecision = async () => {
    if (!selectedLeave) return
    setSubmitting(true)
    try {
      const updated = await reviewTeacherLeaveRequest(
        selectedLeave.id,
        decision,
        substituteTeacher,
        remarks
      )
      toast.success(
        decision === "approved"
          ? `Faculty leave approved for ${updated.teacherName}. Timetable substitution allocated to ${updated.substituteTeacherName}.`
          : `Faculty leave rejected for ${updated.teacherName}.`
      )
      setSelectedLeave(null)
      loadData()
    } catch (err: any) {
      toast.error(err?.message || "Failed to process faculty leave.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Faculty Leaves"
        description={`Fetching ${deptName} faculty leave applications and substitution requests...`}
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load leave requests"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const pendingCount = facultyLeaves.filter(
    (l) => l.status === "submitted" || l.status === "in_review"
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faculty Leave & Timetable Substitutions"
        subtitle={`${deptName} faculty leave queue: approve absences and allocate qualified department substitute teachers to prevent untaught periods. (HoD self-applications are routed directly to the Principal).`}
        action={
          <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
            <Link href={`/campus/${slug}/teacher/hod`}>
              <ArrowLeft className="mr-1.5 size-4 text-[#123B5A]" />
              Dept Dashboard
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          label="Pending Queue"
          value={pendingCount}
          icon={<Clock />}
          tone={pendingCount > 0 ? "warning" : "primary"}
          variant="dark"
          description="Awaiting HoD sanction & substitution"
        />
        <StatCard
          label="Department Faculty"
          value={facultyLoad.length}
          icon={<BookOpen />}
          tone="darkNavy"
          description="Available for substitution coverage"
        />
        <StatCard
          label="Self-Leave Routing"
          value="Principal"
          icon={<ShieldCheck />}
          tone="success"
          description="HoD leave routed to Principal"
        />
      </div>

      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader className="border-b border-[#E5E9EF] pb-4">
          <CardTitle className="text-lg font-bold text-[#202936]">
            Faculty Leave Applications ({facultyLeaves.length})
          </CardTitle>
          <CardDescription className="text-xs text-[#788391]">
            Approving automatically registers timetable handover in the institution-wide substitution register.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {facultyLeaves.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No departmental leave applications"
                description="Department faculty leave and substitution requests will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader className="bg-[#EEF1F5]/80">
                  <TableRow>
                    <TableHead className="font-bold text-[#788391] sticky left-0 z-10 bg-[#EEF1F5]">Faculty Member</TableHead>
                    <TableHead className="font-bold text-[#788391]">Leave Type</TableHead>
                    <TableHead className="font-bold text-[#788391]">Duration & Dates</TableHead>
                    <TableHead className="font-bold text-[#788391]">Nominated Substitute</TableHead>
                    <TableHead className="font-bold text-[#788391]">Status</TableHead>
                    <TableHead className="text-right font-bold text-[#788391]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E5E9EF]">
                  {facultyLeaves.map((leave) => {
                    const isPending =
                      leave.status === "submitted" || leave.status === "in_review"

                    return (
                      <TableRow key={leave.id} className="hover:bg-[#EEF1F5]/50">
                        <TableCell className="font-bold text-[#202936] sticky left-0 z-10 bg-white">
                          {leave.teacherName}
                        </TableCell>
                      <TableCell className="text-xs text-[#202936]">
                        {leave.leaveType}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#788391]">
                        {leave.daysCount}d · {leave.fromDate} → {leave.toDate}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-[#123B5A]">
                        <UserCheck2 className="inline size-3.5 mr-1 text-[#F5A000]" />
                        {leave.substituteTeacherName || "Prof. Rajesh Verma"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full text-xs font-bold",
                            leave.status === "approved"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : leave.status === "rejected"
                                ? "border-rose-300 bg-rose-50 text-rose-700"
                                : "border-amber-300 bg-amber-50 text-amber-700"
                          )}
                        >
                          {leave.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => openDecisionModal(leave, "approved")}
                              className="h-8 rounded-lg bg-emerald-600 px-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              Approve & Assign
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDecisionModal(leave, "rejected")}
                              className="h-8 rounded-lg border-rose-200 px-2.5 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#788391]">
                            Reviewed by {leave.reviewedBy || "HoD"}
                          </span>
                        )}
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

      {/* Decision Dialog */}
      <Dialog open={!!selectedLeave} onOpenChange={(open) => !open && setSelectedLeave(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl bg-white border-[#E5E9EF]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#123B5A]">
              {decision === "approved"
                ? "Approve Faculty Leave & Allocate Substitution"
                : "Reject Faculty Leave Request"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              {selectedLeave?.teacherName} · {selectedLeave?.leaveType} ({selectedLeave?.daysCount}d · {selectedLeave?.fromDate} to {selectedLeave?.toDate})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-[#EEF1F5] p-3 text-xs text-[#202936]">
              <p className="font-semibold text-[#123B5A]">Absence Reason & Handover:</p>
              <p className="mt-1">{selectedLeave?.reason}</p>
              {selectedLeave?.handoverNotes && (
                <p className="mt-1 italic text-[#788391]">{selectedLeave.handoverNotes}</p>
              )}
            </div>

            {decision === "approved" && (
              <div>
                <Label className="text-xs font-bold text-[#202936]">Designated Substitute Faculty</Label>
                <Select
                  value={substituteTeacher}
                  onValueChange={(val) => setSubstituteTeacher(val)}
                >
                  <SelectTrigger className="mt-1 rounded-xl border-[#E5E9EF] text-xs">
                    <SelectValue placeholder="Select faculty" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E5E9EF]">
                    {facultyLoad
                      .filter((f) => f.fullName !== selectedLeave?.teacherName)
                      .map((f) => (
                        <SelectItem key={f.teacherId} value={f.fullName}>
                          {f.fullName} ({f.weeklyHours} hrs/wk)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs font-bold text-[#202936]">HoD Remarks</Label>
              <Textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="mt-1 rounded-xl border-[#E5E9EF] text-base sm:text-xs"
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedLeave(null)}
              className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936]"
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              onClick={handleConfirmDecision}
              className={cn(
                "w-full sm:w-auto rounded-xl font-bold text-white",
                decision === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              )}
            >
              {submitting ? "Processing..." : decision === "approved" ? "Approve & Assign" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
