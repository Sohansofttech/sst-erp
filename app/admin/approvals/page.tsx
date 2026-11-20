"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  ShieldCheck,
  MessageSquare,
  Search,
  Filter,
  Send,
  UserCheck,
  AlertCircle,
  ChevronRight,
  Layers,
} from "lucide-react";

export interface QueryRecord {
  id: string;
  institutionId: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  role: "STUDENT" | "FACULTY" | "PARENT";
  requestType: string;
  subject: string;
  category: string;
  description: string;
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  priority: string;
  studentId?: string;
  studentName?: string;
  adminRemarks?: string;
  reviewedByUserId?: string;
  reviewedByName?: string;
  assignedToUserId?: string;
  assignedToName?: string;
  history: Array<{
    action: string;
    actor: string;
    status?: string;
    remarks?: string;
    assignedToName?: string;
    timestamp: string;
  }>;
  createdAt: string;
  reviewedAt?: string;
}

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState<"QUERIES" | "APPROVALS">("QUERIES");

  // --- Administrative Approvals State ---
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    id: string;
    status: "APPROVED" | "REJECTED";
    remarks: string;
  }>({
    isOpen: false,
    id: "",
    status: "APPROVED",
    remarks: "",
  });

  // --- Campus Queries State ---
  const [queries, setQueries] = useState<QueryRecord[]>([]);
  const [loadingQueries, setLoadingQueries] = useState(true);
  const [queryRoleFilter, setQueryRoleFilter] = useState<string>("ALL");
  const [queryStatusFilter, setQueryStatusFilter] = useState<string>("ALL");
  const [queryCategoryFilter, setQueryCategoryFilter] = useState<string>("ALL");
  const [querySearch, setQuerySearch] = useState<string>("");

  // Staff members for query assignment
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; email: string }>>([]);

  // Query Response Modal State
  const [selectedQuery, setSelectedQuery] = useState<QueryRecord | null>(null);
  const [queryResponseModalOpen, setQueryResponseModalOpen] = useState(false);
  const [responseStatus, setResponseStatus] = useState<"PENDING" | "IN_PROGRESS" | "RESOLVED" | "REJECTED">("RESOLVED");
  const [responseRemarks, setResponseRemarks] = useState("");
  const [assignedStaffId, setAssignedStaffId] = useState("");
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Fetch approvals
  const fetchRequests = async () => {
    try {
      setLoadingApprovals(true);
      const res = await fetch("/api/admin/approvals");
      const json = await res.json();
      if (json.success && json.data) {
        setRequests(json.data);
      }
    } catch (err) {
      console.warn("Failed to load approval requests:", err);
    } finally {
      setLoadingApprovals(false);
    }
  };

  // Fetch queries
  const fetchQueries = async () => {
    try {
      setLoadingQueries(true);
      const params = new URLSearchParams();
      if (queryRoleFilter !== "ALL") params.append("role", queryRoleFilter);
      if (queryStatusFilter !== "ALL") params.append("status", queryStatusFilter);
      if (queryCategoryFilter !== "ALL") params.append("category", queryCategoryFilter);
      if (querySearch.trim()) params.append("q", querySearch.trim());

      const res = await fetch(`/api/admin/queries?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setQueries(json.data);
      }
    } catch (err) {
      console.warn("Failed to load queries:", err);
    } finally {
      setLoadingQueries(false);
    }
  };

  // Fetch staff list for assignment
  const fetchStaff = async () => {
    try {
      const res = await fetch("/api/admin/email?action=recipients&role=TEACHER");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setStaffList(json.data.map((r: any) => ({ id: r.id, name: r.name, email: r.email })));
      }
    } catch (err) {
      console.warn("Failed to load staff list:", err);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchStaff();
  }, []);

  useEffect(() => {
    fetchQueries();
  }, [queryRoleFilter, queryStatusFilter, queryCategoryFilter, querySearch]);

  // Handle approval decision
  const handleDecision = async (id: string, status: "APPROVED" | "REJECTED", remarks?: string) => {
    try {
      const res = await fetch("/api/admin/approvals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, adminRemarks: remarks }),
      });
      const data = await res.json();
      if (data.success) {
        setDecisionModal({ isOpen: false, id: "", status: "APPROVED", remarks: "" });
        fetchRequests();
      } else {
        alert(data.error || "Decision processing failed.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Open Query Response Modal
  const openQueryResponse = (query: QueryRecord) => {
    setSelectedQuery(query);
    setResponseStatus(query.status === "PENDING" ? "RESOLVED" : query.status);
    setResponseRemarks(query.adminRemarks || "");
    setAssignedStaffId(query.assignedToUserId || "");
    setActionSuccessMsg(null);
    setQueryResponseModalOpen(true);
  };

  // Submit Query Response
  const handleSubmitQueryResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuery) return;
    if (!responseRemarks.trim()) {
      alert("Please provide response remarks.");
      return;
    }

    try {
      setSubmittingResponse(true);
      const selectedStaff = staffList.find((s) => s.id === assignedStaffId);

      const res = await fetch("/api/admin/queries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedQuery.id,
          status: responseStatus,
          adminRemarks: responseRemarks.trim(),
          assignedToUserId: assignedStaffId || undefined,
          assignedToName: selectedStaff?.name || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setActionSuccessMsg(`Status updated to ${responseStatus} and in-app notification delivered.`);
        setTimeout(() => {
          setQueryResponseModalOpen(false);
          setSelectedQuery(null);
          fetchQueries();
        }, 1200);
      } else {
        alert(json.error || "Failed to update query.");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingResponse(false);
    }
  };

  const filteredRequests = requests.filter(
    (r) => statusFilter === "ALL" || r.status === statusFilter
  );

  const pendingQueryCount = queries.filter((q) => q.status === "PENDING").length;
  const inProgressQueryCount = queries.filter((q) => q.status === "IN_PROGRESS").length;
  const resolvedQueryCount = queries.filter((q) => q.status === "RESOLVED").length;
  const pendingApprovalCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Approvals & Campus Queries
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Resolve student, faculty, and parent inquiries, assign departmental staff, and adjudicate official campus leave requests.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
          <button
            onClick={() => setActiveTab("QUERIES")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
              activeTab === "QUERIES"
                ? "bg-[#123B5A] text-white shadow-xs"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Campus Queries & Inquiries
            {pendingQueryCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#F5A000] text-white font-mono">
                {pendingQueryCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("APPROVALS")}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
              activeTab === "APPROVALS"
                ? "bg-[#123B5A] text-white shadow-xs"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Administrative Approvals
            {pendingApprovalCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#F5A000] text-white font-mono">
                {pendingApprovalCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: CAMPUS QUERIES & INQUIRIES (STUDENT / FACULTY / PARENT)
      ========================================================================= */}
      {activeTab === "QUERIES" && (
        <div className="space-y-6">
          {/* Query KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-[#E2E8F0]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase">Pending Review</p>
                  <h3 className="text-2xl font-bold text-[#F5A000] mt-1">
                    {pendingQueryCount} Pending
                  </h3>
                  <p className="text-[11px] text-[#F5A000] mt-0.5 font-medium">Awaiting Institution Action</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#F5A000]">
                  <Clock className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E2E8F0]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase">In Progress</p>
                  <h3 className="text-2xl font-bold text-[#2563EB] mt-1">
                    {inProgressQueryCount} Assigned
                  </h3>
                  <p className="text-[11px] text-[#2563EB] mt-0.5 font-medium">Assigned to Staff</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#2563EB]">
                  <UserCheck className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E2E8F0]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase">Resolved / Closed</p>
                  <h3 className="text-2xl font-bold text-[#16A34A] mt-1">
                    {resolvedQueryCount} Resolved
                  </h3>
                  <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">Response Dispatched</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A]">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E2E8F0]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase">Total Campus Queries</p>
                  <h3 className="text-2xl font-bold text-[#123B5A] mt-1">{queries.length}</h3>
                  <p className="text-[11px] text-[#123B5A] mt-0.5 font-medium">All User Roles</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
                  <Layers className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filtering Bar */}
          <Card className="border-[#E2E8F0] p-4">
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
              {/* Role Filters */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-[#475569] uppercase mr-1">Role:</span>
                {["ALL", "STUDENT", "FACULTY", "PARENT"].map((role) => (
                  <button
                    key={role}
                    onClick={() => setQueryRoleFilter(role)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      queryRoleFilter === role
                        ? "bg-[#123B5A] text-white shadow-xs"
                        : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                    }`}
                  >
                    {role === "ALL"
                      ? "All Roles"
                      : role === "STUDENT"
                      ? "Students"
                      : role === "FACULTY"
                      ? "Faculty"
                      : "Guardians"}
                  </button>
                ))}
              </div>

              {/* Status Filters */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-[#475569] uppercase mr-1">Status:</span>
                {["ALL", "PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setQueryStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      queryStatusFilter === st
                        ? "bg-[#F5A000] text-white shadow-xs"
                        : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                    }`}
                  >
                    {st === "ALL" ? "All Status" : st.replace("_", " ")}
                  </button>
                ))}
              </div>

              {/* Search & Category Filter */}
              <div className="flex items-center gap-2 w-full lg:w-auto">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search query, name, email..."
                    value={querySearch}
                    onChange={(e) => setQuerySearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#CBD5E1] focus:outline-none focus:ring-1 focus:ring-[#123B5A]"
                  />
                </div>
                <select
                  value={queryCategoryFilter}
                  onChange={(e) => setQueryCategoryFilter(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[#334155] cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  <option value="ACADEMIC">Academic</option>
                  <option value="EXAMINATION">Examination</option>
                  <option value="FEE">Fee Query</option>
                  <option value="HOSTEL">Hostel & Facilities</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Queries Table */}
          <Card className="border-[#E2E8F0]">
            <CardHeader className="p-4 border-b border-[#E2E8F0] flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-[#1E293B]">
                Campus Inquiries & Query Queue ({queries.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC]">
                    <TableHead className="text-xs font-bold text-[#1E293B]">Requester</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Category & Subject</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Linked Student</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Assigned Staff</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Status</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Submitted</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingQueries ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-sm text-[#64748B]">
                        Loading institutional queries...
                      </TableCell>
                    </TableRow>
                  ) : queries.length === 0 ? (
                    <TableEmpty colSpan={7} message="No queries found matching the selected filters." />
                  ) : (
                    queries.map((q) => (
                      <TableRow key={q.id} className="hover:bg-[#F8FAFC]">
                        <TableCell className="text-xs font-semibold text-[#1E293B]">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-[#123B5A]" />
                            <span>{q.userFullName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                                q.role === "STUDENT"
                                  ? "bg-[#DBEAFE] text-[#1E40AF]"
                                  : q.role === "FACULTY"
                                  ? "bg-[#FEF3C7] text-[#B45309]"
                                  : "bg-[#DCFCE7] text-[#15803D]"
                              }`}
                            >
                              {q.role}
                            </span>
                            <span className="text-[10px] text-[#64748B] font-mono truncate max-w-[140px]">
                              {q.userEmail}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs max-w-xs">
                          <span className="font-bold text-[#1E293B] block truncate">{q.subject}</span>
                          <span className="text-[11px] text-[#64748B] line-clamp-1">{q.description}</span>
                          <span className="text-[10px] font-medium text-[#123B5A] uppercase tracking-wider block mt-0.5">
                            {q.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-[#475569]">
                          {q.studentName ? (
                            <div>
                              <span className="font-semibold text-[#1E293B] block">{q.studentName}</span>
                              <span className="text-[10px] text-[#64748B]">Linked Ward</span>
                            </div>
                          ) : (
                            <span className="text-[#94A3B8] text-[11px]">N/A (Self)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-[#475569]">
                          {q.assignedToName ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#1E293B]">
                              <UserCheck className="w-3 h-3 text-[#2563EB]" />
                              {q.assignedToName}
                            </span>
                          ) : (
                            <span className="text-[#94A3B8] text-[11px] italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              q.status === "RESOLVED"
                                ? "bg-[#DCFCE7] text-[#15803D]"
                                : q.status === "IN_PROGRESS"
                                ? "bg-[#DBEAFE] text-[#1E40AF]"
                                : q.status === "REJECTED"
                                ? "bg-[#FEE2E2] text-[#B91C1C]"
                                : "bg-[#FEF3C7] text-[#B45309]"
                            }`}
                          >
                            {q.status.replace("_", " ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B]">
                          {new Date(q.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="primary"
                            size="sm"
                            className="text-xs"
                            onClick={() => openQueryResponse(q)}
                          >
                            Review & Respond
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =========================================================================
          TAB 2: ADMINISTRATIVE APPROVALS (LEAVE, ELECTIVES, CORRECTIONS)
      ========================================================================= */}
      {activeTab === "APPROVALS" && (
        <div className="space-y-6">
          {/* Approvals KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-[#E2E8F0]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase">Pending Decisions</p>
                  <h3 className="text-2xl font-bold text-[#F5A000] mt-1">
                    {requests.filter((r) => r.status === "PENDING").length} Pending
                  </h3>
                  <p className="text-[11px] text-[#F5A000] mt-0.5 font-medium">Awaiting Adjudication</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#F5A000]">
                  <Clock className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E2E8F0]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase">Approved Requests</p>
                  <h3 className="text-2xl font-bold text-[#16A34A] mt-1">
                    {requests.filter((r) => r.status === "APPROVED").length} Granted
                  </h3>
                  <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">Clearance Granted</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A]">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E2E8F0]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase">Rejected Requests</p>
                  <h3 className="text-2xl font-bold text-[#DC2626] mt-1">
                    {requests.filter((r) => r.status === "REJECTED").length} Denied
                  </h3>
                  <p className="text-[11px] text-[#DC2626] mt-0.5 font-medium">Adjudicated & Closed</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#DC2626]/10 flex items-center justify-center text-[#DC2626]">
                  <XCircle className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#E2E8F0]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#64748B] uppercase">SLA Compliance</p>
                  <h3 className="text-2xl font-bold text-[#123B5A] mt-1">100%</h3>
                  <p className="text-[11px] text-[#123B5A] mt-0.5 font-medium">Timely Processing</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            {["ALL", "PENDING", "APPROVED", "REJECTED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  statusFilter === st
                    ? "bg-[#F5A000] text-white"
                    : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <Card className="border-[#E2E8F0]">
            <CardHeader className="p-4 border-b border-[#E2E8F0]">
              <CardTitle className="text-sm font-bold text-[#1E293B]">
                Approval Queue ({filteredRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC]">
                    <TableHead className="text-xs font-bold text-[#1E293B]">Applicant</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Request Type</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Details / Subject</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Submitted Date</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B]">Status</TableHead>
                    <TableHead className="text-xs font-bold text-[#1E293B] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingApprovals ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-sm text-[#64748B]">
                        Loading requests from database...
                      </TableCell>
                    </TableRow>
                  ) : filteredRequests.length === 0 ? (
                    <TableEmpty colSpan={6} message="No pending or historical requests found in the approval queue." />
                  ) : (
                    filteredRequests.map((req) => (
                      <TableRow key={req.id} className="hover:bg-[#F8FAFC]">
                        <TableCell className="text-xs font-semibold text-[#1E293B]">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-[#F5A000]" />
                            <span>{req.user?.fullName || req.user?.name || req.user?.email}</span>
                          </div>
                          <span className="text-[10px] text-[#64748B] block uppercase">{req.user?.role}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="navy">{req.requestType}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B] max-w-xs">
                          <span className="font-semibold text-[#1E293B] block">{req.description || req.title}</span>
                          {req.adminRemarks && (
                            <span className="text-[11px] text-[#14B8A6] block mt-0.5">
                              Remarks: {req.adminRemarks}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B]">
                          {new Date(req.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              req.status === "APPROVED"
                                ? "success"
                                : req.status === "REJECTED"
                                ? "destructive"
                                : "warning"
                            }
                          >
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {req.status === "PENDING" ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="primary"
                                size="sm"
                                className="text-xs"
                                onClick={() =>
                                  setDecisionModal({
                                    isOpen: true,
                                    id: req.id,
                                    status: "APPROVED",
                                    remarks: "Approved by administration as per policy.",
                                  })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs text-[#DC2626] border-[#DC2626]/30"
                                onClick={() =>
                                  setDecisionModal({
                                    isOpen: true,
                                    id: req.id,
                                    status: "REJECTED",
                                    remarks: "Documentation incomplete / criteria not met.",
                                  })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-[#94A3B8]">Reviewed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: QUERY REVIEW, ASSIGNMENT & RESPONSE MODAL
      ========================================================================= */}
      {selectedQuery && (
        <Modal
          isOpen={queryResponseModalOpen}
          onClose={() => {
            setQueryResponseModalOpen(false);
            setSelectedQuery(null);
          }}
          title="Review & Respond to Campus Query"
        >
          <form onSubmit={handleSubmitQueryResponse} className="space-y-4">
            {actionSuccessMsg && (
              <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] rounded-xl text-xs text-[#15803D] flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{actionSuccessMsg}</span>
              </div>
            )}

            {/* Query Summary Box */}
            <div className="p-4 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                <span className="text-xs font-bold uppercase tracking-wider text-[#123B5A] flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {selectedQuery.category} &bull; {selectedQuery.role} QUERY
                </span>
                <span className="text-[11px] text-[#64748B]">
                  {new Date(selectedQuery.createdAt).toLocaleString()}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-bold text-[#0F172A]">{selectedQuery.subject}</h4>
                <p className="text-xs text-[#475569] mt-1 whitespace-pre-wrap leading-relaxed">
                  {selectedQuery.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#E2E8F0]">
                <div>
                  <span className="text-[#64748B] block text-[10px]">Submitted By:</span>
                  <span className="font-semibold text-[#1E293B]">{selectedQuery.userFullName}</span>
                  <span className="text-[10px] text-[#64748B] font-mono block">{selectedQuery.userEmail}</span>
                </div>
                {selectedQuery.studentName && (
                  <div>
                    <span className="text-[#64748B] block text-[10px]">Linked Student (Ward):</span>
                    <span className="font-semibold text-[#1E293B]">{selectedQuery.studentName}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Resolution History Log */}
            {selectedQuery.history && selectedQuery.history.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#334155] uppercase tracking-wider block">
                  Activity & Resolution History
                </label>
                <div className="max-h-28 overflow-y-auto space-y-1.5 p-2 bg-[#F1F5F9] rounded-xl text-xs border border-[#E2E8F0]">
                  {selectedQuery.history.map((h, i) => (
                    <div key={i} className="flex items-start justify-between text-[11px] text-[#475569] pb-1 border-b border-[#E2E8F0] last:border-0 last:pb-0">
                      <div>
                        <strong className="text-[#1E293B]">{h.actor}</strong> &bull; {h.remarks || h.action}
                        {h.assignedToName && <span className="text-[#2563EB]"> (Assigned: {h.assignedToName})</span>}
                      </div>
                      <span className="text-[10px] text-[#94A3B8] shrink-0 ml-2">
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status & Assignment Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                  Query Status
                </label>
                <select
                  value={responseStatus}
                  onChange={(e) => setResponseStatus(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-[#1E293B] font-medium"
                >
                  <option value="PENDING">Pending Review</option>
                  <option value="IN_PROGRESS">In Progress (Staff Assigned)</option>
                  <option value="RESOLVED">Resolved / Solution Provided</option>
                  <option value="REJECTED">Rejected / Closed</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                  Assign to Department Faculty / Staff
                </label>
                <select
                  value={assignedStaffId}
                  onChange={(e) => {
                    setAssignedStaffId(e.target.value);
                    if (e.target.value && responseStatus === "PENDING") {
                      setResponseStatus("IN_PROGRESS");
                    }
                  }}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-[#1E293B]"
                >
                  <option value="">Leave Unassigned (Admin Owned)</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Official Administrator Response Remarks */}
            <div>
              <label className="text-xs font-semibold text-[#1E293B] block mb-1">
                Official Administration Remarks / Response to Requester
              </label>
              <textarea
                required
                rows={3}
                value={responseRemarks}
                onChange={(e) => setResponseRemarks(e.target.value)}
                placeholder="Detail the resolution, institutional directive, or instructions for the student/faculty/guardian..."
                className="w-full text-xs px-3 py-2 rounded-lg border border-[#CBD5E1] focus:outline-none focus:ring-1 focus:ring-[#123B5A] leading-relaxed"
              />
              <p className="text-[11px] text-[#64748B] mt-1">
                This response will be recorded permanently in the query log and will dispatch an instant in-app notification to the user.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQueryResponseModalOpen(false);
                  setSelectedQuery(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submittingResponse || !responseRemarks.trim()}
              >
                {submittingResponse ? "Saving Response..." : "Save Response & Notify"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =========================================================================
          MODAL 2: APPROVAL DECISION REMARKS MODAL
      ========================================================================= */}
      <Modal
        isOpen={decisionModal.isOpen}
        onClose={() => setDecisionModal({ ...decisionModal, isOpen: false })}
        title={`${decisionModal.status === "APPROVED" ? "Approve" : "Reject"} Workflow Request`}
      >
        <div className="space-y-4">
          <p className="text-xs text-[#64748B]">
            You are about to record a formal decision of{" "}
            <strong className={decisionModal.status === "APPROVED" ? "text-[#16A34A]" : "text-[#DC2626]"}>
              {decisionModal.status}
            </strong>{" "}
            for this request. Provide administrator remarks below:
          </p>

          <div>
            <label className="text-xs font-semibold text-[#1E293B] block mb-1">
              Administrator Remarks / Decision Notes
            </label>
            <Input
              value={decisionModal.remarks}
              onChange={(e) => setDecisionModal({ ...decisionModal, remarks: e.target.value })}
              placeholder="e.g. Approved as per academic council guidelines."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDecisionModal({ ...decisionModal, isOpen: false })}
            >
              Cancel
            </Button>
            <Button
              variant={decisionModal.status === "APPROVED" ? "primary" : "destructive"}
              onClick={() =>
                handleDecision(decisionModal.id, decisionModal.status, decisionModal.remarks)
              }
            >
              Confirm {decisionModal.status}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}