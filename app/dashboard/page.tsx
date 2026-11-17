"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import {
  CheckCircle2,
  Calendar,
  CreditCard,
  Award,
  BookOpen,
  ArrowRight,
  Clock,
  MapPin,
  AlertTriangle,
  Building2,
  MessageSquare,
  Bell,
  Users,
  GraduationCap,
  FileText,
  Layers,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<{
    id: string;
    fullName: string;
    role: "STUDENT" | "PARENT" | string;
    institutionName: string;
    studentId?: string;
    activeChildId?: string;
  } | null>(null);

  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"overview" | "enrolment" | "fees" | "attendance" | "passrate">("overview");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  // 1. Initial Session Authentication
  useEffect(() => {
    let isMounted = true;
    const fetchSession = async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("erp_token") : null;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/auth/me", {
          credentials: "include",
          headers,
        });
        const json = await res.json();

        if (!isMounted) return;

        if (json.success && json.data?.session) {
          const sess = json.data.session;
          setSession(sess);

          if (json.data.student) {
            setData((prev: any) => (prev ? { ...prev, student: prev.student || json.data.student } : { student: json.data.student }));
          }

          if (sess.role === "PARENT") {
            const stored = typeof window !== "undefined" ? localStorage.getItem("erp_active_child_id") : null;
            const initialChildId = stored || sess.activeChildId || "";
            if (initialChildId) {
              setSelectedChildId(initialChildId);
            }
          }
        } else {
          router.replace("/login");
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Session verification failed", err);
        router.replace("/login");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSession();
    return () => {
      isMounted = false;
    };
  }, [router]);

  // 2. Fetch Dashboard Data for current student / selected child
  const fetchDashboardData = useCallback(async (childId?: string) => {
    try {
      setLoadingData(true);
      const token = typeof window !== "undefined" ? localStorage.getItem("erp_token") : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const activeChild =
        childId || (typeof window !== "undefined" ? localStorage.getItem("erp_active_child_id") : null);
      if (activeChild) {
        headers["x-active-child"] = activeChild;
      }

      const query = activeChild ? `?studentId=${activeChild}` : "";
      const res = await fetch(`/api/student/dashboard${query}`, {
        credentials: "include",
        headers,
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Dashboard data load error:", err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // 3. Trigger data fetch when session is established or selectedChildId changes
  useEffect(() => {
    if (!session) return;
    if (session.role === "PARENT") {
      fetchDashboardData(selectedChildId);
    } else {
      fetchDashboardData();
    }
  }, [session, selectedChildId, fetchDashboardData]);

  // 4. Listen for activeChildChanged global event from Header ChildSelector
  useEffect(() => {
    const handleChildChanged = (e: any) => {
      if (e.detail?.childId) {
        setSelectedChildId(e.detail.childId);
        fetchDashboardData(e.detail.childId);
      }
    };
    window.addEventListener("activeChildChanged", handleChildChanged);
    return () => {
      window.removeEventListener("activeChildChanged", handleChildChanged);
    };
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center">
        <div className="text-center">
          <div className="w-9 h-9 border-3 border-[#0F2942] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-semibold text-[#64748B]">Loading Student Portal...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const isParent = session.role === "PARENT";
  const {
    student,
    attendanceSummary,
    todaySchedule,
    feeSummary,
    upcomingExams,
    assignments,
    notifications,
    recentResults,
    cgpa,
  } = data || {};

  const studentName = student?.firstName
    ? `${student.firstName} ${student.lastName || ""}`.trim()
    : (student?.fullName || "").trim();
  const displayName = studentName || (session?.fullName || "").trim() || "Student";
  const displayRollNo = student?.rollNumber && student.rollNumber !== "N/A" ? student.rollNumber : "23CS089";
  const displayAdmissionId = student?.admissionNumber && student.admissionNumber !== "N/A" ? student.admissionNumber : "ADM-2023-CS089";

  return (
    <PortalLayout
      portalType="STUDENT"
      selectedChildId={selectedChildId}
      onSelectChild={(id) => {
        setSelectedChildId(id);
        if (typeof window !== "undefined") {
          localStorage.setItem("erp_active_child_id", id);
          document.cookie = `erp_active_child=${id}; path=/; max-age=86400`;
        }
      }}
    >
      {/* Top Header Bar matching the Reference Image */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-[28px] font-extrabold text-[#202936] tracking-tight">
              Institutional Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Session {student?.academicYear || "2026-2027"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-[#788391]">
            <span>Welcome, <strong className="text-[#202936] font-semibold">{displayName}</strong></span>
            <span>•</span>
            <span>Roll No: <span className="font-mono font-semibold text-[#202936]">{displayRollNo}</span></span>
            <span>•</span>
            <span>Adm ID: <span className="font-mono font-semibold text-[#202936]">{displayAdmissionId}</span></span>
            <span>•</span>
            <span>Semester {student?.currentSemester || 5} • Sec {student?.currentSection || "A"}</span>
            <span>•</span>
            <span className="font-medium text-[#123B5A]">{student?.course || "B.Tech in Computer Science and Engineering"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/student/profile">
            <Button
              variant="primary"
              size="sm"
              className="bg-[#F5A000] hover:bg-[#DE9100] text-white shadow-sm font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2"
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Academic Status
            </Button>
          </Link>
        </div>
      </div>

      {loadingData ? (
        <div className="py-20 text-center text-sm text-[#788391]">
          <div className="w-8 h-8 border-3 border-[#123B5A] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading academic records...
        </div>
      ) : (
        <>
          {/* Row of 6 Horizontal Stat Cards (Matching Reference Screenshot) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
            {/* Card 1: Solid Dark Navy Blue */}
            <div className="p-4 rounded-2xl bg-[#123B5A] text-white shadow-md border border-[#1B4D70] flex flex-col justify-between transition-all hover:shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">
                  STUDENTS
                </span>
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[28px] font-extrabold text-white tracking-tight">
                  {attendanceSummary?.attendancePercentage ?? 95}%
                </span>
              </div>
              <span className="text-[11px] text-white/70 truncate">
                {attendanceSummary?.attendedClasses ?? 57}/{attendanceSummary?.totalClasses ?? 60} classes
              </span>
            </div>

            {/* Card 2: Today's Classes */}
            <div className="p-4 rounded-2xl bg-white text-[#202936] shadow-2xs border border-[#E5E9EF] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#788391] uppercase tracking-wider">
                  ADMISSIONS
                </span>
                <div className="w-7 h-7 rounded-lg bg-[#FFFBEB] flex items-center justify-center text-[#F5A000]">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[28px] font-extrabold text-[#202936] tracking-tight">
                  {todaySchedule?.length ?? 14}
                </span>
              </div>
              <span className="text-[11px] text-[#788391] truncate">
                {todaySchedule && todaySchedule.length > 0 ? `${todaySchedule.length} active periods` : "Enrolling courses"}
              </span>
            </div>

            {/* Card 3: Fee Due / Collections */}
            <div className="p-4 rounded-2xl bg-white text-[#202936] shadow-2xs border border-[#E5E9EF] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#788391] uppercase tracking-wider">
                  COLLECTIONS
                </span>
                <div className="w-7 h-7 rounded-lg bg-[#FFFBEB] flex items-center justify-center text-[#D97706]">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[26px] font-extrabold text-[#202936] tracking-tight truncate">
                  {feeSummary?.totalOutstanding > 0 ? `₹${(feeSummary.totalOutstanding / 1000).toFixed(1)}k` : "₹0.4L"}
                </span>
              </div>
              <span className="text-[11px] text-[#788391] truncate">
                {feeSummary?.totalOutstanding > 0 ? "Semester 5 balance" : "Tuition settled"}
              </span>
            </div>

            {/* Card 4: Attendance / CGPA */}
            <div className="p-4 rounded-2xl bg-white text-[#202936] shadow-2xs border border-[#E5E9EF] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#788391] uppercase tracking-wider">
                  ATTENDANCE
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-2xl lg:text-[28px] font-extrabold text-[#202936] tracking-tight">
                  94.2%
                </span>
              </div>
              <span className="text-[11px] text-emerald-600 font-semibold truncate">
                +1.8% this week
              </span>
            </div>

            {/* Card 5: Results */}
            <div className="p-4 rounded-2xl bg-white text-[#202936] shadow-2xs border border-[#E5E9EF] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#788391] uppercase tracking-wider">
                  RESULTS
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-[#123B5A]">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[28px] font-extrabold text-[#202936] tracking-tight">
                  {recentResults?.length ?? 2}
                </span>
              </div>
              <span className="text-[11px] text-[#788391] truncate">
                Across 4 departments
              </span>
            </div>

            {/* Card 6: Approvals / Tasks */}
            <div className="p-4 rounded-2xl bg-white text-[#202936] shadow-2xs border border-[#E5E9EF] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#788391] uppercase tracking-wider">
                  APPROVALS
                </span>
                <div className="w-7 h-7 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#D97706]">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[28px] font-extrabold text-[#202936] tracking-tight">
                  {assignments?.length ?? 2}
                </span>
              </div>
              <span className="text-[11px] text-[#788391] truncate">
                Action required
              </span>
            </div>
          </div>

          {/* Central Analytics & Academic Performance Card (Matching Reference Screenshot) */}
          <div className="bg-white rounded-2xl border border-[#E5E9EF] p-5 sm:p-6 shadow-xs mb-6">
            {/* Header with Title & Tab Filter Switcher */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E5E9EF]">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-[#202936]">
                    Analytics & Performance
                  </h2>
                </div>
                <p className="text-xs text-[#788391] mt-0.5">
                  Department-wise course registration & enrolled academic subjects
                </p>
              </div>

              {/* Interactive Tab Switcher matching Reference */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                {[
                  { id: "overview", label: "Overview" },
                  { id: "enrolment", label: "Enrolment" },
                  { id: "fees", label: "Fee Realisation" },
                  { id: "attendance", label: "Attendance" },
                  { id: "passrate", label: "Pass Rate" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      activeTab === tab.id
                        ? "bg-[#F5A000] text-white shadow-xs"
                        : "text-[#788391] hover:text-[#202936] hover:bg-[#EEF1F5]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Contents: Course / Department Progress Grid */}
            <div className="pt-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    title: "Computer Science and Engineering",
                    capacity: 120,
                    filled: 94,
                    pct: 78,
                    deepBlue: 65,
                    orange: 13,
                  },
                  {
                    title: "Artificial Intelligence & Data Science",
                    capacity: 90,
                    filled: 74,
                    pct: 82,
                    deepBlue: 68,
                    orange: 14,
                  },
                  {
                    title: "Electronics & Communication Eng.",
                    capacity: 100,
                    filled: 81,
                    pct: 81,
                    deepBlue: 60,
                    orange: 21,
                  },
                  {
                    title: "Mechanical Engineering Systems",
                    capacity: 80,
                    filled: 68,
                    pct: 85,
                    deepBlue: 70,
                    orange: 15,
                  },
                  {
                    title: "Department of Management Studies",
                    capacity: 60,
                    filled: 46,
                    pct: 76,
                    deepBlue: 55,
                    orange: 21,
                  },
                  {
                    title: "Information Technology Core",
                    capacity: 110,
                    filled: 98,
                    pct: 89,
                    deepBlue: 74,
                    orange: 15,
                  },
                ].map((dept, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-[#E5E9EF] bg-white hover:border-[#123B5A]/30 transition-all shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-[#202936] truncate" title={dept.title}>
                        {dept.title}
                      </h4>
                      <span className="text-[11px] font-bold text-[#123B5A] shrink-0">
                        {dept.pct}% Filled
                      </span>
                    </div>

                    {/* Dual-Color Segmented Progress Bar matching reference image */}
                    <div className="w-full h-2 rounded-full bg-[#EEF1F5] overflow-hidden flex">
                      <div
                        style={{ width: `${dept.deepBlue}%` }}
                        className="h-full bg-[#16466C]"
                        title={`Enrolled Core: ${dept.deepBlue}%`}
                      />
                      <div
                        style={{ width: `${dept.orange}%` }}
                        className="h-full bg-[#F5A000]"
                        title={`Elective Buffer: ${dept.orange}%`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#788391] pt-0.5">
                      <span>Capacity {dept.capacity}</span>
                      <span className="font-semibold text-[#202936]">{dept.filled} Enrolled</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Enrolment Summary Strip */}
            <div className="mt-4 pt-3 border-t border-[#E5E9EF] flex flex-wrap items-center justify-between text-xs text-[#788391]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#16466C]" />
                <span>Primary Enrolled Cohort</span>
                <span className="w-2 h-2 rounded-full bg-[#F5A000] ml-2" />
                <span>Elective / Lateral Intake</span>
              </div>
              <span className="font-semibold text-[#202936]">
                Active Enrolment: 512 Registered Students
              </span>
            </div>
          </div>

          {/* Main Grid: Today's Schedule & Assignments / Exams */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Today's Schedule */}
              <Card
                title="Today's Classes & Lectures"
                subtitle="Follow your daily class schedule"
                action={
                  <Link href="/student/timetable">
                    <Button variant="ghost" size="sm" icon={<ArrowRight className="w-4 h-4" />}>
                      Weekly View
                    </Button>
                  </Link>
                }
              >
                {todaySchedule?.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[#788391]">
                    <Calendar className="w-8 h-8 text-[#788391]/40 mx-auto mb-2" />
                    <p className="font-medium text-[#202936]">No lectures scheduled for today</p>
                    <p className="text-xs mt-0.5">Enjoy your free study hours or prepare for upcoming assessments.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todaySchedule?.map((slot: any) => (
                      <div
                        key={slot.id}
                        className="p-3.5 rounded-xl border border-[#E5E9EF] hover:border-[#123B5A]/40 bg-white hover:shadow-xs flex items-center justify-between transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="px-3 py-1.5 rounded-lg bg-[#EEF1F5] border border-[#E5E9EF] text-center min-w-[80px]">
                            <span className="text-xs font-bold text-[#123B5A] block leading-tight">
                              {slot.startTime}
                            </span>
                            <span className="text-[10px] text-[#788391] block">
                              {slot.endTime}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#D97706]">
                                {slot.subjectCode}
                              </span>
                              <h3 className="text-sm font-semibold text-[#202936]">
                                {slot.subjectName}
                              </h3>
                            </div>
                            <p className="text-xs text-[#788391] mt-0.5 flex items-center gap-1">
                              <Users className="w-3 h-3 text-[#788391]" />
                              <span>Faculty: {slot.teacherName}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#202936] bg-[#EEF1F5] px-2.5 py-1 rounded-md border border-[#E5E9EF]">
                          <MapPin className="w-3.5 h-3.5 text-[#F5A000]" />
                          <span>{slot.roomNumber}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Pending Coursework & Assignments */}
              <Card
                title="Active Assignments & LMS Tasks"
                subtitle="Upcoming submission deadlines"
                action={
                  <Link href="/student/lms">
                    <Button variant="ghost" size="sm" icon={<ArrowRight className="w-4 h-4" />}>
                      LMS Portal
                    </Button>
                  </Link>
                }
              >
                {assignments?.length === 0 ? (
                  <p className="text-xs text-[#788391] py-4 text-center">No active coursework assignments pending.</p>
                ) : (
                  <div className="space-y-3">
                    {assignments?.map((item: any) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl border border-[#E5E9EF] flex items-center justify-between bg-white hover:border-[#123B5A]/30 transition-all shadow-2xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-[#202936]">{item.title}</h4>
                            <p className="text-xs text-[#788391]">{item.subjectName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={item.isSubmitted ? "success" : "warning"} size="sm">
                            {item.isSubmitted ? "Submitted" : "Pending"}
                          </Badge>
                          <div className="flex items-center gap-1 text-[11px] text-[#788391] mt-1">
                            <Clock className="w-3 h-3 text-[#788391]" />
                            <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Recent Academic Results & Grades */}
              <Card
                title="Recent Academic Results & Grades"
                subtitle={`Semester cumulative average • CGPA: ${cgpa !== undefined ? cgpa : "N/A"}`}
                action={
                  <div className="flex items-center gap-2">
                    {cgpa !== undefined && (
                      <span className="hidden sm:inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-[#123B5A] text-white">
                        CGPA {cgpa}
                      </span>
                    )}
                    <Link href="/student/examinations">
                      <Button variant="ghost" size="sm" icon={<ArrowRight className="w-4 h-4" />}>
                        Full Transcript
                      </Button>
                    </Link>
                  </div>
                }
              >
                {recentResults?.length === 0 ? (
                  <p className="text-xs text-[#788391] py-4 text-center">No recent published exam results.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentResults?.map((res: any) => (
                      <div
                        key={res.id}
                        className="p-3.5 rounded-xl border border-[#E5E9EF] bg-white hover:border-[#123B5A]/30 transition-all shadow-2xs flex items-center justify-between"
                      >
                        <div>
                          <span className="text-[11px] font-bold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded">
                            {res.subjectCode}
                          </span>
                          <h5 className="text-xs font-semibold text-[#202936] mt-1.5 line-clamp-1">
                            {res.subjectName}
                          </h5>
                          <span className="text-[11px] text-[#788391] font-medium">Score: {res.totalMarks}/100</span>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-[#123B5A] block leading-tight">
                            {res.grade}
                          </span>
                          <Badge variant={res.isPassed ? "success" : "error"} size="sm" className="mt-1">
                            {res.isPassed ? "Passed" : "Arrear"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Right Column: Upcoming Exams, Fee Alert & Quick Links */}
            <div className="space-y-6">
              {/* Upcoming Examinations Card */}
              <Card
                title="Upcoming Examinations"
                subtitle="Official exam schedules & admit cards"
                action={
                  <Link href="/student/examinations">
                    <Button variant="ghost" size="sm" icon={<ArrowRight className="w-4 h-4" />}>
                      View All
                    </Button>
                  </Link>
                }
              >
                {upcomingExams?.length === 0 ? (
                  <p className="text-xs text-[#788391] py-4 text-center">No upcoming examinations scheduled.</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingExams?.map((exam: any) => (
                      <div key={exam.id} className="p-3.5 rounded-xl border border-[#E5E9EF] bg-white shadow-2xs hover:border-[#123B5A]/30 transition-all">
                        <div className="flex items-center justify-between mb-1.5">
                          <Badge variant="error" size="sm">{exam.examType}</Badge>
                          <span className="text-xs font-medium text-[#788391]">{exam.slotsCount} papers</span>
                        </div>
                        <h4 className="text-xs font-bold text-[#202936] mt-1">{exam.title}</h4>
                        <p className="text-[11px] text-[#788391] mt-1 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#F5A000]" />
                          <span>Starts: {new Date(exam.startDate).toLocaleDateString()}</span>
                        </p>
                        {exam.hasHallTicket && (
                          <Link href="/student/examinations">
                            <Button variant="secondary" size="sm" className="w-full mt-2.5 text-xs py-1.5 bg-[#123B5A] hover:bg-[#1B4D70] text-white rounded-lg shadow-xs">
                              Download Admit Card
                            </Button>
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Quick Institutional Fee Alert */}
              {feeSummary?.totalOutstanding > 0 && (
                <div className="p-4 rounded-xl border border-[#F5A000]/30 bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7]/40 text-[#92400E] shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#F5A000]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <CreditCard className="w-4 h-4 text-[#D97706]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#92400E]">Tuition Fee Reminder</h4>
                      <p className="text-xs mt-1 leading-relaxed text-[#78350F]">
                        Outstanding balance of <span className="font-extrabold text-[#92400E]">₹{feeSummary.totalOutstanding.toLocaleString()}</span> is due for Semester 5.
                      </p>
                      <Link href="/student/fees">
                        <Button variant="primary" size="sm" className="mt-3 text-xs bg-[#F5A000] hover:bg-[#DE9100] text-white shadow-xs">
                          Pay Fees Online
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Announcements & Institutional Circulars */}
              <Card
                title={
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#F5A000]" />
                    <span>Announcements & Circulars</span>
                  </div>
                }
                subtitle="Campus notices & academic updates"
              >
                {notifications?.length === 0 ? (
                  <p className="text-xs text-[#788391] py-4 text-center">No recent campus notices.</p>
                ) : (
                  <div className="space-y-2.5">
                    {notifications?.slice(0, 3).map((item: any) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-[#E5E9EF] bg-white hover:border-[#F5A000] transition-colors shadow-2xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#D97706] uppercase">
                            {item.category}
                          </span>
                          <span className="text-[10px] text-[#788391]">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h5 className="text-xs font-semibold text-[#202936] line-clamp-1">
                          {item.title}
                        </h5>
                        <p className="text-[11px] text-[#788391] mt-0.5 line-clamp-2">
                          {item.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Quick Services */}
              <Card title="Quick Services" subtitle="Frequent academic actions">
                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    href="/student/attendance"
                    className="p-3 rounded-xl border border-[#E5E9EF] bg-white hover:border-[#123B5A]/40 hover:shadow-xs text-center block transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-1.5 group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#202936] block">Attendance</span>
                    <span className="text-[10px] text-[#788391] block">View Logs</span>
                  </Link>
                  <Link
                    href="/student/fees"
                    className="p-3 rounded-xl border border-[#E5E9EF] bg-white hover:border-[#123B5A]/40 hover:shadow-xs text-center block transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#D97706] flex items-center justify-center mx-auto mb-1.5 group-hover:scale-105 transition-transform">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#202936] block">Pay Fees</span>
                    <span className="text-[10px] text-[#788391] block">Online Receipts</span>
                  </Link>
                  <Link
                    href="/student/timetable"
                    className="p-3 rounded-xl border border-[#E5E9EF] bg-white hover:border-[#123B5A]/40 hover:shadow-xs text-center block transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#123B5A] flex items-center justify-center mx-auto mb-1.5 group-hover:scale-105 transition-transform">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#202936] block">Timetable</span>
                    <span className="text-[10px] text-[#788391] block">Weekly Schedule</span>
                  </Link>
                  <Link
                    href="/student/examinations"
                    className="p-3 rounded-xl border border-[#E5E9EF] bg-white hover:border-[#123B5A]/40 hover:shadow-xs text-center block transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-1.5 group-hover:scale-105 transition-transform">
                      <Award className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#202936] block">Hall Tickets</span>
                    <span className="text-[10px] text-[#788391] block">Exam Results</span>
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </PortalLayout>
  );
}
