"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldCheck,
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
  getStudentLeaveRequests,
  reviewStudentLeaveRequest,
} from "@/lib/services/teacher.service"
import type { StudentLeaveRequest } from "@/types/teacher"
import { useTeacherRole } from "../../teacher-role-context"

export default function StudentLeaveApprovalsPage() {
  const { slug } = useTeacherRole()
  const [leaveRequests, setLeaveRequests] = React.useState<StudentLeaveRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Review Dialog State
  const [selectedLeave, setSelectedLeave] = React.useState<StudentLeaveRequest | null>(null)
  const [decision, setDecision] = React.useState<"approved" | "rejected">("approved")
  const [remarks, setRemarks] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const loadLeaves = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const leaves = await getStudentLeaveRequests()
      setLeaveRequests(leaves)
    } catch (err: any) {
      setError(err?.message || "Failed to load student leave requests.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadLeaves()
  }, [loadLeaves])

  const openDecisionModal = (leave: StudentLeaveRequest, action: "approved" | "rejected") => {
    setSelectedLeave(leave)
    setDecision(action)
    setRemarks(
      action === "approved"
        ? "Approved. Official On-Duty / medical attendance credit recorded."
        : "Rejected. Prior academic approval was not obtained."
    )
  }

  const handleConfirmDecision = async () => {
    if (!selectedLeave) return
    setSubmitting(true)
    try {
      await reviewStudentLeaveRequest(selectedLeave.id, decision, remarks)
      toast.success(
        decision === "approved"
          ? `Leave approved for ${selectedLeave.studentName}. Attendance records updated in DB transaction.`
          : `Leave rejected for ${selectedLeave.studentName}.`
      )
      setSelectedLeave(null)
      loadLeaves()
    } catch (err: any) {
      toast.error(err?.message || "Failed to process leave request.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Leave Applications"
        description="Fetching Class 10-A student leave and On-Duty requests..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load leave requests"
        description={error}
        onRetry={loadLeaves}
      />
    )
  }

  const pendingCount = leaveRequests.filter((l) => l.status === "pending").length
  const approvedCount = leaveRequests.filter((l) => l.status === "approved").length
  const rejectedCount = leaveRequests.filter((l) => l.status === "rejected").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Leave & On-Duty (OD) Approvals"
        subtitle="Review parent-submitted medical and official co-curricular absence applications for Class 10-A. Approving updates attendance records atomically in one DB transaction."
        action={
          <Button asChild variant="outline" className="rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
            <Link href={`/campus/${slug}/teacher/class-teacher`}>
              <ArrowLeft className="mr-1.5 size-4 text-[#123B5A]" />
              Section Dashboard
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending Queue"
          value={pendingCount}
          icon={<Clock />}
          tone={pendingCount > 0 ? "warning" : "primary"}
          variant="dark"
          description="Action required by Class Teacher"
        />
        <StatCard
          label="Approved YTD"
          value={approvedCount}
          icon={<CheckCircle2 />}
          tone="success"
          description="Attendance credits credited"
        />
        <StatCard
          label="Rejected"
          value={rejectedCount}
          icon={<XCircle />}
          tone="error"
          description="Unauthorized absence recorded"
        />
      </div>

      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader className="border-b border-[#E5E9EF] pb-4">
          <CardTitle className="text-lg font-bold text-[#202936]">
            Application Queue ({leaveRequests.length})
          </CardTitle>
          <CardDescription className="text-xs text-[#788391]">
            Approving automatically marks the student as Present (On-Duty) in the official institutional attendance register.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {leaveRequests.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No student leave requests"
                description="All leave applications for Class 10-A have been reviewed."
              />
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-[#EEF1F5]/80">
                <TableRow>
                  <TableHead className="font-bold text-[#788391]">Roll No</TableHead>
                  <TableHead className="font-bold text-[#788391]">Student Name</TableHead>
                  <TableHead className="font-bold text-[#788391]">Type & Duration</TableHead>
                  <TableHead className="font-bold text-[#788391]">Dates</TableHead>
                  <TableHead className="font-bold text-[#788391]">Reason / Justification</TableHead>
                  <TableHead className="font-bold text-[#788391]">Status</TableHead>
                  <TableHead className="text-right font-bold text-[#788391]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E5E9EF]">
                {leaveRequests.map((leave) => {
                  const isPending = leave.status === "pending"

                  return (
                    <TableRow key={leave.id} className="hover:bg-[#EEF1F5]/50">
                      <TableCell className="font-mono text-xs font-bold text-[#123B5A]">
                        {leave.rollNo}
                      </TableCell>
                      <TableCell className="font-bold text-[#202936]">
                        {leave.studentName}
                      </TableCell>
                      <TableCell className="text-xs text-[#202936]">
                        {leave.leaveType} ({leave.daysCount}d)
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#788391]">
                        {leave.fromDate} → {leave.toDate}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-[#788391]" title={leave.reason}>
                        {leave.reason}
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
                              Approve
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
                            By {leave.reviewedBy || "Class Teacher"}
                          </span>
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

      {/* Decision Dialog */}
      <Dialog open={!!selectedLeave} onOpenChange={(open) => !open && setSelectedLeave(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md bg-white border-[#E5E9EF]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#123B5A]">
              {decision === "approved" ? "Approve Student Leave" : "Reject Student Leave"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              {selectedLeave?.studentName} ({selectedLeave?.rollNo}) · {selectedLeave?.leaveType} ({selectedLeave?.daysCount}d)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-[#EEF1F5] p-3 text-xs text-[#202936]">
              <p className="font-semibold text-[#123B5A]">Application Reason:</p>
              <p className="mt-1">{selectedLeave?.reason}</p>
            </div>
            <div>
              <Label className="text-xs font-bold text-[#202936]">Class Teacher Remarks</Label>
              <Textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="mt-1 rounded-xl border-[#E5E9EF] text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSelectedLeave(null)}
              className="rounded-xl border-[#E5E9EF] text-[#202936]"
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              onClick={handleConfirmDecision}
              className={cn(
                "rounded-xl font-bold text-white",
                decision === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              )}
            >
              {submitting ? "Saving..." : decision === "approved" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
