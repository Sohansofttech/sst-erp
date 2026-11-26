"use client";

import React, { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/shared/Badge";
import { Table } from "@/components/shared/Table";
import { CheckCircle2, Clock, XCircle, LogIn, LogOut } from "lucide-react";

export default function ParentAttendancePage() {
  const [selectedChildId, setSelectedChildId] = useState("");
  const [data, setData] = useState<any>(null);
  const [inOutLogs, setInOutLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("erp_active_child_id");
      if (stored) setSelectedChildId(stored);
    }
    const handleChildChanged = (e: any) => {
      if (e.detail?.childId) {
        setSelectedChildId(e.detail.childId);
      }
    };
    window.addEventListener("activeChildChanged", handleChildChanged);
    return () => window.removeEventListener("activeChildChanged", handleChildChanged);
  }, []);

  const fetchAttendance = async (childId: string) => {
    try {
      setLoading(true);
      setError(null);
      const [attRes, inOutRes] = await Promise.all([
        fetch(`/api/student/attendance?studentId=${encodeURIComponent(childId)}`).then((r) => r.json()),
        fetch(`/api/student/in-out?studentId=${encodeURIComponent(childId)}`).then((r) => r.json()),
      ]);

      if (attRes.success) {
        setData(attRes.data);
      } else {
        setError(attRes.error || "Failed to load attendance records.");
      }
      if (inOutRes.success) setInOutLogs(inOutRes.data);
    } catch (e: any) {
      console.error(e);
      setError("Unable to connect to attendance service. Please check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedChildId) {
      fetchAttendance(selectedChildId);
    } else {
      setLoading(false);
    }
  }, [selectedChildId]);

  const { summary, subjectWise, monthlyAttendance, absenceHistory } = data || {};

  return (
    <PortalLayout
      portalType="PARENT"
      pageTitle="Child Attendance & Campus In/Out Tracking"
      selectedChildId={selectedChildId}
      onSelectChild={(id) => setSelectedChildId(id)}
    >
      {!selectedChildId ? (
        <Card className="p-8 text-center bg-white border border-[#CBD5E1] shadow-xs">
          <Clock className="w-10 h-10 text-[#F5A000] mx-auto mb-3" />
          <h2 className="text-base font-bold text-[#1E293B]">No Linked Child Selected</h2>
          <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
            Please select one of your linked children from the selector in the top header to inspect their daily attendance, lecture records, and campus movement logs.
          </p>
        </Card>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-[#123B5A] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold text-[#64748B]">Loading child attendance data...</p>
        </div>
      ) : error ? (
        <Card className="p-6 text-center border-red-200 bg-red-50">
          <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-red-800">{error}</p>
          <button
            onClick={() => fetchAttendance(selectedChildId)}
            className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 cursor-pointer"
          >
            Retry
          </button>
        </Card>
      ) : (
        <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Overall Attendance"
          value={
            summary?.overallPercentage !== null && summary?.overallPercentage !== undefined
              ? `${summary.overallPercentage}%`
              : "N/A"
          }
          subtitle={summary?.hasData ? "Minimum 75% requirement" : "No attendance data"}
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
          icon={<CheckCircle2 className="w-5 h-5 text-[#16A34A]" />}
        />
        <StatCard
          title="Classes Attended"
          value={
            summary?.hasData
              ? `${summary?.attendedClasses ?? 0} / ${summary?.totalClasses ?? 0}`
              : "0 / 0"
          }
          subtitle="Total semester lectures"
          icon={<Clock className="w-5 h-5 text-[#F59E0B]" />}
        />
        <StatCard
          title="Absences Logged"
          value={summary?.absentClasses ?? 0}
          subtitle={`${summary?.lateClasses ?? 0} late entries`}
          badgeText={
            !summary?.hasData
              ? "Pending"
              : summary?.absentClasses > 0
              ? "Logged"
              : "Zero Absences"
          }
          badgeVariant={
            !summary?.hasData
              ? "neutral"
              : summary?.absentClasses > 0
              ? "warning"
              : "success"
          }
          icon={<XCircle className="w-5 h-5 text-[#DC2626]" />}
        />
      </div>

      <div className="space-y-6">
        {/* Monthly Attendance Breakdown (STU-FE-06) */}
        <Card
          title="Monthly Attendance Summary"
          subtitle="Progressive monthly session tracking"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {monthlyAttendance?.map((m: any) => {
              const hasMonthData = m.percentage !== null && m.percentage !== undefined;
              const isGood = hasMonthData && m.percentage >= 75;
              return (
                <div
                  key={m.monthYear}
                  className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#EEF2F6]/50"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#0F2942]">{m.monthYear}</span>
                    <Badge variant={!hasMonthData ? "neutral" : isGood ? "success" : "error"} size="sm">
                      {!hasMonthData ? "Pending" : isGood ? "Eligible" : "Shortage"}
                    </Badge>
                  </div>
                  <div className="text-xl font-extrabold text-[#1E293B]">
                    {hasMonthData ? `${m.percentage}%` : "N/A"}
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    {m.attendedClasses} of {m.totalClasses} classes
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Subject wise breakdown */}
        <Card title="Subject-Wise Attendance Breakdown">
          <div className="space-y-3">
            {subjectWise?.map((sub: any) => {
              const hasSubData = sub.percentage !== null && sub.percentage !== undefined;
              return (
                <div
                  key={sub.subjectId}
                  className="p-4 rounded-xl border border-[#E2E8F0] bg-[#EEF2F6]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#D97706]">{sub.subjectCode}</span>
                      <h4 className="font-semibold text-[#1E293B]">{sub.subjectName}</h4>
                    </div>
                    <p className="text-[#64748B] text-[11px] mt-0.5">
                      Attended {sub.attendedClasses} out of {sub.totalClasses} classes
                    </p>
                  </div>
                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <span className="text-base font-bold text-[#0F2942]">
                      {hasSubData ? `${sub.percentage}%` : "N/A"}
                    </span>
                    <Badge
                      variant={!hasSubData ? "neutral" : sub.percentage >= 75 ? "success" : "error"}
                      size="sm"
                    >
                      {!hasSubData ? "Pending" : sub.percentage >= 75 ? "Good" : "Low"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Absence history */}
        <Card title="Absence History & Faculty Remarks">
          <Table
            columns={[
              {
                header: "Date",
                cell: (item: any) => new Date(item.date).toLocaleDateString(),
              },
              { header: "Subject", accessorKey: "subjectCode" },
              { header: "Subject Name", accessorKey: "subjectName" },
              {
                header: "Status",
                cell: (item: any) => (
                  <Badge variant={item.status === "LATE" ? "warning" : "error"} size="sm">
                    {item.status}
                  </Badge>
                ),
              },
              { header: "Remarks", accessorKey: "remarks" },
            ]}
            data={absenceHistory || []}
            emptyMessage={
              summary?.hasData
                ? "No absences on record. Attendance is regular."
                : "No attendance sessions logged yet."
            }
          />
        </Card>

        {/* Campus In/Out Logs */}
        <Card title="Campus Gate In/Out Verification Logs">
          <Table
            columns={[
              {
                header: "Timestamp",
                cell: (item: any) => new Date(item.timestamp).toLocaleString(),
              },
              {
                header: "Gate Movement",
                cell: (item: any) => (
                  <Badge variant={item.logType === "ENTRY" ? "success" : "error"} size="sm">
                    {item.logType === "ENTRY" ? "CAMPUS ENTRY" : "CAMPUS EXIT"}
                  </Badge>
                ),
              },
              { header: "Gate Name", accessorKey: "gateName" },
              { header: "Checkpoint Device", accessorKey: "verifiedBy" },
            ]}
            data={inOutLogs}
            emptyMessage="No campus movements logged."
          />
        </Card>
      </div>
      </>
      )}
    </PortalLayout>
  );
}
