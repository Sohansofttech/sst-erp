"use client";

import React, { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { FormInput } from "@/components/shared/FormInput";
import { Table } from "@/components/shared/Table";
import { MessageSquare, Send, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export default function ParentRequestsPage() {
  const [selectedChildId, setSelectedChildId] = useState("");
  const [children, setChildren] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [requestType, setRequestType] = useState("LEAVE_APPLICATION");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("erp_active_child_id");
      if (stored) setSelectedChildId(stored);
    }
    const fetchChildren = async () => {
      try {
        const res = await fetch("/api/parent/children");
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setChildren(json.data);
          const stored = typeof window !== "undefined" ? localStorage.getItem("erp_active_child_id") : null;
          const initialId =
            stored && json.data.some((c: any) => c.student.id === stored)
              ? stored
              : json.data[0].student.id;
          setSelectedChildId(initialId);
          if (typeof window !== "undefined") {
            localStorage.setItem("erp_active_child_id", initialId);
          }
        }
      } catch (err) {
        console.error("Failed to load parent children", err);
      }
    };
    fetchChildren();

    const handleChildChanged = (e: any) => {
      if (e.detail?.childId) {
        setSelectedChildId(e.detail.childId);
      }
    };
    window.addEventListener("activeChildChanged", handleChildChanged);
    return () => window.removeEventListener("activeChildChanged", handleChildChanged);
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const url = selectedChildId
        ? `/api/parent/requests?studentId=${encodeURIComponent(selectedChildId)}`
        : "/api/parent/requests";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRequests(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [selectedChildId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessToast(null);
    setErrorToast(null);

    if (!selectedChildId) {
      setErrorToast("Please select your linked child from the selector before submitting a request.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/parent/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedChildId,
          requestType,
          title: title.trim(),
          message: message.trim(),
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessToast("Parent request submitted to institution workflow with in-app tracking.");
        setTitle("");
        setMessage("");
        setFromDate("");
        setToDate("");
        fetchRequests();
      } else {
        setErrorToast(json.error || "Failed to submit request.");
      }
    } catch (err: any) {
      setErrorToast(err.message || "Network error submitting request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalLayout
      portalType="PARENT"
      pageTitle="Permitted Institutional Requests & Inquiries"
      selectedChildId={selectedChildId}
      onSelectChild={(id) => setSelectedChildId(id)}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <Card
            title="Submit Parent Request"
            subtitle="Leave applications, warden inquiries, or administrative assistance for your linked ward"
          >
            {successToast && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                <span>{successToast}</span>
              </div>
            )}

            {errorToast && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorToast}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                  Linked Student / Ward <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedChildId}
                  onChange={(e) => {
                    setSelectedChildId(e.target.value);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("erp_active_child_id", e.target.value);
                      window.dispatchEvent(new CustomEvent("activeChildChanged", { detail: { childId: e.target.value } }));
                    }
                  }}
                  className="w-full px-3.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white font-medium"
                  required
                >
                  <option value="">-- Select Linked Child --</option>
                  {children.map((c) => (
                    <option key={c.student.id} value={c.student.id}>
                      {c.student.fullName || c.student.firstName} ({c.student.rollNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                  Request Category
                </label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                >
                  <option value="LEAVE_APPLICATION">Leave Application / Absence Notice</option>
                  <option value="HOSTEL_INQUIRY">Hostel / Residential Inquiry</option>
                  <option value="FEE_QUERY">Fee Ledger Clarification</option>
                  <option value="GENERAL_REQUEST">General Communication with Administration</option>
                </select>
              </div>

              {requestType === "LEAVE_APPLICATION" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-[#E2E8F0] rounded-lg bg-white"
                      required
                    />
                  </div>
                </div>
              )}

              <FormInput
                label="Request Subject"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Leave of absence for family wedding"
                required
              />

              <div>
                <label className="block text-[13px] font-medium text-[#1E293B] mb-1">
                  Message / Details
                </label>
                <textarea
                  className="w-full px-3.5 py-2 text-xs border border-[#E2E8F0] rounded-lg leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#123B5A]"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Detail the dates, reasons, and contact info..."
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
                Submit Request
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card
            title="My Submitted Requests & Approval Status"
            subtitle="Shared institutional request engine records"
          >
            {loading ? (
              <p className="text-xs text-[#64748B]">Loading requests...</p>
            ) : (
              <Table
                columns={[
                  {
                    header: "Submitted Date",
                    cell: (item: any) => new Date(item.createdAt).toLocaleDateString(),
                  },
                  {
                    header: "Request Title & Details",
                    cell: (item: any) => (
                      <div className="max-w-xs">
                        <span className="font-bold text-[#1E293B] block truncate">{item.title}</span>
                        <span className="text-xs text-[#64748B] line-clamp-1">{item.description || item.message}</span>
                      </div>
                    ),
                  },
                  {
                    header: "Status",
                    cell: (item: any) => {
                      const st = item.status || "PENDING";
                      return (
                        <Badge
                          variant={
                            st === "RESOLVED" || st === "APPROVED"
                              ? "success"
                              : st === "IN_PROGRESS"
                                ? "brand"
                                : st === "REJECTED"
                                  ? "error"
                                  : "warning"
                          }
                          size="sm"
                        >
                          {st.replace("_", " ")}
                        </Badge>
                      );
                    },
                  },
                  {
                    header: "Admin Response & Assigned Staff",
                    cell: (item: any) =>
                      item.adminRemarks ? (
                        <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-950 space-y-1">
                          <span className="font-semibold block text-[11px] text-emerald-800">
                            Official Response:
                          </span>
                          <p className="leading-relaxed">{item.adminRemarks}</p>
                          {item.assignedToName && (
                            <span className="text-[10px] text-emerald-700 block font-medium">
                              Assigned Staff: {item.assignedToName}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[#64748B] italic flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#F5A000]" /> Awaiting institution review
                        </span>
                      ),
                  },
                ]}
                data={requests}
                emptyMessage="No requests submitted yet for this linked student."
              />
            )}
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}