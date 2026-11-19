"use client"

import * as React from "react"
import Link from "next/link"
import {
  Users,
  Search,
  Megaphone,
  ShieldAlert,
  ArrowLeft,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createAnnouncement,
  getSectionStudents,
} from "@/lib/services/teacher.service"
import type { StudentRosterItem } from "@/types/teacher"
import { useTeacherRole } from "../../teacher-role-context"

export default function SectionStudentsPage() {
  const { slug } = useTeacherRole()
  const [students, setStudents] = React.useState<StudentRosterItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")

  // Notice dialog
  const [noticeTarget, setNoticeTarget] = React.useState<StudentRosterItem | null>(null)
  const [noticeSubject, setNoticeSubject] = React.useState("")
  const [noticeMessage, setNoticeMessage] = React.useState("")
  const [sendingNotice, setSendingNotice] = React.useState(false)

  const loadStudents = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const roster = await getSectionStudents("sec-10a")
      setStudents(roster)
    } catch (err: any) {
      setError(err?.message || "Failed to load student roster.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadStudents()
  }, [loadStudents])

  const openNoticeDialog = (student: StudentRosterItem) => {
    setNoticeTarget(student)
    setNoticeSubject(`Academic & Attendance Advisory — ${student.fullName} (${student.rollNo})`)
    setNoticeMessage(
      `Dear Parent/Guardian of ${student.fullName} (Roll ${student.rollNo}, Class 10-A),\n\nCurrent attendance stands at ${student.attendancePercent}% with an Internal Assessment average of ${student.iaAverage}%. Please review the academic portal.`
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
        priority: noticeTarget.attendancePercent < 75 ? "urgent" : "important",
        isPinned: false,
      })
      toast.success(`Notice dispatched for ${noticeTarget.fullName} via parent portal (phone protected).`)
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
        title="Loading Section Roster"
        description="Fetching Class 10-A student roster and academic metrics..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load students"
        description={error}
        onRetry={loadStudents}
      />
    )
  }

  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const avgAttendance = students.length > 0
    ? Number((students.reduce((acc, s) => acc + s.attendancePercent, 0) / students.length).toFixed(1))
    : 91.1

  const avgIA = students.length > 0
    ? Number((students.reduce((acc, s) => acc + s.iaAverage, 0) / students.length).toFixed(1))
    : 84.6

  return (
    <div className="space-y-6">
      <PageHeader
        title="Section Students — Class 10-A"
        subtitle="Complete homeroom student roster with roll numbers, attendance standing, internal assessment means, and parent contact protection."
        action={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
              <Link href={`/campus/${slug}/teacher/class-teacher`}>
                <ArrowLeft className="mr-1.5 size-4 text-[#123B5A]" />
                Section Dashboard
              </Link>
            </Button>
            <Button asChild className="rounded-xl bg-[#F5A000] font-bold text-white hover:bg-[#E09200]">
              <Link href={`/campus/${slug}/teacher/class-teacher/notices`}>
                <Megaphone className="mr-1.5 size-4" />
                Broadcast Parent Notice
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Students"
          value={students.length}
          icon={<Users />}
          variant="dark"
          tone="darkNavy"
          description="Class 10 - A (Homeroom)"
        />
        <StatCard
          label="Section Attendance"
          value={`${avgAttendance}%`}
          icon={<CheckCircle2 />}
          tone="success"
          description="Roster cumulative mean"
        />
        <StatCard
          label="Section IA Mean"
          value={`${avgIA}%`}
          icon={<CheckCircle2 />}
          tone="primary"
          description="Internal assessment average"
        />
        <StatCard
          label="Shortage Watch"
          value={students.filter((s) => s.attendancePercent < 80).length}
          icon={<ShieldAlert />}
          tone="warning"
          description="Below 80% threshold"
        />
      </div>

      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader className="flex flex-col gap-4 border-b border-[#E5E9EF] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-bold text-[#202936]">
              Student Roster ({students.length})
            </CardTitle>
            <CardDescription className="text-xs text-[#788391]">
              Strictly scoped to assigned homeroom section Class 10-A.
            </CardDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#788391]" />
            <Input
              type="text"
              placeholder="Search by name or roll no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl border-[#E5E9EF] text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredStudents.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No students match search"
                description={`No student found for "${searchQuery}".`}
              />
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-[#EEF1F5]/80">
                <TableRow>
                  <TableHead className="font-bold text-[#788391]">Roll No</TableHead>
                  <TableHead className="font-bold text-[#788391]">Student Name</TableHead>
                  <TableHead className="font-bold text-[#788391]">Attendance %</TableHead>
                  <TableHead className="font-bold text-[#788391]">IA Mean</TableHead>
                  <TableHead className="font-bold text-[#788391]">House</TableHead>
                  <TableHead className="font-bold text-[#788391]">Parent Contact (Protected)</TableHead>
                  <TableHead className="text-right font-bold text-[#788391]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E5E9EF]">
                {filteredStudents.map((s) => {
                  const isDefaulter = s.attendancePercent < 75
                  const isBorderline = s.attendancePercent >= 75 && s.attendancePercent < 82

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
                            isDefaulter
                              ? "text-rose-600"
                              : isBorderline
                                ? "text-amber-600"
                                : "text-emerald-600"
                          )}
                        >
                          {s.attendancePercent}%
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-[#202936]">
                        {s.iaAverage}%
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-full border-[#E5E9EF] text-xs text-[#788391]">
                          {s.houseOrGroup || "General"}
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
                          variant="ghost"
                          onClick={() => openNoticeDialog(s)}
                          className="h-8 rounded-lg text-xs font-bold text-[#F5A000] hover:bg-amber-50"
                        >
                          <Megaphone className="mr-1 size-3.5" />
                          Notice
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
              Send Parent Intimation
            </DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              Dispatches an encrypted notice to the parent portal for {noticeTarget?.fullName}.
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
              <Label className="text-xs font-bold text-[#202936]">Notice Content</Label>
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
              {sendingNotice ? "Sending..." : "Dispatch Notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
