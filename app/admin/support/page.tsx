"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  HelpCircle,
  Plus,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Send,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Inbox,
  RotateCcw,
  XCircle,
  Paperclip,
} from "lucide-react";
import { useInstitution } from "@/lib/store";

interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  relatedModule?: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "OPEN" | "IN_PROGRESS" | "WAITING_FOR_RESPONSE" | "RESOLVED" | "CLOSED";
  description: string;
  attachmentUrl?: string;
  attachmentName?: string;
  creatorName?: string;
  creatorEmail?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  messagesCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SupportMessage {
  id: string;
  ticketId: string;
  authorName: string;
  authorRole: "SUPER_ADMIN" | "INSTITUTION_ADMIN" | "SUPPORT_STAFF";
  body: string;
  isInternal: boolean;
  createdAt: string;
}

const CATEGORIES = [
  "Login & Authentication",
  "Student Management",
  "Faculty Management",
  "Academic Configuration",
  "Attendance",
  "Timetable",
  "Examination & Results",
  "Fees & Payments",
  "Email & Notifications",
  "Database & Technical Issues",
  "Data Correction",
  "Other",
];

const MODULES = [
  "General / Platform",
  "Admissions",
  "Academics (Years, Courses, Classes)",
  "Students",
  "Faculty & Staff",
  "Guardians",
  "Timetable",
  "Attendance",
  "Examinations",
  "Internal Assessment (IA)",
  "Results & Grading",
  "Promotions",
  "Certificates",
  "Fees & Finance",
  "Hostel",
  "Transport",
  "Gate Management",
  "Communication",
  "Institution Settings",
];

