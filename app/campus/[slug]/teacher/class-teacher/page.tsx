"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  AlertTriangle,
  Award,
  BellRing,
  CheckCircle2,
  FileBarChart2,
  Megaphone,
  Search,
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
  createAnnouncement,
  getClassAllocations,
  getSectionStudents,
} from "@/lib/services/teacher.service"
import type { ClassAllocation, StudentRosterItem } from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const parentNoticeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Subject line must be at least 5 characters."),
  priority: z.enum(["normal", "important", "urgent"]),
  content: z
    .string()
    .trim()
    .min(15, "Notice message must be at least 15 characters."),
})

type ParentNoticeValues = z.infer<typeof parentNoticeSchema>

type RecommendationType =
  | "Good Standing"
  | "Attendance Watch"
  | "Remedial Support"
  | "Parent Conference"
  | "Merit Commendation"

function defaultRecommendation(s: StudentRosterItem): RecommendationType {
  if (s.attendancePercent < 75 || s.iaAverage < 60) {
    return "Parent Conference"
  }
  if (s.attendancePercent < 82 || s.iaAverage < 70) {
    return "Remedial Support"
  }
  if (s.attendancePercent >= 95 && s.iaAverage >= 90) {
    return "Merit Commendation"
  }
  return "Good Standing"
}

