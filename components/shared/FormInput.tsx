import React from "react";

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, helperText, className = "", id, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full space-y-1.5">
        <label
          htmlFor={inputId}
          className="block text-[13px] font-medium text-[#1E293B]"
        >
          {label} {props.required && <span className="text-[#DC2626]">*</span>}
        </label>
        <input
          id={inputId}
          ref={ref}
          suppressHydrationWarning
          className={`w-full h-9 px-3 text-sm bg-white border rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-[#F5A000] disabled:bg-[#EEF1F5] disabled:cursor-not-allowed ${
            error
              ? "border-[#DC2626] focus:border-[#DC2626]"
              : "border-[#E2E8F0] focus:border-[#F5A000]"
          } text-[#1E293B] ${className}`}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-xs text-[#DC2626]">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-[#64748B]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

FormInput.displayName = "FormInput";
