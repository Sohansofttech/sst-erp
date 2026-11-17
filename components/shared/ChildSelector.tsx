"use client";

import React, { useState, useEffect } from "react";
import { Users, ChevronDown, Check } from "lucide-react";

interface LinkedChild {
  linkId: string;
  relationship: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    rollNumber: string;
    currentSemester: number;
    courseName: string;
  };
}

interface ChildSelectorProps {
  selectedChildId?: string;
  onSelectChild: (childId: string) => void;
}

export const ChildSelector: React.FC<ChildSelectorProps> = ({
  selectedChildId,
  onSelectChild,
}) => {
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        setLoading(true);
        const token = typeof window !== "undefined" ? localStorage.getItem("erp_token") : null;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/parent/children", { credentials: "include", headers });
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          setChildren(json.data);
          const stored = typeof window !== "undefined" ? localStorage.getItem("erp_active_child_id") : null;
          const initialId =
            stored && json.data.some((c: any) => c.student.id === stored)
              ? stored
              : json.data[0].student.id;

          if (typeof window !== "undefined") {
            localStorage.setItem("erp_active_child_id", initialId);
            document.cookie = `erp_active_child=${initialId}; path=/; max-age=86400`;
          }
          if (selectedChildId !== initialId) {
            onSelectChild(initialId);
          }
        }
      } catch (err) {
        console.error("Failed to fetch linked children", err);
      } finally {
        setLoading(false);
      }
    };

    fetchChildren();
  }, []);

  const activeChild = children.find((c) => c.student.id === selectedChildId) || children[0];

  if (loading) {
    return <div className="text-xs text-[#788391]">Loading students...</div>;
  }

  if (children.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 bg-white border border-[#E5E9EF] rounded-lg shadow-sm hover:border-[#F5A000] transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-full bg-[#123B5A] text-[#F5A000] flex items-center justify-center font-bold text-xs">
          {activeChild ? `${activeChild.student.firstName[0]}${activeChild.student.lastName[0]}` : "ST"}
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-semibold text-[#202936]">
            {activeChild ? `${activeChild.student.firstName} ${activeChild.student.lastName}` : "Select Child"}
          </p>
          <p className="text-[11px] text-[#788391]">
            {activeChild ? `Sem ${activeChild.student.currentSemester} • ${activeChild.student.rollNumber}` : ""}
          </p>
        </div>
        <ChevronDown className="w-4 h-4 text-[#788391] ml-1" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-[#E5E9EF] rounded-xl shadow-xl z-50 overflow-hidden py-1">
          <div className="px-3 py-2 border-b border-[#E5E9EF] bg-[#EEF1F5]">
            <p className="text-xs font-semibold text-[#788391] uppercase tracking-wider">
              Linked Children ({children.length})
            </p>
          </div>
          {children.map((item) => {
            const isSelected = item.student.id === (activeChild?.student.id);
            return (
              <button
                key={item.student.id}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    localStorage.setItem("erp_active_child_id", item.student.id);
                    document.cookie = `erp_active_child=${item.student.id}; path=/; max-age=86400`;
                    window.dispatchEvent(
                      new CustomEvent("activeChildChanged", { detail: { childId: item.student.id } })
                    );
                  }
                  onSelectChild(item.student.id);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-[#EEF1F5] transition-colors ${
                  isSelected ? "bg-[#FFFBEB]" : ""
                }`}
              >
                <div>
                  <p className="text-xs font-semibold text-[#202936]">
                    {item.student.firstName} {item.student.lastName}
                  </p>
                  <p className="text-[11px] text-[#788391]">
                    {item.student.courseName} • Sem {item.student.currentSemester} ({item.student.rollNumber})
                  </p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-[#F5A000]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
