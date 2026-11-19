"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  FileBarChart2,
  Users,
} from "lucide-react"

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDepartmentFacultyLoad } from "@/lib/services/teacher.service"
import type { DepartmentFacultyLoad } from "@/types/teacher"
import { useTeacherRole } from "../../teacher-role-context"

export default function HodAnalyticsPage() {
  const { slug } = useTeacherRole()
  const [facultyLoad, setFacultyLoad] = React.useState<DepartmentFacultyLoad[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getDepartmentFacultyLoad()
      setFacultyLoad(data)
    } catch (err: any) {
      setError(err?.message || "Failed to load departmental analytics.")
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
        title="Loading Department Analytics"
        description="Aggregating attendance distributions and syllabus completion metrics..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load analytics"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const facultyWithAtt = facultyLoad.filter((f) => f.attendanceAveragePercent !== null)
  const avgAttendance = facultyWithAtt.length > 0
    ? Number((facultyWithAtt.reduce((acc, f) => acc + (f.attendanceAveragePercent ?? 0), 0) / facultyWithAtt.length).toFixed(1))
    : null

  const avgSyllabus = facultyLoad.length > 0
    ? Number((facultyLoad.reduce((acc, f) => acc + f.syllabusAveragePercent, 0) / facultyLoad.length).toFixed(1))
    : 79.4

  const totalWeeklyHours = facultyLoad.reduce((acc, f) => acc + f.weeklyHours, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Department Attendance & Result Analytics"
        subtitle="Department of Mathematics aggregate academic performance: student attendance distribution, course syllabus coverage against term milestones, and faculty teaching load."
        action={
          <Button asChild variant="outline" className="rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
            <Link href={`/campus/${slug}/teacher/hod`}>
              <ArrowLeft className="mr-1.5 size-4 text-[#123B5A]" />
              Dept Dashboard
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Dept Faculty Count"
          value={facultyLoad.length}
          icon={<Users />}
          tone="darkNavy"
          variant="dark"
          description="Active teaching faculty"
        />
        <StatCard
          label="Avg Student Attendance"
          value={avgAttendance !== null ? `${avgAttendance}%` : "N/A"}
          icon={<CheckCircle2 />}
          tone="success"
          description="Cross-course attendance mean"
        />
        <StatCard
          label="Avg Syllabus Completion"
          value={`${avgSyllabus}%`}
          icon={<BookOpen />}
          tone="primary"
          description="Milestone benchmark (79.4%)"
        />
        <StatCard
          label="Weekly Lecture Hours"
          value={totalWeeklyHours}
          icon={<BarChart3 />}
          tone="warning"
          description="93 departmental periods"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Attendance Distribution Card */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="border-b border-[#E5E9EF] pb-4">
            <CardTitle className="text-base font-bold text-[#202936]">
              Department Attendance Distribution
            </CardTitle>
            <CardDescription className="text-xs text-[#788391]">
              Average student attendance recorded across all Mathematics courses handled by faculty.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {facultyLoad.map((f) => (
              <div key={f.teacherId} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#202936]">{f.fullName}</span>
                  <span className="font-mono font-bold text-emerald-600">
                    {f.attendanceAveragePercent !== null ? `${f.attendanceAveragePercent}%` : "N/A"}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#EEF1F5] overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{ width: `${f.attendanceAveragePercent ?? 0}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#788391]">
                  {f.subjects.join(", ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Syllabus Completion Card */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="border-b border-[#E5E9EF] pb-4">
            <CardTitle className="text-base font-bold text-[#202936]">
              Curriculum & Syllabus Completion Progress
            </CardTitle>
            <CardDescription className="text-xs text-[#788391]">
              Course syllabus coverage against the CBSE academic term milestone.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {facultyLoad.map((f) => (
              <div key={f.teacherId} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#202936]">{f.fullName}</span>
                  <span className="font-mono font-bold text-[#123B5A]">
                    {f.syllabusAveragePercent}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#EEF1F5] overflow-hidden">
                  <div
                    className="h-full bg-[#123B5A] rounded-full transition-all"
                    style={{ width: `${f.syllabusAveragePercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#788391]">
                  Weekly Load: {f.weeklyHours} lecture periods
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
