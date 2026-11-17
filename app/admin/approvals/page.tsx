"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, Clock, User, ShieldCheck } from "lucide-react";

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/approvals");
      const json = await res.json();
      if (json.success && json.data) {
        setRequests(json.data);
      }
    } catch (err) {
      console.warn("Failed to load approval requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

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

  const filteredRequests = requests.filter(
    (r) => statusFilter === "ALL" || r.status === statusFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Approvals
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Review and adjudicate profile correction requests, elective course selections, and campus leave permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {["ALL", "PENDING", "APPROVED", "REJECTED"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                statusFilter === st
                  ? "bg-[#F5A000] text-white"
                  : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

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
              {loading ? (
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

      {/* Decision Remarks Modal */}
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