export default function ClassTeacherToolsPage() {
  const { role, setRole } = useTeacherRole()
  const [classAlloc, setClassAlloc] = React.useState<ClassAllocation | null>(
    null
  )
  const [students, setStudents] = React.useState<StudentRosterItem[]>([])
  const [recommendations, setRecommendations] = React.useState<
    Record<string, RecommendationType>
  >({})
  const [searchQuery, setSearchQuery] = React.useState("")
  const [noticeOpen, setNoticeOpen] = React.useState(false)
  const [sendingNotice, setSendingNotice] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const noticeForm = useForm<ParentNoticeValues>({
    resolver: zodResolver(parentNoticeSchema),
    defaultValues: {
      title: "",
      priority: "important",
      content: "",
    },
  })

  const hydrate = React.useCallback(
    (allocs: ClassAllocation[], roster: StudentRosterItem[]) => {
      const assigned =
        allocs.find((c) => c.role === "class_teacher") ?? allocs[0] ?? null
      setClassAlloc(assigned)
      setStudents(roster)
      const initialRecs: Record<string, RecommendationType> = {}
      for (const s of roster) {
        initialRecs[s.studentId] = defaultRecommendation(s)
      }
      setRecommendations(initialRecs)
    },
    []
  )

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([getClassAllocations(), getSectionStudents("sec-10a")])
      .then(([allocs, roster]) => {
        hydrate(allocs, roster)
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load Class Teacher tools."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [hydrate])

  React.useEffect(() => {
    let active = true
    Promise.all([getClassAllocations(), getSectionStudents("sec-10a")])
      .then(([allocs, roster]) => {
        if (!active) return
        hydrate(allocs, roster)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load Class Teacher tools."
        )
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [hydrate])

  const openNoticeForStudent = (student?: StudentRosterItem) => {
    if (student) {
      noticeForm.reset({
        title: `Attendance & Academic Advisory — ${student.fullName} (${student.rollNo})`,
        priority: student.attendancePercent < 75 ? "urgent" : "important",
        content: `Dear Parent/Guardian of ${student.fullName} (Roll ${student.rollNo}, Class 10 - A),\n\nCurrent attendance stands at ${student.attendancePercent}% (minimum required: 75%) with an Internal Assessment average of ${student.iaAverage}%. Kindly meet the Class Teacher during PTI hours to review the catch-up plan.`,
      })
    } else {
      noticeForm.reset({
        title: "Class 10 - A Monthly Attendance & Term Progress Update",
        priority: "important",
        content:
          "Dear Parents of Class 10 - A, please review your ward's Term 1 attendance percentage and upcoming Pre-Board schedule on the parent portal.",
      })
    }
    setNoticeOpen(true)
  }

  const handleSendNotice = noticeForm.handleSubmit(async (values) => {
    setSendingNotice(true)
    try {
      await createAnnouncement({
        title: values.title,
        content: values.content,
        audience: "Class & Parents",
        targetClasses: ["Class 10 - A"],
        priority: values.priority,
        isPinned: false,
      })
      setNoticeOpen(false)
      toast.success(
        "Parent notice queued via Official Parent Portal (contact numbers protected)."
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send parent notice."
      )
    } finally {
      setSendingNotice(false)
    }
  })

  if (loading) {
    return (
      <LoadingState
        title="Loading Class Teacher workspace"
        description="Fetching Class 10 - A attendance standing and section summary..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load Class Teacher tools"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const defaulters = students.filter((s) => s.attendancePercent < 75)
  const borderline = students.filter(
    (s) => s.attendancePercent >= 75 && s.attendancePercent < 82
  )
  const avgAttendance =
    students.length > 0
      ? Math.round(
          (students.reduce((sum, s) => sum + s.attendancePercent, 0) /
            students.length) *
            10
        ) / 10
      : 0
  const avgIA =
    students.length > 0
      ? Math.round(
          (students.reduce((sum, s) => sum + s.iaAverage, 0) /
            students.length) *
            10
        ) / 10
      : 0
  const honorStudents = students.filter(
    (s) => s.attendancePercent >= 95 && s.iaAverage >= 85
  ).length

  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Class Teacher Tools — ${classAlloc ? `${classAlloc.className} (${classAlloc.section})` : "Class 10 - A"}`}
        subtitle="Scoped strictly to your assigned homeroom section: attendance shortage defaulters, section summary analytics, status recommendations, and parent notices."
        action={
          <Button onClick={() => openNoticeForStudent()}>
            <Megaphone className="size-4" />
            Quick Parent Notice
          </Button>
        }
      />

      {role !== "class_teacher" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-primary">
          <span>
            Scoped strictly to your Class Teacher section:{" "}
            <strong>Class 10 - A</strong>. Switch the demo role toggle to{" "}
            <strong>Class Teacher</strong> to preview homeroom permissions.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRole("class_teacher")}
          >
            Switch to Class Teacher Role
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Section Strength"
          value={students.length}
          icon={<Users />}
          tone="brand"
          description="Class 10 - A enrolled"
        />
        <StatCard
          label="Section Avg Attendance"
          value={`${avgAttendance}%`}
          icon={<CheckCircle2 />}
          tone="success"
          description="Threshold: 75% mandatory"
        />
        <StatCard
          label="Attendance Defaulters"
          value={defaulters.length}
          icon={<AlertTriangle />}
          tone="error"
          description={`${borderline.length} borderline (75–81%)`}
        />
        <StatCard
          label="Section IA Mean"
          value={`${avgIA}%`}
          icon={<Award />}
          tone="teal"
          description={`${honorStudents} high-merit scholars`}
        />
      </div>

      <Tabs defaultValue="defaulters" className="space-y-4">
        <TabsList>
          <TabsTrigger value="defaulters">
            Section Defaulter List ({defaulters.length + borderline.length})
          </TabsTrigger>
          <TabsTrigger value="summary">
            Section Summary & Status Recommendations ({students.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="defaulters" className="space-y-4">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">
                Attendance Shortage & Borderline Watch (Class 10 - A)
              </CardTitle>
              <CardDescription>
                Students below 75% require immediate parent intimation for examination eligibility compliance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {defaulters.length + borderline.length === 0 ? (
                <EmptyState
                  title="Zero attendance defaulters"
                  description="All students in Class 10 - A are currently above 82% attendance."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Roll No</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Attendance %</TableHead>
                      <TableHead>IA Average</TableHead>
                      <TableHead>Guardian</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...defaulters, ...borderline].map((student) => {
                      const critical = student.attendancePercent < 75
                      return (
                        <TableRow key={student.studentId}>
                          <TableCell className="font-medium text-foreground">
                            {student.rollNo}
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {student.fullName}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "font-semibold",
                                critical ? "text-error" : "text-amber-700"
                              )}
                            >
                              {student.attendancePercent}%
                            </span>
                          </TableCell>
                          <TableCell>{student.iaAverage}%</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {student.guardianContact.guardianName} (
                            {student.guardianContact.relation})
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={critical ? "Rejected" : "Pending"}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={critical ? "default" : "outline"}
                              onClick={() => openNoticeForStudent(student)}
                            >
                              <BellRing className="size-3.5" />
                              Send Parent Notice
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <FileBarChart2 className="size-4 text-brand" />
                  Attendance Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">90% and above</span>
                  <span className="font-semibold text-success">
                    {students.filter((s) => s.attendancePercent >= 90).length}{" "}
                    students
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">75% – 89%</span>
                  <span className="font-semibold text-foreground">
                    {
                      students.filter(
                        (s) =>
                          s.attendancePercent >= 75 && s.attendancePercent < 90
                      ).length
                    }{" "}
                    students
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Below 75% (Shortage)
                  </span>
                  <span className="font-semibold text-error">
                    {defaulters.length} student(s)
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Award className="size-4 text-teal" />
                  IA Score Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Distinction (≥ 85%)
                  </span>
                  <span className="font-semibold text-success">
                    {students.filter((s) => s.iaAverage >= 85).length} students
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Proficient (65% – 84%)
                  </span>
                  <span className="font-semibold text-foreground">
                    {
                      students.filter(
                        (s) => s.iaAverage >= 65 && s.iaAverage < 85
                      ).length
                    }{" "}
                    students
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Needs Remedial (&lt; 65%)
                  </span>
                  <span className="font-semibold text-amber-700">
                    {students.filter((s) => s.iaAverage < 65).length} student(s)
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  Section Homeroom Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Class 10 - A term summary will freeze on{" "}
                  <strong className="text-foreground">25 Nov 2026</strong> prior
                  to Pre-Board hall ticket generation.
                </p>
                <p>
                  Use recommendations below to flag students for Remedial
                  Support or Parent–Teacher Interaction (PTI).
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Student Status Recommendations
                </CardTitle>
                <CardDescription>
                  Assign official homeroom recommendations for Class 10 - A term review.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search roll no or name..."
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roll No</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead>IA Avg</TableHead>
                    <TableHead>Recommendation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => {
                    const rec =
                      recommendations[student.studentId] ?? "Good Standing"
                    return (
                      <TableRow key={student.studentId}>
                        <TableCell className="font-medium text-foreground">
                          {student.rollNo}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {student.fullName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              student.attendancePercent < 75
                                ? "border-error/30 bg-error/10 text-error"
                                : student.attendancePercent < 82
                                  ? "border-warning/35 bg-warning/12 text-amber-700"
                                  : "border-success/25 bg-success/10 text-success"
                            )}
                          >
                            {student.attendancePercent}%
                          </Badge>
                        </TableCell>
                        <TableCell>{student.iaAverage}%</TableCell>
                        <TableCell className="w-60">
                          <Select
                            value={rec}
                            onValueChange={(val) => {
                              setRecommendations((prev) => ({
                                ...prev,
                                [student.studentId]: val as RecommendationType,
                              }))
                              toast.success(
                                `Updated recommendation for ${student.fullName}: ${val}`
                              )
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Good Standing">
                                Good Standing
                              </SelectItem>
                              <SelectItem value="Merit Commendation">
                                Merit Commendation
                              </SelectItem>
                              <SelectItem value="Attendance Watch">
                                Attendance Watch
                              </SelectItem>
                              <SelectItem value="Remedial Support">
                                Remedial Support
                              </SelectItem>
                              <SelectItem value="Parent Conference">
                                Parent Conference
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Parent Notice Dialog */}
      <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Quick Parent Notice (Class 10 - A)</DialogTitle>
            <DialogDescription>
              Delivered via the Parent Portal & official campus digest without exposing personal phone numbers.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendNotice} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="notice-title">Notice Subject</Label>
              <Input
                id="notice-title"
                placeholder="e.g. Attendance Advisory / PTI Reminder"
                {...noticeForm.register("title")}
              />
              {noticeForm.formState.errors.title && (
                <p className="text-xs text-error">
                  {noticeForm.formState.errors.title.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notice-priority">Priority Level</Label>
              <Select
                defaultValue="important"
                onValueChange={(val) =>
                  noticeForm.setValue(
                    "priority",
                    val as ParentNoticeValues["priority"]
                  )
                }
              >
                <SelectTrigger id="notice-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notice-content">Message to Parents</Label>
              <Textarea
                id="notice-content"
                rows={4}
                {...noticeForm.register("content")}
              />
              {noticeForm.formState.errors.content && (
                <p className="text-xs text-error">
                  {noticeForm.formState.errors.content.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNoticeOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={sendingNotice}>
                {sendingNotice ? "Dispatching..." : "Send Parent Notice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
