"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import { History, ShieldCheck, Clock, User, Database, Search } from "lucide-react";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const filteredLogs = logs.filter(
    (l) =>
      l.tableName?.toLowerCase().includes(search.toLowerCase()) ||
      l.action?.toLowerCase().includes(search.toLowerCase()) ||
      l.user?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      l.recordId?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#14B8A6] uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Compliance & Audit
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="text-xs font-semibold text-[#64748B]">Security Vault</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            Institutional Audit Trail & Event Logs
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Append-only forensic audit trail recording data mutations, marks revisions, fee receipts, and administrative overrides.
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
                filteredLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-[#F8FAFC]">
                    <TableCell className="text-xs text-[#64748B] font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.action?.includes("CREATE") || log.action?.includes("INSERT")
                            ? "success"
                            : log.action?.includes("DELETE")
                            ? "destructive"
                            : "navy"
                        }
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold text-[#153B66]">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>{log.tableName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-[#64748B] max-w-xs truncate">
                      {log.recordId}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-[#1E293B]">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-[#14B8A6]" />
                        <span>{log.user?.fullName || log.user?.name || log.user?.email || "System Service"}</span>
                      </div>
                      <span className="text-[10px] text-[#64748B] block">{log.user?.role || "SYSTEM"}</span>
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
