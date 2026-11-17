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
  | "navy"
  | "darkNavy"

const TONE_CLASSES: Record<StatCardTone, string> = {
  primary: "bg-amber-50 text-[#F5A000]",
  brand: "bg-[#123B5A]/10 text-[#123B5A]",
  teal: "bg-emerald-50 text-emerald-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  error: "bg-rose-50 text-rose-600",
  navy: "bg-[#123B5A]/10 text-[#123B5A]",
  darkNavy: "bg-white/15 text-[#F5A000]",
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
  variant?: "default" | "dark"
  trend?: StatCardTrend
  badgeText?: string
  badgeVariant?: "success" | "warning" | "error" | "info" | "brand" | "neutral"
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
  variant = "default",
  trend,
  badgeText,
  badgeVariant = "info",
  onClick,
  className,
}: StatCardProps) {
  const displayTitle = title ?? label ?? ""
  const displaySubtitle = subtitle ?? description ?? helperText
  const direction = trend?.direction ?? "neutral"
  const isDark = variant === "dark" || tone === "darkNavy"

  return (
    <Card
      onClick={onClick}
      className={cn(
        "gap-0 rounded-2xl py-5 shadow-xs transition-all hover:shadow-md",
        isDark
          ? "border-0 bg-[#123B5A] text-white hover:bg-[#16466C]"
          : "border-[#E5E9EF] bg-white text-[#202936]",
        onClick && (isDark ? "cursor-pointer hover:ring-2 hover:ring-[#F5A000]" : "cursor-pointer hover:border-[#F5A000]"),
        className
      )}
    >
      <CardContent className="flex items-start justify-between gap-4 px-5">
        <div className="min-w-0 space-y-1.5">
          <p
            className={cn(
              "truncate text-[13px] font-semibold tracking-normal",
              isDark ? "text-white/80" : "text-[#788391]"
            )}
            title={displayTitle}
          >
            {displayTitle}
          </p>
          <div className="flex items-baseline gap-2">
            <p
              className={cn(
                "text-2xl font-bold tracking-tight sm:text-[28px]",
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
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                    isDark
                      ? direction === "up"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : direction === "down"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-white/10 text-white/80"
                      : direction === "up"
                        ? "bg-emerald-50 text-emerald-700"
                        : direction === "down"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-[#EEF1F5] text-[#788391]"
                  )}
                >
                  {direction === "up" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : direction === "down" ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : null}
                  {trend.value}
                  {trend.label && (
                    <span
                      className={cn(
                        "font-normal",
                        isDark ? "text-white/70" : "text-[#788391]"
                      )}
                    >
                      {trend.label}
                    </span>
                  )}
                </span>
              )}
              {displaySubtitle && (
                <span
                  className={cn(
                    "text-xs truncate",
                    isDark ? "text-white/70" : "text-[#788391]"
                  )}
                >
                  {displaySubtitle}
                </span>
              )}
            </div>
          )}
        </div>

        {icon && (
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border",
              isDark
                ? "border-white/10 bg-white/10 text-[#F5A000]"
                : "border-[#E5E9EF] bg-[#EEF1F5] text-[#123B5A]",
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
