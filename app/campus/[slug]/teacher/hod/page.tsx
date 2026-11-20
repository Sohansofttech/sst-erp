"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Lock,
  Megaphone,
  RotateCcw,
  ShieldCheck,
  UserCheck2,
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
  getDepartmentFacultyLoad,
  getInternalAssessments,
  getTeacherLeaveRequests,
} from "@/lib/services/teacher.service"
import type {
  DepartmentFacultyLoad,
  InternalAssessment,
  TeacherLeaveRequest,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

export default function HodDashboardPage() {
  const { slug } = useTeacherRole()
  const [facultyLoad, setFacultyLoad] = React.useState<DepartmentFacultyLoad[]>([])
  const [assessments, setAssessments] = React.useState<InternalAssessment[]>([])
  const [facultyLeaves, setFacultyLeaves] = React.useState<TeacherLeaveRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [facs, ias, allLeaves] = await Promise.all([
        getDepartmentFacultyLoad(),
        getInternalAssessments(),
        getTeacherLeaveRequests(),
      ])

      // HoD's own leave must not appear in their own approval queue (route to Principal)
      const hodTeacherId = "teacher_demo_042"
      const deptLeaves = allLeaves.filter(
        (l) =>
          l.teacherId !== hodTeacherId &&
          !l.teacherName?.toLowerCase().includes("ananya")
      )

      setFacultyLoad(facs)
      setAssessments(ias)
      setFacultyLeaves(deptLeaves)
    } catch (err: any) {
      setError(err?.message || "Failed to load department dashboard.")
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
        title="Loading Department Leadership"
        description="Aggregating Department of Mathematics faculty load, IA queues, and substitution rosters..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load HoD console"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const base = `/campus/${slug}/teacher/hod`
  const pendingIA = assessments.filter(
    (a) => a.status === "submitted" || a.status === "in_review" || a.status === "draft"
  )
  const pendingLeaves = facultyLeaves.filter(
    (l) => l.status === "submitted" || l.status === "in_review"
  )
  const totalWeeklyHours = facultyLoad.reduce((acc, f) => acc + f.weeklyHours, 0)
  const avgSyllabus = facultyLoad.length > 0
    ? Number((facultyLoad.reduce((acc, f) => acc + f.syllabusAveragePercent, 0) / facultyLoad.length).toFixed(1))
    : 79.4
  const avgAttendance = facultyLoad.length > 0
    ? Number((facultyLoad.reduce((acc, f) => acc + f.attendanceAveragePercent, 0) / facultyLoad.length).toFixed(1))
    : 91.8

  return (
    <div className="space-y-6">
      <PageHeader
        title="Department of Mathematics — HoD Leadership"
        subtitle="Departmental leadership workspace: internal assessment approvals & locking, faculty workload balancing, and faculty leave substitution allocations."
        action={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
              <Link href={`${base}/ia-approvals`}>
                <ClipboardCheck className="mr-1.5 size-4 text-[#123B5A]" />
                IA Approval Queue ({pendingIA.length})
              </Link>
            </Button>
            <Button asChild className="w-full sm:w-auto rounded-xl bg-[#F5A000] font-bold text-white hover:bg-[#E09200]">
              <Link href={`${base}/leave-approvals`}>
                <BookOpen className="mr-1.5 size-4" />
                Faculty Leave ({pendingLeaves.length})
              </Link>
            </Button>
          </div>
        }
      />

      {/* 5 Core KPIs Matching Demo Metrics */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Department Faculty"
          value={facultyLoad.length}
          icon={<Users />}
          variant="dark"
          tone="darkNavy"
          description="Department of Mathematics"
        />
        <StatCard
          label="Total Weekly Hours"
          value={totalWeeklyHours}
          icon={<Clock />}
          tone="primary"
          description="93 departmental periods"
        />
        <StatCard
          label="IA Approval Queue"
          value={pendingIA.length}
          icon={<ClipboardCheck />}
          tone={pendingIA.length > 0 ? "warning" : "primary"}
          description="Pending HoD moderation"
        />
        <StatCard
          label="Average Attendance"
          value={`${avgAttendance}%`}
          icon={<CheckCircle2 />}
          tone="success"
          description="Dept-wide student average"
        />
        <StatCard
          label="Average Syllabus"
          value={`${avgSyllabus}%`}
          icon={<BookOpen />}
          tone="primary"
          description="Term milestone (79.4%)"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* IA Review Snapshot */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[#E5E9EF] pb-4">
            <div>
              <CardTitle className="text-base font-bold text-[#202936]">
                IA Marks Sheet Queue
              </CardTitle>
              <CardDescription className="text-xs text-[#788391]">
                Moderation queue for Periodic Tests, Lab journals, and Portfolios.
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs font-bold text-[#F5A000] hover:bg-amber-50">
              <Link href={`${base}/ia-approvals`} className="gap-1">
                View All Queue
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {pendingIA.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No pending IA marks sheets"
                  description="All submitted assessment sheets have been approved and locked."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[500px]">
                  <TableHeader className="bg-[#EEF1F5]/80">
                    <TableRow>
                      <TableHead className="font-bold text-[#788391]">Assessment</TableHead>
                      <TableHead className="font-bold text-[#788391]">Section</TableHead>
                      <TableHead className="font-bold text-[#788391]">Max Marks</TableHead>
                      <TableHead className="text-right font-bold text-[#788391]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-[#E5E9EF]">
                    {pendingIA.slice(0, 4).map((ia) => (
                      <TableRow key={ia.id} className="hover:bg-[#EEF1F5]/50">
                        <TableCell className="font-bold text-[#202936]">
                          {ia.title}
                        </TableCell>
                        <TableCell className="font-semibold text-xs text-[#123B5A]">
                          {ia.className} - {ia.section}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-[#788391]">
                          {ia.maxMarks} marks
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" className="h-8 rounded-lg bg-[#123B5A] text-xs font-bold text-white hover:bg-[#1B4D70]">
                            <Link href={`${base}/ia-approvals`}>Review</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Faculty Workload Snapshot */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[#E5E9EF] pb-4">
            <div>
              <CardTitle className="text-base font-bold text-[#202936]">
                Faculty Workload & Coverage
              </CardTitle>
              <CardDescription className="text-xs text-[#788391]">
                Weekly lecture hours allocated across Mathematics department faculty.
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs font-bold text-[#F5A000] hover:bg-amber-50">
              <Link href={`${base}/faculty-load`} className="gap-1">
                Full Workload
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#E5E9EF]">
              {facultyLoad.slice(0, 4).map((f) => (
                <div key={f.teacherId} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#202936]">{f.fullName}</p>
                    <p className="text-[11px] text-[#788391]">{f.designation}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-[#123B5A]">
                      {f.weeklyHours} hrs/wk
                    </span>
                    <Badge variant="outline" className="rounded-full text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                      {f.syllabusAveragePercent}% syllabus
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leadership Quick Hub */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-[#E5E9EF] bg-white p-5 shadow-xs hover:border-[#123B5A] transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#123B5A]/10 text-[#123B5A]">
              <ClipboardCheck className="size-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#202936]">IA Approvals</p>
              <p className="text-xs text-[#788391]">{pendingIA.length} sheets pending</p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#E5E9EF] text-xs font-bold text-[#123B5A] hover:bg-[#EEF1F5]">
            <Link href={`${base}/ia-approvals`}>Open IA Queue</Link>
          </Button>
        </Card>

        <Card className="rounded-2xl border-[#E5E9EF] bg-white p-5 shadow-xs hover:border-[#123B5A] transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Users className="size-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#202936]">Faculty Load</p>
              <p className="text-xs text-[#788391]">5 faculty · 93 hours</p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#E5E9EF] text-xs font-bold text-[#123B5A] hover:bg-[#EEF1F5]">
            <Link href={`${base}/faculty-load`}>Open Workload</Link>
          </Button>
        </Card>

        <Card className="rounded-2xl border-[#E5E9EF] bg-white p-5 shadow-xs hover:border-[#123B5A] transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <BookOpen className="size-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#202936]">Substitutions</p>
              <p className="text-xs text-[#788391]">{pendingLeaves.length} leave requests</p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#E5E9EF] text-xs font-bold text-[#123B5A] hover:bg-[#EEF1F5]">
            <Link href={`${base}/leave-approvals`}>Open Leaves</Link>
          </Button>
        </Card>

        <Card className="rounded-2xl border-[#E5E9EF] bg-white p-5 shadow-xs hover:border-[#123B5A] transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-[#202936]">Dept Analytics</p>
              <p className="text-xs text-[#788391]">Attendance & syllabus</p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-[#E5E9EF] text-xs font-bold text-[#123B5A] hover:bg-[#EEF1F5]">
            <Link href={`${base}/analytics`}>Open Analytics</Link>
          </Button>
        </Card>
      </div>
    </div>
  )
}
