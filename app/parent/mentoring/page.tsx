"use client";

import React, { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { Users2, ShieldCheck, CheckCircle2 } from "lucide-react";

export default function ParentMentoringPage() {
  const [selectedChildId, setSelectedChildId] = useState("");
  const [mentoring, setMentoring] = useState<any[]>([]);
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

  const fetchMentoring = async (childId: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/student/mentoring?studentId=${encodeURIComponent(childId)}`);
      const json = await res.json();
      if (json.success) {
        setMentoring(json.data);
      } else {
        setError(json.error || "Failed to load mentoring sessions.");
      }
    } catch (e: any) {
      console.error(e);
      setError("Network error loading mentoring progress.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedChildId) {
      fetchMentoring(selectedChildId);
    } else {
      setLoading(false);
    }
  }, [selectedChildId]);

  return (
    <PortalLayout
      portalType="PARENT"
      pageTitle="Child Faculty Mentoring Progress"
      selectedChildId={selectedChildId}
      onSelectChild={(id) => setSelectedChildId(id)}
    >
      {!selectedChildId ? (
        <Card className="p-8 text-center bg-white border border-[#CBD5E1] shadow-xs">
          <Users2 className="w-10 h-10 text-[#F5A000] mx-auto mb-3" />
          <h2 className="text-base font-bold text-[#1E293B]">No Linked Child Selected</h2>
          <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
            Please select your child from the header selector above to view faculty mentoring reviews, action items, and session notes.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-6 p-4 rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/60 text-[#92400E] flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold uppercase tracking-wider">Parent Privacy Boundary Enforced (Section 22 & 27)</p>
              <p className="mt-0.5 leading-relaxed">
                Parents may view general academic mentoring progress and agreed action items. In accordance with Section 22, private counseling notes between student and faculty mentor are strictly hidden from guardian views.
              </p>
            </div>
          </div>

          <Card
            title="Faculty Mentoring Records & Meeting Schedules"
            subtitle="Permitted academic reviews and guidance sessions"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-3 border-[#123B5A] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs font-semibold text-[#64748B]">Loading mentoring sessions...</p>
              </div>
            ) : error ? (
              <div className="p-4 text-center border-red-200 bg-red-50 rounded-xl">
                <p className="text-sm font-bold text-red-800">{error}</p>
                <button
                  onClick={() => fetchMentoring(selectedChildId)}
                  className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : mentoring.length === 0 ? (
              <p className="text-xs text-[#64748B]">No permitted mentoring records available.</p>
            ) : (
              <div className="space-y-4">
                {mentoring.map((m) => (
                  <div
                    key={m.id}
                    className="p-5 rounded-xl border border-[#E2E8F0] bg-[#EEF2F6]/50 space-y-3 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2">
                      <div>
                        <h4 className="font-bold text-[#1E293B]">
                          Mentor: {m.mentorName} ({m.mentorDesignation})
                        </h4>
                        <p className="text-[11px] text-[#64748B]">{m.mentorDepartment}</p>
                      </div>
                      <Badge variant="brand" size="sm">
                        Date: {new Date(m.sessionDate).toLocaleDateString()}
                      </Badge>
                    </div>

                    <div>
                      <span className="font-bold text-[#0F2942]">Academic Review & Discussion:</span>
                      <p className="text-[#1E293B] mt-0.5 leading-relaxed">{m.topicsDiscussed}</p>
                    </div>

                    {m.studentActionItems && (
                      <div className="p-3 bg-white rounded-lg border border-[#E2E8F0]">
                        <span className="font-bold text-emerald-800">Child's Action Plan:</span>
                        <p className="text-[#1E293B] mt-0.5">{m.studentActionItems}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </PortalLayout>
  );
}
