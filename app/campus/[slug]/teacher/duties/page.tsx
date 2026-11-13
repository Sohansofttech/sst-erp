"use client"

import * as React from "react"
import Link from "next/link"
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Shield,
} from "lucide-react"

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
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
import { getCampusDuties, getExamDuties } from "@/lib/services/teacher.service"
import type { CampusDuty, ExamDuty } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

export default function TeacherDutiesPage() {
  const { slug } = useTeacherRole()
  const [campusDuties, setCampusDuties] = React.useState<CampusDuty[]>([])
  const [examDuties, setExamDuties] = React.useState<ExamDuty[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([getCampusDuties(), getExamDuties()])
      .then(([cRes, eRes]) => {
        setCampusDuties(cRes)
        setExamDuties(eRes)
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load assigned duties."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([getCampusDuties(), getExamDuties()])
      .then(([cRes, eRes]) => {
        if (!active) return
        setCampusDuties(cRes)
        setExamDuties(eRes)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load assigned duties."
        )
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <LoadingState
        title="Loading duty roster"
        description="Fetching assigned campus supervision and examination duties..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load duties"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const activeCampusCount = campusDuties.filter(
    (d) => d.status === "active"
  ).length
  const upcomingExamCount = examDuties.filter(
    (d) => d.status === "assigned"
  ).length
  const completedTotal =
    campusDuties.filter((d) => d.status === "completed").length +
    examDuties.filter((d) => d.status === "completed").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campus & Exam Duties"
        subtitle="Consolidated roster of institutional responsibilities, assembly supervision, club coordination, and exam invigilation duties."
        action={
          <Button asChild>
            <Link href={`/campus/${slug}/teacher/exams`}>
              <ClipboardCheck className="size-4" />
              Log Exam Hall Attendance
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Campus Duties"
          value={activeCampusCount}
          icon={<Shield />}
          tone="brand"
          description="Weekly standing assignments"
        />
        <StatCard
          label="Upcoming Exam Duties"
          value={upcomingExamCount}
          icon={<CalendarClock />}
          tone="warning"
          description="Invigilation & evaluation"
        />
        <StatCard
          label="Completed Duties"
          value={completedTotal}
          icon={<CheckCircle2 />}
          tone="success"
          description="This term"
        />
        <StatCard
          label="Total Duty Roles"
          value={campusDuties.length + examDuties.length}
          icon={<Briefcase />}
          tone="teal"
          description="Campus + Exam Cell"
        />
      </div>

      {/* Campus Duties */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">
            Campus Supervision & Co-Curricular Duties
          </CardTitle>
          <CardDescription>
            Assigned floor supervision, morning assembly, lab oversight, and student club coordination.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campusDuties.length === 0 ? (
            <EmptyState
              title="No campus duties assigned"
              description="Standing campus supervision assignments will appear here."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {campusDuties.map((duty) => (
                <div
                  key={duty.id}
                  className="flex flex-col justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        variant="outline"
                        className="border-primary/25 bg-primary/8 text-primary"
                      >
                        {duty.category}
                      </Badge>
                      <StatusBadge
                        status={
                          duty.status === "completed" ? "Approved" : "On-Duty"
                        }
                      />
                    </div>
                    <h3 className="font-semibold text-foreground">
                      {duty.title}
                    </h3>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" />
                        <span>{duty.schedule}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" />
                        <span>{duty.location}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-muted-foreground">
                    Assigned by: {duty.assignedBy}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exam Duties Summary */}
      <Card className="bg-white">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">
              Examination Invigilation Roster
            </CardTitle>
            <CardDescription>
              Use the Examination Management workspace to submit hall attendance or malpractice reports.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/campus/${slug}/teacher/leave`}>
              Request Substitution
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Examination</TableHead>
                <TableHead>Date & Shift</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {examDuties.map((duty) => (
                <TableRow key={duty.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {duty.examName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {duty.className
                        ? `${duty.className} • ${duty.subjectName ?? ""}`
                        : duty.subjectName ?? "General Duty"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {duty.examDate}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {duty.session} ({duty.startTime} – {duty.endTime})
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{duty.roomNo}</Badge>
                  </TableCell>
                  <TableCell className="font-medium text-brand">
                    {duty.dutyRole}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={
                        duty.status === "completed" ? "Approved" : "Pending"
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
