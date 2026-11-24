"use client"

import * as React from "react"
import Link from "next/link"
import {
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Shield,
  Clock,
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
import { getCampusDuties } from "@/lib/services/teacher.service"
import type { CampusDuty } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

function CampusDutiesInner() {
  const { slug } = useTeacherRole()
  const [campusDuties, setCampusDuties] = React.useState<CampusDuty[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    getCampusDuties()
      .then((cRes) => {
        setCampusDuties(cRes)
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load assigned campus duties."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <LoadingState
        title="Loading duty roster"
        description="Fetching assigned campus supervision and standing responsibilities..."
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

  const activeCampusCount = campusDuties.filter((d) => d.status === "active").length
  const completedTotal = campusDuties.filter((d) => d.status === "completed").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campus Duties"
        subtitle="Consolidated roster of institutional responsibilities, morning assembly supervision, disciplinary rounds, and student club coordination."
        action={
          <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
            <Link href={`/campus/${slug}/teacher/timetable`}>
              <Calendar className="mr-1.5 size-4 text-[#123B5A]" />
              View Timetable Schedule
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Campus Duties"
          value={activeCampusCount}
          icon={<Shield />}
          variant="dark"
          tone="darkNavy"
          description="Weekly standing assignments"
        />
        <StatCard
          label="Completed Duties"
          value={completedTotal}
          icon={<CheckCircle2 />}
          tone="success"
          description="This academic term"
        />
        <StatCard
          label="Total Duty Assignments"
          value={campusDuties.length}
          icon={<Briefcase />}
          tone="primary"
          description="Institutional supervision"
        />
        <StatCard
          label="Supervision Time"
          value="4.5 hrs"
          icon={<Clock />}
          tone="brand"
          description="Weekly allocated duty"
        />
      </div>

      {/* Campus Duties Cards */}
      <Card className="bg-white rounded-2xl border-[#E5E9EF] shadow-xs">
        <CardHeader className="border-b border-[#E5E9EF] pb-4">
          <CardTitle className="text-lg font-bold text-[#202936]">
            Campus Supervision & Standing Assignments
          </CardTitle>
          <CardDescription className="text-[#788391]">
            Floor supervision, morning assembly monitoring, lab oversight, and student activity coordination.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
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
                  className="flex flex-col justify-between rounded-xl border border-[#E5E9EF] bg-white p-4 shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        variant="outline"
                        className="rounded-full border-[#123B5A]/20 bg-[#123B5A]/10 text-[#123B5A] font-bold"
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
    </div>
  )
}

export default function CampusDutiesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <LoadingState
            title="Loading duty roster"
            description="Fetching assigned campus supervision..."
          />
        </div>
      }
    >
      <CampusDutiesInner />
    </React.Suspense>
  )
}
