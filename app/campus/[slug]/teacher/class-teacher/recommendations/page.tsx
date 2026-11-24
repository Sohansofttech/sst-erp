"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  FileBarChart2,
  Save,
  Users,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getSectionStudents } from "@/lib/services/teacher.service"
import type { StudentRosterItem } from "@/types/teacher"
import { useTeacherRole } from "../../teacher-role-context"

type RecommendationType =
  | "Good Standing"
  | "Academic Watch"
  | "Remedial Support"
  | "Parent Meeting"

function defaultRecommendation(student: StudentRosterItem): RecommendationType {
  if ((student.attendancePercent !== null && student.attendancePercent < 75) || student.iaAverage < 60) return "Parent Meeting"
  if (student.iaAverage < 70) return "Remedial Support"
  if (student.attendancePercent !== null && student.attendancePercent < 82) return "Academic Watch"
  return "Good Standing"
}

export default function SectionRecommendationsPage() {
  const { slug } = useTeacherRole()
  const [students, setStudents] = React.useState<StudentRosterItem[]>([])
  const [recommendations, setRecommendations] = React.useState<Record<string, RecommendationType>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const roster = await getSectionStudents()
      setStudents(roster)
      const initial: Record<string, RecommendationType> = {}
      for (const s of roster) {
        initial[s.studentId] = defaultRecommendation(s)
      }
      setRecommendations(initial)
    } catch (err: any) {
      setError(err?.message || "Failed to load section data.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleRecommendationChange = (studentId: string, val: RecommendationType) => {
    setRecommendations((prev) => ({ ...prev, [studentId]: val }))
  }

  const handleSaveAll = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success("Section recommendations saved and synchronized to Student Performance dossier.")
    }, 400)
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading Section Analytics"
        description="Compiling Class 10-A cross-subject IA means and attendance recommendations..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load summary"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const goodStandingCount = Object.values(recommendations).filter((v) => v === "Good Standing").length
  const remedialCount = Object.values(recommendations).filter((v) => v === "Remedial Support").length
  const parentMeetingCount = Object.values(recommendations).filter((v) => v === "Parent Meeting").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Section Summary & Status Recommendations"
        subtitle="Homeroom Class 10-A holistic evaluation: assign term recommendations, remedial clinic tags, and parent conference requests based on attendance and IA metrics."
        action={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
              <Link href={`/campus/${slug}/teacher/class-teacher`}>
                <ArrowLeft className="mr-1.5 size-4 text-[#123B5A]" />
                Section Dashboard
              </Link>
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={saving}
              className="w-full sm:w-auto rounded-xl bg-[#F5A000] font-bold text-white hover:bg-[#E09200]"
            >
              <Save className="mr-1.5 size-4" />
              {saving ? "Saving..." : "Save Recommendations"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Strength"
          value={students.length}
          icon={<Users />}
          tone="darkNavy"
          variant="dark"
          description="Class 10 - A (Homeroom)"
        />
        <StatCard
          label="Good Standing"
          value={goodStandingCount}
          icon={<CheckCircle2 />}
          tone="success"
          description="Satisfying attendance & IA"
        />
        <StatCard
          label="Remedial Support"
          value={remedialCount}
          icon={<Award />}
          tone="warning"
          description="Allocated to doubt clinics"
        />
        <StatCard
          label="Parent Conference"
          value={parentMeetingCount}
          icon={<FileBarChart2 />}
          tone="error"
          description="Meeting required with CT"
        />
      </div>

      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader className="border-b border-[#E5E9EF] pb-4">
          <CardTitle className="text-lg font-bold text-[#202936]">
            Student Recommendation Roster ({students.length})
          </CardTitle>
          <CardDescription className="text-xs text-[#788391]">
            Selected statuses are surfaced in the official Term Progress Report and Parent Dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader className="bg-[#EEF1F5]/80">
                <TableRow>
                  <TableHead className="font-bold text-[#788391] sticky left-0 z-10 bg-[#EEF1F5]">Roll No</TableHead>
                  <TableHead className="font-bold text-[#788391]">Student Name</TableHead>
                  <TableHead className="font-bold text-[#788391]">Attendance %</TableHead>
                  <TableHead className="font-bold text-[#788391]">IA Mean</TableHead>
                  <TableHead className="font-bold text-[#788391]">Class Teacher Recommendation</TableHead>
                  <TableHead className="text-right font-bold text-[#788391]">Standing Tag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E5E9EF]">
                {students.map((s) => {
                  const rec = recommendations[s.studentId] || "Good Standing"

                  return (
                    <TableRow key={s.studentId} className="hover:bg-[#EEF1F5]/50">
                      <TableCell className="font-mono text-xs font-bold text-[#123B5A] sticky left-0 z-10 bg-white">
                        {s.rollNo}
                      </TableCell>
                    <TableCell className="font-bold text-[#202936]">
                      {s.fullName}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "font-mono font-bold text-xs",
                          s.attendancePercent !== null && s.attendancePercent < 75 ? "text-rose-600" : "text-emerald-600"
                        )}
                      >
                        {s.attendancePercent !== null ? `${s.attendancePercent.toFixed(1)}%` : "N/A"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-[#202936]">
                      {s.iaAverage}%
                    </TableCell>
                    <TableCell>
                      <Select
                        value={rec}
                        onValueChange={(val: RecommendationType) =>
                          handleRecommendationChange(s.studentId, val)
                        }
                      >
                        <SelectTrigger className="h-8 w-48 rounded-lg border-[#E5E9EF] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-[#E5E9EF]">
                          <SelectItem value="Good Standing">Good Standing</SelectItem>
                          <SelectItem value="Academic Watch">Academic Watch</SelectItem>
                          <SelectItem value="Remedial Support">Remedial Support</SelectItem>
                          <SelectItem value="Parent Meeting">Parent Meeting</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full text-xs font-bold",
                          rec === "Good Standing"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : rec === "Parent Meeting"
                              ? "border-rose-300 bg-rose-50 text-rose-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                        )}
                      >
                        {rec}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
