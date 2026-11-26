"use client";

import React, { useEffect, useState } from "react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface AssignedDivision {
  id: string;
  name: string;
  code: string;
  type: string;
  isPrimary: boolean;
  designation?: string;
}

export function TeacherDivisionSwitcher() {
  const [divisions, setDivisions] = useState<AssignedDivision[]>([]);
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const fetchDivisions = async () => {
    try {
      const res = await fetch("/api/teacher/divisions", { credentials: "include" });
      const json = await res.json();
      if (json.success && Array.isArray(json.divisions)) {
        setDivisions(json.divisions);
        setActiveDivisionId(json.activeDivisionId);
      }
    } catch (err) {
      console.error("Failed to fetch teacher divisions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDivisions();
  }, []);

  const handleSelectDivision = async (divisionId: string) => {
    if (divisionId === activeDivisionId || switching) return;
    try {
      setSwitching(true);
      const res = await fetch("/api/teacher/divisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId }),
      });
      const json = await res.json();
      if (json.success) {
        setActiveDivisionId(divisionId);
        // Force refresh to reload division-specific classes, attendance, and timetable
        window.location.reload();
      } else {
        alert(json.error || "Failed to switch division.");
      }
    } catch {
      alert("Network error while switching division.");
    } finally {
      setSwitching(false);
    }
  };

  if (loading) return null;
  if (divisions.length === 0) return null;

  const activeDivision = divisions.find((d) => d.id === activeDivisionId) || divisions[0];

  // If teacher has only 1 division, display subtle indicator without dropdown
  if (divisions.length === 1) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[#E5E9EF] bg-white text-[12px] font-semibold text-[#202936]">
        <Building2 className="size-3.5 text-[#123B5A]" />
        <span className="truncate max-w-[130px]">{activeDivision.name}</span>
      </div>
    );
  }

  // Teacher has multiple assigned divisions: display interactive switcher
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={switching}
          className="h-9 gap-1.5 border-[#E5E9EF] bg-white text-[13px] font-semibold text-[#202936] rounded-xl hover:bg-[#EEF1F5]/50 focus:ring-[#F5A000]"
          aria-label="Switch educational division"
        >
          {switching ? (
            <Loader2 className="size-3.5 animate-spin text-[#F5A000]" />
          ) : (
            <Building2 className="size-3.5 text-[#123B5A]" />
          )}
          <span className="truncate max-w-[110px] md:max-w-[150px]">{activeDivision.name}</span>
          <ChevronDown className="size-3.5 text-[#788391]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl border-[#E5E9EF] bg-white p-1">
        <DropdownMenuLabel className="text-xs text-[#788391] px-2 py-1.5">
          Assigned Divisions ({divisions.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[#E5E9EF]" />
        {divisions.map((div) => {
          const isSelected = div.id === activeDivisionId;
          return (
            <DropdownMenuItem
              key={div.id}
              onClick={() => handleSelectDivision(div.id)}
              className="flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer text-xs font-medium text-[#202936] hover:bg-[#EEF1F5] focus:bg-[#EEF1F5]"
            >
              <div className="flex flex-col gap-0.5 truncate pr-2">
                <span className="font-semibold truncate">{div.name}</span>
                <span className="text-[10px] text-[#788391]">
                  {div.designation || div.type} {div.isPrimary ? "• Primary" : ""}
                </span>
              </div>
              {isSelected && <Check className="size-4 text-[#F5A000] shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
