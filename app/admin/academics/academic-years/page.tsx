"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useInstitution } from "@/lib/store";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty } from "@/components/ui/table";
import {
  Calendar,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  CalendarDays,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { AcademicYear, Term } from "@/types/institution";
import { formatDate } from "@/lib/utils";

function normalizeDateToYMD(val: any): string {
  if (!val) return "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.split("T")[0];
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyy) {
      const d = ddmmyyyy[1].padStart(2, "0");
      const m = ddmmyyyy[2].padStart(2, "0");
      const y = ddmmyyyy[3];
      return `${y}-${m}-${d}`;
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch {}
  return "";
}

function mapApiToAY(item: any): AcademicYear {
  return {
    id: item.id,
    name: item.name,
    startDate: normalizeDateToYMD(item.startDate),
    endDate: normalizeDateToYMD(item.endDate),
    isActive: Boolean(item.isCurrent),
    terms: (item.terms || []).map((t: any, idx: number) => ({
      id: t.id || `term-${idx}`,
      name: t.name,
      startDate: normalizeDateToYMD(t.startDate),
      endDate: normalizeDateToYMD(t.endDate),
      isCurrent: Boolean(t.isCurrent),
    })),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
  };
}

export default function AcademicYearsPage() {
  const {
    refreshAcademicYears,
  } = useInstitution();

  // Data fetching state
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAY, setEditingAY] = useState<AcademicYear | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [terms, setTerms] = useState<Term[]>([
    { id: "t1", name: "Odd Semester / Fall", startDate: "", endDate: "", isCurrent: true },
    { id: "t2", name: "Even Semester / Spring", startDate: "", endDate: "", isCurrent: false },
  ]);
  const [formError, setFormError] = useState("");

  const loadAcademicYears = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const res = await fetch("/api/admin/academics/academic-years");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load academic years.");
      }
      const mapped = (json.data || []).map(mapApiToAY);
      setAcademicYears(mapped);
    } catch (err: any) {
      setFetchError(err.message || "Failed to load academic years from server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAcademicYears();
  }, [loadAcademicYears]);

  const activeAcademicYear = academicYears.find((ay) => ay.isActive) || null;

  const handleOpenAddModal = () => {
    setEditingAY(null);
    const currY = new Date().getFullYear();
    setName(`${currY}-${currY + 1}`);
    setStartDate(`${currY}-08-01`);
    setEndDate(`${currY + 1}-05-31`);
    setIsActive(false);
    setTerms([
      { id: "t1", name: "Odd Semester / Term 1", startDate: `${currY}-08-01`, endDate: `${currY}-12-20`, isCurrent: true },
      { id: "t2", name: "Even Semester / Term 2", startDate: `${currY + 1}-01-10`, endDate: `${currY + 1}-05-31`, isCurrent: false },
    ]);
    setFormError("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ay: AcademicYear) => {
    setEditingAY(ay);
    setName(ay.name);
    setStartDate(normalizeDateToYMD(ay.startDate));
    setEndDate(normalizeDateToYMD(ay.endDate));
    setIsActive(ay.isActive);
    setTerms(
      (ay.terms || []).map((t, idx) => ({
        id: t.id || `term-${idx}`,
        name: t.name,
        startDate: normalizeDateToYMD(t.startDate),
        endDate: normalizeDateToYMD(t.endDate),
        isCurrent: Boolean(t.isCurrent),
      }))
    );
    setFormError("");
    setIsModalOpen(true);
  };

  const handleTermChange = (index: number, field: keyof Term, value: string | boolean) => {
    setTerms((prev) => {
      const copy = [...prev];
      const normalizedVal =
        (field === "startDate" || field === "endDate") && typeof value === "string"
          ? normalizeDateToYMD(value) || value
          : value;
      copy[index] = { ...copy[index], [field]: normalizedVal };
      return copy;
    });
  };

  const handleAddTerm = () => {
    const termNum = terms.length + 1;
    setTerms((prev) => [
      ...prev,
      {
        id: `term-${Date.now()}`,
        name: `Term ${termNum}`,
        startDate: "",
        endDate: "",
        isCurrent: false,
      },
    ]);
  };

  const handleRemoveTerm = (index: number) => {
    if (terms.length <= 1) {
      alert("At least one term must be configured.");
      return;
    }
    setTerms((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Academic year label is required.");
      return;
    }

    // Date normalization & validation
    const normAYStart = normalizeDateToYMD(startDate);
    const normAYEnd = normalizeDateToYMD(endDate);
    if (!normAYStart || !normAYEnd) {
      setFormError("Valid start date and end date are required.");
      return;
    }
    const ayStart = new Date(normAYStart);
    const ayEnd = new Date(normAYEnd);
    if (ayStart >= ayEnd) {
      setFormError("Academic year start date must be strictly before end date.");
      return;
    }

    // Terms validation
    if (!terms || terms.length === 0) {
      setFormError("At least one term must be configured for this academic cycle.");
      return;
    }

    const seenTermNames = new Set<string>();
    const normalizedTerms: Term[] = [];

    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      const tTitle = (t.name || "").trim();
      if (!tTitle) {
        setFormError(`Term #${i + 1} must have a valid title.`);
        return;
      }
      const lowerTitle = tTitle.toLowerCase();
      if (seenTermNames.has(lowerTitle)) {
        setFormError(`Duplicate term title "${tTitle}". Each term in an academic cycle must have a unique title.`);
        return;
      }
      seenTermNames.add(lowerTitle);

      const tStartNorm = normalizeDateToYMD(t.startDate);
      const tEndNorm = normalizeDateToYMD(t.endDate);
      if (!tStartNorm || !tEndNorm) {
        setFormError(`Term "${tTitle}" requires both start and end dates.`);
        return;
      }

      const tStart = new Date(tStartNorm);
      const tEnd = new Date(tEndNorm);
      if (tStart >= tEnd) {
        setFormError(`Term "${tTitle}" start date must precede its end date.`);
        return;
      }
      if (tStart < ayStart || tEnd > ayEnd) {
        setFormError(
          `Term "${tTitle}" dates (${tStartNorm} to ${tEndNorm}) must fall within the academic year dates (${normAYStart} to ${normAYEnd}).`
        );
        return;
      }

      normalizedTerms.push({
        id: t.id,
        name: tTitle,
        startDate: tStartNorm,
        endDate: tEndNorm,
        isCurrent: Boolean(t.isCurrent),
      });
    }

    // Non-overlapping validation: terms ordered chronologically must not overlap
    const sortedTerms = [...normalizedTerms].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    for (let i = 0; i < sortedTerms.length - 1; i++) {
      const current = sortedTerms[i];
      const next = sortedTerms[i + 1];
      if (new Date(current.endDate) > new Date(next.startDate)) {
        setFormError(`Terms cannot overlap: "${current.name}" ends on ${current.endDate}, but "${next.name}" starts on ${next.startDate}.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...(editingAY ? { id: editingAY.id } : {}),
        name: trimmedName,
        startDate: normAYStart,
        endDate: normAYEnd,
        isCurrent: isActive,
        terms: normalizedTerms,
      };

      const res = await fetch("/api/admin/academics/academic-years", {
        method: editingAY ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || (editingAY ? "Failed to update academic year." : "Failed to create academic year."));
      }

      await loadAcademicYears();
      await refreshAcademicYears();
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || "An error occurred while saving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetActive = async (id: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/academics/academic-years", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isCurrent: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to set active academic year.");
      }
      await loadAcademicYears();
      await refreshAcademicYears();
    } catch (err: any) {
      alert(err.message || "Failed to set active academic year.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, ayName: string) => {
    if (!confirm(`Are you sure you want to delete Academic Year "${ayName}"?`)) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/academics/academic-years?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to delete academic year.");
      }
      await loadAcademicYears();
      await refreshAcademicYears();
    } catch (err: any) {
      alert(err.message || "Failed to delete academic year.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8F0]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B]">
            Academic Years
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Manage academic years, session cycles, and term boundaries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAcademicYears}
            disabled={isLoading || isSubmitting}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenAddModal}
            disabled={isSubmitting}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Academic Year
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {fetchError && (
        <Alert variant="error" title="Failed to Load Academic Years">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-1">
            <span className="text-sm">{fetchError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadAcademicYears}
              disabled={isLoading}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Current Active Indicator Card */}
      <Card className="border-l-4 border-l-[#16A34A] bg-[#F0FDF4]/40">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center font-bold">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold text-[#16A34A] tracking-wider block">
                Current System Active Year
              </span>
              <h4 className="text-lg font-bold text-[#123B5A]">
                AY {activeAcademicYear?.name || "None Selected"}
              </h4>
              <p className="text-xs text-[#64748B]">
                Valid: {activeAcademicYear?.startDate ? formatDate(activeAcademicYear.startDate) : "N/A"} to{" "}
                {activeAcademicYear?.endDate ? formatDate(activeAcademicYear.endDate) : "N/A"} •{" "}
                {activeAcademicYear?.terms.length || 0} Terms
              </p>
            </div>
          </div>
          <div className="text-xs text-[#16A34A] font-semibold bg-white px-3 py-1.5 rounded-lg border border-[#BBF7D0] shadow-xs">
            All student enrollments and fee dues scope to this cycle
          </div>
        </CardContent>
      </Card>

      {/* Academic Years Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#F5A000]" />
              <CardTitle>Configured Academic Years</CardTitle>
            </div>
            <span className="text-xs text-[#64748B]">
              Total: {academicYears.length} Cycles
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Academic Cycle</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Terms Breakdown</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-[#64748B]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#F5A000]" />
                      <span>Loading academic years...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {academicYears.map((ay) => (
                    <TableRow key={ay.id}>
                      <TableCell className="font-bold text-[#123B5A]">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-[#F5A000]" />
                          <span>AY {ay.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(ay.startDate)}</TableCell>
                      <TableCell>{formatDate(ay.endDate)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ay.terms && ay.terms.length > 0 ? (
                            ay.terms.map((term) => (
                              <span
                                key={term.id}
                                className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                                  term.isCurrent
                                    ? "bg-[#EFF6FF] text-[#F5A000] border-[#BFDBFE]"
                                    : "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]"
                                }`}
                                title={
                                  term.startDate && term.endDate
                                    ? `${formatDate(term.startDate)} to ${formatDate(term.endDate)}`
                                    : undefined
                                }
                              >
                                {term.name} {term.isCurrent && "★"}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[#94A3B8] italic">0 terms</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {ay.isActive ? (
                          <Badge variant="success" size="md">
                            ● Active Calendar
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="md">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {!ay.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetActive(ay.id)}
                              disabled={isSubmitting}
                              className="text-[#F5A000] border-[#F5A000]/30 hover:bg-[#EFF6FF]"
                            >
                              Set as Active
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditModal(ay)}
                            disabled={isSubmitting}
                            title="Edit Year"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#F5A000]" />
                          </Button>
                          {!ay.isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(ay.id, ay.name)}
                              disabled={isSubmitting}
                              title="Delete Year"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {academicYears.length === 0 && (
                    <TableEmpty colSpan={6} message="No academic years configured yet." />
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal: Create / Edit Academic Year */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingAY ? `Edit Academic Year (${editingAY.name})` : "Create New Academic Year"}
        description="Define session duration, terms, and activation status."
        maxWidth="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              leftIcon={isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
            >
              {isSubmitting
                ? "Saving..."
                : editingAY
                ? "Update Academic Year"
                : "Save Academic Year"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <Alert variant="error" title="Validation Inconsistency">
              {formError}
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Academic Year Label"
                required
                placeholder="e.g. 2027-2028"
                value={name}
                onChange={(e) => setName(e.target.value)}
                helperText="Follow standard notation: YYYY-YYYY"
              />
            </div>

            <Input
              label="Session Start Date"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />

            <Input
              label="Session End Date"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="pt-2 border-t border-[#F1F5F9]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-[#CBD5E1] text-[#F5A000] focus:ring-[#F5A000] w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-semibold text-[#1E293B]">
                Set this as the Active Academic Year immediately upon saving
              </span>
            </label>
            <p className="text-[11px] text-[#64748B] ml-6 mt-0.5">
              Only one academic year can be active at any given moment.
            </p>
          </div>

          {/* Terms Configuration */}
          <div className="pt-3 border-t border-[#F1F5F9] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">
                  Term & Semester Sub-Divisions
                </h4>
                <p className="text-[11px] text-[#64748B]">
                  Break down year into Odd/Even semesters or terms
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTerm}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Term
              </Button>
            </div>

            <div className="space-y-2.5">
              {terms.map((t, idx) => (
                <div
                  key={t.id}
                  className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      placeholder="Term Name (e.g. Odd Semester)"
                      value={t.name}
                      onChange={(e) => handleTermChange(idx, "name", e.target.value)}
                      className="text-xs font-bold text-[#123B5A] bg-white border border-[#CBD5E1] rounded px-2 py-1 flex-1"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-[#64748B] cursor-pointer">
                      <input
                        type="radio"
                        name="currentTerm"
                        checked={t.isCurrent}
                        onChange={() => {
                          setTerms((prev) =>
                            prev.map((item, i) => ({
                              ...item,
                              isCurrent: i === idx,
                            }))
                          );
                        }}
                      />
                      <span>Current</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm(idx)}
                      className="text-[#DC2626] hover:text-[#991B1B] p-1 text-xs cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-[#64748B] block">Term Start</span>
                      <input
                        type="date"
                        value={t.startDate}
                        onChange={(e) => handleTermChange(idx, "startDate", e.target.value)}
                        className="w-full bg-white border border-[#CBD5E1] rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#64748B] block">Term End</span>
                      <input
                        type="date"
                        value={t.endDate}
                        onChange={(e) => handleTermChange(idx, "endDate", e.target.value)}
                        className="w-full bg-white border border-[#CBD5E1] rounded px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
