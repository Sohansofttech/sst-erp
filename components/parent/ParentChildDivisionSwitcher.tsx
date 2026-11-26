"use client";

import React, { useEffect, useState } from "react";
import { Users, BookOpen, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface ChildDivision {
  enrollmentId: string;
  divisionId: string;
  divisionName: string;
  divisionCode: string;
  divisionType: string;
  className: string;
  isPrimary: boolean;
}

interface LinkedChild {
  linkId: string;
  relationship: string;
  student: {
    id: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    rollNumber: string;
    currentDivisionId?: string;
    courseName?: string;
    className?: string;
    activeDivisions?: ChildDivision[];
  };
}

interface ParentChildDivisionSwitcherProps {
  selectedChildId?: string;
  onSelectChild?: (childId: string) => void;
}

export function ParentChildDivisionSwitcher({
  selectedChildId,
  onSelectChild,
}: ParentChildDivisionSwitcherProps) {
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [activeChildId, setActiveChildId] = useState<string>("");
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isChildDropdownOpen, setIsChildDropdownOpen] = useState(false);
  const [isDivDropdownOpen, setIsDivDropdownOpen] = useState(false);

  const fetchChildren = async () => {
    try {
      const res = await fetch("/api/parent/children", { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setChildren(json.data);
        const storedChild = typeof window !== "undefined" ? localStorage.getItem("erp_active_child_id") : null;
        const initial = selectedChildId || storedChild || json.data[0]?.student.id || "";
        setActiveChildId(initial);

        // Active division from cookie or child's primary
        const cookieDiv = typeof document !== "undefined"
          ? document.cookie.match(/(?:^|; )sst_active_division=([^;]*)/)?.[1]
          : null;
        setActiveDivisionId(cookieDiv ? decodeURIComponent(cookieDiv) : null);
      }
    } catch (err) {
      console.error("Failed to fetch linked children:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (selectedChildId && selectedChildId !== activeChildId) {
      setActiveChildId(selectedChildId);
    }
  }, [selectedChildId]);

  const handleSelectChild = (childId: string) => {
    setActiveChildId(childId);
    setIsChildDropdownOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("erp_active_child_id", childId);
      window.dispatchEvent(new CustomEvent("activeChildChanged", { detail: { childId } }));
    }
    if (onSelectChild) onSelectChild(childId);
  };

  const handleSelectDivision = async (divisionId: string) => {
    try {
      const res = await fetch("/api/student/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, studentId: activeChildId }),
      });
      const json = await res.json();
      if (json.success) {
        setActiveDivisionId(divisionId);
        setIsDivDropdownOpen(false);
        window.location.reload();
      } else {
        toast.error(json.error || "Failed to switch child division.");
      }
    } catch {
      toast.error("Network error switching division.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#64748B]">
        <Users className="w-3.5 h-3.5 text-[#123B5A] animate-pulse" />
        <span className="hidden sm:inline">Loading student...</span>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
        <Users className="w-3.5 h-3.5 text-amber-600" />
        <span>No linked children</span>
      </div>
    );
  }

  const currentChild = children.find((c) => c.student.id === activeChildId) || children[0];
  const activeDivisions = currentChild.student.activeDivisions || [];
  const currentDiv =
    activeDivisions.find((d) => d.divisionId === activeDivisionId) ||
    activeDivisions.find((d) => d.isPrimary) ||
    activeDivisions[0];

  return (
    <div className="flex items-center gap-2">
      {/* 1. Child Switcher (Multi-child dropdown or single child pill) */}
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => {
            if (children.length > 1) {
              setIsChildDropdownOpen(!isChildDropdownOpen);
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#1E293B] hover:bg-slate-100 transition-colors ${
            children.length > 1 ? "cursor-pointer" : "cursor-default"
          }`}
          aria-label={children.length > 1 ? "Switch Selected Child" : "Active Child"}
          aria-haspopup={children.length > 1 ? "listbox" : undefined}
          aria-expanded={children.length > 1 ? isChildDropdownOpen : undefined}
          aria-controls={children.length > 1 ? "linked-children-list" : undefined}
        >
          <Users className="w-3.5 h-3.5 text-[#123B5A] shrink-0" />
          <span className="truncate max-w-[110px] sm:max-w-[150px]">
            {currentChild.student.fullName || currentChild.student.firstName}
          </span>
          {children.length > 1 ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
          ) : null}
        </button>

        {isChildDropdownOpen && children.length > 1 && (
          <div
            id="linked-children-list"
            role="listbox"
            aria-label="Linked Children"
            className="absolute left-0 mt-1 w-64 rounded-xl border border-[#E2E8F0] bg-white shadow-xl p-1.5 z-50 animate-in fade-in-50 duration-150"
          >
            <div className="px-2 py-1 text-[11px] font-semibold text-[#64748B]">
              Switch Child ({children.length})
            </div>
            <div className="h-px bg-[#E2E8F0] my-1" />
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {children.map((c) => {
                const isSelected = c.student.id === activeChildId;
                return (
                  <button
                    key={c.linkId}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectChild(c.student.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#123B5A]/10 text-[#123B5A] font-bold"
                        : "text-[#1E293B] hover:bg-slate-50"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <p className="font-semibold truncate">{c.student.fullName}</p>
                      <p className="text-[11px] text-[#64748B] truncate">
                        Roll: {c.student.rollNumber} • {c.relationship}
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

      {/* 2. Child Division Switcher (if selected child has enrollments in > 1 division) */}
      {activeDivisions.length > 1 && (
        <div className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setIsDivDropdownOpen(!isDivDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-xs font-semibold text-[#1E293B] hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Select Child Division"
            aria-haspopup="listbox"
            aria-expanded={isDivDropdownOpen}
            aria-controls="child-divisions-list"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#F5A000] shrink-0" />
            <span className="truncate max-w-[100px] sm:max-w-[140px]">
              {currentDiv ? currentDiv.divisionName : "Division"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
          </button>

          {isDivDropdownOpen && (
            <div
              id="child-divisions-list"
              role="listbox"
              aria-label="Child Divisions"
              className="absolute right-0 mt-1 w-60 rounded-xl border border-[#E2E8F0] bg-white shadow-xl p-1.5 z-50 animate-in fade-in-50 duration-150"
            >
              <div className="px-2 py-1 text-[11px] font-semibold text-[#64748B]">
                Child Divisions ({activeDivisions.length})
              </div>
              <div className="h-px bg-[#E2E8F0] my-1" />
              <div className="space-y-1">
                {activeDivisions.map((d) => {
                  const isSelected = d.divisionId === activeDivisionId;
                  return (
                    <button
                      key={d.enrollmentId}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectDivision(d.divisionId)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#123B5A]/10 text-[#123B5A] font-bold"
                          : "text-[#1E293B] hover:bg-slate-50"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <p className="font-semibold truncate">{d.divisionName}</p>
                        <p className="text-[11px] text-[#64748B] truncate">
                          {d.className} {d.isPrimary ? "• Primary" : ""}
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
      )}
    </div>
  );
}
