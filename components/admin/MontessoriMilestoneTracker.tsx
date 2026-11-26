"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Sparkles, CheckCircle2, Clock, BookOpen, AlertCircle, Edit3 } from "lucide-react";

export interface MontessoriObservation {
  milestoneId: string;
  domain: string;
  domainLabel: string;
  title: string;
  description: string;
  status: "NOT_STARTED" | "INTRODUCED" | "WORKING_ON" | "MASTERED";
  notes?: string;
  observedDate?: string | null;
}

export interface StudentMilestoneProgress {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  progressPercentage: number;
  summary: {
    total: number;
    mastered: number;
    workingOn: number;
    notStarted: number;
  };
  observations: MontessoriObservation[];
}

interface MontessoriMilestoneTrackerProps {
  progressData: StudentMilestoneProgress | null;
  onSaveObservation?: (data: {
    studentId: string;
    milestoneId: string;
    status: string;
    notes: string;
  }) => Promise<void>;
}

export function MontessoriMilestoneTracker({
  progressData,
  onSaveObservation,
}: MontessoriMilestoneTrackerProps) {
  const [activeDomain, setActiveDomain] = useState<string>("ALL");
  const [selectedMilestone, setSelectedMilestone] = useState<MontessoriObservation | null>(null);
  const [editStatus, setEditStatus] = useState<string>("WORKING_ON");
  const [editNotes, setEditNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!progressData) {
    return (
      <div className="p-8 text-center text-sm text-[#64748B]">
        Select a student to inspect developmental progress milestones.
      </div>
    );
  }

  const domains = [
    { key: "ALL", label: "All Developmental Areas" },
    { key: "PRACTICAL_LIFE", label: "Practical Life" },
    { key: "SENSORIAL", label: "Sensorial" },
    { key: "LANGUAGE", label: "Language" },
    { key: "MATHEMATICS", label: "Mathematics" },
    { key: "SOCIAL_GRACE", label: "Grace & Courtesy" },
  ];

  const filteredObservations =
    activeDomain === "ALL"
      ? progressData.observations
      : progressData.observations.filter((o) => o.domain === activeDomain);

  const handleOpenEdit = (obs: MontessoriObservation) => {
    setSelectedMilestone(obs);
    setEditStatus(obs.status === "NOT_STARTED" ? "WORKING_ON" : obs.status);
    setEditNotes(obs.notes || "");
  };

  const handleSave = async () => {
    if (!selectedMilestone || !onSaveObservation) return;
    try {
      setIsSubmitting(true);
      await onSaveObservation({
        studentId: progressData.studentId,
        milestoneId: selectedMilestone.milestoneId,
        status: editStatus,
        notes: editNotes,
      });
      setSelectedMilestone(null);
    } catch (err: any) {
      alert(err.message || "Failed to record milestone observation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Student Overview Header */}
      <Card className="border-[#E2E8F0] shadow-xs">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#8B5CF6]" />
                <h3 className="text-lg font-bold text-[#1E293B]">
                  {progressData.studentName}
                </h3>
                <span className="text-xs text-[#64748B]">
                  ({progressData.admissionNumber})
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                Stage / Group: <span className="font-semibold text-[#123B5A]">{progressData.className}</span>
              </p>
            </div>

            <div className="flex items-center gap-4 text-center">
              <div className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Mastered</span>
                <span className="text-base font-extrabold text-[#10B981]">
                  {progressData.summary.mastered} / {progressData.summary.total}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-[#FEF3C7]/40 border border-[#F5A000]/30">
                <span className="text-[10px] uppercase font-bold text-[#D97706] block">Working On</span>
                <span className="text-base font-extrabold text-[#F5A000]">
                  {progressData.summary.workingOn}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Milestone Progress</span>
                <span className="text-base font-extrabold text-[#123B5A]">
                  {progressData.progressPercentage}%
                </span>
              </div>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="w-full bg-[#E2E8F0] rounded-full h-2 mt-4 overflow-hidden">
            <div
              className="bg-[#10B981] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressData.progressPercentage}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Domain Category Filter Tabs */}
      <div className="flex flex-wrap gap-2 pb-1 border-b border-[#E2E8F0]">
        {domains.map((d) => (
          <button
            key={d.key}
            onClick={() => setActiveDomain(d.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeDomain === d.key
                ? "bg-[#123B5A] text-white"
                : "bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Milestone Observation Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredObservations.map((obs) => {
          const isMastered = obs.status === "MASTERED";
          const isWorking = obs.status === "WORKING_ON";
          const isIntroduced = obs.status === "INTRODUCED";

          return (
            <Card
              key={obs.milestoneId}
              className={`border transition-shadow hover:shadow-md ${
                isMastered
                  ? "border-[#10B981]/40 bg-[#F0FDF4]/30"
                  : isWorking
                  ? "border-[#F5A000]/40 bg-[#FFFBEB]/30"
                  : "border-[#E2E8F0] bg-white"
              }`}
            >
              <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
                      {obs.domainLabel}
                    </span>
                    <Badge
                      variant={
                        isMastered
                          ? "default"
                          : isWorking
                          ? "outline"
                          : isIntroduced
                          ? "secondary"
                          : "secondary"
                      }
                      className="text-[10px] font-bold"
                    >
                      {obs.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <h4 className="text-sm font-bold text-[#1E293B] leading-tight">
                    {obs.title}
                  </h4>
                  <p className="text-xs text-[#64748B] mt-1 line-clamp-2">
                    {obs.description}
                  </p>
                </div>

                {obs.notes && (
                  <div className="p-2 rounded bg-white/80 border border-[#E2E8F0] text-[11px] text-[#334155] italic">
                    &ldquo;{obs.notes}&rdquo;
                  </div>
                )}

                <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between">
                  <span className="text-[10px] text-[#64748B]">
                    {obs.observedDate ? `Observed: ${new Date(obs.observedDate).toLocaleDateString()}` : "Not recorded"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => handleOpenEdit(obs)}
                  >
                    <Edit3 className="w-3 h-3 mr-1" /> Log Observation
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Observation Modal */}
      {selectedMilestone && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedMilestone(null)}
          title={`Observation: ${selectedMilestone.title}`}
          description={`Domain: ${selectedMilestone.domainLabel} · Child: ${progressData.studentName}`}
          maxWidth="md"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedMilestone(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Recording..." : "Save Observation"}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[#1E293B] block mb-1">
                Developmental Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "INTRODUCED", label: "Introduced" },
                  { key: "WORKING_ON", label: "Working On" },
                  { key: "MASTERED", label: "Mastered" },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setEditStatus(s.key)}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border text-center transition-colors cursor-pointer ${
                      editStatus === s.key
                        ? "bg-[#123B5A] text-white border-[#123B5A]"
                        : "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] hover:bg-[#F1F5F9]"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#1E293B] block mb-1">
                Qualitative Guide Notes
              </label>
              <textarea
                rows={3}
                className="w-full text-xs rounded-lg border border-[#CBD5E1] p-2.5 text-[#1E293B] focus:outline-hidden focus:border-[#123B5A]"
                placeholder="e.g. Demonstrated high concentration with broad stair grading. Successfully self-corrected error on 4th block."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
