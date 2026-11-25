"use client";

/**
 * ============================================================================
 * Component: DivisionSwitcher
 * Description: Header dropdown component that lists authorized educational
 *              divisions for the authenticated admin user and allows switching
 *              the active division context.
 *
 * Security Rules:
 * 1. Divisions are fetched from the server-side /api/admin/divisions endpoint —
 *    never from client-supplied parameters.
 * 2. The active division is persisted in the `sst_active_division` cookie so
 *    resolveDivisionContext() on the server validates it on each request.
 * 3. "All Divisions" is only offered when the API signals isInstitutionWideAdmin.
 * 4. No division ID is accepted from local storage, URL params, or any other
 *    client-supplied source without server verification.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2,
  ChevronDown,
  Layers,
  School,
  GraduationCap,
  BookOpen,
  Award,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useDivision, ALL_DIVISIONS_ID } from "@/lib/division-store";
import { cn } from "@/lib/utils";

export { ALL_DIVISIONS_ID };

export type DivisionType = "MONTESSORI" | "SCHOOL" | "HIGHER_SECONDARY" | "COLLEGE" | "ACADEMY";

export interface DivisionOption {
  id: string;
  name: string;
  code: string;
  type: DivisionType;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  isDefault: boolean;
  logoUrl?: string | null;
  academicSettings?: { brandColor?: string; shortName?: string } | null;
}

const TYPE_CONFIG: Record<DivisionType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  MONTESSORI:       { label: "Montessori",        icon: Sparkles,     color: "text-purple-600" },
  SCHOOL:           { label: "School",             icon: School,       color: "text-blue-600" },
  HIGHER_SECONDARY: { label: "Higher Secondary",   icon: BookOpen,     color: "text-teal-600" },
  COLLEGE:          { label: "College",            icon: GraduationCap, color: "text-indigo-600" },
  ACADEMY:          { label: "Academy",            icon: Award,        color: "text-amber-600" },
};

function DivisionIcon({ type, className }: { type: DivisionType; className?: string }) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return <Building2 className={className} />;
  const Icon = cfg.icon;
  return <Icon className={cn(cfg.color, className)} />;
}

export function DivisionSwitcher() {
  const {
    divisions,
    activeDivisionId,
    isInstitutionWideAdmin,
    isDivisionsLoading,
    divisionsError,
    setActiveDivision,
    refreshDivisions,
  } = useDivision();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const activeDivision =
    activeDivisionId === ALL_DIVISIONS_ID
      ? null
      : divisions.find((d) => d.id === activeDivisionId) || null;

  const isAllView = activeDivisionId === ALL_DIVISIONS_ID;

  const handleSelect = useCallback(
    (id: string) => {
      setActiveDivision(id);
      setIsOpen(false);
    },
    [setActiveDivision]
  );

  // No divisions configured — show nothing (single-division institutions still work without switcher)
  if (!isDivisionsLoading && !divisionsError && divisions.length === 0) {
    return null;
  }

  // Single division with no "ALL" option — no switcher needed
  if (!isDivisionsLoading && !divisionsError && divisions.length === 1 && !isInstitutionWideAdmin) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDivisionsLoading}
        title="Switch Educational Division"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer",
          "border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#1E293B]",
          isDivisionsLoading && "opacity-60 cursor-not-allowed"
        )}
      >
        {isDivisionsLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-[#64748B]" />
        ) : isAllView ? (
          <Layers className="w-4 h-4 text-[#F5A000]" />
        ) : activeDivision ? (
          <DivisionIcon type={activeDivision.type} className="w-4 h-4 shrink-0" />
        ) : (
          <Building2 className="w-4 h-4 text-[#64748B]" />
        )}

        <div className="hidden md:block text-left">
          <span className="text-[10px] uppercase font-semibold text-[#64748B] block leading-none">
            Division
          </span>
          <span className="text-xs font-bold text-[#123B5A] leading-none max-w-[110px] truncate block">
            {isDivisionsLoading
              ? "Loading..."
              : isAllView
              ? "All Divisions"
              : activeDivision
              ? activeDivision.academicSettings?.shortName || activeDivision.name
              : "Select Division"}
          </span>
        </div>

        <span className="text-xs font-bold text-[#123B5A] md:hidden max-w-[80px] truncate">
          {isDivisionsLoading
            ? "..."
            : isAllView
            ? "All"
            : activeDivision?.code || "Division"}
        </span>

        <ChevronDown className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-[#E2E8F0] p-1.5 z-50 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#F1F5F9]">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              Educational Division
            </span>
            <button
              onClick={() => { refreshDivisions(); }}
              title="Refresh divisions"
              className="p-1 rounded hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-[#64748B]" />
            </button>
          </div>

          <div className="py-1 max-h-72 overflow-y-auto">
            {isDivisionsLoading ? (
              <div className="px-3 py-4 text-xs text-[#64748B] text-center flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading divisions…
              </div>
            ) : divisionsError ? (
              <div className="px-3 py-3 text-xs text-red-600 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{divisionsError}</span>
              </div>
            ) : (
              <>
                {/* All Divisions option — only for institution-wide admins */}
                {isInstitutionWideAdmin && (
                  <button
                    onClick={() => handleSelect(ALL_DIVISIONS_ID)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer",
                      isAllView
                        ? "bg-[#FEF3C7] text-[#D97706] font-bold"
                        : "text-[#1E293B] hover:bg-[#F8FAFC]"
                    )}
                  >
                    <Layers className="w-4 h-4 text-[#F5A000] shrink-0" />
                    <div className="min-w-0">
                      <span className="block font-semibold truncate">All Divisions</span>
                      <span className="block text-[10px] text-[#64748B]">Executive overview</span>
                    </div>
                    {isAllView && <CheckCircle2 className="w-3.5 h-3.5 text-[#D97706] ml-auto shrink-0" />}
                  </button>
                )}

                {/* Divider if "All" option is shown */}
                {isInstitutionWideAdmin && divisions.length > 0 && (
                  <div className="border-t border-[#F1F5F9] my-1" />
                )}

                {/* Individual division options */}
                {divisions.map((div) => {
                  const isActive = activeDivisionId === div.id;
                  const cfg = TYPE_CONFIG[div.type];
                  const Icon = cfg?.icon || Building2;
                  return (
                    <button
                      key={div.id}
                      onClick={() => handleSelect(div.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer",
                        isActive
                          ? "bg-[#EEF2FF] text-[#4F46E5] font-bold"
                          : "text-[#1E293B] hover:bg-[#F8FAFC]"
                      )}
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", cfg?.color)} />
                      <div className="min-w-0 flex-1">
                        <span className="block font-semibold truncate">{div.name}</span>
                        <span className="block text-[10px] text-[#64748B]">
                          {cfg?.label || div.type} · {div.code}
                          {div.isDefault && " · Default"}
                        </span>
                      </div>
                      {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-[#4F46E5] ml-auto shrink-0" />}
                    </button>
                  );
                })}

                {divisions.length === 0 && (
                  <div className="px-3 py-4 text-xs text-[#64748B] text-center">
                    No active divisions found.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
