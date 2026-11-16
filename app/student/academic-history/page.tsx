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
        <div className="py-20 text-center text-sm text-[#788391]">Loading academic history...</div>
      </PortalLayout>
    );
  }

  const { enrollmentsHistory, institution, rollNumber, admissionNumber } = data || {};

  return (
    <PortalLayout portalType="STUDENT" pageTitle="Academic History & Progression">
      {/* Official Academic Records Notice */}
      <div className="mb-6 p-4 rounded-xl border border-[#E5E9EF] bg-white shadow-sm flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-lg bg-[#123B5A]/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-[#123B5A]" />
        </div>
        <div className="text-xs">
          <p className="font-semibold text-[#123B5A]">Official Academic Progression Record</p>
          <p className="mt-0.5 text-[#788391] leading-relaxed">
            All completed semester enrollments, credits, and promotion timestamps are certified and immutably preserved in the
            institutional registry as you advance through your program.
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
                      ? "bg-[#FFFBEB] border-[#F5A000] shadow-sm"
                      : "bg-white border-[#E5E9EF]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isCurrent
                            ? "bg-[#123B5A] text-[#F5A000]"
                            : "bg-[#EEF1F5] text-[#123B5A]"
                        }`}
                      >
                        S{enrollment.semester}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#202936]">
                          Semester {enrollment.semester} — Section {enrollment.section}
                        </h3>
                        <p className="text-xs text-[#788391]">
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
                      <span className="text-xs font-semibold text-[#123B5A] bg-[#EEF1F5] px-2 py-0.5 rounded">
                        AY {enrollment.academicYear}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-3 border-t border-[#E5E9EF]/70 text-xs">
                    <div>
                      <span className="text-[#788391]">Enrolled Date:</span>{" "}
                      <span className="font-semibold text-[#202936]">
                        {new Date(enrollment.enrolledDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#788391]">GPA / Score:</span>{" "}
                      <span className="font-semibold text-[#202936]">
                        {enrollment.gradePointAverage ? `${enrollment.gradePointAverage} / 10.0` : "In Progress"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#788391]">Promotion Remarks:</span>{" "}
                      <span className="font-medium text-[#202936]">
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
