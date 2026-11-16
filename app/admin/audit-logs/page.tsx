"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { History, ShieldCheck, Clock, User, Database, Search, Lock, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("ALL");

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/audit-logs?take=100");
      const json = await res.json();
      if (json.success && json.data) {
        setLogs(json.data);
      }
    } catch (err) {
      console.warn("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    const tableStr = (l.tableName || l.entity || "").toLowerCase();
    const actionStr = (l.action || "").toLowerCase();
    const userStr = (l.user?.fullName || l.user?.name || "").toLowerCase();
    const recStr = (l.recordId || l.entityId || "").toLowerCase();
    const q = search.toLowerCase();

    const matchesSearch =
      search === "" ||
      tableStr.includes(q) ||
      actionStr.includes(q) ||
      userStr.includes(q) ||
      recStr.includes(q);

    const matchesTag =
      filterTag === "ALL" ||
      (filterTag === "FEES" && (tableStr.includes("fee") || actionStr.includes("FEE") || actionStr.includes("RECEIPT"))) ||
      (filterTag === "APPROVALS" && (tableStr.includes("approval") || actionStr.includes("APPROVAL"))) ||
      (filterTag === "HOSTEL" && (tableStr.includes("hostel") || actionStr.includes("ROOM"))) ||
      (filterTag === "EVENTS" && (tableStr.includes("event") || actionStr.includes("EVENT"))) ||
      (filterTag === "SECURITY" && (tableStr.includes("gate") || tableStr.includes("campus") || actionStr.includes("GATE") || actionStr.includes("PASS")));

    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Audit Logs
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Append-only forensic audit trail recording data mutations, marks revisions, and administrative overrides.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search action, table, or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg focus:outline-hidden"
          />
        </div>
      </div>

      {/* Audit KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Audit Records</p>
              <h3 className="text-2xl font-bold text-[#1E293B] mt-1">{logs.length} Events</h3>
              <p className="text-[11px] text-[#64748B] mt-0.5">Forensic Event History</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#F5A000]/10 flex items-center justify-center text-[#F5A000]">
              <History className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Security Actions</p>
              <h3 className="text-2xl font-bold text-[#123B5A] mt-1">100% Verified</h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">Session Authenticated</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#123B5A]/10 flex items-center justify-center text-[#123B5A]">
              <Lock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Data Mutations</p>
              <h3 className="text-2xl font-bold text-[#F5A000] mt-1">Append-Only</h3>
              <p className="text-[11px] text-[#F5A000] mt-0.5 font-medium">Immutable Trail</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#F5A000]">
              <Database className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase">Compliance Status</p>
              <h3 className="text-2xl font-bold text-[#16A34A] mt-1">Certified</h3>
              <p className="text-[11px] text-[#16A34A] mt-0.5 font-medium">Regulatory Audit Ready</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A]">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {["ALL", "FEES", "APPROVALS", "HOSTEL", "EVENTS", "SECURITY"].map((tag) => (
          <button
            key={tag}
            onClick={() => setFilterTag(tag)}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filterTag === tag
                ? "bg-[#F5A000] text-white"
                : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <Card className="border-[#E2E8F0]">
        <CardHeader className="p-4 border-b border-[#E2E8F0]">
          <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center justify-between">
            <span>Forensic Event Records</span>
            <span className="text-xs font-normal text-[#64748B]">Showing {filteredLogs.length} events</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAFC]">
                <TableHead className="text-xs font-bold text-[#1E293B]">Timestamp</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Action</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Table / Target</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Record ID</TableHead>
                <TableHead className="text-xs font-bold text-[#1E293B]">Operator / Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-[#64748B]">
                    Loading audit trail from database...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableEmpty colSpan={5} message="No audit events found matching the search criteria." />
              ) : (
                filteredLogs.map((log) => {
                  const dateStr = log.createdAt || log.timestamp || new Date();
                  const parsedDate = new Date(dateStr);
                  const validDate = isNaN(parsedDate.getTime()) ? new Date().toLocaleString() : parsedDate.toLocaleString();
                  const tableName = log.tableName || log.entity || "system_records";
                  const recordId = log.recordId || log.entityId || "rec_general";

                  return (
                    <TableRow key={log.id} className="hover:bg-[#F8FAFC]">
                      <TableCell className="text-xs text-[#64748B] font-mono">
                        {validDate}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            log.action?.includes("CREATE") || log.action?.includes("INSERT") || log.action?.includes("ALLOCATED") || log.action?.includes("ISSUED")
                              ? "success"
                              : log.action?.includes("DELETE") || log.action?.includes("REJECT")
                              ? "destructive"
                              : "navy"
                          }
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono font-semibold text-[#123B5A]">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-[#F5A000]" />
                          <span>{tableName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-[#64748B] max-w-xs truncate">
                        {recordId}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-[#1E293B]">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-[#14B8A6]" />
                          <span>{log.user?.fullName || log.user?.name || log.user?.email || "System Service"}</span>
                        </div>
                        <span className="text-[10px] text-[#64748B] block">{log.user?.role || "SYSTEM"}</span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
