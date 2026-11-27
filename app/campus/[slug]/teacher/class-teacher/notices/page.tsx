"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Megaphone,
  Send,
  History,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import {
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createAnnouncement, getAnnouncements, getSectionStudents } from "@/lib/services/teacher.service"
import { useTeacherRole } from "../../teacher-role-context"

interface SentNotice {
  id: string
  title: string
  content: string
  priority: "normal" | "important" | "urgent"
  sentAt: string
  recipientCount: number
  isSample?: boolean
}

export default function ParentNoticesPage() {
  const { slug, user } = useTeacherRole()
  const homeroomName = user?.homeroomClass || "Assigned Homeroom"
  const [title, setTitle] = React.useState("")
  const [priority, setPriority] = React.useState<"normal" | "important" | "urgent">("important")
  const [content, setContent] = React.useState("")
  const [isSending, setIsSending] = React.useState(false)
  const [recipientCount, setRecipientCount] = React.useState<number | null>(null)
  const [sentHistory, setSentHistory] = React.useState<SentNotice[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true
    async function loadInitialData() {
      try {
        const [roster, announcements] = await Promise.all([
          getSectionStudents().catch(() => []),
          getAnnouncements().catch(() => []),
        ])

        if (!isMounted) return

        const count = roster.length
        setRecipientCount(count)

        if (announcements.length > 0) {
          const mapped: SentNotice[] = announcements.slice(0, 5).map((a) => ({
            id: a.id,
            title: a.title,
            content: a.content,
            priority: a.priority,
            sentAt: a.publishedAt ? a.publishedAt.replace("T", " ").slice(0, 16) : new Date().toISOString().slice(0, 10),
            recipientCount: count,
          }))
          setSentHistory(mapped)
        } else {
          setSentHistory([
            {
              id: "sample-sn-01",
              title: `[Sample Content] Monthly Attendance & Progress Report Released`,
              content: `Sample preview for ${homeroomName} parents: Please review Term attendance and upcoming schedule on the parent portal.`,
              priority: "important",
              sentAt: new Date().toISOString().replace("T", " ").slice(0, 10),
              recipientCount: count,
              isSample: true,
            },
          ])
        }
      } catch (err) {
        console.warn("Failed to load initial notice data:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadInitialData()
    return () => {
      isMounted = false
    }
  }, [homeroomName])

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      toast.error("Please provide both subject and notice content.")
      return
    }

    setIsSending(true)
    try {
      await createAnnouncement({
        title: title.trim(),
        content: content.trim(),
        audience: "Class & Parents",
        targetClasses: [homeroomName],
        priority,
        isPinned: priority === "urgent",
      })

      const count = recipientCount ?? 0
      const newNotice: SentNotice = {
        id: `sn-${Date.now()}`,
        title: title.trim(),
        content: content.trim(),
        priority,
        sentAt: new Date().toISOString().replace("T", " ").slice(0, 16),
        recipientCount: count,
      }

      setSentHistory((prev) => [newNotice, ...prev.filter((p) => !p.isSample)])
      setTitle("")
      setContent("")
      toast.success(
        count > 0
          ? `Notice queued and dispatched to ${count} registered parent accounts of ${homeroomName}.`
          : `Notice broadcast queued for ${homeroomName}.`
      )
    } catch (err: any) {
      toast.error(err?.message || "Failed to broadcast notice.")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parent Notices Broadcast"
        subtitle={`Send direct institutional notices to all verified parents of ${homeroomName}. Messages are delivered to the Parent Portal with contact privacy protection.`}
        action={
          <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]">
            <Link href={`/campus/${slug}/teacher/class-teacher`}>
              <ArrowLeft className="mr-1.5 size-4 text-[#123B5A]" />
              Section Dashboard
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Broadcast Form */}
        <div className="lg:col-span-3">
          <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
            <CardHeader className="border-b border-[#E5E9EF] pb-4">
              <CardTitle className="text-lg font-bold text-[#202936]">
                Compose Parent Notice
              </CardTitle>
              <CardDescription className="text-xs text-[#788391]">
                Target audience: {recipientCount !== null ? `${recipientCount} registered student parents` : "Registered student parents"} of {homeroomName} (Homeroom).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleBroadcast} className="space-y-4">
                <div>
                  <Label className="text-xs font-bold text-[#202936]">Subject Line</Label>
                  <Input
                    placeholder="e.g., Attendance Shortage Notice / Pre-Board Parent Meeting"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="mt-1 rounded-xl border-[#E5E9EF] text-base sm:text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-[#202936]">Priority</Label>
                  <Select
                    value={priority}
                    onValueChange={(val: any) => setPriority(val)}
                  >
                    <SelectTrigger className="mt-1 rounded-xl border-[#E5E9EF] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#E5E9EF]">
                      <SelectItem value="normal">Normal Information</SelectItem>
                      <SelectItem value="important">Important Advisory</SelectItem>
                      <SelectItem value="urgent">Urgent Action Required</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-[#202936]">Notice Content</Label>
                  <Textarea
                    rows={5}
                    placeholder="Enter the official notification message for parents..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                    className="mt-1 rounded-xl border-[#E5E9EF] text-base sm:text-xs"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-[#E5E9EF]">
                  <div className="flex items-center gap-1.5 text-xs text-[#788391]">
                    <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
                    <span>Parent phone numbers protected</span>
                  </div>
                  <Button
                    type="submit"
                    disabled={isSending}
                    className="w-full sm:w-auto rounded-xl bg-[#F5A000] font-bold text-[#123B5A] hover:bg-[#E09200]"
                  >
                    <Send className="mr-1.5 size-4" />
                    {isSending
                      ? "Broadcasting..."
                      : `Broadcast to ${recipientCount !== null ? `${recipientCount} Parents` : "Parents"}`}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Sent History */}
        <div className="lg:col-span-2">
          <Card className="rounded-2xl border-[#E5E9EF] bg-white shadow-xs">
            <CardHeader className="border-b border-[#E5E9EF] pb-4">
              <div className="flex items-center gap-2">
                <History className="size-4 text-[#123B5A]" />
                <CardTitle className="text-base font-bold text-[#202936]">
                  Sent Notices Log
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-[#788391]">
                Recent broadcasts sent to {homeroomName}.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {sentHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#E5E9EF] bg-[#EEF1F5]/40 p-3 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-[#202936] line-clamp-1">
                      {item.title}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full text-[10px] font-bold shrink-0",
                        item.priority === "urgent"
                          ? "border-rose-300 bg-rose-50 text-rose-700"
                          : item.priority === "important"
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-slate-300 bg-slate-50 text-slate-700"
                      )}
                    >
                      {item.priority}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[#788391] line-clamp-2">
                    {item.content}
                  </p>
                  <div className="flex items-center justify-between pt-1 text-[10px] text-[#788391]">
                    <span>{item.sentAt}</span>
                    <span className="font-semibold text-[#123B5A]">{item.recipientCount} Parents</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
