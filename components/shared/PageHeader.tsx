import * as React from "react"

import { cn } from "@/lib/utils"

export interface PageHeaderProps {
  title: string
  subtitle?: string
  badge?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  badge,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[26px]">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
            {subtitle}
          </p>
        )}
      </div>

      {action && (
        <div className="flex shrink-0 items-center gap-2.5">{action}</div>
      )}
    </div>
  )
}

