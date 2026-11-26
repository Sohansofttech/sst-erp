"use client"

import * as React from "react"
import {
  Calendar,
  Clock,
  Layers,
  MapPin,
  RefreshCw,
  Sparkles,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getSubjectAllocations,
  getTimetable,
} from "@/lib/services/teacher.service"
import type { DayOfWeek } from "@/types/common"
import type { SubjectAllocation, TimetableSlot } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const DAYS_OF_WEEK: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

const PERIOD_TIMES: Record<number, string> = {
  1: "08:30 – 09:15",
  2: "09:15 – 10:00",
  3: "10:15 – 11:00",
  4: "11:00 – 11:45",
  5: "11:45 – 12:30",
  6: "13:15 – 14:00",
  7: "14:00 – 14:45",
}

function getDefaultDay(): DayOfWeek {
  const idx = new Date().getDay()
  if (idx >= 1 && idx <= 6) {
    return DAYS_OF_WEEK[idx - 1]
  }
  return "Monday"
}

function detectLivePeriodId(slots: TimetableSlot[]): string | null {
  const now = new Date()
  const currentDay = getDefaultDay()
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  const live = slots.find(
    (s) =>
      s.day === currentDay && hhmm >= s.startTime && hhmm <= s.endTime
  )
  return live?.id ?? null
}

