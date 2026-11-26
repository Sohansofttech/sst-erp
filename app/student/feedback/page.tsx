"use client";

import React, { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { FormInput } from "@/components/shared/FormInput";
import { Table } from "@/components/shared/Table";
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  UserCheck,
  Calendar,
  Layers,
} from "lucide-react";

export default function StudentFeedbackPage() {
  const [queryList, setQueryList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [category, setCategory] = useState("ACADEMIC");
  const [priority, setPriority] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchQueries = async () => {
    try {
      setLoading(true);
      // Fetch both endpoints concurrently to ensure complete sync between feedback and approval_requests
      const [qRes, fbRes] = await Promise.allSettled([
        fetch("/api/student/queries", { credentials: "include" }),
        fetch("/api/student/feedback", { credentials: "include" }),
      ]);

      const items: any[] = [];
      if (qRes.status === "fulfilled") {
        try {
          const json = await qRes.value.json();
          if (json.success && Array.isArray(json.data)) {
            items.push(...json.data);
          }
        } catch {}
      }

      if (fbRes.status === "fulfilled") {
        try {
          const fbJson = await fbRes.value.json();
          if (fbJson.success && Array.isArray(fbJson.data)) {
            for (const fb of fbJson.data) {
              const existingIdx = items.findIndex(
                (it) => it.id === fb.id || (it.subject === fb.subject && it.category === fb.category)
              );
              if (existingIdx >= 0) {
                // If feedback has admin response or resolved status, merge it
                if (fb.status !== "PENDING" || fb.response) {
                  items[existingIdx] = {
                    ...items[existingIdx],
                    status: fb.status || items[existingIdx].status,
                    adminRemarks: fb.response || items[existingIdx].adminRemarks,
                    response: fb.response || items[existingIdx].response,
                    respondedAt: fb.respondedAt || items[existingIdx].respondedAt,
                  };
                }
              } else {
                items.push({
                  id: fb.id,
                  subject: fb.subject,
                  category: fb.category,
                  description: fb.message,
                  status: fb.status || "PENDING",
                  adminRemarks: fb.response,
                  response: fb.response,
                  createdAt: fb.submittedAt || fb.createdAt,
                  respondedAt: fb.respondedAt,
                });
              }
            }
          }
        } catch {}
      }

      setQueryList(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueries();
    const handleChildChanged = () => {
      fetchQueries();
    };
    window.addEventListener("activeChildChanged", handleChildChanged);
    return () => {
      window.removeEventListener("activeChildChanged", handleChildChanged);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/student/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          description: description.trim(),
          message: description.trim(),
          priority,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("Query submitted successfully to campus administration. In-app tracking active.");
        setSubject("");
        setDescription("");
        fetchQueries();
      } else {
        setErrorMsg(json.error || "Failed to submit query.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error submitting query.");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RESOLVED":
        return <Badge variant="success" size="sm">Resolved</Badge>;
      case "IN_PROGRESS":
        return <Badge variant="brand" size="sm">In Progress</Badge>;
      case "REJECTED":
        return <Badge variant="error" size="sm">Closed</Badge>;
      default:
        return <Badge variant="warning" size="sm">Pending Review</Badge>;
    }
  };

  return (
    <PortalLayout portalType="STUDENT" pageTitle="Student Queries & Grievance Redressal">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Column */}
        <div>
          <Card
            title="Submit Institutional Query"
            subtitle="Academics, course feedback, infrastructure, hostel, or fee questions"
          >
            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="ACADEMIC">Academic & Classes</option>
                    <option value="EXAMINATION">Examinations & Marks</option>
                    <option value="INFRASTRUCTURE">Campus Infrastructure</option>
                    <option value="HOSTEL">Hostel & Dining</option>
                    <option value="FEE">Fee Clarification</option>
                    <option value="GENERAL">General Inquiries</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <FormInput
                label="Query Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Clarification on Semester 4 Elective Form"
                required
              />

              <div>
                <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                  Query Details / Grievance Description
                </label>
                <textarea
                  className="w-full px-3.5 py-2 text-xs border border-[#E2E8F0] rounded-lg leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#123B5A]"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide complete details, dates, and question for administrative review..."
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                isLoading={submitting}
                icon={<Send className="w-4 h-4" />}
              >
                Submit Query
              </Button>
            </form>
          </Card>
        </div>

        {/* Responses Column */}
        <div className="lg:col-span-2">
          <Card
            title="My Submitted Queries & Status"
            subtitle="Track live status and official responses from campus administration"
          >
            {loading ? (
              <p className="text-xs text-[#64748B]">Loading query history...</p>
            ) : (
              <Table
                columns={[
                  {
                    header: "Date",
                    cell: (item: any) => new Date(item.createdAt).toLocaleDateString(),
                  },
                  {
                    header: "Category",
                    cell: (item: any) => (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#E2E8F0] text-[#334155]">
                        {item.category}
                      </span>
                    ),
                  },
                  {
                    header: "Subject & Details",
                    cell: (item: any) => (
                      <div className="max-w-xs">
                        <span className="font-bold text-[#1E293B] block truncate">{item.subject}</span>
                        <span className="text-xs text-[#64748B] line-clamp-1">{item.description}</span>
                        {item.assignedToName && (
                          <span className="text-[10px] text-[#2563EB] font-medium flex items-center gap-1 mt-0.5">
                            <UserCheck className="w-3 h-3" /> Assigned: {item.assignedToName}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: "Status",
                    cell: (item: any) => getStatusBadge(item.status),
                  },
                  {
                    header: "Administration Response",
                    cell: (item: any) => {
                      const responseText = item.response || item.adminRemarks;
                      return responseText ? (
                        <div
                          className={`p-2.5 rounded-lg border text-xs ${
                            item.status === "RESOLVED"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                              : item.status === "IN_PROGRESS"
                              ? "bg-blue-50 border-blue-200 text-blue-950"
                              : item.status === "REJECTED"
                              ? "bg-rose-50 border-rose-200 text-rose-950"
                              : "bg-slate-50 border-slate-200 text-slate-950"
                          }`}
                        >
                          <p
                            className={`font-semibold text-[11px] mb-0.5 ${
                              item.status === "RESOLVED"
                                ? "text-emerald-800"
                                : item.status === "IN_PROGRESS"
                                ? "text-blue-800"
                                : item.status === "REJECTED"
                                ? "text-rose-800"
                                : "text-slate-800"
                            }`}
                          >
                            {item.status === "RESOLVED"
                              ? "Official Resolution Remark"
                              : item.status === "IN_PROGRESS"
                              ? "Official Department Note"
                              : item.status === "REJECTED"
                              ? "Official Decision Remark (Rejected)"
                              : "Department Response"}
                            {item.respondedAt && (
                              <span className="font-normal opacity-80 ml-1.5">
                                ({new Date(item.respondedAt).toLocaleDateString()})
                              </span>
                            )}
                          </p>
                          <p className="leading-relaxed whitespace-pre-wrap">{responseText}</p>
                          {item.reviewedByName && (
                            <span className="text-[10px] text-emerald-700 block font-medium mt-1">
                              Reviewed by: {item.reviewedByName}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[#64748B] italic flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#F5A000]" /> Awaiting Admin Review
                        </span>
                      );
                    },
                  },
                ]}
                data={queryList}
                emptyMessage="No queries submitted yet. Use the form on the left to submit an institutional inquiry."
              />
            )}
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}