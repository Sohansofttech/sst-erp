"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalErrorRoot({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root global error boundary captured error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#EEF2F6] flex items-center justify-center p-4 font-sans text-[#1E293B]">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-[#E2E8F0] p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#FFFBEB] border border-[#F5A000]/30 flex items-center justify-center mx-auto mb-4 text-[#D97706] shadow-sm">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-extrabold text-[#1E293B] tracking-tight">
            Institutional ERP
          </h1>

          <p className="text-xs sm:text-sm text-[#64748B] mt-2 leading-relaxed">
            A system error occurred. Please reload to try again.
          </p>

          {error?.message && (
            <div className="mt-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-left">
              <p className="text-[11px] font-mono text-slate-600 truncate">
                {error.message}
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#123B5A] text-white text-xs font-bold hover:bg-[#16466C] transition-all shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Application
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
