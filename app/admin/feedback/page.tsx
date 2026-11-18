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
  HeartHandshake,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Send,
  Building,
  User,
  AlertCircle,
  ArrowRight,
  Filter,
} from "lucide-react";

interface StudentFeedbackItem {
  id: string;
  institutionId: string;
  studentId: string;
  category: string;
  subject: string;
  message: string;
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "REJECTED" | string;
  response: string | null;
  submittedAt: string;
  respondedAt: string | null;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string | null;
    rollNumber: string;
    admissionNumber: string;
    email: string | null;
    phone: string | null;
    currentDepartment?: {
      id: string;
      name: string;
      code: string;
    } | null;
    currentCourse?: {
      id: string;
      name: string;
      code: string;
    } | null;
    user?: {
      name: string | null;
      email: string | null;
      phone: string | null;
    } | null;
  };
}

export default function AdminFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<StudentFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Modal / Review state
  const [selectedItem, setSelectedItem] = useState<StudentFeedbackItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("RESOLVED");
  const [officialResponse, setOfficialResponse] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/feedback", { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setFeedbacks(json.data);
      }
    } catch (err) {
      console.error("Failed to load student feedback:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleOpenReview = (item: StudentFeedbackItem) => {
    setSelectedItem(item);
    setNewStatus(item.status || "RESOLVED");
    setOfficialResponse(item.response || "");
    setSaveSuccess(false);
    setIsModalOpen(true);
  };

  const handleSaveResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    try {
      setIsSaving(true);
      const res = await fetch("/api/admin/feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: selectedItem.id,
          status: newStatus,
          response: officialResponse.trim(),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSaveSuccess(true);
        // Refresh local list
        await fetchFeedbacks();
        setTimeout(() => {
          setIsModalOpen(false);
          setSelectedItem(null);
          setSaveSuccess(false);
        }, 600);
      } else {
        alert(json.error || "Failed to update feedback status.");
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Network error while saving response.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredFeedbacks = feedbacks.filter((item) => {
    // Status Filter
    if (statusFilter !== "ALL" && item.status !== statusFilter) return false;

    // Category Filter
    if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;

    // Search Filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const studentName = (item.student?.fullName || `${item.student?.firstName || ""} ${item.student?.lastName || ""}`).toLowerCase();
      const roll = (item.student?.rollNumber || "").toLowerCase();
      const adm = (item.student?.admissionNumber || "").toLowerCase();
      const dept = (item.student?.currentDepartment?.name || "").toLowerCase();
      const subj = (item.subject || "").toLowerCase();
      const msg = (item.message || "").toLowerCase();

      return (
        studentName.includes(q) ||
        roll.includes(q) ||
        adm.includes(q) ||
        dept.includes(q) ||
        subj.includes(q) ||
        msg.includes(q)
      );
    }

    return true;
  });

  const pendingCount = feedbacks.filter((f) => f.status === "PENDING").length;
  const inProgressCount = feedbacks.filter((f) => f.status === "IN_PROGRESS").length;
  const resolvedCount = feedbacks.filter((f) => f.status === "RESOLVED").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight flex items-center gap-2.5">
            <HeartHandshake className="w-7 h-7 text-[#F5A000]" />
            Student Grievances & Feedback
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Review submitted student grievances, track departmental resolutions, and dispatch official replies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFeedbacks}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0] shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Total Grievances</p>
              <h3 className="text-2xl font-bold text-[#1E293B] mt-1">
                {feedbacks.length}
              </h3>
              <p className="text-[11px] text-[#64748B] mt-0.5 font-medium">All logged submissions</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
              <MessageSquare className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Pending Review</p>
              <h3 className="text-2xl font-bold text-[#D97706] mt-1">
                {pendingCount}
              </h3>
              <p className="text-[11px] text-[#D97706] mt-0.5 font-medium">Requires action</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#D97706]">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">In Progress</p>
              <h3 className="text-2xl font-bold text-[#2563EB] mt-1">
                {inProgressCount}
              </h3>
              <p className="text-[11px] text-[#2563EB] mt-0.5 font-medium">Under active review</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#DBEAFE] flex items-center justify-center text-[#2563EB]">
              <AlertCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Resolved</p>
              <h3 className="text-2xl font-bold text-[#16A34A] mt-1">
                {resolvedCount}
              </h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">Resolution dispatched</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#DCFCE7] flex items-center justify-center text-[#16A34A]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card className="border-[#E2E8F0] shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#94A3B8]" />
              <Input
                placeholder="Search student, roll number, department, subject..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#64748B] flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Category:
              </span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg bg-white font-medium text-[#1E293B]"
              >
                <option value="ALL">All Categories</option>
                <option value="ACADEMIC">Academic / Curriculum</option>
                <option value="INFRASTRUCTURE">Campus Infrastructure & Wi-Fi</option>
                <option value="HOSTEL">Hostel & Dining Facility</option>
                <option value="GENERAL">General Suggestion</option>
              </select>
            </div>
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
            <span className="text-xs font-semibold text-[#64748B] mr-2">Status:</span>
            {["ALL", "PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  statusFilter === st
                    ? "bg-[#123B5A] text-white"
                    : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                }`}
              >
                {st.replace("_", " ")}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Feedback Records Table */}
      <Card className="border-[#E2E8F0] shadow-xs">
        <CardHeader className="py-3 px-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center justify-between">
            <span>Student Submissions ({filteredFeedbacks.length})</span>
            <span className="text-xs font-normal text-[#64748B]">
              Showing all recorded student grievances
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead className="w-[200px]">Student Details</TableHead>
                <TableHead className="w-[140px]">Category</TableHead>
                <TableHead>Grievance & Details</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[240px]">Department Response</TableHead>
                <TableHead className="w-[110px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-xs text-[#64748B]">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#F5A000]" />
                      <span>Loading student grievances...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredFeedbacks.length === 0 ? (
                <TableEmpty colSpan={7} message="No student grievances found matching current filters." />
              ) : (
                filteredFeedbacks.map((item) => {
                  const studentName =
                    item.student?.fullName ||
                    [item.student?.firstName, item.student?.lastName].filter(Boolean).join(" ") ||
                    "Student";
                  const rollNo = item.student?.rollNumber || "N/A";
                  const admNo = item.student?.admissionNumber || "";
                  const deptName = item.student?.currentDepartment?.name || item.student?.currentDepartment?.code;

                  return (
                    <TableRow key={item.id} className="hover:bg-[#F8FAFC]/80 transition-colors">
                      {/* Date */}
                      <TableCell className="text-xs text-[#64748B] whitespace-nowrap font-medium">
                        {new Date(item.submittedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>

                      {/* Student Details */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <span className="font-bold text-[#1E293B] block text-xs">
                            {studentName}
                          </span>
                          <span className="text-[11px] text-[#64748B] block font-mono">
                            Roll: {rollNo} {admNo ? `| Adm: ${admNo}` : ""}
                          </span>
                          {deptName && (
                            <span className="inline-block text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                              {deptName}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <Badge variant="brand" size="sm">
                          {item.category}
                        </Badge>
                      </TableCell>

                      {/* Subject & Message */}
                      <TableCell>
                        <div className="space-y-1">
                          <span className="font-bold text-[#1E293B] block text-xs leading-snug">
                            {item.subject}
                          </span>
                          <p className="text-xs text-[#64748B] line-clamp-2 leading-relaxed">
                            {item.message}
                          </p>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "RESOLVED"
                              ? "success"
                              : item.status === "IN_PROGRESS"
                              ? "brand"
                              : item.status === "REJECTED"
                              ? "destructive"
                              : "warning"
                          }
                          size="sm"
                        >
                          {item.status.replace("_", " ")}
                        </Badge>
                      </TableCell>

                      {/* Department Response */}
                      <TableCell>
                        {item.response ? (
                          <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-950">
                            <p className="font-semibold text-emerald-800 text-[11px] mb-0.5 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                              Official Resolution
                            </p>
                            <p className="line-clamp-2 leading-relaxed">{item.response}</p>
                            {item.respondedAt && (
                              <span className="text-[10px] text-emerald-700/80 block mt-1">
                                {new Date(item.respondedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[#94A3B8] italic flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            Awaiting response
                          </span>
                        )}
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenReview(item)}
                          className="text-xs text-[#123B5A] border-[#123B5A]/30 hover:bg-[#123B5A]/5 font-semibold"
                        >
                          Review / Respond
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review / Respond Modal */}
      {selectedItem && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            if (!isSaving) {
              setIsModalOpen(false);
              setSelectedItem(null);
            }
          }}
          title="Review Student Grievance & Dispatch Response"
          description="Update case status and draft official administrative remarks visible to the student."
          maxWidth="xl"
          footer={
            <div className="flex items-center justify-between w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedItem(null);
                }}
                disabled={isSaving}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveResponse}
                disabled={isSaving}
                className="flex items-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Save & Dispatch Response</span>
                  </>
                )}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-1">
            {saveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                <span>Response dispatched and grievance status updated successfully.</span>
              </div>
            )}

            {/* Student & Submission Info Banner */}
            <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#123B5A]" />
                  <span className="font-bold text-xs text-[#1E293B]">
                    {selectedItem.student?.fullName ||
                      [selectedItem.student?.firstName, selectedItem.student?.lastName]
                        .filter(Boolean)
                        .join(" ") ||
                      "Student"}
                  </span>
                  <span className="text-xs text-[#64748B]">
                    ({selectedItem.student?.rollNumber || "No Roll #"})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="brand" size="sm">
                    {selectedItem.category}
                  </Badge>
                  <span className="text-xs text-[#64748B]">
                    {new Date(selectedItem.submittedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="text-xs text-[#64748B] flex flex-wrap gap-x-4 gap-y-1">
                {selectedItem.student?.admissionNumber && (
                  <span>
                    <strong>Adm ID:</strong> {selectedItem.student.admissionNumber}
                  </span>
                )}
                {selectedItem.student?.currentDepartment?.name && (
                  <span>
                    <strong>Dept:</strong> {selectedItem.student.currentDepartment.name}
                  </span>
                )}
                {selectedItem.student?.email && (
                  <span>
                    <strong>Email:</strong> {selectedItem.student.email}
                  </span>
                )}
              </div>
            </div>

            {/* Student's Grievance Details */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1E293B] block uppercase tracking-wider">
                Grievance Subject & Message
              </label>
              <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg space-y-1 shadow-2xs">
                <h4 className="font-bold text-xs text-[#1E293B]">
                  {selectedItem.subject}
                </h4>
                <p className="text-xs text-[#475569] leading-relaxed whitespace-pre-wrap">
                  {selectedItem.message}
                </p>
              </div>
            </div>

            {/* Status Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1E293B] block">
                Update Case Status
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: "PENDING", label: "Pending", color: "border-amber-400 bg-amber-50 text-amber-900" },
                  { value: "IN_PROGRESS", label: "In Progress", color: "border-blue-400 bg-blue-50 text-blue-900" },
                  { value: "RESOLVED", label: "Resolved", color: "border-emerald-400 bg-emerald-50 text-emerald-900" },
                  { value: "REJECTED", label: "Rejected", color: "border-rose-400 bg-rose-50 text-rose-900" },
                ].map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setNewStatus(s.value)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                      newStatus === s.value
                        ? `${s.color} ring-2 ring-offset-1 ring-[#123B5A]`
                        : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-slate-50"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Official Response Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1E293B] block">
                Official Department Response / Resolution Remark
              </label>
              <textarea
                rows={4}
                value={officialResponse}
                onChange={(e) => setOfficialResponse(e.target.value)}
                placeholder="Write the official administrative response. This will be visible to the student in their portal..."
                className="w-full px-3.5 py-2.5 text-xs border border-[#CBD5E1] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#123B5A] bg-white leading-relaxed"
              />
              <p className="text-[11px] text-[#64748B]">
                This response will be published to the student&apos;s Feedback & Official Responses ledger.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

