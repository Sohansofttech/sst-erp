import * as React from "react"
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export interface LoadingStateProps {
  title?: string
  description?: string
  compact?: boolean
  className?: string
}

export function LoadingState({
  title = "Loading data...",
  description = "Please wait while we fetch the latest records.",
  compact = false,
  className,
}: LoadingStateProps) {
  return (
    <Card className={cn("rounded-2xl border border-dashed border-[#E5E9EF] bg-white shadow-none", className)}>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "py-8" : "py-14"
        )}
      >
        <div className="flex size-11 items-center justify-center rounded-full bg-amber-50 text-[#F5A000]">
          <Loader2 className="size-5 animate-spin" />
        </div>
        <h3 className="mt-4 text-[18px] font-bold text-[#202936]">
          {title}
        </h3>
        {description && (
          <p className="mt-1 max-w-md text-[14px] text-[#788391]">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
  className?: string
}

export function EmptyState({
  title = "No records found",
  description = "There are no items to display here yet.",
  icon,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn("rounded-2xl border border-dashed border-[#E5E9EF] bg-white shadow-none", className)}>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "py-8" : "py-14"
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-[#EEF1F5] text-[#788391] [&_svg]:size-6">
          {icon ?? <Inbox />}
        </div>
        <h3 className="mt-4 text-[18px] font-bold text-[#202936]">
          {title}
        </h3>
        {description && (
          <p className="mt-1 max-w-md text-[14px] text-[#788391]">
            {description}
          </p>
        )}
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  )
}

export interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  compact?: boolean
  className?: string
}

export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this section. Please try again.",
  onRetry,
  retryLabel = "Try again",
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <Card className={cn("rounded-2xl border border-rose-200 bg-white shadow-none", className)}>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "py-8" : "py-14"
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertCircle className="size-6" />
        </div>
        <h3 className="mt-4 text-[18px] font-bold text-[#202936]">
          {title}
        </h3>
        {description && (
          <p className="mt-1 max-w-md text-[14px] text-[#788391]">
            {description}
          </p>
        )}
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            onClick={onRetry}
            className="mt-5 rounded-xl border-[#E5E9EF] text-[#202936] hover:bg-[#EEF1F5]"
          >
            <RefreshCw className="size-4" />
            {retryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