export default function TeacherTimetablePage() {
  const { academicYear } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [slots, setSlots] = React.useState<TimetableSlot[]>([])
  const [allocations, setAllocations] = React.useState<SubjectAllocation[]>([])
  const [selectedDay, setSelectedDay] = React.useState<DayOfWeek>(
    getDefaultDay()
  )
  const [activeSlotId, setActiveSlotId] = React.useState<string | null>(null)

  const loadTimetable = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [tt, subs] = await Promise.all([
        getTimetable(),
        getSubjectAllocations(),
      ])
      setSlots(tt)
      setAllocations(subs)
      const liveId = detectLivePeriodId(tt)
      const fallback =
        tt.find((s) => s.day === getDefaultDay()) ?? tt[0] ?? null
      setActiveSlotId(liveId ?? fallback?.id ?? null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load timetable."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([getTimetable(), getSubjectAllocations()])
      .then(([tt, subs]) => {
        if (!active) return
        setSlots(tt)
        setAllocations(subs)
        const liveId = detectLivePeriodId(tt)
        const fallback =
          tt.find((s) => s.day === getDefaultDay()) ?? tt[0] ?? null
        setActiveSlotId(liveId ?? fallback?.id ?? null)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load timetable."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <LoadingState
        title="Loading My Timetable"
        description="Fetching your weekly schedule and workload summary..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load timetable"
        description={error}
        onRetry={() => void loadTimetable()}
      />
    )
  }

  const daySlots = slots
    .filter((slot) => slot.day === selectedDay)
    .sort((a, b) => a.period - b.period)

  const totalPeriods = slots.length
  const totalHours = Number(((totalPeriods * 45) / 60).toFixed(2))
  const labPeriods = slots.filter((s) => s.isLab).length
  const substitutedCount = slots.filter((s) => s.isSubstituted).length

  const slotLookup = new Map<string, TimetableSlot>()
  for (const slot of slots) {
    slotLookup.set(`${slot.day}-${slot.period}`, slot)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Timetable"
        subtitle={`Weekly teaching schedule, room allocations, and substitution updates · AY ${academicYear}`}
        badge={
          substitutedCount > 0 ? (
            <Badge variant="teal" className="gap-1">
              <RefreshCw className="size-3" />
              {substitutedCount} Substituted Slot
            </Badge>
          ) : undefined
        }
        action={
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <span className="text-[12.5px] font-medium text-muted-foreground whitespace-nowrap">
              Active Slot Preview:
            </span>
            <Select
              value={activeSlotId ?? ""}
              onValueChange={(val) => setActiveSlotId(val)}
            >
              <SelectTrigger size="sm" className="w-full sm:w-52 bg-card">
                <SelectValue placeholder="Highlight active slot" />
              </SelectTrigger>
              <SelectContent align="end">
                {slots.map((slot) => (
                  <SelectItem key={slot.id} value={slot.id}>
                    {slot.day.slice(0, 3)} P{slot.period} · {slot.className}-
                    {slot.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Workload Summary KPI Strip */}
      <section
        aria-label="Workload Summary"
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label="Weekly Periods"
          value={totalPeriods}
          icon={<Calendar />}
          tone="brand"
          description="Across Mon – Sat"
        />
        <StatCard
          label="Teaching Hours / Week"
          value={`${totalHours} hrs`}
          icon={<Clock />}
          tone="primary"
          description="45 mins per period"
        />
        <StatCard
          label="Lab & Mentoring Slots"
          value={labPeriods + slots.filter((s) => s.subjectCode === "MENTOR").length}
          icon={<Layers />}
          tone="teal"
          description={`${labPeriods} Math Lab · 1 Mentorship`}
        />
        <StatCard
          label="Substitutions Assigned"
          value={substitutedCount}
          icon={<RefreshCw />}
          tone="warning"
          description="Highlighted in Teal"
        />
      </section>

      {/* Day View vs Weekly Matrix View */}
      <div className="grid gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <Tabs defaultValue="weekly" className="w-full">
            <div className="flex flex-col justify-between gap-3 pb-3 sm:flex-row sm:items-center">
              <TabsList>
                <TabsTrigger value="day">Day View</TabsTrigger>
                <TabsTrigger value="weekly">Weekly Matrix View</TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-primary" />
                  Active Slot
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-teal" />
                  Substitution
                </span>
              </div>
            </div>

            {/* Day View */}
            <TabsContent value="day" className="space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-1.5 sm:flex-wrap">
                {DAYS_OF_WEEK.map((day) => {
                  const count = slots.filter((s) => s.day === day).length
                  const active = selectedDay === day
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] font-bold transition-all",
                        active
                          ? "border-[#F5A000] bg-[#F5A000] text-[#123B5A] shadow-xs"
                          : "border-[#E5E9EF] bg-white text-[#202936] hover:bg-[#EEF1F5]"
                      )}
                    >
                      <span>{day}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px]",
                          active
                            ? "bg-[#123B5A]/20 text-[#123B5A] font-bold"
                            : "bg-[#EEF1F5] text-[#788391]"
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {daySlots.length === 0 ? (
                <EmptyState
                  compact
                  title={`No periods on ${selectedDay}`}
                  description="You have no scheduled teaching periods for this day."
                />
              ) : (
                <div className="space-y-3">
                  {daySlots.map((slot) => {
                    const isActiveSlot = slot.id === activeSlotId
                    return (
                      <Card
                        key={slot.id}
                        className={cn(
                          "py-4 rounded-2xl border-[#E5E9EF] bg-white shadow-xs transition-all",
                          isActiveSlot &&
                            "border-[#F5A000] ring-2 ring-[#F5A000]/25",
                          slot.isSubstituted &&
                            !isActiveSlot &&
                            "border-amber-200 bg-amber-50/40"
                        )}
                      >
                        <CardContent className="flex flex-col justify-between gap-3 px-5 sm:flex-row sm:items-center">
                          <div className="flex items-start gap-4">
                            <div
                              className={cn(
                                "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border text-center font-bold",
                                isActiveSlot
                                  ? "border-[#F5A000] bg-[#F5A000] text-[#123B5A]"
                                  : "border-[#E5E9EF] bg-[#EEF1F5] text-[#202936]"
                              )}
                            >
                              <span className="text-[10px] font-bold uppercase">
                                Period
                              </span>
                              <span className="text-[15px] leading-none font-extrabold">
                                {slot.period}
                              </span>
                            </div>

                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[15px] font-bold text-[#202936]">
                                  {slot.subject}
                                </span>
                                <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936]">
                                  {slot.className} - {slot.section}
                                </Badge>
                                {isActiveSlot && (
                                  <Badge className="gap-1 rounded-full bg-[#F5A000] text-[#123B5A] font-bold">
                                    <Sparkles className="size-3" />
                                    Active Slot
                                  </Badge>
                                )}
                                {slot.isSubstituted && (
                                  <Badge className="rounded-full border-amber-200 bg-amber-100 text-amber-800 font-bold">Substituted</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#788391]">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="size-3.5" />
                                  {slot.startTime} – {slot.endTime}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="size-3.5" />
                                  Room {slot.room}
                                </span>
                                {slot.subjectCode && (
                                  <span className="font-mono text-xs text-[#788391]">
                                    {slot.subjectCode}
                                  </span>
                                )}
                              </div>
                              {slot.substitutedFor && (
                                <p className="text-[12.5px] font-bold text-[#123B5A]">
                                  Covering for {slot.substitutedFor}
                                  {slot.notes ? ` · ${slot.notes}` : ""}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            {/* Weekly Matrix View */}
            <TabsContent value="weekly">
              <Card className="overflow-hidden py-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[850px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28 bg-[#EEF1F5] font-bold text-[#202936] sticky left-0 z-10">
                          Period
                        </TableHead>
                        {DAYS_OF_WEEK.map((day) => (
                          <TableHead
                            key={day}
                            className="min-w-36 font-semibold text-foreground"
                          >
                            {day}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[1, 2, 3, 4, 5, 6, 7].map((period) => (
                        <TableRow key={period} className="hover:bg-transparent">
                          <TableCell className="bg-[#EEF1F5]/80 sticky left-0 z-10 backdrop-blur-xs align-top">
                            <p className="text-[13px] font-semibold text-foreground">
                              Period {period}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground">
                              {PERIOD_TIMES[period]}
                            </p>
                          </TableCell>
                          {DAYS_OF_WEEK.map((day) => {
                            const slot = slotLookup.get(`${day}-${period}`)
                            if (!slot) {
                              return (
                                <TableCell
                                  key={day}
                                  className="align-top text-center text-xs text-muted-foreground/60"
                                >
                                  —
                                </TableCell>
                              )
                            }
                            const isActiveSlot = slot.id === activeSlotId
                            return (
                              <TableCell key={day} className="p-2 align-top">
                                <button
                                  type="button"
                                  onClick={() => setActiveSlotId(slot.id)}
                                  className={cn(
                                    "flex w-full flex-col gap-1 rounded-xl border p-2.5 text-left transition-all",
                                    isActiveSlot
                                      ? "border-[#F5A000] bg-amber-50/50 ring-2 ring-[#F5A000]/30 shadow-xs"
                                      : slot.isSubstituted
                                        ? "border-amber-200 bg-amber-50/40 text-amber-900"
                                        : "border-[#E5E9EF] bg-white hover:border-[#123B5A]/40"
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-[12.5px] font-bold text-[#202936]">
                                      {slot.className}-{slot.section}
                                    </span>
                                    {slot.isSubstituted && (
                                      <Badge
                                        className="rounded-full border-amber-200 bg-amber-100 text-amber-800 px-1.5 py-0 text-[10px] font-bold"
                                      >
                                        Sub
                                      </Badge>
                                    )}
                                    {isActiveSlot && !slot.isSubstituted && (
                                      <Badge className="rounded-full bg-[#F5A000] px-1.5 py-0 text-[10px] text-[#123B5A] font-bold">
                                        Active
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="truncate text-[12px] font-medium text-[#788391]">
                                    {slot.subject}
                                  </p>
                                  <p className="text-[11px] text-[#788391]">
                                    Room {slot.room}
                                  </p>
                                </button>
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Workload Summary Breakdown Card */}
        <Card className="h-fit rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
          <CardHeader className="border-b border-[#E5E9EF] pb-4">
            <CardTitle className="text-[#202936]">Workload Summary</CardTitle>
            <CardDescription className="text-[#788391]">
              Weekly allocation across classes & subjects.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {allocations.map((alloc) => {
              const sectionSlotCount = slots.filter(
                (s) => s.sectionId === alloc.sectionId
              ).length
              return (
                <div
                  key={alloc.id}
                  className="space-y-1.5 rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/30 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-foreground">
                      {alloc.className} - {alloc.section}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {alloc.subjectCode}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {alloc.subjectName}
                  </p>
                  <div className="flex items-center justify-between pt-1 text-[12px]">
                    <span className="text-muted-foreground">
                      Assigned: {alloc.weeklyHours} hrs/wk
                    </span>
                    <span className="font-semibold text-brand">
                      {sectionSlotCount} slots mapped
                    </span>
                  </div>
                </div>
              )
            })}

            <div className="rounded-xl bg-brand/5 p-3.5 text-[13px]">
              <p className="font-semibold text-brand">Weekly Total</p>
              <p className="mt-0.5 text-muted-foreground">
                {totalPeriods} periods ({totalHours} teaching hours) including{" "}
                {substitutedCount} substitution coverage.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

