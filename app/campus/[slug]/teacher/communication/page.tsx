"use client"

import * as React from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Megaphone,
  Pin,
  Send,
  ShieldCheck,
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createAnnouncement,
  getAnnouncements,
  getClassAllocations,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/services/teacher.service"
import type {
  Announcement,
  ClassAllocation,
  NotificationItem,
} from "@/types/teacher"
import { useTeacherRole } from "../teacher-role-context"

const announcementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Announcement headline must be at least 5 characters."),
  audience: z.enum([
    "Class & Parents",
    "Department",
    "Class Teachers",
    "All Staff",
  ]),
  priority: z.enum(["normal", "important", "urgent"]),
  content: z
    .string()
    .trim()
    .min(12, "Provide clear announcement details (min 12 chars)."),
  isPinned: z.boolean(),
})

type AnnouncementFormValues = z.infer<typeof announcementSchema>

export default function TeacherCommunicationPage() {
  const { slug } = useTeacherRole()
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([])
  const [notifications, setNotifications] = React.useState<NotificationItem[]>(
    []
  )
  const [classes, setClasses] = React.useState<ClassAllocation[]>([])
  const [selectedClasses, setSelectedClasses] = React.useState<string[]>([
    "Class 10 - A",
  ])
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all")
  const [sending, setSending] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: "",
      audience: "Class & Parents",
      priority: "normal",
      content: "",
      isPinned: false,
    },
  })

  const audienceVal = useWatch({ control: form.control, name: "audience" })
  const priorityVal = useWatch({ control: form.control, name: "priority" })
  const titleVal = useWatch({ control: form.control, name: "title" })
  const pinnedVal = useWatch({ control: form.control, name: "isPinned" })

  const loadData = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([getAnnouncements(), getNotifications(), getClassAllocations()])
      .then(([annRes, notifRes, classRes]) => {
        setAnnouncements(annRes)
        setNotifications(notifRes)
        setClasses(classRes)
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load communication hub."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([getAnnouncements(), getNotifications(), getClassAllocations()])
      .then(([annRes, notifRes, classRes]) => {
        if (!active) return
        setAnnouncements(annRes)
        setNotifications(notifRes)
        setClasses(classRes)
      })
      .catch((err) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load communication hub."
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

  const toggleClassTarget = (label: string) => {
    setSelectedClasses((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]
    )
  }

  const handlePublish = form.handleSubmit(async (values) => {
    const needsClassTargets = values.audience === "Class & Parents"
    if (needsClassTargets && selectedClasses.length === 0) {
      toast.error("Select at least one target class section.")
      return
    }

    setSending(true)
    try {
      const created = await createAnnouncement({
        title: values.title,
        content: values.content,
        audience: values.audience,
        targetClasses: needsClassTargets ? selectedClasses : undefined,
        priority: values.priority,
        isPinned: values.isPinned,
      })
      setAnnouncements((prev) => [created, ...prev])
      form.reset({
        title: "",
        audience: "Class & Parents",
        priority: "normal",
        content: "",
        isPinned: false,
      })
      toast.success("Academic announcement published & delivery log recorded.")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to publish announcement."
      )
    } finally {
      setSending(false)
    }
  })

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
    } catch {
      toast.error("Could not update notification.")
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      toast.success("All notifications marked as read.")
    } catch {
      toast.error("Could not clear notifications.")
    }
  }

  if (loading) {
    return (
      <LoadingState
        title="Loading communication & notifications"
        description="Fetching published academic circulars and alert feeds..."
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load communication hub"
        description={error}
        onRetry={loadData}
      />
    )
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length
  const pinnedCount = announcements.filter((a) => a.isPinned).length
  const needsSections = audienceVal === "Class & Parents"

  const previewRecipientCount = needsSections
    ? classes
        .filter((c) => selectedClasses.includes(`${c.className} - ${c.section}`))
        .reduce((sum, c) => sum + c.studentCount, 0)
    : audienceVal === "Department"
      ? 4
      : audienceVal === "Class Teachers"
        ? 12
        : 42

  const filteredNotifications =
    categoryFilter === "all"
      ? notifications
      : notifications.filter((n) => n.category === categoryFilter)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication & Notification Center"
        subtitle="Broadcast section-scoped academic announcements with masked delivery logs and monitor real-time institutional alerts."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Published Broadcasts"
          value={announcements.length}
          icon={<Megaphone />}
          tone="brand"
          description={`${pinnedCount} pinned circular(s)`}
        />
        <StatCard
          label="Unread Notifications"
          value={unreadCount}
          icon={<Bell />}
          tone="warning"
          description="Timetable, Leave & Assessment alerts"
        />
        <StatCard
          label="Assigned Sections"
          value={classes.length}
          icon={<Users />}
          tone="teal"
          description="Eligible announcement cohorts"
        />
        <StatCard
          label="Contact Privacy"
          value="Masked"
          icon={<ShieldCheck />}
          tone="success"
          description="Zero personal numbers exposed"
        />
      </div>

      <Tabs defaultValue="announcements" className="space-y-4">
        <TabsList>
          <TabsTrigger value="announcements">
            Academic Announcements ({announcements.length})
          </TabsTrigger>
          <TabsTrigger value="notifications">
            Notification Center ({unreadCount} unread)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Compose Announcement */}
            <Card className="bg-white lg:col-span-5">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Publish Academic Announcement
                </CardTitle>
                <CardDescription>
                  Target specific class sections or department cohorts via official campus channels.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePublish} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ann-title">Headline</Label>
                    <Input
                      id="ann-title"
                      placeholder="e.g. Lab Journal Submission Deadline Extended"
                      {...form.register("title")}
                    />
                    {form.formState.errors.title && (
                      <p className="text-xs text-error">
                        {form.formState.errors.title.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ann-audience">Target Audience</Label>
                      <Select
                        value={audienceVal}
                        onValueChange={(val) =>
                          form.setValue(
                            "audience",
                            val as AnnouncementFormValues["audience"]
                          )
                        }
                      >
                        <SelectTrigger id="ann-audience">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Class & Parents">
                            Class & Parents
                          </SelectItem>
                          <SelectItem value="Department">
                            Department Faculty
                          </SelectItem>
                          <SelectItem value="Class Teachers">
                            Class Teachers
                          </SelectItem>
                          <SelectItem value="All Staff">All Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="ann-priority">Priority</Label>
                      <Select
                        value={priorityVal}
                        onValueChange={(val) =>
                          form.setValue(
                            "priority",
                            val as AnnouncementFormValues["priority"]
                          )
                        }
                      >
                        <SelectTrigger id="ann-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="important">Important</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {needsSections && (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <Label className="text-xs font-semibold text-foreground">
                        Target Assigned Sections
                      </Label>
                      <div className="flex flex-wrap gap-3">
                        {classes.map((cls) => {
                          const label = `${cls.className} - ${cls.section}`
                          const checked = selectedClasses.includes(label)
                          return (
                            <label
                              key={cls.id}
                              className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleClassTarget(label)}
                              />
                              <span>
                                {label} ({cls.studentCount})
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="ann-content">Message Body</Label>
                    <Textarea
                      id="ann-content"
                      rows={4}
                      placeholder="Write syllabus reminders, exam instructions, or PTI timings..."
                      {...form.register("content")}
                    />
                    {form.formState.errors.content && (
                      <p className="text-xs text-error">
                        {form.formState.errors.content.message}
                      </p>
                    )}
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                    <Checkbox
                      checked={pinnedVal}
                      onCheckedChange={(checked) =>
                        form.setValue("isPinned", Boolean(checked))
                      }
                    />
                    <span>Pin notice to top of student & parent feed</span>
                  </label>

                  {/* Delivery Log Preview (Privacy-Safe) */}
                  <div className="rounded-lg border border-teal/30 bg-teal/8 p-3 text-xs">
                    <div className="flex items-center justify-between font-semibold text-teal-800">
                      <span>Delivery Log Preview</span>
                      <Badge
                        variant="outline"
                        className="border-teal/35 bg-white text-teal-700"
                      >
                        Portal & Digest Gateway
                      </Badge>
                    </div>
                    <div className="mt-1.5 space-y-1 text-muted-foreground">
                      <div>
                        Headline:{" "}
                        <strong className="text-foreground">
                          {titleVal?.trim() || "Untitled Academic Circular"}
                        </strong>
                      </div>
                      <div>
                        Estimated Cohort Reach:{" "}
                        <strong className="text-foreground">
                          {previewRecipientCount} recipient(s)
                        </strong>{" "}
                        ({audienceVal})
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-teal-800">
                        <ShieldCheck className="size-3.5 shrink-0" />
                        <span>
                          Phone numbers & personal emails remain masked by ERP
                          notification gateway.
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={sending}>
                    <Send className="size-4" />
                    {sending ? "Broadcasting..." : "Publish Announcement"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Announcements Feed & Delivery Audit */}
            <Card className="bg-white lg:col-span-7">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Recent Academic Circulars & Delivery Logs
                </CardTitle>
                <CardDescription>
                  Aggregate delivery confirmation across portal banners and parent app notifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {announcements.length === 0 ? (
                  <EmptyState
                    title="No announcements published"
                    description="Create an academic circular using the composer."
                  />
                ) : (
                  announcements.map((ann) => (
                    <div
                      key={ann.id}
                      className="rounded-lg border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {ann.isPinned && (
                            <Badge
                              variant="outline"
                              className="border-brand/30 bg-brand/10 text-brand"
                            >
                              <Pin className="mr-1 size-3" />
                              Pinned
                            </Badge>
                          )}
                          <Badge variant="outline">{ann.audience}</Badge>
                          {ann.targetClasses?.map((cls) => (
                            <Badge
                              key={cls}
                              variant="outline"
                              className="border-primary/25 bg-primary/8 text-primary"
                            >
                              {cls}
                            </Badge>
                          ))}
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize",
                              ann.priority === "urgent"
                                ? "border-error/30 bg-error/10 text-error"
                                : ann.priority === "important"
                                  ? "border-warning/35 bg-warning/12 text-amber-700"
                                  : "border-slate-200 bg-slate-50 text-muted-foreground"
                            )}
                          >
                            {ann.priority}
                          </Badge>
                        </div>
                        <StatusBadge status="Published" />
                      </div>

                      <h3 className="mt-2 font-semibold text-foreground">
                        {ann.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {ann.content}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-muted-foreground">
                        <span>
                          By {ann.authorName} ({ann.authorRole}) •{" "}
                          {ann.publishedAt}
                        </span>
                        <span className="font-medium text-success">
                          Delivered via Portal Feed (Contact Info Protected)
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card className="bg-white">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Notification Center
                </CardTitle>
                <CardDescription>
                  Timetable updates, student leave escalations, IA deadlines, and exam duty alerts.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={categoryFilter}
                  onValueChange={setCategoryFilter}
                >
                  <SelectTrigger
                    className="w-44"
                    aria-label="Filter notifications"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="timetable">Timetable Changes</SelectItem>
                    <SelectItem value="leave">Leave Approvals</SelectItem>
                    <SelectItem value="assessment">
                      Assessment Deadlines
                    </SelectItem>
                    <SelectItem value="attendance">Attendance</SelectItem>
                    <SelectItem value="duty">Duties</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={unreadCount === 0}
                  onClick={handleMarkAllRead}
                >
                  <CheckCheck className="size-4" />
                  Mark All Read
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredNotifications.length === 0 ? (
                <EmptyState
                  title="No notifications in this category"
                  description="Switch category filter to view other alerts."
                />
              ) : (
                filteredNotifications.map((notif) => {
                  const targetHref = notif.actionHref
                    ? notif.actionHref.replace("/demo-school/", `/${slug}/`)
                    : undefined
                  return (
                    <div
                      key={notif.id}
                      className={cn(
                        "flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center",
                        notif.isRead
                          ? "border-slate-200 bg-white"
                          : "border-primary/25 bg-primary/5"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {!notif.isRead && (
                            <span
                              className="size-2 rounded-full bg-primary"
                              aria-label="Unread"
                            />
                          )}
                          <span className="font-semibold text-foreground">
                            {notif.title}
                          </span>
                          <Badge variant="outline" className="capitalize">
                            {notif.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {notif.message}
                        </p>
                        <div className="text-xs text-muted-foreground">
                          {notif.createdAt.replace("T", " ").slice(0, 16)}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {!notif.isRead && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkRead(notif.id)}
                          >
                            Mark Read
                          </Button>
                        )}
                        {targetHref && (
                          <Button asChild size="sm" variant="secondary">
                            <Link href={targetHref}>
                              Open
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
