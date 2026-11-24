"use client";

import React, { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/shared/Badge";
import { Table } from "@/components/shared/Table";
import { CheckCircle2, XCircle, Clock, AlertTriangle, LogIn, LogOut, ShieldCheck, RefreshCw } from "lucide-react";

/**
 * Format raw biometric verifier identifiers into user-friendly labels.
 * Examples:
 * - "BIO:RFID:sst-c69c65691062b1aa:d81f..." -> "RFID Scanner"
 * - "BIO:FINGERPRINT:sst-..." -> "Fingerprint Scanner"
 * - "Security Desk" -> "Security Desk"
 * - null / undefined -> "Automated Turnstile"
 */
function formatVerifier(verifiedBy?: string | null): string {
  if (!verifiedBy) return "Automated Turnstile";
  if (typeof verifiedBy !== "string") return String(verifiedBy);

  const trimmed = verifiedBy.trim();
  if (trimmed.startsWith("BIO:")) {
    const parts = trimmed.split(":");
    const method = (parts[1] || "").toUpperCase();
    if (method === "RFID") {
      return "RFID Scanner";
    }
    if (method === "FINGERPRINT") {
      return "Fingerprint Scanner";
    }
    return `Biometric Scanner (${parts[1] || "Automated"})`;
  }

  return trimmed || "Automated Turnstile";
}

export default function AttendancePage() {
  const [data, setData] = useState<any>(null);
  const [inOutLogs, setInOutLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"SUBJECT_WISE" | "MONTHLY" | "DAILY_HISTORY" | "IN_OUT">("SUBJECT_WISE");
  const [refreshingInOut, setRefreshingInOut] = useState(false);
  const [inOutError, setInOutError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [attRes, inOutRes] = await Promise.all([
        fetch("/api/student/attendance", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/student/in-out", { credentials: "include" }).then((r) => r.json()),
      ]);

      if (attRes.success) setData(attRes.data);
      if (inOutRes.success) setInOutLogs(inOutRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshInOut = async () => {
    if (refreshingInOut) return;
    try {
      setRefreshingInOut(true);
      setInOutError(null);
      const res = await fetch("/api/student/in-out", { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setInOutLogs(json.data);
      } else {
        setInOutError(json.error || "Unable to refresh in/out logs. Please try again.");
      }
    } catch (err: any) {
      setInOutError("Network error while updating in/out logs. Please check your connection.");
    } finally {
      setRefreshingInOut(false);
    }
  };

  useEffect(() => {
    fetchData();
    const handleChildChanged = () => {
      fetchData();
    };
    window.addEventListener("activeChildChanged", handleChildChanged);
    return () => {
      window.removeEventListener("activeChildChanged", handleChildChanged);
    };
  }, []);

  if (loading) {
    return (
      <PortalLayout portalType="STUDENT" pageTitle="Attendance & In/Out Register">
        <div className="py-20 text-center text-sm text-[#64748B]">Loading attendance records...</div>
      </PortalLayout>
    );
  }

  const { summary, subjectWise, monthlyAttendance, dailyHistory, absenceHistory } = data || {};

  return (
    <PortalLayout portalType="STUDENT" pageTitle="Attendance & Campus In/Out Register">
      {/* 4 Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Overall Attendance"
          value={
            summary?.overallPercentage !== null && summary?.overallPercentage !== undefined
              ? `${summary.overallPercentage}%`
              : "N/A"
          }
          subtitle={summary?.hasData ? "Minimum 75% required" : "No attendance data"}
          badgeText={
            !summary?.hasData
              ? "Pending"
              : summary?.overallPercentage >= 75
              ? "Eligible"
              : "Attendance Shortage"
          }
          badgeVariant={
            !summary?.hasData
              ? "neutral"
              : summary?.overallPercentage >= 75
              ? "success"
              : "error"
          }
          variant="dark"
          icon={<CheckCircle2 className="w-5 h-5 text-white" />}
        />
        <StatCard
          title="Total Sessions"
          value={summary?.totalClasses ?? 0}
          subtitle="Conducted this semester"
          icon={<Clock className="w-5 h-5 text-[#F5A000]" />}
        />
        <StatCard
          title="Classes Attended"
          value={summary?.attendedClasses ?? 0}
          subtitle="Present or excused"
          badgeText="Verified"
          badgeVariant="success"
          icon={<CheckCircle2 className="w-5 h-5 text-[#F5A000]" />}
        />
        <StatCard
          title="Total Absences"
          value={summary?.absentClasses ?? 0}
          subtitle={`${summary?.lateClasses ?? 0} late marks`}
          badgeText={summary?.absentClasses > 3 ? "Action Req" : "Normal"}
          badgeVariant={summary?.absentClasses > 3 ? "warning" : "neutral"}
          icon={<XCircle className="w-5 h-5 text-[#DC2626]" />}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#E2E8F0] pb-2 overflow-x-auto">
        <button
          onClick={() => setTab("SUBJECT_WISE")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            tab === "SUBJECT_WISE"
              ? "bg-[#123B5A] text-white shadow-xs"
              : "text-[#64748B] hover:text-[#1E293B] hover:bg-white"
          }`}
        >
          Subject-Wise Attendance
        </button>
        <button
          onClick={() => setTab("MONTHLY")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            tab === "MONTHLY"
              ? "bg-[#123B5A] text-white shadow-xs"
              : "text-[#64748B] hover:text-[#1E293B] hover:bg-white"
          }`}
        >
          Monthly Attendance
        </button>
        <button
          onClick={() => setTab("DAILY_HISTORY")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            tab === "DAILY_HISTORY"
              ? "bg-[#123B5A] text-white shadow-xs"
              : "text-[#64748B] hover:text-[#1E293B] hover:bg-white"
          }`}
        >
          Absence History & Logs
        </button>
        <button
          onClick={() => setTab("IN_OUT")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
            tab === "IN_OUT"
              ? "bg-[#123B5A] text-white shadow-xs"
              : "text-[#64748B] hover:text-[#1E293B] hover:bg-white"
          }`}
        >
          Campus In/Out Gate Register
        </button>
      </div>

      {tab === "SUBJECT_WISE" && (
        <Card title="Subject-Wise Attendance Breakdown">
          <div className="space-y-4">
            {subjectWise?.map((sub: any) => {
              const hasSubData = sub.percentage !== null && sub.percentage !== undefined;
              const isEligible = hasSubData && sub.percentage >= 75;
              const barWidth = hasSubData ? Math.min(100, Math.max(0, sub.percentage)) : 0;
              return (
                <div
                  key={sub.subjectId}
                  className="p-4 rounded-xl border border-[#E2E8F0] bg-[#EEF1F5]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#D97706]">
                        {sub.subjectCode}
                      </span>
                      <h4 className="text-sm font-semibold text-[#1E293B]">
                        {sub.subjectName}
                      </h4>
                    </div>
                    <p className="text-xs text-[#64748B]">
                      {hasSubData
                        ? `Attended ${sub.attendedClasses} out of ${sub.totalClasses} total lectures`
                        : "No instructional sessions logged for this subject"}
                    </p>

                    {/* Progress Bar */}
                    <div className="mt-2 w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          !hasSubData ? "bg-slate-300" : isEligible ? "bg-[#16A34A]" : "bg-[#DC2626]"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <div className="text-right">
                      <span className="text-xl font-bold text-[#1E293B] block">
                        {hasSubData ? `${sub.percentage}%` : "N/A"}
                      </span>
                      <span className="text-[11px] text-[#64748B]">Attendance</span>
                    </div>
                    <Badge variant={!hasSubData ? "neutral" : isEligible ? "success" : "error"}>
                      {!hasSubData ? "Pending" : isEligible ? "Exam Eligible" : "Low %"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "MONTHLY" && (
        <Card
          title="Monthly Attendance Summary"
          subtitle="Monthly session attendance tracking and academic percentage"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {monthlyAttendance?.map((m: any) => {
              const isGood = m.percentage >= 75;
              return (
                <div
                  key={m.monthYear}
                  className="p-4 rounded-xl border border-[#E2E8F0] bg-[#EEF1F5]/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#123B5A]">{m.monthYear}</span>
                    <Badge variant={isGood ? "success" : "error"} size="sm">
                      {isGood ? "Eligible" : "Shortage"}
                    </Badge>
                  </div>
                  <div className="text-2xl font-extrabold text-[#1E293B] mb-1">
                    {m.percentage}%
                  </div>
                  <p className="text-xs text-[#64748B]">
                    {m.attendedClasses} attended / {m.totalClasses} total
                  </p>
                  <div className="mt-3 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isGood ? "bg-[#16A34A]" : "bg-[#DC2626]"
                      }`}
                      style={{ width: `${Math.min(100, m.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <Table
            columns={[
              { header: "Academic Month", accessorKey: "monthYear" },
              { header: "Total Classes", accessorKey: "totalClasses" },
              { header: "Attended", accessorKey: "attendedClasses" },
              { header: "Absences", accessorKey: "absentClasses" },
              {
                header: "Monthly Percentage",
                cell: (item: any) => (
                  <span
                    className={`font-bold ${
                      item.percentage >= 75 ? "text-[#16A34A]" : "text-[#DC2626]"
                    }`}
                  >
                    {item.percentage}%
                  </span>
                ),
              },
              {
                header: "Standing",
                cell: (item: any) => (
                  <Badge variant={item.percentage >= 75 ? "success" : "error"} size="sm">
                    {item.percentage >= 75 ? "Satisfactory" : "Attendance Warning"}
                  </Badge>
                ),
              },
            ]}
            data={monthlyAttendance || []}
          />
        </Card>
      )}

      {tab === "DAILY_HISTORY" && (
        <div className="space-y-6">
          <Card title="Absence History & Remark Log">
            <Table
              columns={[
                {
                  header: "Date",
                  cell: (item: any) => new Date(item.date).toLocaleDateString(),
                },
                {
                  header: "Subject Code",
                  accessorKey: "subjectCode",
                },
                {
                  header: "Subject Name",
                  accessorKey: "subjectName",
                },
                {
                  header: "Status",
                  cell: (item: any) => (
                    <Badge variant={item.status === "LATE" ? "warning" : "error"} size="sm">
                      {item.status}
                    </Badge>
                  ),
                },
                {
                  header: "Faculty / Institution Remarks",
                  accessorKey: "remarks",
                },
              ]}
              data={absenceHistory || []}
              emptyMessage={
                summary?.hasData
                  ? "No absences recorded in the selected period."
                  : "No attendance sessions recorded yet."
              }
            />
          </Card>
        </div>
      )}

      {tab === "IN_OUT" && (
        <Card
          title="Recorded Campus Entry & Exit Logs"
          subtitle="Automated gate RFID readers and physical security logs"
          action={
            <button
              onClick={handleRefreshInOut}
              disabled={refreshingInOut}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#E2E8F0] transition-colors ${
                refreshingInOut
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-white text-[#1E293B] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] shadow-2xs cursor-pointer active:scale-95"
              }`}
              title="Refresh In/Out Register"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingInOut ? "animate-spin text-[#123B5A]" : "text-[#64748B]"}`} />
              <span>{refreshingInOut ? "Refreshing..." : "Refresh"}</span>
            </button>
          }
        >
          {inOutError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
              <span>{inOutError}</span>
              <button
                onClick={() => setInOutError(null)}
                className="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer"
                title="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          <Table
            columns={[
              {
                header: "Timestamp",
                cell: (item: any) =>
                  new Date(item.timestamp).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
              },
              {
                header: "Movement",
                cell: (item: any) => (
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    {item.logType === "ENTRY" ? (
                      <>
                        <LogIn className="w-4 h-4 text-[#16A34A]" />
                        <span className="text-[#16A34A]">CAMPUS ENTRY</span>
                      </>
                    ) : (
                      <>
                        <LogOut className="w-4 h-4 text-[#DC2626]" />
                        <span className="text-[#DC2626]">CAMPUS EXIT</span>
                      </>
                    )}
                  </div>
                ),
              },
              {
                header: "Gate / Checkpoint",
                accessorKey: "gateName",
              },
              {
                header: "Verified By",
                cell: (item: any) => (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#334155] font-medium">
                    {formatVerifier(item.verifiedBy)}
                  </span>
                ),
              },
            ]}
            data={inOutLogs}
            emptyMessage="No campus movements logged."
          />
        </Card>
      )}
    </PortalLayout>
  );
}
