import * as React from "react"
import { TrendingDown, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge as SharedBadge } from "./Badge"

export type StatCardTone =
  | "primary"
  | "brand"
  | "teal"
  | "success"
  | "warning"
  | "error"

const TONE_CLASSES: Record<StatCardTone, string> = {
  primary: "bg-primary/10 text-primary",
  brand: "bg-brand/10 text-brand",
  teal: "bg-teal/12 text-teal",
  success: "bg-success/10 text-success",
  warning: "bg-warning/12 text-warning",
  error: "bg-error/10 text-error",
}

export interface StatCardTrend {
  value: string
  direction?: "up" | "down" | "neutral"
  label?: string
}

export interface StatCardProps {
  // Supports both Teacher portal (label) and Student/Parent portal (title)
  label?: string
  title?: string
  value: string | number
  icon?: React.ReactNode
  tone?: StatCardTone
  trend?: StatCardTrend
  description?: string
  subtitle?: string
  badgeText?: string
  badgeVariant?: "success" | "warning" | "error" | "info" | "brand" | "neutral"
  className?: string
  onClick?: () => void
}

export function StatCard({
  label,
  title,
  value,
  icon,
  tone = "primary",
  trend,
  description,
  subtitle,
  badgeText,
  badgeVariant = "info",
  className,
  onClick,
}: StatCardProps) {
  const displayTitle = label ?? title ?? ""
  const displaySubtitle = description ?? subtitle
  const direction = trend?.direction ?? "neutral"

  return (
    <Card
      onClick={onClick}
      className={cn(
        "gap-0 py-5 shadow-xs transition-all",
        onClick && "cursor-pointer hover:border-primary hover:shadow-md",
        className
      )}
    >
      <CardContent className="flex items-start justify-between gap-4 px-5">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate text-[13px] font-medium text-muted-foreground">
            {displayTitle}
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight text-foreground sm:text-[26px]">
              {value}
            </p>
            {badgeText && (
              <SharedBadge variant={badgeVariant} size="sm">
                {badgeText}
              </SharedBadge>
            )}
          </div>

          {(trend || displaySubtitle) && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    direction === "up" && "bg-success/10 text-success",
                    direction === "down" && "bg-error/10 text-error",
                    direction === "neutral" && "bg-muted text-muted-foreground"
                  )}
                >
                  {direction === "up" && <TrendingUp className="size-3" />}
                  {direction === "down" && <TrendingDown className="size-3" />}
                  {trend.value}
                </span>
              )}
              {(trend?.label || displaySubtitle) && (
                <span className="text-[13px] text-muted-foreground">
                  {trend?.label ?? displaySubtitle}
                </span>
              )}
            </div>
          )}
        </div>

        {icon && (
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
              TONE_CLASSES[tone]
            )}
          >
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
