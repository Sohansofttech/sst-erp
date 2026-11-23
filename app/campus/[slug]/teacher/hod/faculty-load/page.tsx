"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  GraduationCap,
  Users,
} from "lucide-react"

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
import { getDepartmentFacultyLoad } from "@/lib/services/teacher.service"
import type { DepartmentFacultyLoad } from "@/types/teacher"
import { useTeacherRole } from "../../teacher-role-context"

export default function HodFacultyLoadPage() {
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
      setError(err?.message || "Failed to load departmental faculty workload.")
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
        title="Loading Faculty Workload"
        description="Aggregating Department of Mathematics lecture allocations and syllabus coverage..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load faculty load"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const totalWeeklyHours = facultyLoad.reduce((acc, f) => acc + f.weeklyHours, 0)
  const avgSyllabus = facultyLoad.length > 0
    ? Number((facultyLoad.reduce((acc, f) => acc + f.syllabusAveragePercent, 0) / facultyLoad.length).toFixed(1))
    : 79.4

  return (
    <div className="space-y-6">
      <PageHeader
        title="Course Allocation & Faculty Workload"
        subtitle="Department of Mathematics faculty roster: lecture load balancing, weekly teaching hours, curriculum syllabus completion, and course section coverage."
        action={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
              <Link href={`/campus/${slug}/teacher/hod`}>
                <ArrowLeft className="mr-1.5 size-4 text-[#123B5A]" />
                Dept Dashboard
              </Link>
            </Button>
            <Button asChild className="w-full sm:w-auto rounded-xl bg-[#F5A000] font-bold text-white hover:bg-[#E09200]">
              <Link href={`/campus/${slug}/teacher/timetable`}>
                <Calendar className="mr-1.5 size-4" />
                Department Timetable
              </Link>
            </Button>
          </div>
        }
      />

      {/* Verified Demo Metrics */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          label="Department Faculty"
          value={facultyLoad.length}
          icon={<Users />}
          tone="darkNavy"
          variant="dark"
          description="Department of Mathematics"
        />
        <StatCard
          label="Total Weekly Hours"
          value={totalWeeklyHours}
          icon={<Clock />}
          tone="primary"
          description="Cumulative across 5 faculty"
        />
        <StatCard
          label="Average Syllabus Progress"
          value={`${avgSyllabus}%`}
          icon={<BookOpen />}
          tone="success"
          description="Curriculum completion benchmark"
        />
      </div>

      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader className="border-b border-[#E5E9EF] pb-4">
          <CardTitle className="text-lg font-bold text-[#202936]">
            Mathematics Department Faculty Workload ({facultyLoad.length})
          </CardTitle>
          <CardDescription className="text-xs text-[#788391]">
            Standard full-time teaching workload baseline is 18–21 lecture periods per academic week.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {facultyLoad.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No faculty load records"
                description="Department faculty load will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader className="bg-[#EEF1F5]/80">
                  <TableRow>
                    <TableHead className="font-bold text-[#788391] sticky left-0 z-10 bg-[#EEF1F5]">Faculty Name</TableHead>
                    <TableHead className="font-bold text-[#788391]">Designation</TableHead>
                    <TableHead className="font-bold text-[#788391]">Assigned Subjects & Sections</TableHead>
                    <TableHead className="font-bold text-[#788391]">Weekly Hours</TableHead>
                    <TableHead className="font-bold text-[#788391]">Syllabus Completion</TableHead>
                    <TableHead className="text-right font-bold text-[#788391]">Avg Attendance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E5E9EF]">
                  {facultyLoad.map((f) => (
                    <TableRow key={f.teacherId} className="hover:bg-[#EEF1F5]/50">
                      <TableCell className="font-bold text-[#202936] sticky left-0 z-10 bg-white">
                        {f.fullName}
                      </TableCell>
                    <TableCell className="text-xs text-[#788391]">
                      {f.designation}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-sm">
                        {f.subjects.map((sub, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="rounded-full bg-[#EEF1F5] text-[11px] font-semibold text-[#123B5A]"
                          >
                            {sub}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-[#123B5A]">
                      {f.weeklyHours} hrs/wk
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-[#EEF1F5] overflow-hidden">
                          <div
                            className="h-full bg-[#123B5A] rounded-full"
                            style={{ width: `${f.syllabusAveragePercent}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-xs text-[#202936]">
                          {f.syllabusAveragePercent}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-xs text-emerald-600">
                      {f.attendanceAveragePercent}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
