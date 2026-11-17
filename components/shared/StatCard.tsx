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
  title?: string
  label?: string
  value: string | number
  subtitle?: string
  description?: string
  helperText?: string
  icon?: React.ReactNode
  tone?: StatCardTone
  trend?: StatCardTrend
  badgeText?: string
  badgeVariant?: "success" | "warning" | "error" | "info" | "brand" | "neutral"
  variant?: "default" | "dark"
  onClick?: () => void
  className?: string
}

export function StatCard({
  title,
  label,
  value,
  subtitle,
  description,
  helperText,
  icon,
  tone = "primary",
  trend,
  badgeText,
  badgeVariant = "info",
  variant = "default",
  onClick,
  className,
}: StatCardProps) {
  const isDark = variant === "dark"
  const displayTitle = title ?? label ?? ""
  const displaySubtitle = subtitle ?? description ?? helperText
  const direction = trend?.direction ?? "neutral"

  return (
    <Card
      onClick={onClick}
      className={cn(
        "gap-0 py-5 shadow-xs transition-all hover:shadow-md",
        isDark
          ? "bg-[#123B5A] text-white border border-[#1B4D70] shadow-md"
          : "bg-white border border-[#E5E9EF]",
        onClick && (isDark ? "cursor-pointer hover:border-[#F5A000]" : "cursor-pointer hover:border-[#F5A000]"),
        className
      )}
    >
      <CardContent className="flex items-start justify-between gap-4 px-5">
        <div className="min-w-0 space-y-1.5">
          <p
            className={cn(
              "text-xs font-semibold tracking-normal truncate",
              isDark ? "text-white/80" : "text-[#788391]"
            )}
            title={displayTitle}
          >
            {displayTitle}
          </p>
          <div className="flex items-baseline gap-2">
            <p
              className={cn(
                "text-2xl font-bold tracking-tight sm:text-[26px]",
                isDark ? "text-white" : "text-[#202936]"
              )}
            >
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
              {displaySubtitle && (
                <span
                  className={cn(
                    "text-[13px]",
                    isDark ? "text-white/70" : "text-[#788391]"
                  )}
                >
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
              isDark
                ? "bg-white/10 border border-white/10 text-white"
                : TONE_CLASSES[tone] || "bg-[#FFFBEB] border border-[#FDE68A] text-[#F59E0B]"
            )}
          >
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
