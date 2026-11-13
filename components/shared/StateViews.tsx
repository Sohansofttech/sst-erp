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
    <Card className={cn("border-dashed shadow-none", className)}>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "py-8" : "py-14"
        )}
      >
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Loader2 className="size-5 animate-spin" />
        </div>
        <h3 className="mt-4 text-[18px] font-semibold text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 max-w-md text-[14px] text-muted-foreground">
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
    <Card className={cn("border-dashed shadow-none", className)}>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "py-8" : "py-14"
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">
          {icon ?? <Inbox />}
        </div>
        <h3 className="mt-4 text-[18px] font-semibold text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 max-w-md text-[14px] text-muted-foreground">
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
    <Card className={cn("border-error/25 shadow-none", className)}>
      <CardContent
        className={cn(
          "flex flex-col items-center justify-center text-center",
          compact ? "py-8" : "py-14"
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
          <AlertCircle className="size-6" />
        </div>
        <h3 className="mt-4 text-[18px] font-semibold text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 max-w-md text-[14px] text-muted-foreground">
            {description}
          </p>
        )}
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            onClick={onRetry}
            className="mt-5"
          >
            <RefreshCw className="size-4" />
            {retryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

