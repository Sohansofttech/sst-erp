"use client";

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

export type SubscriptionNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export function SubscriptionSidebar({
  nav,
  activeHref,
  institutionName,
  userName,
  onNavigate,
}: {
  nav: SubscriptionNavItem[];
  activeHref: string;
  institutionName: string;
  userName: string;
  onNavigate?: () => void;
}) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-[#153B66] text-white">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#14B8A6] text-sm font-black">
          SST
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">SST-ERP</div>
          <div className="truncate text-[11px] text-white/65">Subscription Portal</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Subscription navigation">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-[#2563EB] text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {active && <ChevronRight className="ml-auto h-3.5 w-3.5" />}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="truncate text-xs font-bold">{userName}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/60">{institutionName}</div>
      </div>
    </aside>
  );
}
