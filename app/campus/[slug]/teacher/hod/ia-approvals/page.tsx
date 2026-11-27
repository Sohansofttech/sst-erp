"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Lock,
  RotateCcw,
  Search,
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
  getInternalAssessments,
  updateInternalAssessmentStatus,
} from "@/lib/services/teacher.service"
import type { InternalAssessment } from "@/types/teacher"
import type { ApprovalStatus } from "@/types/common"
import { useTeacherRole } from "../../teacher-role-context"

export default function HodIaApprovalsPage() {
  const { slug, user } = useTeacherRole()
  const deptName = user?.department || "Department"
  const [assessments, setAssessments] = React.useState<InternalAssessment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Review Dialog State
  const [targetIA, setTargetIA] = React.useState<InternalAssessment | null>(null)
  const [actionType, setActionType] = React.useState<"approved" | "locked" | "returned">("approved")
  const [actionNotes, setActionNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const loadAssessments = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getInternalAssessments()
      setAssessments(data)
    } catch (err: any) {
      setError(err?.message || "Failed to load internal assessment queue.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadAssessments()
  }, [loadAssessments])

  const openActionModal = (ia: InternalAssessment, action: "approved" | "locked" | "returned") => {
    setTargetIA(ia)
    setActionType(action)
    setActionNotes(
      action === "approved"
        ? "Verified and approved by Head of Department."
        : action === "locked"
          ? "Final marks locked for CBSE report card compilation."
          : "Returned for marks correction. Please verify student absent entries."
    )
  }

  const handleConfirmAction = async () => {
    if (!targetIA) return
    setSubmitting(true)
    try {
      await updateInternalAssessmentStatus(targetIA.id, actionType, actionNotes)
      toast.success(
        actionType === "approved"
          ? `Marks approved for ${targetIA.title} (${targetIA.className}-${targetIA.section}).`
          : actionType === "locked"
            ? `Marks permanently locked for ${targetIA.title}.`
            : `Marks returned with corrections to faculty for ${targetIA.title}.`
      )
      setTargetIA(null)
      loadAssessments()
    } catch (err: any) {
      toast.error(err?.message || "Failed to update assessment status.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Assessment Approval Queue"
        description={`Fetching submitted IA marks sheets across ${deptName} sections...`}
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load IA queue"
        description={error}
        onRetry={loadAssessments}
      />
    )
  }

  const pendingCount = assessments.filter(
    (a) => a.status === "submitted" || a.status === "in_review" || a.status === "draft"
  ).length
  const approvedCount = assessments.filter((a) => a.status === "approved").length
  const lockedCount = assessments.filter((a) => a.status === "locked").length

  return (
    <div className="space-y-6">
      <PageHeader
        title={`IA Approval & Lock Queue — ${deptName}`}
        subtitle="Departmental leadership review: approve verified internal assessment scores, return sheets for moderation corrections, or permanently lock marks for report card compilation."
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
          label="Pending Review Queue"
          value={pendingCount}
          icon={<ClipboardCheck />}
          tone={pendingCount > 0 ? "warning" : "primary"}
          variant="dark"
          description="Action required by HoD"
        />
        <StatCard
          label="Approved Sheets"
          value={approvedCount}
          icon={<CheckCircle2 />}
          tone="success"
          description="Eligible for locking"
        />
        <StatCard
          label="Locked Sheets"
          value={lockedCount}
          icon={<Lock />}
          tone="darkNavy"
          description="Permanent record sealed"
        />
      </div>

      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader className="border-b border-[#E5E9EF] pb-4">
          <CardTitle className="text-lg font-bold text-[#202936]">
            {deptName} Marks Sheets ({assessments.length})
          </CardTitle>
          <CardDescription className="text-xs text-[#788391]">
            Once locked, internal assessment scores can only be modified through academic director authorization.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {assessments.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No assessment submissions"
                description="Submitted IA marks sheets from department faculty will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader className="bg-[#EEF1F5]/80">
                  <TableRow>
                    <TableHead className="font-bold text-[#788391] sticky left-0 z-10 bg-[#EEF1F5]">Assessment Title</TableHead>
                    <TableHead className="font-bold text-[#788391]">Class & Section</TableHead>
                    <TableHead className="font-bold text-[#788391]">Type & Marks</TableHead>
                    <TableHead className="font-bold text-[#788391]">Due Date</TableHead>
                    <TableHead className="font-bold text-[#788391]">Status</TableHead>
                    <TableHead className="text-right font-bold text-[#788391]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E5E9EF]">
                  {assessments.map((ia) => {
                    const isLocked = ia.status === "locked"
                    const isApproved = ia.status === "approved"
                    const isPending = !isLocked && !isApproved

                    return (
                      <TableRow key={ia.id} className="hover:bg-[#EEF1F5]/50">
                        <TableCell className="sticky left-0 z-10 bg-white">
                          <p className="font-bold text-[#202936]">{ia.title}</p>
                          <p className="text-xs text-[#788391]">{ia.subjectName || deptName}</p>
                        </TableCell>
                      <TableCell className="font-semibold text-xs text-[#123B5A]">
                        {ia.className} - {ia.section}
                      </TableCell>
                      <TableCell className="text-xs text-[#202936]">
                        {ia.componentName} (Max {ia.maxMarks})
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#788391]">
                        {ia.conductedDate}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full text-xs font-bold",
                            isLocked
                              ? "border-[#123B5A] bg-[#123B5A]/10 text-[#123B5A]"
                              : isApproved
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-amber-300 bg-amber-50 text-amber-700"
                          )}
                        >
                          {isLocked ? "Locked" : isApproved ? "Approved" : "Pending HoD"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => openActionModal(ia, "approved")}
                              className="h-8 rounded-lg bg-emerald-600 px-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openActionModal(ia, "returned")}
                              className="h-8 rounded-lg border-rose-200 px-2.5 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              Return
                            </Button>
                          </div>
                        ) : isApproved ? (
                          <Button
                            size="sm"
                            onClick={() => openActionModal(ia, "locked")}
                            className="h-8 rounded-lg bg-[#123B5A] px-2.5 text-xs font-bold text-white hover:bg-[#1B4D70]"
                          >
                            <Lock className="mr-1 size-3" />
                            Lock Marks
                          </Button>
                        ) : (
                          <span className="text-xs text-[#788391] flex items-center justify-end gap-1">
                            <Lock className="size-3 text-[#123B5A]" />
                            Permanent Lock
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

      {/* Action Dialog */}
      <Dialog open={!!targetIA} onOpenChange={(open) => !open && setTargetIA(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl bg-white border-[#E5E9EF]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#123B5A]">
              {actionType === "approved"
                ? "Approve IA Marks"
                : actionType === "locked"
                  ? "Lock Marks Permanently"
                  : "Return Sheet with Remarks"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              {targetIA?.title} · {targetIA?.className}-{targetIA?.section} (Max {targetIA?.maxMarks} marks)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-[#202936]">HoD Remarks / Instructions</Label>
              <Textarea
                rows={3}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className="mt-1 rounded-xl border-[#E5E9EF] text-base sm:text-xs"
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setTargetIA(null)}
              className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936]"
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              onClick={handleConfirmAction}
              className={cn(
                "w-full sm:w-auto rounded-xl font-bold text-white",
                actionType === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : actionType === "locked"
                    ? "bg-[#123B5A] hover:bg-[#1B4D70]"
                    : "bg-rose-600 hover:bg-rose-700"
              )}
            >
              {submitting ? "Processing..." : actionType === "approved" ? "Approve Sheet" : actionType === "locked" ? "Confirm Lock" : "Return to Faculty"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
