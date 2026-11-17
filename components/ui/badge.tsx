import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        brand:
          "border-transparent bg-brand text-brand-foreground [a&]:hover:bg-brand/90",
        teal:
          "border-[#99F6E4] bg-[#CCFBF1] text-[#0D9488]",
        success:
          "border-[#BBF7D0] bg-[#DCFCE7] text-[#16A34A]",
        warning:
          "border-[#FDE68A] bg-[#FEF3C7] text-[#D97706]",
        error:
          "border-[#FECACA] bg-[#FEE2E2] text-[#DC2626]",
        info:
          "border-[#FDE68A] bg-[#FEF3C7] text-[#D97706]",
        navy:
          "border-[#16466C]/30 bg-[#EEF1F5] text-[#123B5A]",
        orange:
          "border-[#FDE68A] bg-[#FEF3C7] text-[#F5A000]",
        neutral:
          "border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "text-[11px] px-2 py-0.5",
        md: "text-xs px-2.5 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
