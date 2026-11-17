"use client"

import * as React from "react"
import {
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  LayoutDashboard,
  Plus,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PortalShell,
  StatCard,
  StatusBadge,
  type PortalNavItem,
  type StatusType,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const ALL_STATUSES: StatusType[] = [
  "Present",
  "Absent",
  "Late",
  "On-Duty",
  "Pending",
  "Approved",
  "Rejected",
  "Draft",
  "Published",
  "Locked",
]

interface TeacherShellPreviewProps {
  institutionSlug: string
  institutionName: string
}

export function TeacherShellPreview({
  institutionSlug,
  institutionName,
}: TeacherShellPreviewProps) {
  const [academicYear, setAcademicYear] = React.useState("2026-27")

  const basePath = `/campus/${institutionSlug}/teacher`
  const navItems: PortalNavItem[] = [
    {
      label: "Overview",
      href: basePath,
      icon: <LayoutDashboard className="size-4" />,
      exact: true,
    },
    {
      label: "Classes & Sections",
      href: `${basePath}#classes`,
      icon: <BookOpen className="size-4" />,
    },
    {
      label: "Attendance",
      href: `${basePath}#attendance`,
      icon: <CalendarCheck className="size-4" />,
      badge: 2,
    },
    {
      label: "Assessments",
      href: `${basePath}#assessments`,
      icon: <ClipboardList className="size-4" />,
    },
    {
      label: "Students",
      href: `${basePath}#roster`,
      icon: <Users className="size-4" />,
    },
  ]

  return (
    <PortalShell
      institutionName={institutionName}
      institutionSlug={institutionSlug}
      portalLabel="Teacher Portal"
      navItems={navItems}
      selectedAcademicYear={academicYear}
      onAcademicYearChange={(year) => {
        setAcademicYear(year)
        toast.info(`Switched academic year to ${year}`)
      }}
      notificationCount={3}
      onNotificationClick={() =>
        toast("3 pending notifications in Teacher Portal")
      }
      onSignOut={() => toast.info("Sign-out action triggered")}
    >
      <PageHeader
        title="Teacher Portal Design System"
        subtitle={`Previewing shared layout, typography, and UI primitives for ${institutionName} (${academicYear}).`}
        badge={
          <Badge variant="teal" className="font-medium">
            Shell Preview
          </Badge>
        }
        action={
          <Button
            type="button"
            onClick={() =>
              toast.success("Primary action button works", {
                description: "Design system tokens and Sonner toast are active.",
              })
            }
          >
            <Plus className="size-4" />
            Primary Action
          </Button>
        }
      />

      {/* KPI Stat Cards */}
      <section aria-label="KPI Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Assigned Classes"
          value="6"
          icon={<BookOpen />}
          variant="dark"
          tone="darkNavy"
          trend={{ value: "+1", direction: "up", label: "this term" }}
        />
        <StatCard
          label="Today's Attendance"
          value="96.4%"
          icon={<CheckCircle2 />}
          tone="success"
          trend={{ value: "+1.8%", direction: "up", label: "vs last week" }}
        />
        <StatCard
          label="Pending Reviews"
          value="14"
          icon={<Clock />}
          tone="warning"
          trend={{ value: "-3", direction: "down", label: "from yesterday" }}
        />
        <StatCard
          label="Total Students"
          value="188"
          icon={<Users />}
          tone="teal"
          description="Across 4 grade sections"
        />
      </section>

      {/* Status Badges & State Views Showcase */}
      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Status Badges & Table Typography</CardTitle>
            <CardDescription>
              Consistent 13-14px table cells and color-coded status pills across all ERP workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {ALL_STATUSES.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Token Role</TableHead>
                    <TableHead>Sample Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Daily Attendance</TableCell>
                    <TableCell className="text-muted-foreground">
                      Success / Warning / Error / Teal
                    </TableCell>
                    <TableCell>
                      <StatusBadge status="Present" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Leave Request</TableCell>
                    <TableCell className="text-muted-foreground">
                      Approval Lifecycle
                    </TableCell>
                    <TableCell>
                      <StatusBadge status="Pending" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Exam Marks Sheet</TableCell>
                    <TableCell className="text-muted-foreground">
                      Publishing Workflow
                    </TableCell>
                    <TableCell>
                      <StatusBadge status="Published" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Term Gradebook</TableCell>
                    <TableCell className="text-muted-foreground">
                      Finalized State
                    </TableCell>
                    <TableCell>
                      <StatusBadge status="Locked" />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>State Views</CardTitle>
            <CardDescription>
              Reusable loading, empty, and error states.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="empty" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="loading">Loading</TabsTrigger>
                <TabsTrigger value="empty">Empty</TabsTrigger>
                <TabsTrigger value="error">Error</TabsTrigger>
              </TabsList>
              <TabsContent value="loading" className="pt-3">
                <LoadingState compact />
              </TabsContent>
              <TabsContent value="empty" className="pt-3">
                <EmptyState
                  compact
                  action={
                    <Button size="sm" variant="outline">
                      Reset Filters
                    </Button>
                  }
                />
              </TabsContent>
              <TabsContent value="error" className="pt-3">
                <ErrorState
                  compact
                  onRetry={() => toast.info("Retry callback invoked")}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </PortalShell>
  )
}

