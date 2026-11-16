import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  icon,
  className = "",
  disabled,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed text-[14px]";

  const variantClasses = {
    primary: "bg-[#F5A000] hover:bg-[#DE9100] text-white focus:ring-[#F5A000] shadow-sm",
    secondary: "bg-[#123B5A] hover:bg-[#1B4D70] text-white focus:ring-[#123B5A] shadow-sm",
    outline: "border border-[#E5E9EF] bg-white text-[#123B5A] hover:bg-[#EEF1F5] focus:ring-[#F5A000]",
    danger: "bg-[#DC2626] hover:bg-[#B91C1C] text-white focus:ring-[#DC2626] shadow-sm",
    ghost: "text-[#788391] hover:text-[#123B5A] hover:bg-[#EEF1F5] focus:ring-[#788391]",
  };

  const sizeClasses = {
    sm: "px-2.5 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-[14px] gap-2",
    lg: "px-5 py-2.5 text-[15px] gap-2.5",
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
