"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DoorOpen,
  FileSpreadsheet,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  getExamDuties,
  getExamSchedule,
  saveExamHallLog,
} from "@/lib/services/teacher.service"
import type { ExamDuty, ExamScheduleItem } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const hallLogSchema = z
  .object({
    registeredCount: z
      .number({ error: "Enter registered student count." })
      .int("Must be a whole number.")
      .min(1, "At least 1 student must be registered.")
      .max(200, "Count cannot exceed 200 per hall."),
    presentCount: z
      .number({ error: "Enter present student count." })
      .int("Must be a whole number.")
      .min(0, "Cannot be negative."),
    absentRollNosText: z.string(),
    malpracticeCount: z
      .number({ error: "Enter malpractice count." })
      .int("Must be a whole number.")
      .min(0, "Cannot be negative.")
      .max(50, "Verify incident count."),
    malpracticeNotes: z.string().max(500, "Max 500 characters."),
  })
  .refine((data) => data.presentCount <= data.registeredCount, {
    message: "Present count cannot exceed registered students.",
    path: ["presentCount"],
  })
  .refine(
    (data) =>
      data.malpracticeCount === 0 || data.malpracticeNotes.trim().length >= 5,
    {
      message:
        "Provide incident details (student roll no & brief note) when malpractice > 0.",
      path: ["malpracticeNotes"],
    }
  )

type HallLogFormValues = z.infer<typeof hallLogSchema>

function mapDutyStatus(status: ExamDuty["status"]) {
  if (status === "completed") return "Approved" as const
  if (status === "excused") return "On-Duty" as const
  return "Pending" as const
}

