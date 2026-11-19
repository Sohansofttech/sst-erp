"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Megaphone,
  ShieldAlert,
  CheckCircle2,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Textarea } from "@/components/ui/textarea"
import {
  createAnnouncement,
  getSectionStudents,
} from "@/lib/services/teacher.service"
import type { StudentRosterItem } from "@/types/teacher"
import { useTeacherRole } from "../../teacher-role-context"

export default function AttendanceDefaultersPage() {
  const { slug } = useTeacherRole()
  const [students, setStudents] = React.useState<StudentRosterItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Notice dialog
  const [noticeTarget, setNoticeTarget] = React.useState<StudentRosterItem | null>(null)
  const [noticeSubject, setNoticeSubject] = React.useState("")
  const [noticeMessage, setNoticeMessage] = React.useState("")
  const [sendingNotice, setSendingNotice] = React.useState(false)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const roster = await getSectionStudents("sec-10a")
      setStudents(roster)
    } catch (err: any) {
      setError(err?.message || "Failed to load attendance records.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const openNoticeDialog = (student: StudentRosterItem) => {
    setNoticeTarget(student)
    setNoticeSubject(`Urgent Attendance Advisory — ${student.fullName} (${student.rollNo})`)
    setNoticeMessage(
      `Dear Parent/Guardian of ${student.fullName} (Roll ${student.rollNo}, Class 10-A),\n\nYour ward's attendance currently stands at ${student.attendancePercent}% which is below the mandatory 75% CBSE requirement. Kindly attend PTI hours with the Class Teacher to formulate an attendance recovery schedule.`
    )
  }

  const handleSendNotice = async () => {
    if (!noticeTarget || !noticeSubject.trim() || !noticeMessage.trim()) return
    setSendingNotice(true)
    try {
      await createAnnouncement({
        title: noticeSubject,
        content: noticeMessage,
        audience: "Class & Parents",
        targetClasses: ["Class 10 - A"],
        priority: "urgent",
        isPinned: true,
      })
      toast.success(`Defaulter notice sent for ${noticeTarget.fullName} via official parent portal.`)
      setNoticeTarget(null)
    } catch (err: any) {
      toast.error(err?.message || "Failed to send notice.")
    } finally {
      setSendingNotice(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Attendance Defaulters"
        description="Scanning Class 10-A attendance thresholds (<75% critical, 75-82% borderline)..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load defaulters"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const criticalDefaulters = students.filter((s) => s.attendancePercent < 75)
  const borderlineStudents = students.filter(
    (s) => s.attendancePercent >= 75 && s.attendancePercent < 82
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Defaulters & Shortage Watch"
        subtitle="Mandatory attendance monitoring for Class 10-A: students below 75% require immediate parent intimation and exam eligibility counseling."
        action={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
              <Link href={`/campus/${slug}/teacher/class-teacher`}>
                <ArrowLeft className="mr-1.5 size-4 text-[#123B5A]" />
                Section Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
              <Link href={`/campus/${slug}/teacher/class-teacher/students`}>
                Full Section Roster ({students.length})
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Critical Defaulters (<75%)"
          value={criticalDefaulters.length}
          icon={<AlertTriangle />}
          tone="error"
          variant="dark"
          description="Examination eligibility risk"
        />
        <StatCard
          label="Borderline Watch (75-82%)"
          value={borderlineStudents.length}
          icon={<ShieldAlert />}
          tone="warning"
          description="At risk of falling below quota"
        />
        <StatCard
          label="Safe Standing (≥82%)"
          value={students.length - criticalDefaulters.length - borderlineStudents.length}
          icon={<CheckCircle2 />}
          tone="success"
          description="Compliant with board norms"
        />
      </div>

      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader className="border-b border-[#E5E9EF] pb-4">
          <CardTitle className="text-lg font-bold text-[#202936]">
            Shortage Roster ({criticalDefaulters.length + borderlineStudents.length} Students)
          </CardTitle>
          <CardDescription className="text-xs text-[#788391]">
            Parent contact numbers are protected with masked identifiers in compliance with institutional data governance.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {criticalDefaulters.length + borderlineStudents.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Zero attendance defaulters"
                description="All 18 students in Class 10-A currently maintain attendance above 82%."
              />
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-[#EEF1F5]/80">
                <TableRow>
                  <TableHead className="font-bold text-[#788391]">Roll No</TableHead>
                  <TableHead className="font-bold text-[#788391]">Student Name</TableHead>
                  <TableHead className="font-bold text-[#788391]">Attendance %</TableHead>
                  <TableHead className="font-bold text-[#788391]">IA Average</TableHead>
                  <TableHead className="font-bold text-[#788391]">Standing</TableHead>
                  <TableHead className="font-bold text-[#788391]">Parent / Guardian</TableHead>
                  <TableHead className="text-right font-bold text-[#788391]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E5E9EF]">
                {[...criticalDefaulters, ...borderlineStudents].map((s) => {
                  const isCritical = s.attendancePercent < 75

                  return (
                    <TableRow key={s.studentId} className="hover:bg-[#EEF1F5]/50">
                      <TableCell className="font-mono text-xs font-bold text-[#123B5A]">
                        {s.rollNo}
                      </TableCell>
                      <TableCell className="font-bold text-[#202936]">
                        {s.fullName}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "font-mono font-bold text-xs",
                            isCritical ? "text-rose-600" : "text-amber-600"
                          )}
                        >
                          {s.attendancePercent}%
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-[#202936]">
                        {s.iaAverage}%
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full text-xs font-bold",
                            isCritical
                              ? "border-rose-300 bg-rose-50 text-rose-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          )}
                        >
                          {isCritical ? "Defaulter (<75%)" : "Borderline"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-[#788391]">
                        <span className="font-semibold text-[#202936]">
                          {s.guardianContact.guardianName}
                        </span>{" "}
                        ({s.guardianContact.relation})
                        <span className="block font-mono text-[11px] text-[#788391]">
                          {s.guardianContact.phone.slice(0, 7)}****
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => openNoticeDialog(s)}
                          className="h-8 rounded-lg bg-[#F5A000] px-2.5 text-xs font-bold text-white hover:bg-[#E09200]"
                        >
                          <Megaphone className="mr-1 size-3.5" />
                          Intimate Parent
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Notice Dialog */}
      <Dialog open={!!noticeTarget} onOpenChange={(open) => !open && setNoticeTarget(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md bg-white border-[#E5E9EF]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#123B5A]">
              Send Shortage Advisory
            </DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              Dispatches an attendance alert to the parent portal for {noticeTarget?.fullName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-[#202936]">Subject</Label>
              <Input
                value={noticeSubject}
                onChange={(e) => setNoticeSubject(e.target.value)}
                className="mt-1 rounded-xl border-[#E5E9EF] text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-[#202936]">Advisory Content</Label>
              <Textarea
                rows={4}
                value={noticeMessage}
                onChange={(e) => setNoticeMessage(e.target.value)}
                className="mt-1 rounded-xl border-[#E5E9EF] text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setNoticeTarget(null)}
              className="rounded-xl border-[#E5E9EF] text-[#202936]"
            >
              Cancel
            </Button>
            <Button
              disabled={sendingNotice}
              onClick={handleSendNotice}
              className="rounded-xl bg-[#F5A000] font-bold text-white hover:bg-[#E09200]"
            >
              {sendingNotice ? "Sending..." : "Send Advisory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
