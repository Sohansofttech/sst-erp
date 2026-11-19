"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error boundary captured error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FFFBEB] border border-[#F5A000]/30 flex items-center justify-center mx-auto mb-4 text-[#D97706] shadow-sm">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <h1 className="text-xl font-extrabold text-[#1E293B] tracking-tight">
          Something went wrong
        </h1>

        <p className="text-xs sm:text-sm text-[#64748B] mt-2 leading-relaxed">
          An unexpected error occurred. Please try reloading the page, or return to the sign in portal.
        </p>

        {error?.message && (
          <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-left">
            <p className="text-[11px] font-mono text-slate-600 truncate">
              {error.message}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#123B5A] text-white text-xs font-bold hover:bg-[#16466C] transition-all shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Page
          </button>

          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.replace("/login");
              }
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#123B5A] border border-[#E2E8F0] hover:bg-slate-50 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Return to Login
          </button>
        </div>
      </div>
    </div>
  );
}
