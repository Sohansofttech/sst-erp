"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Lock,
  MessageSquarePlus,
  Minus,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  createMentoringSession,
  escalateMenteeConcern,
  getMentees,
  getMentoringSessions,
  saveConfidentialMentorNote,
} from "@/lib/services/teacher.service"
import type { Mentee, MentoringSession } from "@/types/teacher"

const meetingSchema = z.object({
  sessionDate: z.string().min(1, "Select meeting date."),
  mode: z.enum(["in_person", "parent_call", "online"]),
  topic: z
    .string()
    .trim()
    .min(3, "Agenda / topic must be at least 3 characters."),
  observations: z
    .string()
    .trim()
    .min(10, "Enter goals & observations (min 10 chars)."),
  actionItemsText: z
    .string()
    .trim()
    .min(3, "Enter at least one action item."),
  followUpDate: z.string().optional(),
})

type MeetingFormValues = z.infer<typeof meetingSchema>

const escalationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Describe the academic or attendance concern (min 10 chars).")
    .max(400, "Keep summary under 400 characters."),
})

type EscalationFormValues = z.infer<typeof escalationSchema>

function RiskPill({ level }: { level: Mentee["riskLevel"] }) {
  if (level === "at_risk") {
    return (
      <Badge
        variant="outline"
        className="border-rose-200 bg-rose-50 text-rose-700 font-semibold"
      >
        At Risk
      </Badge>
    )
  }
  if (level === "watch") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-700 font-semibold"
      >
        Needs Watch
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold"
    >
      On Track
    </Badge>
  )
}

function TrendBadge({ trend }: { trend?: Mentee["iaTrend"] }) {
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
        <TrendingUp className="size-3.5" />
        Improving
      </span>
    )
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
        <TrendingDown className="size-3.5" />
        Declining
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#788391]">
      <Minus className="size-3.5" />
      Steady
    </span>
  )
}

