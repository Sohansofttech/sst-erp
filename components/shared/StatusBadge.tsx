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
    badgeClass: "border-success/25 bg-success/10 text-success",
    dotClass: "bg-success",
  },
  Absent: {
    label: "Absent",
    badgeClass: "border-error/25 bg-error/10 text-error",
    dotClass: "bg-error",
  },
  Late: {
    label: "Late",
    badgeClass: "border-warning/30 bg-warning/12 text-amber-700",
    dotClass: "bg-warning",
  },
  "On-Duty": {
    label: "On-Duty",
    badgeClass: "border-teal/30 bg-teal/12 text-teal-700",
    dotClass: "bg-teal",
  },
  Pending: {
    label: "Pending",
    badgeClass: "border-warning/30 bg-warning/12 text-amber-700",
    dotClass: "bg-warning",
  },
  Approved: {
    label: "Approved",
    badgeClass: "border-success/25 bg-success/10 text-success",
    dotClass: "bg-success",
  },
  Rejected: {
    label: "Rejected",
    badgeClass: "border-error/25 bg-error/10 text-error",
    dotClass: "bg-error",
  },
  Draft: {
    label: "Draft",
    badgeClass: "border-slate-300 bg-slate-100 text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
  Published: {
    label: "Published",
    badgeClass: "border-primary/25 bg-primary/10 text-primary",
    dotClass: "bg-primary",
  },
  Locked: {
    label: "Locked",
    badgeClass: "border-brand/25 bg-brand/10 text-brand",
    dotClass: "bg-brand",
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