export default function TeacherExamsPage() {
  const { slug } = useTeacherRole()
  const [duties, setDuties] = React.useState<ExamDuty[]>([])
  const [schedule, setSchedule] = React.useState<ExamScheduleItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [examFilter, setExamFilter] = React.useState<string>("all")

  const [activeDuty, setActiveDuty] = React.useState<ExamDuty | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [savingLog, setSavingLog] = React.useState(false)

  const form = useForm<HallLogFormValues>({
    resolver: zodResolver(hallLogSchema),
    defaultValues: {
      registeredCount: 30,
      presentCount: 30,
      absentRollNosText: "",
      malpracticeCount: 0,
      malpracticeNotes: "",
    },
  })

  const malpracticeCountVal = useWatch({
    control: form.control,
    name: "malpracticeCount",
  })
  const registeredVal = useWatch({
    control: form.control,
    name: "registeredCount",
  })
  const presentVal = useWatch({
    control: form.control,
    name: "presentCount",
  })

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([getExamDuties(), getExamSchedule()])
      .then(([dutiesRes, scheduleRes]) => {
        setDuties(dutiesRes)
        setSchedule(scheduleRes)
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load exam duties."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([getExamDuties(), getExamSchedule()])
      .then(([dutiesRes, scheduleRes]) => {
        if (!active) return
        setDuties(dutiesRes)
        setSchedule(scheduleRes)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load exam duties."
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

  const openHallLogDrawer = (duty: ExamDuty) => {
    setActiveDuty(duty)
    const existing = duty.hallAttendance
    form.reset({
      registeredCount: existing?.registeredCount ?? 32,
      presentCount: existing?.presentCount ?? 32,
      absentRollNosText: existing?.absentRollNos.join(", ") ?? "",
      malpracticeCount: existing?.malpracticeCount ?? 0,
      malpracticeNotes: existing?.malpracticeNotes ?? "",
    })
    setDrawerOpen(true)
  }

  const handleSaveHallLog = form.handleSubmit(async (values) => {
    if (!activeDuty) return
    setSavingLog(true)
    try {
      const absentRolls = values.absentRollNosText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      const updated = await saveExamHallLog(activeDuty.id, {
        registeredCount: values.registeredCount,
        presentCount: values.presentCount,
        absentRollNos: absentRolls,
        malpracticeCount: values.malpracticeCount,
        malpracticeNotes: values.malpracticeNotes.trim() || undefined,
        submittedAt: new Date().toISOString(),
      })

      setDuties((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      setActiveDuty(updated)
      setDrawerOpen(false)
      toast.success(`Hall log saved for ${updated.roomNo} (${updated.examName}).`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to save exam hall log."
      )
    } finally {
      setSavingLog(false)
    }
  })

  if (loading) {
    return (
      <LoadingState
        title="Loading examination roster"
        description="Fetching invigilation duties and exam schedules..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load examination workspace"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const assignedCount = duties.filter((d) => d.status === "assigned").length
  const completedCount = duties.filter((d) => d.status === "completed").length
  const uniqueRooms = new Set(duties.map((d) => d.roomNo)).size
  const examNames = Array.from(new Set(schedule.map((s) => s.examName)))
  const filteredSchedule =
    examFilter === "all"
      ? schedule
      : schedule.filter((s) => s.examName === examFilter)

  const computedAbsent =
    typeof registeredVal === "number" &&
    typeof presentVal === "number" &&
    !Number.isNaN(registeredVal) &&
    !Number.isNaN(presentVal)
      ? Math.max(0, registeredVal - presentVal)
      : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examination Duties & Schedules"
        subtitle="View invigilation assignments, log exam hall attendance or malpractice reports, and track scheduled examinations."
        action={
          <Button asChild variant="outline">
            <Link href={`/campus/${slug}/teacher/results`}>
              <FileSpreadsheet className="size-4" />
              Open Final Results Entry
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Exam Duties"
          value={duties.length}
          icon={<ClipboardCheck />}
          variant="dark"
          tone="darkNavy"
          description="Current term roster"
        />
        <StatCard
          label="Pending Invigilation"
          value={assignedCount}
          icon={<Clock />}
          tone="warning"
          description="Awaiting hall attendance log"
        />
        <StatCard
          label="Logged & Completed"
          value={completedCount}
          icon={<CheckCircle2 />}
          tone="success"
          description="Submitted to Exam Cell"
        />
        <StatCard
          label="Assigned Rooms / Labs"
          value={uniqueRooms}
          icon={<DoorOpen />}
          tone="primary"
          description={`${schedule.length} scheduled papers`}
        />
      </div>

      <Tabs defaultValue="duties" className="space-y-4">
        <TabsList>
          <TabsTrigger value="duties">
            Invigilation & Exam Duties ({duties.length})
          </TabsTrigger>
          <TabsTrigger value="schedule">
            Exam Schedule ({schedule.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="duties" className="space-y-4">
          {duties.length === 0 ? (
            <EmptyState
              title="No examination duties assigned"
              description="Invigilation and evaluation duties will appear here once published by the Exam Cell."
            />
          ) : (
            <Card className="bg-white rounded-2xl border-[#E5E9EF] shadow-xs">
              <CardHeader className="border-b border-[#E5E9EF] pb-4">
                <CardTitle className="text-lg font-bold text-[#202936]">
                  Assigned Exam & Invigilation Roster
                </CardTitle>
                <CardDescription className="text-[#788391]">
                  Submit exam hall attendance and report any malpractice incidents immediately after each shift.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam & Subject</TableHead>
                      <TableHead>Date & Shift</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Hall Log</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {duties.map((duty) => (
                      <TableRow key={duty.id}>
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {duty.examName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {duty.className
                              ? `${duty.className} • ${duty.subjectName ?? "General"}`
                              : duty.subjectName ?? "Exam Supervision"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-foreground">
                            {duty.examDate}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {duty.session} ({duty.startTime} – {duty.endTime})
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 font-medium text-foreground"
                          >
                            {duty.roomNo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-brand">
                            {duty.dutyRole}
                          </span>
                        </TableCell>
                        <TableCell>
                          {duty.hallAttendance ? (
                            <div className="space-y-0.5 text-xs">
                              <div className="font-medium text-success">
                                {duty.hallAttendance.presentCount}/
                                {duty.hallAttendance.registeredCount} Present
                              </div>
                              {duty.hallAttendance.malpracticeCount > 0 ? (
                                <div className="inline-flex items-center gap-1 font-medium text-error">
                                  <ShieldAlert className="size-3" />
                                  {duty.hallAttendance.malpracticeCount} incident(s)
                                </div>
                              ) : (
                                <div className="text-muted-foreground">
                                  Zero incidents
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Not submitted yet
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={mapDutyStatus(duty.status)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={
                              duty.status === "completed" ? "outline" : "default"
                            }
                            onClick={() => openHallLogDrawer(duty)}
                          >
                            {duty.hallAttendance
                              ? "Update Hall Log"
                              : "Log Hall Attendance"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card className="bg-white rounded-2xl border-[#E5E9EF] shadow-xs">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5E9EF] pb-4">
              <div>
                <CardTitle className="text-lg font-bold text-[#202936]">
                  Official Examination Timetable
                </CardTitle>
                <CardDescription className="text-[#788391]">
                  Scheduled papers, rooms, and assessment weightage across your classes.
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Select value={examFilter} onValueChange={setExamFilter}>
                  <SelectTrigger aria-label="Filter by exam cycle">
                    <SelectValue placeholder="All Examination Cycles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Examination Cycles</SelectItem>
                    {examNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Examination</TableHead>
                    <TableHead>Class & Section</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead className="text-right">Marks (Max / Pass)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedule.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Calendar className="size-3.5 text-muted-foreground" />
                          {item.examDate}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.startTime} – {item.endTime}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {item.examName}
                      </TableCell>
                      <TableCell>
                        {item.className} - {item.section}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {item.subjectName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Code: {item.subjectCode}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.roomNo}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        {item.maxMarks} / {item.passingMarks}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Exam Hall Attendance & Malpractice Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Exam Hall Attendance & Incident Log</SheetTitle>
            <SheetDescription>
              {activeDuty
                ? `${activeDuty.examName} • ${activeDuty.roomNo} (${activeDuty.examDate}, ${activeDuty.session})`
                : "Record candidate attendance and examination compliance."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSaveHallLog} className="mt-6 space-y-5 px-4 pb-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">
                Duty Role: {activeDuty?.dutyRole}
              </div>
              <div className="mt-0.5">
                {activeDuty?.className ?? "All Assigned Candidates"} •{" "}
                {activeDuty?.startTime} – {activeDuty?.endTime}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="registeredCount">Registered Count</Label>
                <Input
                  id="registeredCount"
                  type="number"
                  min={1}
                  max={200}
                  {...form.register("registeredCount", {
                    valueAsNumber: true,
                  })}
                />
                {form.formState.errors.registeredCount && (
                  <p className="text-xs font-medium text-error">
                    {form.formState.errors.registeredCount.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="presentCount">Present Count</Label>
                <Input
                  id="presentCount"
                  type="number"
                  min={0}
                  max={200}
                  {...form.register("presentCount", { valueAsNumber: true })}
                />
                {form.formState.errors.presentCount && (
                  <p className="text-xs font-medium text-error">
                    {form.formState.errors.presentCount.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Calculated Absentees</span>
              <span className="font-semibold text-foreground">
                {computedAbsent} student(s)
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="absentRollNosText">
                Absentee Roll Numbers (comma-separated)
              </Label>
              <Input
                id="absentRollNosText"
                placeholder="e.g. 10A-07, 10A-11"
                {...form.register("absentRollNosText")}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank if all registered candidates are present.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="malpracticeCount">
                Malpractice / Unfair Means Incidents
              </Label>
              <Input
                id="malpracticeCount"
                type="number"
                min={0}
                max={50}
                {...form.register("malpracticeCount", { valueAsNumber: true })}
              />
              {form.formState.errors.malpracticeCount && (
                <p className="text-xs font-medium text-error">
                  {form.formState.errors.malpracticeCount.message}
                </p>
              )}
            </div>

            {typeof malpracticeCountVal === "number" && malpracticeCountVal > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Malpractice incidents are escalated immediately to the Chief
                  Superintendent and Examination Cell. Please specify exact roll
                  numbers and confiscated material details below.
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="malpracticeNotes">
                Hall Supervisor / Incident Remarks
              </Label>
              <Textarea
                id="malpracticeNotes"
                rows={4}
                placeholder="Describe seat verification, late arrivals, or unfair means incident details..."
                {...form.register("malpracticeNotes")}
              />
              {form.formState.errors.malpracticeNotes && (
                <p className="text-xs font-medium text-error">
                  {form.formState.errors.malpracticeNotes.message}
                </p>
              )}
            </div>

            <SheetFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDrawerOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingLog}>
                {savingLog ? "Saving Log..." : "Submit Exam Hall Log"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
