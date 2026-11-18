import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "default";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "default",
  isLoading = false,
  icon,
  className = "",
  disabled,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center font-bold rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[14px]";

  const variantClasses = {
    primary: "bg-[#F5A000] hover:bg-[#E09200] text-white focus:ring-[#F5A000] shadow-xs",
    secondary: "bg-[#123B5A] hover:bg-[#1B4D70] text-white focus:ring-[#123B5A] shadow-xs",
    outline: "border border-[#E2E8F0] bg-white text-[#1E293B] hover:bg-[#F8FAFC] focus:ring-[#F5A000]",
    danger: "bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-600 shadow-xs",
    ghost: "text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] focus:ring-[#64748B]",
  };

  const sizeClasses = {
    default: "h-9 px-3 text-xs gap-1.5",
    sm: "h-8 px-2.5 text-xs gap-1.5",
    md: "h-9 px-4 text-xs gap-2",
    lg: "h-10 px-5 text-sm gap-2.5",
  };

  return (
    <button
      suppressHydrationWarning
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          ></path>
        </svg>
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
};
