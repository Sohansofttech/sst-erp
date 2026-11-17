import * as React from "react"

import { cn } from "@/lib/utils"

export type StatusType =
  | "Present"
  | "Absent"
  | "Late"
  | "On-Duty"
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Draft"
  | "Published"
  | "Locked"

interface StatusStyle {
  label: StatusType
  badgeClass: string
  dotClass: string
}

const STATUS_STYLES: Record<StatusType, StatusStyle> = {
  Present: {
    label: "Present",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold",
    dotClass: "bg-emerald-600",
  },
  Absent: {
    label: "Absent",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700 font-semibold",
    dotClass: "bg-rose-600",
  },
  Late: {
    label: "Late",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700 font-semibold",
    dotClass: "bg-[#F5A000]",
  },
  "On-Duty": {
    label: "On-Duty",
    badgeClass: "border-blue-200 bg-blue-50 text-[#123B5A] font-semibold",
    dotClass: "bg-[#123B5A]",
  },
  Pending: {
    label: "Pending",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700 font-semibold",
    dotClass: "bg-[#F5A000]",
  },
  Approved: {
    label: "Approved",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold",
    dotClass: "bg-emerald-600",
  },
  Rejected: {
    label: "Rejected",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700 font-semibold",
    dotClass: "bg-rose-600",
  },
  Draft: {
    label: "Draft",
    badgeClass: "border-[#E5E9EF] bg-[#EEF1F5] text-[#788391] font-semibold",
    dotClass: "bg-[#788391]",
  },
  Published: {
    label: "Published",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold",
    dotClass: "bg-emerald-600",
  },
  Locked: {
    label: "Locked",
    badgeClass: "border-[#123B5A]/20 bg-[#123B5A]/10 text-[#123B5A] font-semibold",
    dotClass: "bg-[#123B5A]",
  },
}

const NORMALIZED_STATUS_MAP: Record<string, StatusType> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  "on-duty": "On-Duty",
  on_duty: "On-Duty",
  onduty: "On-Duty",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  draft: "Draft",
  published: "Published",
  locked: "Locked",
}

export interface StatusBadgeProps {
  status: StatusType | (string & {})
  showDot?: boolean
  className?: string
}

export function StatusBadge({
  status,
  showDot = true,
  className,
}: StatusBadgeProps) {
  const normalized =
    NORMALIZED_STATUS_MAP[status.trim().toLowerCase()] ?? "Draft"
  const style = STATUS_STYLES[normalized]
  const displayLabel =
    normalized in STATUS_STYLES &&
    status.trim().toLowerCase() in NORMALIZED_STATUS_MAP
      ? style.label
      : status

  return (
    <span
      data-slot="status-badge"
      data-status={normalized}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        style.badgeClass,
        className
      )}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", style.dotClass)}
        />
      )}
      {displayLabel}
    </span>
  )
}

