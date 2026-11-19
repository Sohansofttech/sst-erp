"use client"

import * as React from "react"
import {
  GraduationCap,
  Phone,
  Search,
  UserCheck,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/shared"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import {
  getClassAllocations,
  getSectionStudents,
  getSubjectAllocations,
} from "@/lib/services/teacher.service"
import type {
  ClassAllocation,
  StudentRosterItem,
  SubjectAllocation,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

interface AssignedClassCardItem {
  classAllocation: ClassAllocation
  subjectAllocation?: SubjectAllocation
}

function getStudentInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

export default function TeacherClassesPage() {
  const { academicYear } = useTeacherRole()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [assignedClasses, setAssignedClasses] = React.useState<
    AssignedClassCardItem[]
  >([])
  const [selectedSectionId, setSelectedSectionId] = React.useState<string>("")
  const [roster, setRoster] = React.useState<StudentRosterItem[]>([])
  const [loadingRoster, setLoadingRoster] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [onlyLowAttendance, setOnlyLowAttendance] = React.useState(false)
  const [activeStudent, setActiveStudent] =
    React.useState<StudentRosterItem | null>(null)

  const fetchClassesData = React.useCallback(async () => {
    const [classAllocs, subjectAllocs] = await Promise.all([
      getClassAllocations(),
      getSubjectAllocations(),
    ])
    const combined: AssignedClassCardItem[] = classAllocs.map((ca) => ({
      classAllocation: ca,
      subjectAllocation: subjectAllocs.find(
        (sa) => sa.sectionId === ca.sectionId
      ),
    }))
    const firstId = combined[0]?.classAllocation.sectionId ?? ""
    const students = firstId ? await getSectionStudents(firstId) : []
    return { combined, firstId, students }
  }, [])

  const loadClasses = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { combined, firstId, students } = await fetchClassesData()
      setAssignedClasses(combined)
      setSelectedSectionId(firstId)
      setRoster(students)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load class allocations."
      )
    } finally {
      setLoading(false)
    }
  }, [fetchClassesData])

  React.useEffect(() => {
    let active = true
    fetchClassesData()
      .then(({ combined, firstId, students }) => {
        if (!active) return
        setAssignedClasses(combined)
        setSelectedSectionId(firstId)
        setRoster(students)
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load class allocations."
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchClassesData])

  const handleSelectClass = async (sectionId: string) => {
    setSelectedSectionId(sectionId)
    setSearchQuery("")
    setOnlyLowAttendance(false)
    setLoadingRoster(true)
    try {
      const students = await getSectionStudents(sectionId)
      setRoster(students)
    } catch {
      toast.error("Failed to fetch section roster.")
    } finally {
      setLoadingRoster(false)
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading My Classes & Students"
        description="Fetching assigned sections, subjects, and student rosters..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load classes"
        description={error}
        onRetry={() => void loadClasses()}
      />
    )
  }

  const activeItem = assignedClasses.find(
    (item) => item.classAllocation.sectionId === selectedSectionId
  )

  const filteredRoster = roster.filter((student) => {
    if (
      onlyLowAttendance &&
      (student.attendancePercent === null ||
        student.attendancePercent === undefined ||
        student.attendancePercent >= 75)
    ) {
      return false
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      student.fullName.toLowerCase().includes(q) ||
      student.rollNo.toLowerCase().includes(q) ||
      student.admissionNo.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Classes & Students"
        subtitle={`Select an assigned class & section to inspect its student roster and academic summary · AY ${academicYear}`}
        badge={
          <Badge variant="brand">
            {assignedClasses.length} Assigned Sections
          </Badge>
        }
      />

      {/* Assigned Class + Section + Subject Cards */}
      <section
        aria-label="Assigned Classes"
        className="grid gap-4 md:grid-cols-3"
      >
        {assignedClasses.map(({ classAllocation, subjectAllocation }) => {
          const isSelected =
            classAllocation.sectionId === selectedSectionId
          const syllabus = subjectAllocation?.syllabusCompletionPercent ?? 0

          return (
            <button
              key={classAllocation.id}
              type="button"
              onClick={() => void handleSelectClass(classAllocation.sectionId)}
              className="text-left focus-visible:outline-none"
            >
              <Card
                className={cn(
                  "h-full py-5 rounded-2xl border-[#E5E9EF] bg-white shadow-xs transition-all hover:border-[#F5A000]/60",
                  isSelected &&
                    "border-[#F5A000] ring-2 ring-[#F5A000]/25 shadow-sm"
                )}
              >
                <CardContent className="space-y-4 px-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[17px] font-bold text-[#202936]">
                        {classAllocation.className} - Section{" "}
                        {classAllocation.section}
                      </p>
                      <p className="mt-0.5 text-[13.5px] font-bold text-[#F5A000]">
                        {subjectAllocation?.subjectName ?? "Mathematics"}{" "}
                        {subjectAllocation?.subjectCode
                          ? `(${subjectAllocation.subjectCode})`
                          : ""}
                      </p>
                    </div>
                    {classAllocation.role === "class_teacher" ? (
                      <Badge className="rounded-full bg-[#123B5A]/10 text-[#123B5A] border-[#123B5A]/20 font-bold gap-1">
                        <UserCheck className="size-3" />
                        Class Teacher
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="rounded-full bg-[#EEF1F5] text-[#202936] font-semibold">Subject Teacher</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#EEF1F5] p-2.5 text-center text-[12px]">
                    <div>
                      <p className="text-[#788391] font-medium">Students</p>
                      <p className="mt-0.5 text-[14px] font-extrabold text-[#202936]">
                        {classAllocation.studentCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#788391] font-medium">Avg Att.</p>
                      <p className="mt-0.5 text-[14px] font-extrabold text-emerald-700">
                        {classAllocation.averageAttendancePercent !== null &&
                        classAllocation.averageAttendancePercent !== undefined
                          ? `${classAllocation.averageAttendancePercent}%`
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#788391] font-medium">Room</p>
                      <p className="mt-0.5 text-[14px] font-extrabold text-[#202936]">
                        {classAllocation.roomNo}
                      </p>
                    </div>
                  </div>

                  {subjectAllocation && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="text-[#788391]">
                          Syllabus Progress ({subjectAllocation.weeklyHours}{" "}
                          hrs/wk)
                        </span>
                        <span className="font-bold text-[#202936]">
                          {syllabus}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEF1F5]">
                        <div
                          className="h-full rounded-full bg-[#F5A000] transition-all"
                          style={{ width: `${syllabus}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </button>
          )
        })}
      </section>

      {/* Active Section Student Roster */}
      <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5E9EF] pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-[#202936]">
              <Users className="size-4 text-[#F5A000]" />
              {activeItem
                ? `${activeItem.classAllocation.className} - Section ${activeItem.classAllocation.section} Student Roster`
                : "Student Roster"}
            </CardTitle>
            <CardDescription className="text-[#788391]">
              {activeItem?.subjectAllocation?.subjectName ?? "Subject"} · Room{" "}
              {activeItem?.classAllocation.roomNo ?? "—"} ·{" "}
              {filteredRoster.length} of {roster.length} students shown
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#788391]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or roll no..."
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant={onlyLowAttendance ? "default" : "outline"}
              size="sm"
              className={onlyLowAttendance ? "rounded-xl bg-[#F5A000] text-white hover:bg-[#E09200]" : "rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"}
              onClick={() => setOnlyLowAttendance((v) => !v)}
            >
              {onlyLowAttendance ? "Showing < 75% Att." : "Filter < 75% Att."}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          {loadingRoster ? (
            <LoadingState compact title="Loading student roster..." />
          ) : filteredRoster.length === 0 ? (
            <EmptyState
              compact
              title="No matching students"
              description="Try clearing your search query or attendance filter."
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-[#E5E9EF] text-[#202936]"
                  onClick={() => {
                    setSearchQuery("")
                    setOnlyLowAttendance(false)
                  }}
                >
                  Reset Search
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E5E9EF]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Roll No</TableHead>
                    <TableHead>Guardian Contact</TableHead>
                    <TableHead>Attendance %</TableHead>
                    <TableHead>IA Average</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoster.map((student) => {
                    const attTone =
                      student.attendancePercent === null ||
                      student.attendancePercent === undefined
                        ? "border-slate-200 bg-slate-50 text-slate-700 font-medium"
                        : student.attendancePercent < 75
                          ? "border-rose-200 bg-rose-50 text-rose-700 font-bold"
                          : student.attendancePercent < 85
                            ? "border-amber-200 bg-amber-50 text-amber-700 font-bold"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 font-bold"

                    return (
                      <TableRow key={student.studentId}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar size="sm">
                              <AvatarFallback className="bg-[#123B5A]/10 text-[11px] font-bold text-[#123B5A]">
                                {getStudentInitials(student.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-[13.5px] font-bold text-[#202936]">
                                {student.fullName}
                              </p>
                              <p className="font-mono text-[11.5px] text-[#788391]">
                                {student.admissionNo}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[13px] font-medium">
                          {student.rollNo}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-[13px] font-medium text-[#202936]">
                              {student.guardianContact.guardianName} (
                              {student.guardianContact.relation})
                            </p>
                            <p className="text-[12px] text-[#788391]">
                              {student.guardianContact.phone}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold",
                              attTone
                            )}
                          >
                            {student.attendancePercent !== null &&
                            student.attendancePercent !== undefined
                              ? `${student.attendancePercent}%`
                              : "N/A"}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold text-[#202936]">
                          {student.iaAverage}%
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="rounded-lg border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
                            onClick={() => setActiveStudent(student)}
                          >
                            View Student Summary
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Student Summary Drawer */}
      <Sheet
        open={Boolean(activeStudent)}
        onOpenChange={(open) => {
          if (!open) setActiveStudent(null)
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {activeStudent && (
            <>
              <SheetHeader className="border-b pb-4">
                <div className="flex items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback className="bg-brand text-sm font-bold text-white">
                      {getStudentInitials(activeStudent.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle>{activeStudent.fullName}</SheetTitle>
                    <SheetDescription>
                      {activeStudent.className} - Section{" "}
                      {activeStudent.section} · Roll {activeStudent.rollNo}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-5 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-background p-3.5">
                    <p className="text-[12px] font-medium text-muted-foreground">
                      Attendance
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-2xl font-bold",
                        activeStudent.attendancePercent === null ||
                          activeStudent.attendancePercent === undefined
                          ? "text-muted-foreground"
                          : activeStudent.attendancePercent < 75
                            ? "text-error"
                            : "text-success"
                      )}
                    >
                      {activeStudent.attendancePercent !== null &&
                      activeStudent.attendancePercent !== undefined
                        ? `${activeStudent.attendancePercent}%`
                        : "N/A"}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {activeStudent.attendancePercent === null ||
                      activeStudent.attendancePercent === undefined
                        ? "No attendance records"
                        : activeStudent.attendancePercent < 75
                          ? "Below 75% threshold"
                          : "Meets requirement"}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-background p-3.5">
                    <p className="text-[12px] font-medium text-muted-foreground">
                      IA Average
                    </p>
                    <p className="mt-1 text-2xl font-bold text-primary">
                      {activeStudent.iaAverage}%
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      Internal Assessments
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="text-[14px] font-semibold text-foreground">
                    Academic Identifiers
                  </h4>
                  <div className="space-y-2 rounded-xl border p-3.5 text-[13px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Admission Number
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        {activeStudent.admissionNo}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Roll Number</span>
                      <span className="font-mono font-medium text-foreground">
                        {activeStudent.rollNo}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Class & Section
                      </span>
                      <span className="font-medium text-foreground">
                        {activeStudent.className} - {activeStudent.section}
                      </span>
                    </div>
                    {activeStudent.houseOrGroup && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          School House
                        </span>
                        <span className="font-medium text-foreground">
                          {activeStudent.houseOrGroup}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[14px] font-semibold text-foreground">
                    Guardian Contact
                  </h4>
                  <div className="space-y-2 rounded-xl border p-3.5 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {activeStudent.guardianContact.relation}
                      </span>
                      <span className="font-semibold text-foreground">
                        {activeStudent.guardianContact.guardianName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="size-3.5" /> Phone
                      </span>
                      <span className="font-mono font-medium text-primary">
                        {activeStudent.guardianContact.phone}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-brand/15 bg-brand/[0.03] p-3.5 text-[12.5px] text-muted-foreground">
                  <div className="flex items-center gap-2 font-semibold text-brand">
                    <GraduationCap className="size-4" />
                    Academic Focus View
                  </div>
                  <p className="mt-1">
                    Only academic, attendance, and guardian contact information is shown in the Teacher Portal.
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() =>
                      toast.info(
                        `Dialing ${activeStudent.guardianContact.guardianName}`,
                        {
                          description: activeStudent.guardianContact.phone,
                        }
                      )
                    }
                  >
                    <Phone className="size-4" />
                    Call Guardian
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveStudent(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
