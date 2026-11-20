"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  FileBarChart2,
  Megaphone,
  ShieldAlert,
  Users,
} from "lucide-react"

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
  getSectionStudents,
  getStudentLeaveRequests,
} from "@/lib/services/teacher.service"
import type { StudentRosterItem, StudentLeaveRequest } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

export default function ClassTeacherDashboardPage() {
  const { slug } = useTeacherRole()
  const [students, setStudents] = React.useState<StudentRosterItem[]>([])
  const [leaveRequests, setLeaveRequests] = React.useState<StudentLeaveRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [roster, leaves] = await Promise.all([
        getSectionStudents("sec-10a"),
        getStudentLeaveRequests(),
      ])
      setStudents(roster)
      setLeaveRequests(leaves)
    } catch (err: any) {
      setError(err?.message || "Failed to load homeroom section data.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <LoadingState
        title="Loading Homeroom Section"
        description="Aggregating Class 10-A student metrics, attendance defaulters, and leave queue..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load section dashboard"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const base = `/campus/${slug}/teacher/class-teacher`
  const defaulters = students.filter((s) => s.attendancePercent < 75)
  const borderline = students.filter(
    (s) => s.attendancePercent >= 75 && s.attendancePercent < 82
  )
  const pendingLeaves = leaveRequests.filter((l) => l.status === "pending")

  const avgAttendance = students.length > 0
    ? Number((students.reduce((acc, s) => acc + s.attendancePercent, 0) / students.length).toFixed(1))
    : 91.1

  const avgIA = students.length > 0
    ? Number((students.reduce((acc, s) => acc + s.iaAverage, 0) / students.length).toFixed(1))
    : 84.6

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homeroom Workspace — Class 10-A"
        subtitle="Dedicated homeroom section management: student roster, attendance shortage alerts, student leave approvals, and parent communications."
        action={
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
              <Link href={`${base}/leave-approvals`}>
                <CheckCircle2 className="mr-1.5 size-4 text-[#123B5A]" />
                Leave Approvals ({pendingLeaves.length})
              </Link>
            </Button>
            <Button asChild className="w-full sm:w-auto rounded-xl bg-[#F5A000] font-bold text-white hover:bg-[#E09200]">
              <Link href={`${base}/notices`}>
                <Megaphone className="mr-1.5 size-4" />
                Broadcast Parent Notice
              </Link>
            </Button>
          </div>
        }
      />

      {/* 5 Core KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Section Strength"
          value={students.length}
          icon={<Users />}
          variant="dark"
          tone="darkNavy"
          description="Class 10 - A (Homeroom)"
        />
        <StatCard
          label="Average Attendance"
          value={`${avgAttendance}%`}
          icon={<CheckCircle2 />}
          tone="success"
          description="Target ≥85% CBSE norm"
        />
        <StatCard
          label="Attendance Defaulters"
          value={defaulters.length}
          icon={<AlertTriangle />}
          tone="error"
          description={`${borderline.length} borderline (75–82%)`}
        />
        <StatCard
          label="Section IA Mean"
          value={`${avgIA}%`}
          icon={<Award />}
          tone="primary"
          description="Cross-subject aggregate"
        />
        <StatCard
          label="Pending Leaves"
          value={pendingLeaves.length}
          icon={<Clock />}
          tone={pendingLeaves.length > 0 ? "warning" : "primary"}
          description="Requires CT approval"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Defaulter Alert Snapshot */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[#E5E9EF] pb-4">
            <div>
              <CardTitle className="text-base font-bold text-[#202936]">
                Attendance Shortage Watch
              </CardTitle>
              <CardDescription className="text-xs text-[#788391]">
                Students under 75% require immediate parent notice for exam eligibility.
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs font-bold text-[#F5A000] hover:bg-amber-50">
              <Link href={`${base}/defaulters`} className="gap-1">
                View All
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {defaulters.length + borderline.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Zero attendance defaulters"
                  description="All students currently maintain safe attendance standing."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[500px]">
                  <TableHeader className="bg-[#EEF1F5]/80">
                    <TableRow>
                      <TableHead className="font-bold text-[#788391]">Roll No</TableHead>
                      <TableHead className="font-bold text-[#788391]">Student</TableHead>
                      <TableHead className="font-bold text-[#788391]">Attendance</TableHead>
                      <TableHead className="text-right font-bold text-[#788391]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-[#E5E9EF]">
                    {[...defaulters, ...borderline].slice(0, 4).map((s) => {
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
                          <TableCell className="text-right">
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
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Student Leaves Snapshot */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[#E5E9EF] pb-4">
            <div>
              <CardTitle className="text-base font-bold text-[#202936]">
                Pending Leave / OD Queue
              </CardTitle>
              <CardDescription className="text-xs text-[#788391]">
                Approving automatically records On-Duty attendance credit.
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs font-bold text-[#F5A000] hover:bg-amber-50">
              <Link href={`${base}/leave-approvals`} className="gap-1">
                Manage Queue
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {pendingLeaves.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No pending leave applications"
                  description="All student leave and on-duty requests have been processed."
                />
              </div>
            ) : (
              <div className="divide-y divide-[#E5E9EF] p-2">
                {pendingLeaves.map((l) => (
                  <div key={l.id} className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-[#202936]">
                        {l.studentName} ({l.rollNo})
                      </p>
                      <p className="text-[11px] text-[#788391] mt-0.5">
                        {l.leaveType} ({l.daysCount}d) · {l.fromDate}
                      </p>
                      <p className="text-[11px] text-[#123B5A] italic mt-0.5 truncate max-w-xs">
                        {l.reason}
                      </p>
                    </div>
                    <Button asChild size="sm" className="w-full sm:w-auto h-8 rounded-lg bg-[#123B5A] text-xs font-bold text-white hover:bg-[#1B4D70]">
                      <Link href={`${base}/leave-approvals`}>Review</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Homeroom Action Center */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="rounded-2xl border-[#E5E9EF] bg-white p-5 shadow-xs hover:border-[#123B5A] transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#123B5A]/10 text-[#123B5A]">
              <Users className="size-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#202936]">Roster Directory</p>
              <p className="text-xs text-[#788391]">All 18 students & contacts</p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#E5E9EF] text-xs font-bold text-[#123B5A] hover:bg-[#EEF1F5]">
            <Link href={`${base}/students`}>Open Section Students</Link>
          </Button>
        </Card>

        <Card className="rounded-2xl border-[#E5E9EF] bg-white p-5 shadow-xs hover:border-[#123B5A] transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <FileBarChart2 className="size-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#202936]">Section Remarks</p>
              <p className="text-xs text-[#788391]">Assign term recommendations</p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#E5E9EF] text-xs font-bold text-[#123B5A] hover:bg-[#EEF1F5]">
            <Link href={`${base}/recommendations`}>Open Recommendations</Link>
          </Button>
        </Card>

        <Card className="rounded-2xl border-[#E5E9EF] bg-white p-5 shadow-xs hover:border-[#123B5A] transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Megaphone className="size-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#202936]">Parent Notices</p>
              <p className="text-xs text-[#788391]">Broadcast announcements</p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#E5E9EF] text-xs font-bold text-[#123B5A] hover:bg-[#EEF1F5]">
            <Link href={`${base}/notices`}>Open Parent Broadcasts</Link>
          </Button>
        </Card>
      </div>
    </div>
  )
}
