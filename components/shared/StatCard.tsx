import * as React from "react"
import { TrendingDown, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

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
  label: string
  value: string | number
  icon: React.ReactNode
  tone?: StatCardTone
  trend?: StatCardTrend
  description?: string
  className?: string
}

export function StatCard({
  label,
  value,
  icon,
  tone = "primary",
  trend,
  description,
  className,
}: StatCardProps) {
  const direction = trend?.direction ?? "neutral"

  return (
    <Card className={cn("gap-0 py-5 shadow-xs", className)}>
      <CardContent className="flex items-start justify-between gap-4 px-5">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate text-[13px] font-medium text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold tracking-tight text-foreground sm:text-[26px]">
            {value}
          </p>

          {(trend || description) && (
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
              {(trend?.label || description) && (
                <span className="text-[13px] text-muted-foreground">
                  {trend?.label ?? description}
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
            TONE_CLASSES[tone]
          )}
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

