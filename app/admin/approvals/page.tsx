"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { CheckSquare, CheckCircle, XCircle, Clock, User, Filter } from "lucide-react";

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");

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

  const handleDecision = async (id: string, status: "APPROVED" | "REJECTED") => {
    const remarks = prompt(`Enter optional administrator remarks for ${status.toLowerCase()}:`);
    try {
      const res = await fetch("/api/admin/approvals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, adminRemarks: remarks }),
      });
      const data = await res.json();
      if (data.success) {
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
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#14B8A6] uppercase tracking-wider flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5" /> Administrative Workflows
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="text-xs font-semibold text-[#64748B]">Approval Engine</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Requests & Approvals Governance
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
                  ? "bg-[#2563EB] text-white"
                  : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
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
                        <User className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>{req.user?.fullName || req.user?.name || req.user?.email}</span>
                      </div>
                      <span className="text-[10px] text-[#64748B] block uppercase">{req.user?.role}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="navy">{req.requestType}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-[#64748B] max-w-xs">
                      <span className="font-semibold text-[#1E293B] block">{req.title}</span>
                      {req.adminRemarks && (
                        <span className="text-[11px] text-[#14B8A6] block mt-0.5">
                          Admin: {req.adminRemarks}
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
                            onClick={() => handleDecision(req.id, "APPROVED")}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs text-[#DC2626] border-[#DC2626]/30"
                            onClick={() => handleDecision(req.id, "REJECTED")}
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
  );
}
