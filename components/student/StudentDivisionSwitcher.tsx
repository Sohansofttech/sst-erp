"use client";

import React, { useEffect, useState } from "react";
import { BookOpen, Check, ChevronDown, Loader2 } from "lucide-react";

interface StudentEnrollmentItem {
  enrollmentId: string;
  divisionId: string;
  divisionName: string;
  divisionCode: string;
  divisionType: string;
  isPrimary: boolean;
  className: string;
  academicYear: string;
}

export function StudentDivisionSwitcher({ studentId }: { studentId?: string }) {
  const [enrollments, setEnrollments] = useState<StudentEnrollmentItem[]>([]);
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const fetchEnrollments = async () => {
    try {
      const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
      const res = await fetch(`/api/student/divisions${query}`, { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.enrollments)) {
        setEnrollments(json.enrollments);
        setActiveDivisionId(json.activeDivisionId);
      }
    } catch (err) {
      console.error("Failed to fetch student divisions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, [studentId]);

  const handleSelectDivision = async (divisionId: string) => {
    if (divisionId === activeDivisionId || switching) return;
    try {
      setSwitching(true);
      const res = await fetch("/api/student/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, studentId }),
      });
      const json = await res.json();
      if (json.success) {
        setActiveDivisionId(divisionId);
        setIsOpen(false);
        // Dispatch global event for listeners & refresh
        window.dispatchEvent(new CustomEvent("activeDivisionChanged", { detail: { divisionId } }));
        window.location.reload();
      } else {
        alert(json.error || "Failed to switch division view.");
      }
    } catch {
      alert("Network error while switching division.");
    } finally {
      setSwitching(false);
    }
  };

  if (loading) return null;
  // If student has only 1 enrollment, hide switching UI completely
  if (enrollments.length <= 1) return null;

  const activeEnrollment =
    enrollments.find((e) => e.divisionId === activeDivisionId) ||
    enrollments.find((e) => e.isPrimary) ||
    enrollments[0];

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        disabled={switching}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#1E293B] hover:bg-slate-100 transition-colors cursor-pointer"
        aria-label="Switch Division Enrollment"
      >
        {switching ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F5A000]" />
        ) : (
          <BookOpen className="w-3.5 h-3.5 text-[#123B5A]" />
        )}
        <span className="truncate max-w-[130px] sm:max-w-[180px]">
          {activeEnrollment ? `${activeEnrollment.divisionName} (${activeEnrollment.className})` : "Switch Division"}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 rounded-xl border border-[#E2E8F0] bg-white shadow-lg p-1.5 z-50">
          <div className="px-2 py-1 text-[11px] font-semibold text-[#64748B]">
            Active Enrollments ({enrollments.length})
          </div>
          <div className="h-px bg-[#E2E8F0] my-1" />
          <div className="space-y-1">
            {enrollments.map((enr) => {
              const isSelected = enr.divisionId === activeDivisionId;
              return (
                <button
                  key={enr.enrollmentId}
                  onClick={() => handleSelectDivision(enr.divisionId)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs text-[#1E293B] hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="truncate pr-2">
                    <p className="font-semibold truncate">{enr.divisionName}</p>
                    <p className="text-[10px] text-[#64748B] truncate">
                      {enr.className} {enr.isPrimary ? "• Primary" : "• Concurrent"}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#F5A000] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