export default function InstitutionSupportPage() {
  const { profile } = useInstitution();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    open: 0,
    inProgress: 0,
    waitingForInstitution: 0,
    resolved: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Modal states
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [isReopenPromptOpen, setIsReopenPromptOpen] = useState(false);

  // New ticket form state
  const [formData, setFormData] = useState({
    subject: "",
    category: "Academic Configuration",
    priority: "NORMAL" as "LOW" | "NORMAL" | "HIGH" | "URGENT",
    relatedModule: "Timetable",
    description: "",
    attachmentUrl: "",
    attachmentName: "",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== "ALL") params.append("status", activeTab);
      if (categoryFilter !== "ALL") params.append("category", categoryFilter);
      if (searchQuery.trim()) params.append("q", searchQuery.trim());

      const res = await fetch(`/api/admin/support?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setTickets(json.data || []);
        if (json.counts) setCounts(json.counts);
      }
    } catch (err: any) {
      console.error("Failed to load tickets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [activeTab, categoryFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTickets();
  };

  const openTicketDetail = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setIsDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/support/${ticket.id}`);
      const json = await res.json();
      if (json.success) {
        setSelectedTicket(json.data.ticket);
        setTicketMessages(json.data.messages || []);
      }
    } catch (err) {
      console.error("Failed to load ticket details:", err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setReplySubmitting(true);
    try {
      const res = await fetch(`/api/admin/support/${selectedTicket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REPLY",
          message: replyText.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setReplyText("");
        // Reload details
        openTicketDetail(selectedTicket);
        fetchTickets();
      } else {
        alert(json.error || "Failed to send reply");
      }
    } catch (err: any) {
      alert("Error sending reply: " + err.message);
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    if (!confirm("Are you sure you want to close this ticket? You can reopen it later if needed.")) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`/api/admin/support/${selectedTicket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CLOSE" }),
      });
      const json = await res.json();
      if (json.success) {
        openTicketDetail(selectedTicket);
        fetchTickets();
      } else {
        alert(json.error || "Failed to close ticket");
      }
    } catch (err: any) {
      alert("Error closing ticket: " + err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleReopenTicket = async () => {
    if (!selectedTicket || !reopenReason.trim()) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`/api/admin/support/${selectedTicket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REOPEN",
          reason: reopenReason.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setIsReopenPromptOpen(false);
        setReopenReason("");
        openTicketDetail(selectedTicket);
        fetchTickets();
      } else {
        alert(json.error || "Failed to reopen ticket");
      }
    } catch (err: any) {
      alert("Error reopening ticket: " + err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!formData.subject.trim()) {
      setErrorMessage("Please enter a ticket subject.");
      return;
    }
    if (!formData.description.trim()) {
      setErrorMessage("Please enter a detailed description of the problem.");
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await fetch("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMessage(`Ticket #${json.data.ticketNumber} created successfully!`);
        setFormData({
          subject: "",
          category: "Academic Configuration",
          priority: "NORMAL",
          relatedModule: "Timetable",
          description: "",
          attachmentUrl: "",
          attachmentName: "",
        });
        setTimeout(() => {
          setIsRaiseModalOpen(false);
          setSuccessMessage(null);
          fetchTickets();
        }, 1200);
      } else {
        setErrorMessage(json.error || "Failed to create support ticket.");
      }
    } catch (err: any) {
      setErrorMessage("Network error: " + err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return <Badge className="bg-red-600 text-white font-bold">URGENT</Badge>;
      case "HIGH":
        return <Badge className="bg-amber-600 text-white font-semibold">HIGH</Badge>;
      case "NORMAL":
        return <Badge className="bg-blue-600 text-white font-medium">NORMAL</Badge>;
      default:
        return <Badge className="bg-slate-500 text-white font-normal">LOW</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-300 font-semibold">Open</Badge>;
      case "IN_PROGRESS":
        return <Badge className="bg-blue-500/15 text-blue-700 border border-blue-300 font-semibold">In Progress</Badge>;
      case "WAITING_FOR_RESPONSE":
        return <Badge className="bg-amber-500/15 text-amber-700 border border-amber-300 font-semibold">Waiting on You</Badge>;
      case "RESOLVED":
        return <Badge className="bg-purple-500/15 text-purple-700 border border-purple-300 font-semibold">Resolved</Badge>;
      case "CLOSED":
        return <Badge className="bg-slate-500/15 text-slate-700 border border-slate-300 font-semibold">Closed</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-[var(--admin-sidebar-bg,#123B5A)] flex items-center justify-center text-white shadow-xs">
              <HelpCircle className="w-5 h-5 text-[var(--admin-accent,#F5A000)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Support & Helpdesk</h1>
              <p className="text-xs text-slate-500">
                Raise technical requests, report system anomalies, or request priority assistance from Super Admin.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTickets}
            className="flex items-center gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
          <Button
            onClick={() => setIsRaiseModalOpen(true)}
            className="flex items-center gap-1.5 bg-[var(--admin-accent,#F5A000)] hover:bg-[#e09200] text-white font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Raise New Ticket</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card
          onClick={() => setActiveTab("ALL")}
          className={`cursor-pointer transition-all border ${
            activeTab === "ALL" ? "border-[var(--admin-sidebar-bg,#123B5A)] bg-slate-50/80 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">All Tickets</span>
              <Inbox className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">{counts.all}</div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveTab("OPEN")}
          className={`cursor-pointer transition-all border ${
            activeTab === "OPEN" ? "border-emerald-500 bg-emerald-50/50 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800">Open</span>
              <AlertCircle className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-emerald-700 mt-2">{counts.open}</div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveTab("IN_PROGRESS")}
          className={`cursor-pointer transition-all border ${
            activeTab === "IN_PROGRESS" ? "border-blue-500 bg-blue-50/50 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-800">In Progress</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-blue-700 mt-2">{counts.inProgress}</div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveTab("WAITING_FOR_RESPONSE")}
          className={`cursor-pointer transition-all border ${
            activeTab === "WAITING_FOR_RESPONSE" ? "border-amber-500 bg-amber-50/50 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800">Waiting on You</span>
              <MessageSquare className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-700 mt-2">{counts.waitingForInstitution}</div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveTab("RESOLVED")}
          className={`cursor-pointer transition-all border ${
            activeTab === "RESOLVED" ? "border-purple-500 bg-purple-50/50 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-800">Resolved</span>
              <CheckCircle2 className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-black text-purple-700 mt-2">{counts.resolved}</div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveTab("CLOSED")}
          className={`cursor-pointer transition-all border ${
            activeTab === "CLOSED" ? "border-slate-400 bg-slate-100 shadow-xs" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Closed</span>
              <XCircle className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-700 mt-2">{counts.closed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white p-3.5 rounded-lg border border-slate-200">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              type="text"
              placeholder="Search by ticket #, subject, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" className="text-xs">
            Search
          </Button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs font-semibold text-slate-600 shrink-0">Category:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="ALL">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tickets Table */}
      <Card className="border border-slate-200 shadow-xs">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow>
                <TableHead className="w-36 text-xs font-bold text-slate-700">Ticket #</TableHead>
                <TableHead className="text-xs font-bold text-slate-700">Subject & Category</TableHead>
                <TableHead className="w-32 text-xs font-bold text-slate-700">Module</TableHead>
                <TableHead className="w-24 text-xs font-bold text-slate-700">Priority</TableHead>
                <TableHead className="w-32 text-xs font-bold text-slate-700">Status</TableHead>
                <TableHead className="w-24 text-xs font-bold text-slate-700">Replies</TableHead>
                <TableHead className="w-32 text-xs font-bold text-slate-700">Created</TableHead>
                <TableHead className="w-28 text-right text-xs font-bold text-slate-700">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-400 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                    Loading support tickets...
                  </TableCell>
                </TableRow>
              ) : tickets.length === 0 ? (
                <TableEmpty colSpan={8} message="No support tickets found matching current filters." />
              ) : (
                tickets.map((t) => (
                  <TableRow key={t.id} className="hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => openTicketDetail(t)}>
                    <TableCell className="font-mono text-xs font-bold text-blue-600">{t.ticketNumber}</TableCell>
                    <TableCell>
                      <div className="font-semibold text-xs text-slate-900">{t.subject}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{t.category}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{t.relatedModule || "General"}</TableCell>
                    <TableCell>{getPriorityBadge(t.priority)}</TableCell>
                    <TableCell>{getStatusBadge(t.status)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        {t.messagesCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="text-xs text-blue-600 hover:text-blue-800 p-1">
                          View <ChevronRight className="w-3.5 h-3.5 ml-0.5 inline" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Raise New Ticket Modal */}
      <Modal isOpen={isRaiseModalOpen} onClose={() => setIsRaiseModalOpen(false)} title="Raise New Support Ticket" maxWidth="2xl">
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ticket Subject <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="Brief summary of the issue (e.g., Timetable period generation conflict)"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              required
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white text-slate-800"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Related Module
              </label>
              <select
                value={formData.relatedModule}
                onChange={(e) => setFormData({ ...formData, relatedModule: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white text-slate-800"
              >
                {MODULES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Priority <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white text-slate-800 font-semibold"
              >
                <option value="LOW">Low (Informational / Query)</option>
                <option value="NORMAL">Normal (Standard operational request)</option>
                <option value="HIGH">High (Impacting daily staff/student operations)</option>
                <option value="URGENT">Critical / Urgent (Blocker / Data discrepancy)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Detailed Description <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="Describe the steps to reproduce, expected vs actual behavior, and any affected student/faculty IDs..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              className="w-full text-xs border border-slate-200 rounded-md p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Optional Attachment / Log Link
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="https://drive.google.com/... or screenshot URL"
                value={formData.attachmentUrl}
                onChange={(e) => setFormData({ ...formData, attachmentUrl: e.target.value })}
                className="text-xs"
              />
              <Input
                type="text"
                placeholder="Attachment label"
                value={formData.attachmentName}
                onChange={(e) => setFormData({ ...formData, attachmentName: e.target.value })}
                className="text-xs w-48"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Provide link to screenshots, export spreadsheets, or error logs to expedite diagnosis.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsRaiseModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={formSubmitting}
              className="bg-[var(--admin-accent,#F5A000)] hover:bg-[#e09200] text-white font-semibold"
            >
              {formSubmitting ? "Submitting..." : "Submit Ticket to Super Admin"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Ticket Details & Conversation Modal */}
      {selectedTicket && (
        <Modal
          isOpen={!!selectedTicket}
          onClose={() => {
            setSelectedTicket(null);
            setTicketMessages([]);
          }}
          title={`Ticket ${selectedTicket.ticketNumber} — ${selectedTicket.subject}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {/* Ticket Metadata Bar */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Status:</span>
                {getStatusBadge(selectedTicket.status)}
                <span className="font-bold text-slate-500 ml-2">Priority:</span>
                {getPriorityBadge(selectedTicket.priority)}
                <span className="font-bold text-slate-500 ml-2">Category:</span>
                <Badge variant="outline" className="bg-white">{selectedTicket.category}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {selectedTicket.status === "RESOLVED" || selectedTicket.status === "CLOSED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsReopenPromptOpen(true)}
                    className="flex items-center gap-1 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reopen Ticket
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCloseTicket}
                    disabled={actionSubmitting}
                    className="flex items-center gap-1 text-xs text-slate-700 border-slate-300 hover:bg-slate-100"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Close Ticket
                  </Button>
                )}
              </div>
            </div>

            {/* Initial Problem Statement */}
            <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Opened by <strong>{selectedTicket.creatorName || "Institution Administrator"}</strong> on{" "}
                  {new Date(selectedTicket.createdAt).toLocaleString("en-IN")}
                </span>
                <span>Module: {selectedTicket.relatedModule || "General"}</span>
              </div>
              <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">{selectedTicket.description}</p>
              {selectedTicket.attachmentUrl && (
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                  <a
                    href={selectedTicket.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    {selectedTicket.attachmentName || "View Attachment"} &rarr;
                  </a>
                </div>
              )}
            </div>

            {/* Conversation Timeline */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Conversation History ({ticketMessages.length})
              </div>

              {isDetailLoading ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-slate-400" />
                  Loading conversation...
                </div>
              ) : ticketMessages.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-100">
                  No replies yet. Super Admin support staff will review and respond shortly.
                </div>
              ) : (
                ticketMessages.map((msg) => {
                  const isSuperAdmin = msg.authorRole === "SUPER_ADMIN" || msg.authorRole === "SUPPORT_STAFF";
                  return (
                    <div
                      key={msg.id}
                      className={`p-3.5 rounded-lg border text-xs ${
                        isSuperAdmin
                          ? "bg-blue-50/70 border-blue-200 ml-4"
                          : "bg-white border-slate-200 mr-4"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 text-[11px]">
                        <span className="font-bold flex items-center gap-1.5">
                          {isSuperAdmin ? (
                            <>
                              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                              <span className="text-blue-900">{msg.authorName}</span>
                              <Badge className="text-[9px] bg-blue-600 text-white py-0 px-1">Platform Support</Badge>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                              <span className="text-slate-800">{msg.authorName}</span>
                              <Badge variant="outline" className="text-[9px] py-0 px-1">Institution Admin</Badge>
                            </>
                          )}
                        </span>
                        <span className="text-slate-400">
                          {new Date(msg.createdAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed mt-1.5">{msg.body}</p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply Input Box */}
            {selectedTicket.status !== "CLOSED" ? (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-700">Reply to Super Admin</label>
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Provide additional details or respond to support team..."
                    className="flex-1 text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Button
                    onClick={handleSendReply}
                    disabled={replySubmitting || !replyText.trim()}
                    className="self-end bg-[var(--admin-sidebar-bg,#123B5A)] hover:bg-[#16466C] text-white text-xs px-4"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {replySubmitting ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-100 text-slate-600 text-xs rounded-lg text-center">
                This ticket is currently closed. If you require further assistance on this issue, please reopen it.
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Reopen Reason Prompt Modal */}
      <Modal isOpen={isReopenPromptOpen} onClose={() => setIsReopenPromptOpen(false)} title="Reopen Support Ticket" maxWidth="md">
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Please explain why this issue needs to be reopened so the support team can assist you further:
          </p>
          <textarea
            rows={3}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="e.g., The timetable period collision still occurs after saving..."
            className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white text-slate-800"
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button size="sm" variant="outline" onClick={() => setIsReopenPromptOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleReopenTicket}
              disabled={actionSubmitting || !reopenReason.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
            >
              Confirm Reopen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
