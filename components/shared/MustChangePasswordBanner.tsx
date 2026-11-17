"use client";

import React, { useState, useEffect } from "react";
import { ShieldAlert, ArrowRight } from "lucide-react";
import { ChangePasswordModal } from "./ChangePasswordModal";

export function MustChangePasswordBanner() {
  const [mustChange, setMustChange] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.session?.mustChangePassword) {
          setMustChange(true);
        }
      })
      .catch(() => {});
  }, []);

  if (!mustChange) return null;

  return (
    <>
      <div className="w-full bg-amber-500 text-white px-4 py-2.5 shadow-xs flex items-center justify-between gap-3 text-xs z-30 relative animate-in slide-in-from-top duration-200">
        <div className="flex items-center gap-2 max-w-4xl">
          <ShieldAlert className="w-4 h-4 shrink-0 text-white animate-pulse" />
          <p className="font-medium text-white leading-tight">
            <strong className="font-bold">Security Notice:</strong> You are currently signed in with a default or breached demo password. Google Password Manager and ERP security recommend changing it immediately.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="shrink-0 bg-white text-[#123B5A] hover:bg-slate-100 font-bold px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer text-xs"
        >
          <span>Change Password</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <ChangePasswordModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        isMandatory={false}
      />
    </>
  );
}

