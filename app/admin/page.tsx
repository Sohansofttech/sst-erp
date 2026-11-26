"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useInstitution } from "@/lib/store";
import { useDivision, ALL_DIVISIONS_ID } from "@/lib/division-store";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Briefcase,
  Building2,
  Clock,
  ArrowRight,
  Sparkles,
  TrendingUp,
  CreditCard,
  Home,
  Bus,
  CalendarDays,
  MessageSquare,
  CheckSquare,
  History,
  ShieldCheck,
  UserCheck,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  PieChart,
  BarChart3,
  Layers,
  GraduationCap,
  RefreshCw,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { TrialSubscriptionBanner } from "@/components/admin/TrialSubscriptionBanner";
import { getTerminology, isFeatureEnabled } from "@/lib/institution-type-config";

export default function DashboardPage() {
  const {
    profile,
    stats,
    activeAcademicYear,
    isAcademicYearsLoading,
    getClassAttendanceSummaries,
    institutionKind,
    classes,
  } = useInstitution();
  const { activeDivisionId, activeDivision } = useDivision();
  const terms = getTerminology(institutionKind);
  const isCollegeTemplate = institutionKind === "COLLEGE";
  const isGroupTemplate = institutionKind === "SCHOOL" || institutionKind === "ACADEMY";
  const showHostelShortcut = isFeatureEnabled(institutionKind, "hostel");
  const peopleLabel = terms.learners;
  const staffLabel = terms.staff;

  const [activeChartTab, setActiveChartTab] = useState<"enrollment" | "finance" | "attendance">("enrollment");
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);

  // Backend live API metrics state
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [multiDivData, setMultiDivData] = useState<any | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const fetchDashboardMetrics = async () => {
    try {
      setLoadingDashboard(true);
      setDashboardError(null);

      // If viewing all divisions, fetch multi-division aggregate
      if (activeDivisionId === ALL_DIVISIONS_ID) {
        try {
          const mRes = await fetch("/api/admin/dashboard/multi-division");
          const mJson = await mRes.json();
          if (mJson.success && mJson.data) {
            setMultiDivData(mJson.data);
          }
        } catch (mErr) {
          console.warn("Could not load multi-division metrics:", mErr);
        }
      } else {
        setMultiDivData(null);
      }

      // Fetch base dashboard metrics
      const url = activeDivisionId && activeDivisionId !== ALL_DIVISIONS_ID
        ? `/api/admin/dashboard?divisionId=${encodeURIComponent(activeDivisionId)}`
        : "/api/admin/dashboard";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        setDashboardData(json.data);
      } else if (json.error) {
        setDashboardError(json.error);
      }
    } catch (err: any) {
      console.warn("Could not load live dashboard API metrics:", err);
      setDashboardError(err.message || "Network error fetching dashboard metrics.");
    } finally {
      setLoadingDashboard(false);
    }
  };

  const fetchPendingApprovals = async () => {
    try {
      setLoadingApprovals(true);
      const res = await fetch("/api/admin/approvals?status=PENDING");
      const json = await res.json();
      if (json.success && json.data) {
        setApprovals(json.data.slice(0, 5));
      }
    } catch (err) {
      console.warn("Could not load pending approvals:", err);
    } finally {
      setLoadingApprovals(false);
    }
  };

  useEffect(() => {
    fetchDashboardMetrics();
    fetchPendingApprovals();
  }, [activeDivisionId]);

  const handleQuickDecision = async (id: string, status: "APPROVED" | "REJECTED") => {
    try {
      const res = await fetch("/api/admin/approvals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, adminRemarks: `Decision via Dashboard Executive Quick Action` }),
      });
      const json = await res.json();
      if (json.success) {
        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } else {
        alert(json.error || "Decision processing failed.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to update approval.");
    }
  };

  // Live computed metrics with fallbacks
  const liveStats = dashboardData?.stats;

  const totalStudents = liveStats?.totalStudents !== undefined ? liveStats.totalStudents : (stats.totalStudents ?? 0);
  const totalStaff = liveStats?.totalFaculty !== undefined ? liveStats.totalFaculty : (stats.totalStaff ?? 0);
  const totalAdmissions = liveStats?.pendingAdmissions !== undefined ? liveStats.pendingAdmissions : (stats.totalAdmissions ?? 0);
  const pendingApprovalsCount = liveStats?.pendingApprovals !== undefined
    ? liveStats.pendingApprovals
    : (loadingApprovals ? 0 : approvals.length);
  const totalFeesCollected = liveStats?.totalFeesCollected !== undefined
    ? `₹${(liveStats.totalFeesCollected / 100000).toFixed(2)}L`
    : (stats.totalFeesCollected ? `₹${(stats.totalFeesCollected / 100000).toFixed(1)}L` : "₹0.00L");
  const attendanceRate = liveStats?.attendanceRate || (stats.attendanceRateToday ? `${stats.attendanceRateToday}%` : "N/A");
  const totalDepartments = liveStats?.totalDepartments !== undefined ? liveStats.totalDepartments : 0;

  const effectiveActivities = Array.isArray(dashboardData?.recentActivities)
    ? dashboardData.recentActivities.map((a: any) => ({
        id: a.id,
        user: a.userName || "Administrator",
        action: a.action,
        target: a.tableName || a.entity || "general",
        timestamp: a.timestamp
          ? new Date(a.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "Recently",
      }))
    : [];

  // Real department enrollment calculated from authenticated database departments
  const deptColors = ["bg-[#16466C]", "bg-[#F5A000]", "bg-[#16466C]", "bg-[#F5A000]", "bg-[#16466C]", "bg-[#F5A000]"];
  const dynamicDeptEnrollment = Array.isArray(dashboardData?.departmentEnrollment)
    ? dashboardData.departmentEnrollment.map((dept: any, index: number) => ({
        name: dept.name,
        code: dept.code,
        count: dept.count || 0,
        capacity: dept.capacity || 0,
        percentage: dept.percentage || 0,
        color: deptColors[index % deptColors.length],
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B] tracking-tight">
            {activeDivisionId === ALL_DIVISIONS_ID
              ? "Multi-Division Executive Dashboard"
              : activeDivision
              ? `${activeDivision.name} Dashboard`
              : terms.dashboardTitle}
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {activeDivisionId === ALL_DIVISIONS_ID
              ? "Consolidated cross-division institutional performance & division status"
              : activeDivision
              ? `Operational metrics for ${activeDivision.code} • ${activeDivision.type}`
              : profile?.institutionCategory || "Institutional governance, academic operations, and analytics"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 bg-[#F1F5F9] px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-xs">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="font-semibold text-[#1E293B]">Session:</span>
            <span className="font-bold text-[#F5A000]">{isAcademicYearsLoading ? "Loading..." : (dashboardData?.activeAcademicYear?.name || activeAcademicYear?.name || "Not Set")}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardMetrics}
            className="text-xs border-[#CBD5E1] h-8 px-2.5"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDashboard ? "animate-spin text-[#F5A000]" : "text-[#64748B]"}`} />
          </Button>

          <Link href="/admin/communication">
            <Button className="bg-[#F5A000] hover:bg-[#D98E00] text-white text-xs h-8 shadow-xs">
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Broadcast Notice
            </Button>
          </Link>
        </div>
      </div>

      {/* 1.5 14-Day Free Trial & Subscription Status Banner */}
      <TrialSubscriptionBanner
        subscription={dashboardData?.subscription}
        loading={loadingDashboard}
      />

      {/* 1.8 Executive Multi-Division Breakdown (Shown when 'All Divisions' selected) */}
      {activeDivisionId === ALL_DIVISIONS_ID && multiDivData?.divisions && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#123B5A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#F5A000]" />
              Educational Divisions Breakdown ({multiDivData.divisions.length})
            </h2>
            <Link
              href="/admin/divisions"
              className="text-xs font-semibold text-[#123B5A] hover:underline flex items-center gap-1"
            >
              Manage Divisions <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {multiDivData.divisions.map((div: any) => (
              <Card key={div.id} className="border-[#E2E8F0] shadow-xs hover:border-[#123B5A] transition-all">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#1E293B]">{div.name}</h3>
                      <p className="text-[11px] text-[#64748B]">{div.code} • {div.type}</p>
                    </div>
                    <Badge variant={div.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                      {div.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F1F5F9] text-center">
                    <div>
                      <span className="text-[10px] text-[#64748B] block">Students</span>
                      <span className="text-sm font-bold text-[#123B5A]">{div.studentCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#64748B] block">Classes</span>
                      <span className="text-sm font-bold text-[#123B5A]">{div.classCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#64748B] block">Faculty</span>
                      <span className="text-sm font-bold text-[#123B5A]">{div.staffCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 2. Top Executive Highlight Cards Grid (6 Cards reproducing the Reference Theme) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Students - Signature Deep Navy Highlight Card */}
        <Card className="bg-[#123B5A] text-white border-[#123B5A] shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8EA4C2]">{peopleLabel}</span>
              <div className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-white mt-1.5">
              {loadingDashboard ? "..." : totalStudents.toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#38BDF8] font-bold mt-1">
              <TrendingUp className="w-3 h-3" />
              <span>{totalStudents > 0 ? (liveStats?.studentGrowth || "Growth data unavailable") : `No active ${peopleLabel.toLowerCase()}`}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Admissions - Orange Accent Card (matches reference Share) */}
        <Card className="border-[#E2E8F0] shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Admissions</span>
              <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] text-[#F5A000] flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#1E293B] mt-1.5">
              {loadingDashboard ? "..." : totalAdmissions}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] font-medium mt-1">
              {dashboardData?.schemaStatus?.admissions === "PENDING_MIGRATION" ? (
                <span className="text-[#F59E0B] font-medium">Setup in progress</span>
              ) : totalAdmissions > 0 ? (
                <span><span className="text-[#F5A000] font-bold">{totalAdmissions}</span> awaiting review</span>
              ) : (
                <span>No pending applications</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Fee Collections - Blue Accent Card (matches reference Likes) */}
        <Card className="border-[#E2E8F0] shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Collections</span>
              <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#F5A000] flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#1E293B] mt-1.5">
              {loadingDashboard ? "..." : totalFeesCollected}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] font-medium mt-1">
              <span>{totalFeesCollected !== "₹0.00L" ? "Fee collections" : "No collections recorded"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Daily Attendance - Amber Accent Card (matches reference Rating) */}
        <Card className="border-[#E2E8F0] shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Attendance</span>
              <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] text-[#F59E0B] flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#1E293B] mt-1.5">
              {attendanceRate}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] font-medium mt-1">
              <span>{attendanceRate !== "N/A" ? `${attendanceRate} recorded` : "No sessions logged"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Faculty Staff */}
        <Card className="border-[#E2E8F0] shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">{staffLabel}</span>
              <div className="w-8 h-8 rounded-lg bg-[#E0E7FF] text-[#123B5A] flex items-center justify-center">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#1E293B] mt-1.5">
              {loadingDashboard ? "..." : totalStaff}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] font-medium mt-1">
              <span>
                {isGroupTemplate
                  ? classes.length === 0
                    ? `No ${terms.groupPlural} configured`
                    : `Across ${classes.length} ${classes.length === 1 ? terms.group : terms.groupPlural}`
                  : dashboardData?.schemaStatus?.departments === "PENDING_MIGRATION"
                  ? "Departments pending setup"
                  : totalDepartments === 1
                  ? "Across 1 department"
                  : totalDepartments > 1
                  ? `Across ${totalDepartments} departments`
                  : "No departments configured"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 6: Pending Approvals */}
        <Card className="border-[#E2E8F0] shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Approvals</span>
              <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] text-[#F5A000] flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#1E293B] mt-1.5">
              {loadingApprovals ? "..." : pendingApprovalsCount}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mt-1 font-bold">
              {pendingApprovalsCount > 0 ? (
                <span className="text-[#F5A000]">Action required</span>
              ) : (
                <span className="text-[#10B981]">Queue clear</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Analytics Section & Interactive Charts */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-[#E2E8F0]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#F5A000]" />
                <span>Analytics & Performance</span>
              </CardTitle>
            </div>

            <div className="flex items-center gap-2">
              {/* Chart Filter Tabs */}
              <div className="flex items-center bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0]">
                <button
                  onClick={() => setActiveChartTab("enrollment")}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    activeChartTab === "enrollment"
                      ? "bg-white text-[#F5A000] shadow-xs"
                      : "text-[#64748B] hover:text-[#1E293B]"
                  }`}
                >
                  Enrollment
                </button>
                <button
                  onClick={() => setActiveChartTab("finance")}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    activeChartTab === "finance"
                      ? "bg-white text-[#F5A000] shadow-xs"
                      : "text-[#64748B] hover:text-[#1E293B]"
                  }`}
                >
                  Fee Realization
                </button>
                <button
                  onClick={() => setActiveChartTab("attendance")}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    activeChartTab === "attendance"
                      ? "bg-white text-[#F5A000] shadow-xs"
                      : "text-[#64748B] hover:text-[#1E293B]"
                  }`}
                >
                  Attendance
                </button>
              </div>

              {/* Action Button matching Reference "Check Now" */}
              <Link href="/admin/audit-logs">
                <Button size="sm" className="bg-[#F5A000] hover:bg-[#D98E00] text-white text-xs h-7 px-3 font-semibold shadow-xs">
                  Check Now
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {activeChartTab === "enrollment" && isGroupTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-[#64748B]">
                <span>Registered {terms.learners} by {terms.group}</span>
                <span className="font-semibold text-[#1E293B]">
                  {totalStudents > 0 ? `${totalStudents.toLocaleString()} Enrolled` : `No active ${terms.learners.toLowerCase()}`}
                </span>
              </div>
              {classes.length === 0 ? (
                <div className="text-center py-8 space-y-2 border border-dashed border-[#CBD5E1] rounded-xl bg-[#F8FAFC]">
                  <Layers className="w-8 h-8 text-[#94A3B8] mx-auto opacity-60" />
                  <p className="text-xs font-semibold text-[#1E293B]">No {terms.groupPlural} configured</p>
                  <p className="text-[11px] text-[#64748B]">
                    <Link href="/admin/academics/classes" className="underline">Create {terms.groupPlural}</Link> to see enrollment here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {classes.slice(0, 12).map((cls) => (
                    <div key={cls.id} className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-[#1E293B] truncate max-w-[200px]" title={cls.name}>{cls.name}</span>
                        <span className="font-mono font-bold text-[#F5A000]">{cls.totalStudents}</span>
                      </div>
                      <div className="text-[11px] text-[#64748B]">
                        {cls.courseName || cls.code} · {cls.sectionsCount} {cls.sectionsCount === 1 ? "section" : "sections"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeChartTab === "enrollment" && isCollegeTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-[#64748B]">
                <span>Department Enrollment Quota vs Registered Students</span>
                <span className="font-semibold text-[#1E293B]">
                  Active Cohorts: {totalStudents > 0 ? `${totalStudents.toLocaleString()} Enrolled` : "No active students"}
                </span>
              </div>
              {dynamicDeptEnrollment.length === 0 ? (
                <div className="text-center py-8 space-y-2 border border-dashed border-[#CBD5E1] rounded-xl bg-[#F8FAFC]">
                  <Layers className="w-8 h-8 text-[#94A3B8] mx-auto opacity-60" />
                  <p className="text-xs font-semibold text-[#1E293B]">
                    {dashboardData?.schemaStatus?.departments === "PENDING_MIGRATION"
                      ? "Departments Pending Setup"
                      : "No Department Cohorts Configured"}
                  </p>
                  <p className="text-[11px] text-[#64748B]">
                    Academic departments have not been created for this institution yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dynamicDeptEnrollment.map((dept: any) => (
                    <div key={dept.code || dept.name} className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-[#1E293B] truncate max-w-[200px]" title={dept.name}>
                          {dept.name}
                        </span>
                        <span className="font-mono font-bold text-[#F5A000]">{dept.count}</span>
                      </div>
                      <div className="w-full bg-[#E2E8F0] rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${dept.color}`}
                          style={{ width: `${dept.percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#64748B] mt-1.5">
                        <span>Capacity: {dept.capacity}</span>
                        <span className="font-semibold text-[#1E293B]">{dept.percentage}% Filled</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeChartTab === "finance" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
                <span className="text-xs font-bold text-[#F5A000] uppercase tracking-wider block">
                  Collected Revenues
                </span>
                <div className="text-2xl font-black text-[#1E293B]">
                  ₹{(liveStats?.feeMetrics?.totalCollected ?? 0).toLocaleString()}
                </div>
                <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-[#16466C] h-2 rounded-full transition-all"
                    style={{ width: `${liveStats?.feeMetrics?.collectionRate ?? 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-[#64748B] block">
                  {liveStats?.feeMetrics?.totalInvoiced > 0
                    ? `${liveStats?.feeMetrics?.collectionRate ?? 0}% collected on time`
                    : "No fee collections recorded yet"}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
                <span className="text-xs font-bold text-[#F5A000] uppercase tracking-wider block">
                  Pending Due (0-30 Days)
                </span>
                <div className="text-2xl font-black text-[#1E293B]">
                  ₹{(liveStats?.feeMetrics?.pendingDue ?? 0).toLocaleString()}
                </div>
                <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-[#F5A000] h-2 rounded-full transition-all"
                    style={{
                      width: `${
                        liveStats?.feeMetrics?.totalInvoiced > 0
                          ? Math.min(100, Math.round(((liveStats?.feeMetrics?.pendingDue ?? 0) / liveStats.feeMetrics.totalInvoiced) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-[#64748B] block">
                  {liveStats?.feeMetrics?.pendingDue > 0 ? "Invoices within grace cycle" : "No pending dues"}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-2">
                <span className="text-xs font-bold text-[#EF4444] uppercase tracking-wider block">
                  Overdue (60+ Days)
                </span>
                <div className="text-2xl font-black text-[#1E293B]">
                  ₹{(liveStats?.feeMetrics?.overdue ?? 0).toLocaleString()}
                </div>
                <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-[#EF4444] h-2 rounded-full transition-all"
                    style={{
                      width: `${
                        liveStats?.feeMetrics?.totalInvoiced > 0
                          ? Math.min(100, Math.round(((liveStats?.feeMetrics?.overdue ?? 0) / liveStats.feeMetrics.totalInvoiced) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-[#64748B] block">
                  {liveStats?.feeMetrics?.overdue > 0 ? "Notice alerts dispatched" : "No overdue invoices"}
                </span>
              </div>
            </div>
          )}

          {activeChartTab === "attendance" && isGroupTemplate && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(getClassAttendanceSummaries ? getClassAttendanceSummaries() : []).length === 0 ? (
                <div className="col-span-full text-center py-6 text-xs text-[#64748B] border border-dashed border-[#CBD5E1] rounded-xl bg-[#F8FAFC]">
                  No attendance sessions recorded for any {terms.group} yet.
                </div>
              ) : (
                (getClassAttendanceSummaries ? getClassAttendanceSummaries() : []).slice(0, 8).map((summary) => {
                  const pct = summary.averagePercentage ?? null;
                  return (
                    <div key={summary.className} className="p-3 text-center rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="text-[11px] font-bold text-[#64748B] truncate" title={summary.className}>{summary.className}</div>
                      <div className={`text-xl font-black mt-1 ${pct !== null ? "text-[#16466C]" : "text-[#94A3B8]"}`}>
                        {pct !== null ? `${pct}%` : "N/A"}
                      </div>
                      <div className="text-[10px] text-[#64748B] mt-0.5">
                        {pct !== null ? (pct >= 75 ? "Optimal attendance" : "Attendance shortage") : "No session records"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeChartTab === "attendance" && isCollegeTemplate && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "1st Year (Semester 1 & 2)", key: "1" },
                { label: "2nd Year (Semester 3 & 4)", key: "2" },
                { label: "3rd Year (Semester 5 & 6)", key: "3" },
                { label: "Final Year (Semester 7 & 8)", key: "4" },
              ].map((yr) => {
                const classAttendanceList = getClassAttendanceSummaries ? getClassAttendanceSummaries() : [];
                const matchedClass = classAttendanceList.find(
                  (c) =>
                    c.className.toLowerCase().includes(`${yr.key}st`) ||
                    c.className.toLowerCase().includes(`${yr.key}nd`) ||
                    c.className.toLowerCase().includes(`${yr.key}rd`) ||
                    c.className.toLowerCase().includes(`${yr.key}th`) ||
                    c.className.includes(yr.key)
                );
                const avgPct = matchedClass?.averagePercentage ?? null;
                const hasAvg = avgPct !== null && avgPct !== undefined;
                return (
                  <div key={yr.key} className="p-3 text-center rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="text-[11px] font-bold text-[#64748B]">{yr.label}</div>
                    <div className={`text-xl font-black mt-1 ${hasAvg ? "text-[#16466C]" : "text-[#94A3B8]"}`}>
                      {hasAvg ? `${avgPct}%` : "N/A"}
                    </div>
                    <div className="text-[10px] text-[#64748B] mt-0.5">
                      {hasAvg
                        ? avgPct >= 75
                          ? "Optimal attendance"
                          : "Attendance shortage"
                        : "No session records"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3B. Centralized Departmental Operations Control */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/admissions" className="block group">
          <Card className="h-full border-t-4 border-t-[#F5A000] group-hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Admissions</span>
                <UserPlus className="w-4 h-4 text-[#F5A000]" />
              </div>
              <div className="text-2xl font-black text-[#1E293B]">
                {dashboardData?.departmentMetrics?.admissions?.total ?? liveStats?.pendingAdmissions ?? 0}
              </div>
              <p className="text-[11px] text-[#64748B]">
                {dashboardData?.departmentMetrics?.admissions?.submitted ?? 0} pending •{" "}
                {dashboardData?.departmentMetrics?.admissions?.enrolled ?? 0} enrolled
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/fees" className="block group">
          <Card className="h-full border-t-4 border-t-[#16A34A] group-hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Finance &amp; Accounts</span>
                <CreditCard className="w-4 h-4 text-[#16A34A]" />
              </div>
              <div className="text-2xl font-black text-[#1E293B]">
                ₹{(dashboardData?.departmentMetrics?.finance?.totalCollected ?? liveStats?.totalFeesCollected ?? 0).toLocaleString()}
              </div>
              <p className="text-[11px] text-[#64748B]">
                Outstanding: ₹{(dashboardData?.departmentMetrics?.finance?.pendingDue ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/hostel" className="block group">
          <Card className="h-full border-t-4 border-t-[#123B5A] group-hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Hostel Management</span>
                <Home className="w-4 h-4 text-[#123B5A]" />
              </div>
              <div className="text-2xl font-black text-[#1E293B]">
                {dashboardData?.departmentMetrics?.hostel?.occupiedBeds ?? 0}
              </div>
              <p className="text-[11px] text-[#64748B]">Active bed allocations</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/transport" className="block group">
          <Card className="h-full border-t-4 border-t-[#7C3AED] group-hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Transport Management</span>
                <Bus className="w-4 h-4 text-[#7C3AED]" />
              </div>
              <div className="text-2xl font-black text-[#1E293B]">
                {dashboardData?.departmentMetrics?.transport?.allocatedStudents ?? 0}
              </div>
              <p className="text-[11px] text-[#64748B]">Active student route passes</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 4. Quick Actions */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-2 border-b border-[#E2E8F0]">
          <CardTitle className="text-sm font-bold text-[#1E293B]">
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <Link href="/admin/admissions" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] text-[#F5A000] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <UserPlus className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Admissions</span>
                <span className="text-[10px] text-[#64748B]">Intake Pipeline</span>
              </div>
            </Link>

            <Link href="/admin/fees" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#F5A000] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <CreditCard className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Fees</span>
                <span className="text-[10px] text-[#64748B]">Cashier Desk</span>
              </div>
            </Link>

            {showHostelShortcut && (
            <Link href="/admin/hostel" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#E0E7FF] text-[#123B5A] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <Home className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Hostel</span>
                <span className="text-[10px] text-[#64748B]">Rooms & Beds</span>
              </div>
            </Link>
            )}

            <Link href="/admin/transport" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] text-[#F59E0B] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <Bus className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Transport</span>
                <span className="text-[10px] text-[#64748B]">Fleet & Routes</span>
              </div>
            </Link>

            <Link href="/admin/gate-management" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#E0E7FF] text-[#123B5A] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Gate Control</span>
                <span className="text-[10px] text-[#64748B]">Visitor Passes</span>
              </div>
            </Link>

            <Link href="/admin/events" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] text-[#F5A000] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Events</span>
                <span className="text-[10px] text-[#64748B]">Campus Venues</span>
              </div>
            </Link>

            <Link href="/admin/approvals" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] text-[#F5A000] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Approvals</span>
                <span className="text-[10px] text-[#64748B]">Decision Center</span>
              </div>
            </Link>

            <Link href="/admin/audit-logs" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#F1F5F9] text-[#64748B] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <History className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Audit Logs</span>
                <span className="text-[10px] text-[#64748B]">Security Trail</span>
              </div>
            </Link>

            <Link href="/admin/students/import" className="group">
              <div className="p-3 rounded-xl bg-[#EEF2FF] border border-[#C7D2FE] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#123B5A] text-white flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#0F2942] group-hover:text-[#F5A000]">Bulk Import Students</span>
                <span className="text-[10px] text-[#475569]">CSV / Excel Onboarding</span>
              </div>
            </Link>

            <Link href="/admin/students/import?tab=history" className="group">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#F5A000] group-hover:shadow-xs transition-all text-center h-full flex flex-col items-center justify-center">
                <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] text-[#F5A000] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <Upload className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#F5A000]">Import History</span>
                <span className="text-[10px] text-[#64748B]">Past Import Reports</span>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 5. Split Section: Live Audit Stream (Left) & Pending Approvals (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Activity Stream (7/12) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="shadow-xs h-full">
            <CardHeader className="p-4 pb-2 border-b border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#F5A000]" />
                  <span>Recent Activity</span>
                </CardTitle>
                <Link
                  href="/admin/audit-logs"
                  className="text-xs font-bold text-[#F5A000] hover:underline flex items-center gap-1"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {loadingDashboard ? (
                  <p className="text-xs text-[#64748B] text-center py-6">
                    Loading recent activities...
                  </p>
                ) : effectiveActivities.length === 0 ? (
                  <div className="text-center py-6 space-y-1">
                    <History className="w-7 h-7 text-[#94A3B8] mx-auto opacity-60" />
                    <p className="text-xs font-semibold text-[#1E293B]">No Recent Activity</p>
                    <p className="text-[11px] text-[#64748B]">No audit events recorded for this institution yet.</p>
                  </div>
                ) : (
                  effectiveActivities.slice(0, 6).map((activity: any) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-2.5 rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] hover:bg-white hover:border-[#E2E8F0] transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-[#123B5A] text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                        {activity.user?.charAt(0) || "A"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-[#1E293B] truncate">
                            {activity.user}
                          </p>
                          <span className="text-[10px] text-[#94A3B8] shrink-0">
                            {activity.timestamp}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748B] truncate mt-0.5">
                          <span className="font-semibold text-[#1E293B]">{activity.action}</span>:{" "}
                          <span className="font-mono text-[#F5A000]">{activity.target}</span>
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Pending Decision Queue (5/12) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="shadow-xs h-full">
            <CardHeader className="p-4 pb-2 border-b border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-[#1E293B] flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-[#F5A000]" />
                  <span>Pending Approvals</span>
                </CardTitle>
                <Link
                  href="/admin/approvals"
                  className="text-xs font-bold text-[#F5A000] hover:underline flex items-center gap-1"
                >
                  Manage <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {loadingApprovals ? (
                  <p className="text-xs text-[#64748B] text-center py-6">
                    Loading pending requests...
                  </p>
                ) : approvals.length === 0 ? (
                  <div className="text-center py-6 space-y-1.5">
                    <CheckCircle2 className="w-8 h-8 text-[#10B981] mx-auto opacity-70" />
                    <p className="text-xs font-bold text-[#1E293B]">All Clear!</p>
                    <p className="text-[11px] text-[#64748B]">No pending requests require administrative review.</p>
                  </div>
                ) : (
                  approvals.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge variant="outline" className="text-[10px] bg-white text-[#F5A000]">
                            {req.type || "LEAVE_APPLICATION"}
                          </Badge>
                          <h4 className="text-xs font-bold text-[#1E293B] mt-1">
                            {req.title || req.student?.fullName || "Student Request"}
                          </h4>
                        </div>
                        <span className="text-[10px] text-[#94A3B8] font-mono shrink-0">
                          {new Date(req.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B] line-clamp-2">
                        {req.reason || req.description || "Request submitted for administrative approval."}
                      </p>
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickDecision(req.id, "REJECTED")}
                          className="h-6 px-2 text-[10px] border-[#CBD5E1] text-[#EF4444] hover:bg-[#FEE2E2]"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleQuickDecision(req.id, "APPROVED")}
                          className="h-6 px-2 text-[10px] bg-[#F5A000] hover:bg-[#D98E00] text-white"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
