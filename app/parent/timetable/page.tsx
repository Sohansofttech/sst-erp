"use client";

import React, { useEffect, useState } from "react";
import { PortalLayout } from "@/components/layout/PortalLayout";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { Calendar, Clock, MapPin, User } from "lucide-react";

export default function ParentTimetablePage() {
  const [selectedChildId, setSelectedChildId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState("MONDAY");

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

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

  const fetchTimetable = async (childId: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/student/timetable?studentId=${encodeURIComponent(childId)}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Failed to load timetable.");
      }
    } catch (e: any) {
      console.error(e);
      setError("Network error fetching timetable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedChildId) {
      fetchTimetable(selectedChildId);
    } else {
      setLoading(false);
    }
  }, [selectedChildId]);

  const { semester, section, weeklySchedule } = data || {};
  const currentSlots = weeklySchedule?.[selectedDay] || [];

  return (
    <PortalLayout
      portalType="PARENT"
      pageTitle="Child Class Timetable & Schedule"
      selectedChildId={selectedChildId}
      onSelectChild={(id) => setSelectedChildId(id)}
    >
      {!selectedChildId ? (
        <Card className="p-8 text-center bg-white border border-[#CBD5E1] shadow-xs">
          <Calendar className="w-10 h-10 text-[#F5A000] mx-auto mb-3" />
          <h2 className="text-base font-bold text-[#1E293B]">No Linked Child Selected</h2>
          <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
            Please select your child from the header dropdown to view their registered section timetable and daily lecture slots.
          </p>
        </Card>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-[#123B5A] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold text-[#64748B]">Loading class schedule...</p>
        </div>
      ) : error ? (
        <Card className="p-6 text-center border-red-200 bg-red-50">
          <p className="text-sm font-bold text-red-800">{error}</p>
          <button
            onClick={() => fetchTimetable(selectedChildId)}
            className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 cursor-pointer"
          >
            Retry
          </button>
        </Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Badge variant="brand">Semester {semester ?? "—"}</Badge>
              <Badge variant="neutral">Section {section ?? "—"}</Badge>
            </div>

        {/* Day selection */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {days.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                selectedDay === d
                  ? "bg-[#0F2942] text-white border-[#0F2942]"
                  : "bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <Card title={`${selectedDay} Schedule`}>
        {currentSlots.length === 0 ? (
          <p className="text-xs text-[#64748B]">No classes scheduled for {selectedDay}.</p>
        ) : (
          <div className="space-y-3">
            {currentSlots.map((slot: any) => (
              <div
                key={slot.id}
                className="p-4 rounded-xl border border-[#E2E8F0] bg-[#EEF2F6]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 bg-white rounded-lg border border-[#E2E8F0] text-center min-w-[80px]">
                    <span className="font-bold text-[#0F2942] block">{slot.startTime}</span>
                    <span className="text-[10px] text-[#64748B] block">{slot.endTime}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#D97706]">{slot.subjectCode}</span>
                      <h4 className="font-semibold text-[#1E293B]">{slot.subjectName}</h4>
                    </div>
                    <p className="text-[#64748B] text-[11px] mt-0.5">Faculty: {slot.teacherName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 font-medium text-[#1E293B] bg-white px-2.5 py-1 rounded border border-[#E2E8F0] self-start sm:self-center">
                  <MapPin className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>{slot.roomNumber}</span>
                </div>
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
