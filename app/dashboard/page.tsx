"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { fetchClientSession } from "@/lib/auth/client-session";
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
    id?: string;
    userId?: string;
    fullName: string;
    role: "STUDENT" | "PARENT" | string;
    institutionName: string;
    studentId?: string;
    activeChildId?: string;
    mustChangePassword?: boolean;
  } | null>(null);

  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "coursework" | "marks" | "credits">("overview");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  // First-login password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);
    if (!pwdCurrent || !pwdNew || !pwdConfirm) {
      setPwdError("Please fill in all password fields.");
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError("New passwords do not match.");
      return;
    }
    if (pwdNew.length < 8) {
      setPwdError("New password must be at least 8 characters long.");
      return;
    }

    try {
      setPwdLoading(true);
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: pwdCurrent,
          newPassword: pwdNew,
          confirmPassword: pwdConfirm,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPwdError(json.error || "Failed to update password.");
        return;
      }
      setPwdSuccess("Password changed successfully!");
      setSession((prev) => (prev ? { ...prev, mustChangePassword: false } : null));
      setTimeout(() => {
        setShowPasswordModal(false);
        setPwdCurrent("");
        setPwdNew("");
        setPwdConfirm("");
        setPwdSuccess(null);
      }, 1500);
    } catch {
      setPwdError("Network error. Please try again.");
    } finally {
      setPwdLoading(false);
    }
  };

  // Fast client-side check to redirect non-student/parent users immediately
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const storedUser = localStorage.getItem("erp_user");
        if (storedUser) {
          const u = JSON.parse(storedUser);
          if (u.role === "ADMIN") {
            router.replace("/admin");
            return;
          }
          if (u.role === "SUPER_ADMIN") {
            router.replace("/super-admin");
            return;
          }
          if (u.role === "TEACHER") {
            const slug = (u.institutionSlug || u.institutionCode || "vidyaniketan").toLowerCase();
            router.replace(`/campus/${slug}/teacher`);
            return;
          }
        }
      }
    } catch {}
  }, [router]);

  // 1. Initial Session Authentication
  useEffect(() => {
    let isMounted = true;
    const fetchSession = async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("erp_token") : null;
        const json = await fetchClientSession(token);

        if (!isMounted) return;

        if (json.success && json.data?.session) {
          const sess = json.data.session;

          // Role Redirection Guard:
          // /dashboard is exclusively for STUDENT and PARENT.
          // Other roles must be directed to their respective portals:
          if (sess.role === "ADMIN") {
            router.replace("/admin");
            return;
          }
          if (sess.role === "SUPER_ADMIN") {
            router.replace("/super-admin");
            return;
          }
          if (sess.role === "TEACHER") {
            const slug = (sess.institutionSlug || sess.institutionCode || "vidyaniketan").toLowerCase();
            router.replace(`/campus/${slug}/teacher`);
            return;
          }

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

  // 3. Initiate dashboard data fetch only for student/parent roles
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("erp_user");
        if (stored) {
          const u = JSON.parse(stored);
          if (u.role && u.role !== "STUDENT" && u.role !== "PARENT") {
            return; // Do not fetch student dashboard for admin/teacher/super-admin
          }
        }
      }
    } catch {}

    fetchDashboardData();
  }, [fetchDashboardData]);

  // 4. Refetch when parent changes active child
  useEffect(() => {
    if (!session || session.role !== "PARENT" || !selectedChildId) return;
    fetchDashboardData(selectedChildId);
  }, [session, selectedChildId, fetchDashboardData]);

  // 5. Listen for activeChildChanged global event from Header ChildSelector
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

  if (session.role !== "STUDENT" && session.role !== "PARENT") {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#123B5A] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-semibold text-[#64748B]">Redirecting to your authorized portal...</p>
        </div>
      </div>
    );
  }

  const isParent = session.role === "PARENT";
  const {
    student,
    attendanceSummary,
    subjectWiseAttendance,
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

  // Student Enrolled Courses with dynamic subject-wise attendance
  const enrolledCourses = React.useMemo(() => {
    const baseCourses = [
      {
        code: "CS301",
        name: "Database Management Systems",
        faculty: "Prof. Rajesh Sharma",
        credits: 4,
        marks: 93,
        grade: "A+",
        theoryPct: 75,
        labPct: 15,
        pendingTasks: 0,
        status: "On Track",
      },
      {
        code: "CS302",
        name: "Operating Systems",
        faculty: "Prof. Rajesh Sharma",
        credits: 4,
        marks: 86,
        grade: "A",
        theoryPct: 72,
        labPct: 16,
        pendingTasks: 1,
        status: "On Track",
      },
      {
        code: "CS303",
        name: "Computer Networks",
        faculty: "Prof. Rajesh Sharma",
        credits: 4,
        marks: 90,
        grade: "A",
        theoryPct: 74,
        labPct: 14,
        pendingTasks: 0,
        status: "On Track",
      },
      {
        code: "CS304",
        name: "Software Engineering & Architecture",
        faculty: "Prof. Rajesh Sharma",
        credits: 3,
        marks: 88,
        grade: "A+",
        theoryPct: 78,
        labPct: 12,
        pendingTasks: 1,
        status: "On Track",
      },
      {
        code: "CS305",
        name: "Web Technologies & Cloud Lab",
        faculty: "Prof. Sunita Verma",
        credits: 2,
        marks: 95,
        grade: "O",
        theoryPct: 82,
        labPct: 12,
        pendingTasks: 0,
        status: "Exemplary",
      },
      {
        code: "CS306",
        name: "Professional Ethics & Values",
        faculty: "Dr. Arvind Swamy",
        credits: 2,
        marks: 85,
        grade: "A",
        theoryPct: 70,
        labPct: 15,
        pendingTasks: 0,
        status: "On Track",
      },
    ];

    const subjectList: any[] = Array.isArray(subjectWiseAttendance) ? subjectWiseAttendance : [];

    return baseCourses.map((c) => {
      const matched = subjectList.find(
        (s: any) =>
          s &&
          ((s.subjectCode && s.subjectCode.toLowerCase() === c.code.toLowerCase()) ||
            (s.subjectName && s.subjectName.toLowerCase() === c.name.toLowerCase()))
      );

      const actualAttendance = matched && matched.percentage !== null && matched.percentage !== undefined ? matched.percentage : null;

      return {
        ...c,
        attendance: actualAttendance,
        attendanceLabel:
          actualAttendance !== null
            ? `${actualAttendance}% Attended`
            : "No sessions",
      };
    });
  }, [subjectWiseAttendance]);

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
      {/* First Login Security Notice */}
      {session?.mustChangePassword && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">First-Time Login Security Notice</p>
              <p className="text-xs text-amber-700">You are currently logged in with a temporary password. Please set a new permanent password to secure your portal account.</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="bg-white border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0 self-start sm:self-auto cursor-pointer"
            onClick={() => setShowPasswordModal(true)}
          >
            Change Password
          </Button>
        </div>
      )}

      {/* Top Header Bar matching the Reference Image */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-[28px] font-extrabold text-[#1E293B] tracking-tight">
              Student Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Session {student?.academicYear || "2025-2026"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-[#64748B]">
            <span>Welcome, <strong className="text-[#1E293B] font-semibold">{displayName}</strong></span>
            <span>•</span>
            <span>Roll No: <span className="font-mono font-semibold text-[#1E293B]">{displayRollNo}</span></span>
            <span>•</span>
            <span>Adm ID: <span className="font-mono font-semibold text-[#1E293B]">{displayAdmissionId}</span></span>
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
              className="bg-[#F5A000] hover:bg-[#DE9100] text-white shadow-xs font-semibold px-4 py-2 rounded-md text-xs flex items-center gap-2 cursor-pointer"
              icon={<ArrowRight className="w-4 h-4" />}
            >
              View Student Profile
            </Button>
          </Link>
        </div>
      </div>

      {loadingData ? (
        <div className="py-20 text-center text-sm text-[#64748B]">
          <div className="w-8 h-8 border-3 border-[#123B5A] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading academic records...
        </div>
      ) : (
        <>
          {/* Row of 6 Horizontal Stat Cards (Student-Specific Metrics in Theme) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
            {/* Card 1: Solid Dark Navy Blue */}
            <div className="p-4 rounded-xl bg-[#123B5A] text-white shadow-xs border border-[#16466C] flex flex-col justify-between transition-all hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">
                  ATTENDANCE
                </span>
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[28px] font-extrabold text-white tracking-tight">
                  {attendanceSummary?.attendancePercentage !== null && attendanceSummary?.attendancePercentage !== undefined
                    ? `${attendanceSummary.attendancePercentage}%`
                    : "N/A"}
                </span>
              </div>
              <span className="text-[11px] text-white/70 truncate">
                {attendanceSummary?.hasData
                  ? `${attendanceSummary.attendedClasses}/${attendanceSummary.totalClasses} classes`
                  : "No attendance data"}
              </span>
            </div>

            {/* Card 2: Today's Classes */}
            <div className="p-4 rounded-xl bg-white text-[#1E293B] shadow-xs border border-[#E2E8F0] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  TODAY&apos;S CLASSES
                </span>
                <div className="w-7 h-7 rounded-lg bg-[#FFFBEB] flex items-center justify-center text-[#F5A000]">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[28px] font-extrabold text-[#1E293B] tracking-tight">
                  {Array.isArray(todaySchedule) ? todaySchedule.length : 0}
                </span>
              </div>
              <span className="text-[11px] text-[#64748B] truncate">
                {Array.isArray(todaySchedule) && todaySchedule.length > 0 ? `${todaySchedule.length} active periods` : "No classes today"}
              </span>
            </div>

            {/* Card 3: Fee Status */}
            <div className="p-4 rounded-xl bg-white text-[#1E293B] shadow-xs border border-[#E2E8F0] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  FEE STATUS
                </span>
                <div className="w-7 h-7 rounded-lg bg-[#FFFBEB] flex items-center justify-center text-[#D97706]">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[26px] font-extrabold text-[#1E293B] tracking-tight truncate">
                  {feeSummary && Number(feeSummary.totalOutstanding) > 0 ? `₹${(Number(feeSummary.totalOutstanding) / 1000).toFixed(1)}k` : "Settled"}
                </span>
              </div>
              <span className="text-[11px] text-[#64748B] truncate">
                {feeSummary && Number(feeSummary.totalOutstanding) > 0 ? "Semester balance due" : "All tuition cleared"}
              </span>
            </div>

            {/* Card 4: Academic CGPA */}
            <div className="p-4 rounded-xl bg-white text-[#1E293B] shadow-xs border border-[#E2E8F0] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  CURRENT CGPA
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-2xl lg:text-[28px] font-extrabold text-[#1E293B] tracking-tight">
                  {cgpa !== undefined && cgpa !== null && Number(cgpa) > 0 ? cgpa : "N/A"}
                </span>
              </div>
              <span className="text-[11px] text-emerald-600 font-semibold truncate">
                {cgpa !== undefined && cgpa !== null && Number(cgpa) > 0 ? "Cumulative Performance" : "Records Pending"}
              </span>
            </div>

            {/* Card 5: Examinations */}
            <div className="p-4 rounded-xl bg-white text-[#1E293B] shadow-xs border border-[#E2E8F0] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  EXAMINATIONS
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-[#123B5A]">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[28px] font-extrabold text-[#1E293B] tracking-tight">
                  {Array.isArray(upcomingExams) ? upcomingExams.length : 0}
                </span>
              </div>
              <span className="text-[11px] text-[#64748B] truncate">
                {Array.isArray(upcomingExams) && upcomingExams.length > 0
                  ? (upcomingExams[0]?.hasHallTicket ? "Hall Ticket Ready" : "Upcoming Schedule")
                  : "No upcoming exams"}
              </span>
            </div>

            {/* Card 6: LMS Tasks */}
            <div className="p-4 rounded-xl bg-white text-[#1E293B] shadow-xs border border-[#E2E8F0] hover:border-[#123B5A]/30 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  PENDING TASKS
                </span>
                <div className="w-7 h-7 rounded-lg bg-[#FEF3C7] flex items-center justify-center text-[#D97706]">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <span className="text-2xl lg:text-[28px] font-extrabold text-[#1E293B] tracking-tight">
                  {Array.isArray(assignments) ? assignments.filter((a: any) => !a?.isSubmitted).length : 0}
                </span>
              </div>
              <span className="text-[11px] text-[#64748B] truncate">
                {Array.isArray(assignments) && assignments.filter((a: any) => !a?.isSubmitted).length > 0 ? "Coursework due soon" : "No pending tasks"}
              </span>
            </div>
          </div>

          {/* Central Student Academic & Course Performance Card */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs mb-6 overflow-hidden">
            {/* Header with Title & Tab Filter Switcher (px-6 py-4 border-b border-[#E2E8F0]) */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-[#1E293B]">
                    Course Progress & Academic Performance
                  </h2>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Semester {student?.currentSemester || 5} • Enrolled subjects, attendance health & syllabus coverage
                </p>
              </div>

              {/* Interactive Tab Switcher */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                {[
                  { id: "overview", label: "Overview" },
                  { id: "attendance", label: "Attendance Health" },
                  { id: "coursework", label: "Coursework & Labs" },
                  { id: "marks", label: "Internal Marks" },
                  { id: "credits", label: "Credit Distribution" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      activeTab === tab.id
                        ? "bg-[#F5A000] text-white shadow-xs"
                        : "text-[#64748B] hover:text-[#1E293B] hover:bg-[#EEF1F5]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Contents: Course Progress Grid (p-6) */}
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {enrolledCourses.map((course, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#123B5A]/30 transition-all shadow-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#D97706] uppercase inline-block mb-1">
                          {course.code}
                        </span>
                        <h4 className="text-xs font-bold text-[#1E293B] truncate" title={course.name}>
                          {course.name}
                        </h4>
                      </div>
                      <span className="text-[11px] font-bold text-[#123B5A] shrink-0 bg-[#EEF1F5] px-2 py-0.5 rounded-md">
                        {activeTab === "attendance"
                          ? course.attendanceLabel
                          : activeTab === "marks"
                          ? `${course.marks}/100 (${course.grade})`
                          : activeTab === "coursework"
                          ? course.pendingTasks > 0
                            ? "1 Due"
                            : "Submitted"
                          : activeTab === "credits"
                          ? `${course.credits} Credits`
                          : course.attendanceLabel}
                      </span>
                    </div>

                    {/* Dual-Color Segmented Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-[#EEF1F5] overflow-hidden flex">
                      <div
                        style={{ width: `${course.theoryPct}%` }}
                        className="h-full bg-[#123B5A]"
                        title={`Lecture Attendance: ${course.theoryPct}%`}
                      />
                      <div
                        style={{ width: `${course.labPct}%` }}
                        className="h-full bg-[#F5A000]"
                        title={`Lab & Practical: ${course.labPct}%`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-0.5">
                      <span className="truncate">Faculty: {course.faculty}</span>
                      <span className="font-semibold text-[#1E293B] shrink-0">{course.credits} Credits</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Summary Strip */}
              <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between text-xs text-[#64748B]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#123B5A]" />
                  <span>Lecture Attendance (Theory)</span>
                  <span className="w-2 h-2 rounded-full bg-[#F5A000] ml-2" />
                  <span>Practical Labs & Coursework</span>
                </div>
                <span className="font-semibold text-[#1E293B]">
                  Semester Load: 6 Enrolled Subjects • 19 Total Credits
                </span>
              </div>
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
                {!Array.isArray(todaySchedule) || todaySchedule.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[#64748B]">
                    <Calendar className="w-8 h-8 text-[#64748B]/40 mx-auto mb-2" />
                    <p className="font-medium text-[#1E293B]">No lectures scheduled for today</p>
                    <p className="text-xs mt-0.5 text-[#64748B]">Enjoy your free study hours or prepare for upcoming assessments.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todaySchedule.map((slot: any) => (
                      <div
                        key={slot.id}
                        className="p-3.5 rounded-xl border border-[#E2E8F0] hover:border-[#123B5A]/40 bg-white hover:shadow-xs flex items-center justify-between transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="px-3 py-1.5 rounded-lg bg-[#EEF1F5] border border-[#E2E8F0] text-center min-w-[80px]">
                            <span className="text-xs font-bold text-[#123B5A] block leading-tight">
                              {slot.startTime}
                            </span>
                            <span className="text-[10px] text-[#64748B] block">
                              {slot.endTime}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#D97706]">
                                {slot.subjectCode}
                              </span>
                              <h3 className="text-sm font-semibold text-[#1E293B]">
                                {slot.subjectName}
                              </h3>
                            </div>
                            <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1">
                              <Users className="w-3 h-3 text-[#64748B]" />
                              <span>Faculty: {slot.teacherName}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1E293B] bg-[#EEF1F5] px-2.5 py-1 rounded-md border border-[#E2E8F0]">
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
                {!Array.isArray(assignments) || assignments.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-4 text-center">No active coursework assignments pending.</p>
                ) : (
                  <div className="space-y-3">
                    {assignments.map((item: any) => {
                      const dueDate = item?.dueDate ? new Date(item.dueDate) : null;
                      const dueStr = dueDate && !isNaN(dueDate.getTime()) ? dueDate.toLocaleDateString() : "TBD";
                      return (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-xl border border-[#E2E8F0] flex items-center justify-between bg-white hover:border-[#123B5A]/30 transition-all shadow-xs"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
                              <BookOpen className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-[#1E293B]">{item.title}</h4>
                              <p className="text-xs text-[#64748B]">{item.subjectName}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={item.isSubmitted ? "success" : "warning"} size="sm">
                              {item.isSubmitted ? "Submitted" : "Pending"}
                            </Badge>
                            <div className="flex items-center gap-1 text-[11px] text-[#64748B] mt-1">
                              <Clock className="w-3 h-3 text-[#64748B]" />
                              <span>Due {dueStr}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                {!Array.isArray(recentResults) || recentResults.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-4 text-center">No recent published exam results.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentResults.map((res: any) => (
                      <div
                        key={res.id}
                        className="p-3.5 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#123B5A]/30 transition-all shadow-xs flex items-center justify-between"
                      >
                        <div>
                          <span className="text-[11px] font-bold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded">
                            {res.subjectCode}
                          </span>
                          <h5 className="text-xs font-semibold text-[#1E293B] mt-1.5 line-clamp-1">
                            {res.subjectName}
                          </h5>
                          <span className="text-[11px] text-[#64748B] font-medium">Score: {res.totalMarks}/100</span>
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
                {!Array.isArray(upcomingExams) || upcomingExams.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-4 text-center">No upcoming examinations scheduled.</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingExams.map((exam: any) => {
                      const startDate = exam?.startDate ? new Date(exam.startDate) : null;
                      const startStr = startDate && !isNaN(startDate.getTime()) ? startDate.toLocaleDateString() : "TBD";
                      return (
                        <div key={exam.id} className="p-3.5 rounded-xl border border-[#E2E8F0] bg-white shadow-xs hover:border-[#123B5A]/30 transition-all">
                          <div className="flex items-center justify-between mb-1.5">
                            <Badge variant="error" size="sm">{exam.examType || "EXAM"}</Badge>
                            <span className="text-xs font-medium text-[#64748B]">{exam.slotsCount || 0} papers</span>
                          </div>
                          <h4 className="text-xs font-bold text-[#1E293B] mt-1">{exam.title}</h4>
                          <p className="text-[11px] text-[#64748B] mt-1 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-[#F5A000]" />
                            <span>Starts: {startStr}</span>
                          </p>
                          {exam.hasHallTicket && (
                            <Link href="/student/examinations">
                              <Button variant="secondary" size="sm" className="w-full mt-2.5 text-xs py-1.5 bg-[#123B5A] hover:bg-[#16466C] text-white rounded-md shadow-xs">
                                Download Admit Card
                              </Button>
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Quick Institutional Fee Alert */}
              {feeSummary && Number(feeSummary.totalOutstanding) > 0 && (
                <div className="p-4 rounded-xl border border-[#F5A000]/30 bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7]/40 text-[#92400E] shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#F5A000]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <CreditCard className="w-4 h-4 text-[#D97706]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#92400E]">Tuition Fee Reminder</h4>
                      <p className="text-xs mt-1 leading-relaxed text-[#78350F]">
                        Outstanding balance of <span className="font-extrabold text-[#92400E]">₹{Number(feeSummary.totalOutstanding).toLocaleString("en-IN")}</span> is due for Semester 5.
                      </p>
                      <Link href="/student/fees">
                        <Button variant="primary" size="sm" className="mt-3 text-xs bg-[#F5A000] hover:bg-[#DE9100] text-white shadow-xs rounded-md">
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
                {!Array.isArray(notifications) || notifications.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-4 text-center">No recent campus notices.</p>
                ) : (
                  <div className="space-y-2.5">
                    {notifications.slice(0, 3).map((item: any) => {
                      const createdDate = item?.createdAt ? new Date(item.createdAt) : null;
                      const dateStr = createdDate && !isNaN(createdDate.getTime()) ? createdDate.toLocaleDateString() : "Recent";
                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-lg border border-[#E2E8F0] bg-white hover:border-[#F5A000] transition-colors shadow-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#D97706] uppercase">
                              {item.category || "Notice"}
                            </span>
                            <span className="text-[10px] text-[#64748B]">
                              {dateStr}
                            </span>
                          </div>
                          <h5 className="text-xs font-semibold text-[#1E293B] line-clamp-1">
                            {item.title}
                          </h5>
                          <p className="text-[11px] text-[#64748B] mt-0.5 line-clamp-2">
                            {item.message}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Quick Services */}
              <Card title="Quick Services" subtitle="Frequent academic actions">
                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    href="/student/attendance"
                    className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#123B5A]/40 hover:shadow-xs text-center block transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-1.5 group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#1E293B] block">Attendance</span>
                    <span className="text-[10px] text-[#64748B] block">View Logs</span>
                  </Link>
                  <Link
                    href="/student/fees"
                    className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#123B5A]/40 hover:shadow-xs text-center block transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#D97706] flex items-center justify-center mx-auto mb-1.5 group-hover:scale-105 transition-transform">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#1E293B] block">Pay Fees</span>
                    <span className="text-[10px] text-[#64748B] block">Online Receipts</span>
                  </Link>
                  <Link
                    href="/student/timetable"
                    className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#123B5A]/40 hover:shadow-xs text-center block transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#123B5A] flex items-center justify-center mx-auto mb-1.5 group-hover:scale-105 transition-transform">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#1E293B] block">Timetable</span>
                    <span className="text-[10px] text-[#64748B] block">Weekly Schedule</span>
                  </Link>
                  <Link
                    href="/student/examinations"
                    className="p-3 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#123B5A]/40 hover:shadow-xs text-center block transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-1.5 group-hover:scale-105 transition-transform">
                      <Award className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#1E293B] block">Hall Tickets</span>
                    <span className="text-[10px] text-[#64748B] block">Exam Results</span>
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Set New Password</h2>
            <p className="text-xs text-slate-500 mb-4">Choose a strong password with at least 8 characters.</p>

            {pwdError && (
              <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div className="p-3 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                {pwdSuccess}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current / Temporary Password</label>
                <input
                  type="password"
                  value={pwdCurrent}
                  onChange={(e) => setPwdCurrent(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123B5A]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123B5A]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123B5A]"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordModal(false)}
                  disabled={pwdLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#123B5A] text-white hover:bg-[#0E2E47]"
                  disabled={pwdLoading}
                >
                  {pwdLoading ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
