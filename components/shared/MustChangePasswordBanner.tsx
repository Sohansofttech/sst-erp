"use client";

import React, { useState, useEffect } from "react";
import { ShieldAlert, ArrowRight, X } from "lucide-react";
import { ChangePasswordModal } from "./ChangePasswordModal";

export function MustChangePasswordBanner() {
  const [mustChange, setMustChange] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Suppress security banner in local environment
    if (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.port === "3000" ||
        process.env.NODE_ENV === "development")
    ) {
      return;
    }

    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.session?.mustChangePassword) {
          setMustChange(true);
        }
      })
      .catch(() => {});
  }, []);

  if (
    dismissed ||
    !mustChange ||
    (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.port === "3000" ||
        process.env.NODE_ENV === "development"))
  ) {
    return null;
  }

  return (
    <>
      <div className="w-full bg-amber-500 text-white px-4 py-2.5 shadow-xs flex items-center justify-between gap-3 text-xs z-30 relative animate-in slide-in-from-top duration-200">
        <div className="flex items-center gap-2 max-w-4xl">
          <ShieldAlert className="w-4 h-4 shrink-0 text-white animate-pulse" />
          <p className="font-medium text-white leading-tight">
            <strong className="font-bold">Security Notice:</strong> You are currently signed in with a default or breached demo password. Google Password Manager and ERP security recommend changing it immediately.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setModalOpen(true)}
            className="bg-white text-[#123B5A] hover:bg-slate-100 font-bold px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <span>Change Password</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-white/20 rounded-md transition-colors text-white cursor-pointer"
            title="Dismiss message"
            aria-label="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        isMandatory={false}
      />
    </>
  );
}

