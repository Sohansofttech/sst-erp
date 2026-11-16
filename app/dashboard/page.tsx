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
      {/* Welcome Banner */}
      <div className="mb-6 bg-[#0F2942] border border-[#183B5E] rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#183B5E] text-[#F59E0B] border border-[#183B5E] text-xs font-bold px-2 py-0.5 rounded">
                {student?.academicYear || "2025-2026"}
              </span>
              <span className="text-xs text-[#8FA6B9]">
                Semester {student?.currentSemester || 5} • Section {student?.currentSection || "A"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mt-2 text-white">
              Welcome back, {student?.firstName} {student?.lastName}!
            </h1>
            <p className="text-sm text-[#8FA6B9] mt-1">
              Roll No: <span className="font-semibold text-white">{student?.rollNumber || "N/A"}</span> | Admission ID:{" "}
              <span className="font-semibold text-white">{student?.admissionNumber || "N/A"}</span> | {student?.course}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/student/profile">
              <Button variant="primary" size="sm" className="bg-[#F59E0B] hover:bg-[#D97706] text-white shadow-sm font-semibold">
                View Student Profile
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {loadingData ? (
        <div className="py-20 text-center text-sm text-[#64748B]">
          <div className="w-8 h-8 border-3 border-[#0F2942] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Loading academic records...
        </div>
      ) : (
        <>
          {/* 4 Metric Summary Cards - First is Solid Midnight Navy like the Reference Design */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Attendance"
              value={`${attendanceSummary?.attendancePercentage ?? 0}%`}
              subtitle={`${attendanceSummary?.attendedClasses ?? 0} of ${attendanceSummary?.totalClasses ?? 0} classes`}
              badgeText={attendanceSummary?.attendancePercentage >= 75 ? "Good Standing" : "Low Attendance"}
              badgeVariant={attendanceSummary?.attendancePercentage >= 75 ? "success" : "error"}
              variant="dark"
              icon={<CheckCircle2 className="w-5 h-5 text-white" />}
            />
            <StatCard
              title="Today's Schedule"
              value={`${todaySchedule?.length ?? 0} Classes`}
              subtitle="Timetable for today"
              icon={<Calendar className="w-5 h-5 text-[#F59E0B]" />}
            />
            <StatCard
              title="Fee Status"
              value={feeSummary?.totalOutstanding > 0 ? `₹${feeSummary.totalOutstanding.toLocaleString()}` : "Fully Settled"}
              subtitle={feeSummary?.totalOutstanding > 0 ? "Pending Balance Due" : "No Pending Dues"}
              badgeText={feeSummary?.totalOutstanding > 0 ? "Due Dec 15" : "Paid"}
              badgeVariant={feeSummary?.totalOutstanding > 0 ? "warning" : "success"}
              icon={<CreditCard className="w-5 h-5 text-[#F59E0B]" />}
            />
            <StatCard
              title="Upcoming Exams"
              value={`${upcomingExams?.length ?? 0} Exams`}
              subtitle="Semester Finals"
              badgeText={upcomingExams?.[0]?.hasHallTicket ? "Hall Ticket Ready" : "Schedule Released"}
              badgeVariant="info"
              icon={<Award className="w-5 h-5 text-[#F59E0B]" />}
            />
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
                  <p className="text-sm text-[#64748B]">No classes scheduled for today.</p>
                ) : (
                  <div className="space-y-3">
                    {todaySchedule?.map((slot: any) => (
                      <div
                        key={slot.id}
                        className="p-3.5 rounded-xl border border-[#E2E8F0] hover:border-[#F59E0B] bg-[#EEF2F6]/50 flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-center min-w-[75px]">
                            <span className="text-xs font-bold text-[#0F2942] block">
                              {slot.startTime}
                            </span>
                            <span className="text-[10px] text-[#64748B] block">
                              {slot.endTime}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#D97706]">
                                {slot.subjectCode}
                              </span>
                              <h3 className="text-sm font-semibold text-[#1E293B]">
                                {slot.subjectName}
                              </h3>
                            </div>
                            <p className="text-xs text-[#64748B] mt-0.5">
                              Faculty: {slot.teacherName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[#64748B] bg-white px-2.5 py-1 rounded-md border border-[#E2E8F0]">
                          <MapPin className="w-3.5 h-3.5 text-[#F59E0B]" />
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
                <div className="space-y-3">
                  {assignments?.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-[#E2E8F0] flex items-center justify-between bg-white"
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
                          <Clock className="w-3 h-3" />
                          <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Recent Academic Results & Academic Performance */}
              {/* Recent Academic Results & Grades */}
              <Card
                title="Recent Academic Results & Grades"
                subtitle={`Semester cumulative average • CGPA: ${cgpa !== undefined ? cgpa : "N/A"}`}
                action={
                  <Link href="/student/examinations">
                    <Button variant="ghost" size="sm" icon={<ArrowRight className="w-4 h-4" />}>
                      Full Transcript
                    </Button>
                  </Link>
                }
              >
                {recentResults?.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No recent published exam results.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentResults?.map((res: any) => (
                      <div
                        key={res.id}
                        className="p-3 rounded-xl border border-[#E2E8F0] bg-[#EEF2F6]/50 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-[11px] font-bold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded">
                            {res.subjectCode}
                          </span>
                          <h5 className="text-xs font-semibold text-[#1E293B] mt-1 line-clamp-1">
                            {res.subjectName}
                          </h5>
                          <span className="text-[11px] text-[#64748B]">Score: {res.totalMarks}/100</span>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-[#0F2942] block">
                            {res.grade}
                          </span>
                          <Badge variant={res.isPassed ? "success" : "error"} size="sm">
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
                  <p className="text-xs text-[#64748B]">No upcoming exams scheduled.</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingExams?.map((exam: any) => (
                      <div key={exam.id} className="p-3 rounded-lg border border-[#E2E8F0] bg-[#EEF2F6]/50">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="error" size="sm">{exam.examType}</Badge>
                          <span className="text-xs text-[#64748B]">{exam.slotsCount} papers</span>
                        </div>
                        <h4 className="text-xs font-semibold text-[#1E293B] mt-1">{exam.title}</h4>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          Starts: {new Date(exam.startDate).toLocaleDateString()}
                        </p>
                        {exam.hasHallTicket && (
                          <Link href="/student/examinations">
                            <Button variant="secondary" size="sm" className="w-full mt-2 text-xs py-1 bg-[#0F2942] hover:bg-[#183B5E] text-white">
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
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">Fee Reminder</h4>
                      <p className="text-xs mt-1 leading-relaxed">
                        Outstanding tuition fee balance of <span className="font-bold">₹{feeSummary.totalOutstanding.toLocaleString()}</span>.
                      </p>
                      <Link href="/student/fees">
                        <Button variant="primary" size="sm" className="mt-3 text-xs bg-[#F59E0B] hover:bg-[#D97706] text-white">
                          Pay Online Now
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
                    <Bell className="w-4 h-4 text-[#F59E0B]" />
                    <span>Announcements & Circulars</span>
                  </div>
                }
                subtitle="Campus notices & academic updates"
              >
                {notifications?.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No recent announcements.</p>
                ) : (
                  <div className="space-y-2.5">
                    {notifications?.slice(0, 3).map((item: any) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-lg border border-[#E2E8F0] bg-[#EEF2F6]/50 hover:border-[#F59E0B] transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#D97706] uppercase">
                            {item.category}
                          </span>
                          <span className="text-[10px] text-[#64748B]">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h5 className="text-xs font-semibold text-[#1E293B] line-clamp-1">
                          {item.title}
                        </h5>
                        <p className="text-[11px] text-[#64748B] mt-0.5 line-clamp-2">
                          {item.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Quick Nav Links */}
              <Card title="Quick Services">
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/student/attendance" className="p-2.5 rounded-lg border border-[#E2E8F0] hover:bg-[#EEF2F6] text-center block transition-colors">
                    <CheckCircle2 className="w-5 h-5 text-[#16A34A] mx-auto mb-1" />
                    <span className="text-xs font-medium text-[#1E293B]">Attendance</span>
                  </Link>
                  <Link href="/student/fees" className="p-2.5 rounded-lg border border-[#E2E8F0] hover:bg-[#EEF2F6] text-center block transition-colors">
                    <CreditCard className="w-5 h-5 text-[#F59E0B] mx-auto mb-1" />
                    <span className="text-xs font-medium text-[#1E293B]">Pay Fees</span>
                  </Link>
                  <Link href="/student/campus-services" className="p-2.5 rounded-lg border border-[#E2E8F0] hover:bg-[#EEF2F6] text-center block transition-colors">
                    <Building2 className="w-5 h-5 text-[#0F2942] mx-auto mb-1" />
                    <span className="text-xs font-medium text-[#1E293B]">Campus Services</span>
                  </Link>
                  <Link href="/student/feedback" className="p-2.5 rounded-lg border border-[#E2E8F0] hover:bg-[#EEF2F6] text-center block transition-colors">
                    <MessageSquare className="w-5 h-5 text-[#F59E0B] mx-auto mb-1" />
                    <span className="text-xs font-medium text-[#1E293B]">Feedback</span>
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
