"use client";

import { Menu, X } from "lucide-react";

export function SubscriptionHeader({
  title,
  institutionName,
  mobileOpen,
  onToggleMobile,
}: {
  title: string;
  institutionName: string;
  mobileOpen: boolean;
  onToggleMobile: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open subscription navigation"
          className="rounded-lg border border-slate-200 p-2 lg:hidden"
          onClick={onToggleMobile}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div>
          <h1 className="text-sm font-bold md:text-base">{title}</h1>
          <p className="hidden text-xs text-slate-500 md:block">{institutionName}</p>
        </div>
      </div>
      <div className="rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-bold text-[#2563EB]">
        Institution Admin
      </div>
    </header>
  );
}
