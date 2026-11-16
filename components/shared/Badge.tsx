import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "success" | "warning" | "error" | "info" | "brand" | "neutral";
  size?: "sm" | "md";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  size = "md",
  className = "",
}) => {
  const variantStyles = {
    success: "bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]",
    warning: "bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]",
    error: "bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]",
    info: "bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]",
    brand: "bg-[#123B5A] text-white border-[#123B5A]",
    neutral: "bg-[#EEF1F5] text-[#788391] border-[#E5E9EF]",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs font-medium",
    md: "px-2.5 py-1 text-xs font-semibold",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
};
