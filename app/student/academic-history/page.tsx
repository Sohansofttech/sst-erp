"use client";

import React, { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { Table } from "@/components/shared/Table";
import { GraduationCap, History, CheckCircle2, ShieldCheck } from "lucide-react";

export default function AcademicHistoryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/student/academics", { credentials: "include" });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    const handleChildChanged = () => {
      fetchHistory();
    };
    window.addEventListener("activeChildChanged", handleChildChanged);
    return () => {
      window.removeEventListener("activeChildChanged", handleChildChanged);
    };
  }, []);

  if (loading) {
    return (
      <PortalLayout portalType="STUDENT" pageTitle="Academic Progression History">
        <div className="py-20 text-center text-sm text-[#64748B]">Loading academic history...</div>
      </PortalLayout>
    );
  }

  const { enrollmentsHistory, institution, rollNumber, admissionNumber } = data || {};

  return (
    <PortalLayout portalType="STUDENT" pageTitle="Academic History & Progression">
      {/* Rule 4 Callout */}
      <div className="mb-6 p-4 rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/60 text-[#92400E] flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-bold uppercase tracking-wider">Historical Preservation Rule 4 Verified</p>
          <p className="mt-0.5 leading-relaxed">
            All prior semester enrollments, grades, and promotion timestamps remain immutably preserved in the
            institutional database as the student advances.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <Card
          title="Enrollment & Progression Timeline"
          subtitle={`Student: ${rollNumber} • Admission: ${admissionNumber} • ${institution?.name}`}
        >
          <div className="space-y-4">
            {enrollmentsHistory?.map((enrollment: any, idx: number) => {
              const isCurrent = enrollment.status === "ACTIVE";

              return (
                <div
                  key={enrollment.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrent
                      ? "bg-[#FFFBEB] border-[#F59E0B] shadow-sm"
                      : "bg-white border-[#E2E8F0]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isCurrent
                            ? "bg-[#0F2942] text-[#F59E0B]"
                            : "bg-[#EEF2F6] text-[#0F2942]"
                        }`}
                      >
                        S{enrollment.semester}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#1E293B]">
                          Semester {enrollment.semester} — Section {enrollment.section}
                        </h3>
                        <p className="text-xs text-[#64748B]">
                          {enrollment.courseName} ({enrollment.courseCode})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          isCurrent
                            ? "info"
                            : enrollment.status === "PROMOTED"
                            ? "success"
                            : "neutral"
                        }
                      >
                        {enrollment.status}
                      </Badge>
                      <span className="text-xs font-semibold text-[#0F2942] bg-[#EEF2F6] px-2 py-0.5 rounded">
                        AY {enrollment.academicYear}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-3 border-t border-[#E2E8F0]/70 text-xs">
                    <div>
                      <span className="text-[#64748B]">Enrolled Date:</span>{" "}
                      <span className="font-semibold text-[#1E293B]">
                        {new Date(enrollment.enrolledDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">GPA / Score:</span>{" "}
                      <span className="font-semibold text-[#1E293B]">
                        {enrollment.gradePointAverage ? `${enrollment.gradePointAverage} / 10.0` : "In Progress"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Promotion Remarks:</span>{" "}
                      <span className="font-medium text-[#1E293B]">
                        {enrollment.promotionRemarks || "Active Semester"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </PortalLayout>
  );
}