export default function TeacherMentoringPage() {
  const [mentees, setMentees] = React.useState<Mentee[]>([])
  const [sessions, setSessions] = React.useState<MentoringSession[]>([])
  const [selectedId, setSelectedId] = React.useState<string>("")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [riskFilter, setRiskFilter] = React.useState<string>("all")
  const [confidentialDraft, setConfidentialDraft] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const [meetingDialogOpen, setMeetingDialogOpen] = React.useState(false)
  const [savingMeeting, setSavingMeeting] = React.useState(false)
  const [escalateDialogOpen, setEscalateDialogOpen] = React.useState(false)
  const [savingEscalation, setSavingEscalation] = React.useState(false)

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const meetingForm = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      sessionDate: "2026-11-12",
      mode: "in_person",
      topic: "",
      observations: "",
      actionItemsText: "",
      followUpDate: "",
    },
  })

  const escalationForm = useForm<EscalationFormValues>({
    resolver: zodResolver(escalationSchema),
    defaultValues: {
      reason: "",
    },
  })

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([getMentees(), getMentoringSessions()])
      .then(([mRes, sRes]) => {
        setMentees(mRes)
        setSessions(sRes)
        if (mRes[0]) {
          setSelectedId(mRes[0].id)
          setConfidentialDraft(mRes[0].confidentialNotes ?? "")
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load mentoring data."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([getMentees(), getMentoringSessions()])
      .then(([mRes, sRes]) => {
        if (!active) return
        setMentees(mRes)
        setSessions(sRes)
        if (mRes[0]) {
          setSelectedId(mRes[0].id)
          setConfidentialDraft(mRes[0].confidentialNotes ?? "")
        }
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : "Failed to load mentoring data."
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

  const selectMentee = (mentee: Mentee) => {
    setSelectedId(mentee.id)
    setConfidentialDraft(mentee.confidentialNotes ?? "")
  }

  const activeMentee = mentees.find((m) => m.id === selectedId) ?? null
  const activeSessions = sessions.filter((s) => s.menteeId === selectedId)

  const handleSaveConfidentialNote = async () => {
    if (!activeMentee) return
    setSavingNote(true)
    try {
      const updated = await saveConfidentialMentorNote(
        activeMentee.id,
        confidentialDraft.trim()
      )
      setMentees((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      toast.success("Confidential mentor note saved securely.")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to save mentor note."
      )
    } finally {
      setSavingNote(false)
    }
  }

  const handleLogMeeting = meetingForm.handleSubmit(async (values) => {
    if (!activeMentee) return
    setSavingMeeting(true)
    try {
      const items = values.actionItemsText
        .split(/\n|;/)
        .map((s) => s.trim())
        .filter(Boolean)

      const created = await createMentoringSession({
        menteeId: activeMentee.id,
        sessionDate: values.sessionDate,
        mode: values.mode,
        topic: values.topic,
        observations: values.observations,
        actionItems: items.length > 0 ? items : [values.actionItemsText],
        followUpDate: values.followUpDate || undefined,
        status: "completed",
      })
      setSessions((prev) => [created, ...prev])
      setMentees((prev) =>
        prev.map((m) =>
          m.id === activeMentee.id
            ? { ...m, lastSessionDate: values.sessionDate }
            : m
        )
      )
      setMeetingDialogOpen(false)
      meetingForm.reset({
        sessionDate: "2026-11-12",
        mode: "in_person",
        topic: "",
        observations: "",
        actionItemsText: "",
        followUpDate: "",
      })
      toast.success(`Mentoring meeting logged for ${activeMentee.fullName}.`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to log mentoring session."
      )
    } finally {
      setSavingMeeting(false)
    }
  })

  const handleEscalate = escalationForm.handleSubmit(async (values) => {
    if (!activeMentee) return
    setSavingEscalation(true)
    try {
      const updated = await escalateMenteeConcern(
        activeMentee.id,
        values.reason
      )
      setMentees((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      setEscalateDialogOpen(false)
      escalationForm.reset({ reason: "" })
      toast.success(
        `Concern escalated to Class Coordinator & Counselor for ${updated.fullName}.`
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to escalate concern."
      )
    } finally {
      setSavingEscalation(false)
    }
  })

  if (loading) {
    return (
      <LoadingState
        title="Loading mentoring workspace"
        description="Fetching assigned mentees and counseling logs..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load mentoring cohort"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const atRiskCount = mentees.filter((m) => m.riskLevel === "at_risk").length
  const watchCount = mentees.filter((m) => m.riskLevel === "watch").length
  const escalatedCount = mentees.filter((m) => m.escalated).length

  const filteredMentees = mentees.filter((m) => {
    const matchesSearch =
      m.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRisk = riskFilter === "all" || m.riskLevel === riskFilter
    return matchesSearch && matchesRisk
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Mentoring Workspace"
        subtitle="Monitor mentee attendance and IA trajectories, log counseling meetings, maintain confidential notes, and escalate at-risk cases."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Assigned Mentees"
          value={mentees.length}
          icon={<Users />}
          variant="dark"
          tone="darkNavy"
          description="Cohort across Class 10-A"
        />
        <StatCard
          label="At-Risk Flags (Red)"
          value={atRiskCount}
          icon={<AlertTriangle />}
          tone="error"
          description="Attendance < 75% or IA < 60%"
        />
        <StatCard
          label="Needs Watch (Amber)"
          value={watchCount}
          icon={<CalendarClock />}
          tone="warning"
          description="Follow-up recommended"
        />
        <StatCard
          label="Active Escalations"
          value={escalatedCount}
          icon={<ShieldAlert />}
          tone="teal"
          description={`${sessions.length} logged sessions`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Cohort List */}
        <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs lg:col-span-5">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle className="text-lg font-bold text-[#202936]">
                Mentee Roster
              </CardTitle>
              <CardDescription className="text-sm text-[#788391]">
                Select a student to open their mentoring workspace.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-[#788391]" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search mentee..."
                  className="rounded-xl border-[#E5E9EF] bg-white pl-9 text-[#202936] focus-visible:ring-[#F5A000]"
                />
              </div>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="rounded-xl border-[#E5E9EF] bg-white sm:w-36 text-[#202936]" aria-label="Filter by risk">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[#E5E9EF]">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="watch">Needs Watch</SelectItem>
                  <SelectItem value="on_track">On Track</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredMentees.length === 0 ? (
              <EmptyState
                title="No matching mentees"
                description="Try clearing the search query or risk filter."
              />
            ) : (
              filteredMentees.map((mentee) => {
                const isSelected = mentee.id === selectedId
                return (
                  <button
                    key={mentee.id}
                    type="button"
                    onClick={() => selectMentee(mentee)}
                    className={cn(
                      "w-full rounded-xl border p-3.5 text-left transition-all",
                      isSelected
                        ? "border-[#F5A000] bg-amber-50/50 ring-1 ring-[#F5A000]/30 shadow-xs"
                        : "border-[#E5E9EF] bg-white hover:bg-[#EEF1F5]/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#202936]">
                          {mentee.fullName}
                        </div>
                        <div className="text-xs text-[#788391]">
                          {mentee.rollNo} • {mentee.className} -{" "}
                          {mentee.section}
                        </div>
                      </div>
                      <RiskPill level={mentee.riskLevel} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "font-semibold",
                            mentee.attendancePercent === null ||
                              mentee.attendancePercent === undefined
                              ? "text-[#788391]"
                              : mentee.attendancePercent < 75
                                ? "text-rose-600"
                                : mentee.attendancePercent < 85
                                  ? "text-amber-700"
                                  : "text-[#202936]"
                          )}
                        >
                          Att:{" "}
                          {mentee.attendancePercent !== null &&
                          mentee.attendancePercent !== undefined
                            ? `${mentee.attendancePercent}%`
                            : "N/A"}
                        </span>
                        <span
                          className={cn(
                            "font-semibold",
                            mentee.iaAverage < 60
                              ? "text-rose-600"
                              : mentee.iaAverage < 75
                                ? "text-amber-700"
                                : "text-[#202936]"
                          )}
                        >
                          IA Avg: {mentee.iaAverage}%
                        </span>
                      </div>
                      <TrendBadge trend={mentee.iaTrend} />
                    </div>

                    {mentee.escalated && (
                      <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                        <ShieldAlert className="size-3" />
                        Escalated to Coordinator
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Right Mentoring Workspace */}
        <div className="space-y-5 lg:col-span-7">
          {!activeMentee ? (
            <EmptyState
              title="Select a mentee"
              description="Choose a student from the left list to review sessions and notes."
            />
          ) : (
            <>
              <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl font-bold text-[#202936]">
                        {activeMentee.fullName}
                      </CardTitle>
                      <RiskPill level={activeMentee.riskLevel} />
                      {activeMentee.escalated && (
                        <Badge
                          variant="outline"
                          className="border-rose-200 bg-rose-50 text-rose-700 font-semibold"
                        >
                          Escalated
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1 text-xs text-[#788391]">
                      Roll No: {activeMentee.rollNo} • Admission:{" "}
                      {activeMentee.admissionNo} • Guardian:{" "}
                      {activeMentee.guardianContact.guardianName} (
                      {activeMentee.guardianContact.relation})
                    </CardDescription>
                  </div>

                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
                    <Button
                      size="sm"
                      onClick={() => setMeetingDialogOpen(true)}
                      className="w-full sm:w-auto rounded-xl bg-[#F5A000] text-white hover:bg-[#E09200]"
                    >
                      <MessageSquarePlus className="size-4" />
                      Log Mentoring Meeting
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => setEscalateDialogOpen(true)}
                    >
                      <ShieldAlert className="size-4" />
                      Escalate Concern
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/50 p-3">
                      <div className="text-xs font-semibold text-[#788391]">
                        Attendance Rate
                      </div>
                      <div
                        className={cn(
                          "mt-1 text-xl font-bold",
                          activeMentee.attendancePercent === null ||
                            activeMentee.attendancePercent === undefined
                            ? "text-[#788391]"
                            : activeMentee.attendancePercent < 75
                              ? "text-rose-600"
                              : activeMentee.attendancePercent < 85
                                ? "text-amber-700"
                                : "text-emerald-700"
                        )}
                      >
                        {activeMentee.attendancePercent !== null &&
                        activeMentee.attendancePercent !== undefined
                          ? `${activeMentee.attendancePercent}%`
                          : "N/A"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/50 p-3">
                      <div className="text-xs font-semibold text-[#788391]">
                        IA Average & Trend
                      </div>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl font-bold text-[#202936]">
                          {activeMentee.iaAverage}%
                        </span>
                        <TrendBadge trend={activeMentee.iaTrend} />
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/50 p-3">
                      <div className="text-xs font-semibold text-[#788391]">
                        Last Check-in
                      </div>
                      <div className="mt-1 text-lg font-bold text-[#202936]">
                        {activeMentee.lastSessionDate ?? "None"}
                      </div>
                    </div>
                  </div>

                  {activeMentee.escalated && activeMentee.escalationReason && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
                      <div>
                        <div className="font-bold">
                          Escalated Concern Note
                        </div>
                        <p className="mt-0.5">{activeMentee.escalationReason}</p>
                      </div>
                    </div>
                  )}

                  <Separator className="bg-[#E5E9EF]" />

                  {/* Confidential Notes Section */}
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label
                        htmlFor="confidential-note"
                        className="text-sm font-bold text-[#202936]"
                      >
                        Confidential Mentor Notes
                      </Label>
                      <Badge
                        variant="outline"
                        className="border-[#123B5A]/20 bg-[#123B5A]/10 text-[#123B5A] font-semibold"
                      >
                        <Lock className="mr-1 size-3" />
                        Confidential: Mentor & Authorized Roles Only
                      </Badge>
                    </div>
                    <Textarea
                      id="confidential-note"
                      rows={3}
                      value={confidentialDraft}
                      onChange={(e) => setConfidentialDraft(e.target.value)}
                      placeholder="Record private counseling context, learning support needs, or home study barriers (not visible to peers)..."
                      className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                    />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs text-[#788391]">
                        Strictly excluded from student report cards and public logs.
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingNote}
                        onClick={handleSaveConfidentialNote}
                        className="w-full sm:w-auto rounded-xl border-[#123B5A] text-[#123B5A] hover:bg-[#123B5A] hover:text-white"
                      >
                        {savingNote ? "Saving..." : "Save Confidential Note"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Session History */}
              <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-[#202936]">
                    Mentoring Meeting Logs ({activeSessions.length})
                  </CardTitle>
                  <CardDescription className="text-sm text-[#788391]">
                    Agendas, student goals, and agreed follow-up actions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeSessions.length === 0 ? (
                    <EmptyState
                      title="No meetings logged yet"
                      description="Use 'Log Mentoring Meeting' above to record your first session with this student."
                    />
                  ) : (
                    activeSessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-xl border border-[#E5E9EF] p-4 bg-white"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-[#202936]">
                            {session.topic}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize border-[#E5E9EF] bg-[#EEF1F5] text-[#202936]">
                              {session.mode.replace("_", " ")}
                            </Badge>
                            <StatusBadge
                              status={
                                session.status === "completed"
                                  ? "Approved"
                                  : session.status === "cancelled"
                                    ? "Rejected"
                                    : "Pending"
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-[#788391]">
                          Date: {session.sessionDate}
                          {session.followUpDate
                            ? ` • Next Follow-up: ${session.followUpDate}`
                            : ""}
                        </div>
                        <p className="mt-2.5 text-sm text-[#202936]">
                          {session.observations}
                        </p>
                        {session.actionItems.length > 0 && (
                          <div className="mt-3 space-y-1 rounded-xl bg-[#EEF1F5]/60 p-3 border border-[#E5E9EF]">
                            <div className="text-xs font-bold text-[#202936]">
                              Action Items
                            </div>
                            <ul className="space-y-1 text-xs text-[#788391]">
                              {session.actionItems.map((item, idx) => (
                                <li
                                  key={`${session.id}-ai-${idx}`}
                                  className="flex items-start gap-1.5"
                                >
                                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#F5A000]" />
                                  <span className="text-[#202936]">{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Log Mentoring Meeting Dialog */}
      <Dialog open={meetingDialogOpen} onOpenChange={setMeetingDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] rounded-2xl border-[#E5E9EF] bg-white shadow-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#202936]">Log Mentoring Meeting</DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              {activeMentee
                ? `Record session agenda, goals, and action plan for ${activeMentee.fullName} (${activeMentee.rollNo}).`
                : "Record mentoring meeting details."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogMeeting} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sessionDate" className="text-xs font-semibold text-[#202936]">Meeting Date</Label>
                <Input
                  id="sessionDate"
                  type="date"
                  className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                  {...meetingForm.register("sessionDate")}
                />
                {meetingForm.formState.errors.sessionDate && (
                  <p className="text-xs text-rose-600">
                    {meetingForm.formState.errors.sessionDate.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mode" className="text-xs font-semibold text-[#202936]">Session Mode</Label>
                <Select
                  defaultValue="in_person"
                  onValueChange={(val) =>
                    meetingForm.setValue(
                      "mode",
                      val as MeetingFormValues["mode"]
                    )
                  }
                >
                  <SelectTrigger id="mode" className="rounded-xl border-[#E5E9EF] bg-white text-[#202936]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[#E5E9EF]">
                    <SelectItem value="in_person">In-Person</SelectItem>
                    <SelectItem value="parent_call">Parent Call</SelectItem>
                    <SelectItem value="online">Online Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="topic" className="text-xs font-semibold text-[#202936]">Agenda / Discussion Topic</Label>
              <Input
                id="topic"
                placeholder="e.g. Term 1 Recovery Plan & Study Schedule"
                className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                {...meetingForm.register("topic")}
              />
              {meetingForm.formState.errors.topic && (
                <p className="text-xs text-rose-600">
                  {meetingForm.formState.errors.topic.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observations" className="text-xs font-semibold text-[#202936]">Goals & Observations</Label>
              <Textarea
                id="observations"
                rows={3}
                placeholder="Summarize academic goals set and student feedback..."
                className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                {...meetingForm.register("observations")}
              />
              {meetingForm.formState.errors.observations && (
                <p className="text-xs text-rose-600">
                  {meetingForm.formState.errors.observations.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="actionItemsText" className="text-xs font-semibold text-[#202936]">
                Action Items (one per line or semicolon-separated)
              </Label>
              <Textarea
                id="actionItemsText"
                rows={2}
                placeholder="Complete Chapter 4 worksheet&#10;Attend Tuesday remedial session"
                className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                {...meetingForm.register("actionItemsText")}
              />
              {meetingForm.formState.errors.actionItemsText && (
                <p className="text-xs text-rose-600">
                  {meetingForm.formState.errors.actionItemsText.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="followUpDate" className="text-xs font-semibold text-[#202936]">Next Follow-Up Date (optional)</Label>
              <Input
                id="followUpDate"
                type="date"
                className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                {...meetingForm.register("followUpDate")}
              />
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                onClick={() => setMeetingDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingMeeting} className="w-full sm:w-auto rounded-xl bg-[#F5A000] text-white hover:bg-[#E09200]">
                {savingMeeting ? "Saving..." : "Save Meeting Log"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Escalate Concern Dialog */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] rounded-2xl border-[#E5E9EF] bg-white shadow-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-rose-600">
              Escalate Mentee Concern
            </DialogTitle>
            <DialogDescription className="text-xs text-[#788391]">
              Notify the Academic Coordinator and Student Counselor for{" "}
              {activeMentee?.fullName}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEscalate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="escalation-reason" className="text-xs font-semibold text-[#202936]">
                Reason for Escalation & Recommended Support
              </Label>
              <Textarea
                id="escalation-reason"
                rows={4}
                placeholder="Outline attendance drop, consecutive IA failures, or intervention needed..."
                className="rounded-xl border-[#E5E9EF] bg-white text-[#202936] focus-visible:ring-[#F5A000]"
                {...escalationForm.register("reason")}
              />
              {escalationForm.formState.errors.reason && (
                <p className="text-xs text-rose-600">
                  {escalationForm.formState.errors.reason.message}
                </p>
              )}
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                onClick={() => setEscalateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="w-full sm:w-auto rounded-xl bg-rose-600 text-white hover:bg-rose-700"
                disabled={savingEscalation}
              >
                {savingEscalation ? "Escalating..." : "Confirm Escalation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
