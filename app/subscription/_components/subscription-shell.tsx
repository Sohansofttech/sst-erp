"use client";

import { usePathname } from "next/navigation";
import {
  Activity,
  CreditCard,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { SubscriptionSidebar, type SubscriptionNavItem } from "./subscription-sidebar";
import { SubscriptionHeader } from "./subscription-header";

export function SubscriptionShell({
  children,
  institutionName,
  userName,
}: {
  children: React.ReactNode;
  institutionName: string;
  userName: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav: SubscriptionNavItem[] = [
    { label: "Overview", href: "/subscription", icon: LayoutDashboard },
    { label: "Available Plans", href: "/subscription/plans", icon: ShieldCheck },
    { label: "Current Subscription", href: "/subscription/current", icon: CreditCard },
    { label: "History", href: "/subscription/history", icon: Activity },
    { label: "Invoices", href: "/subscription/invoices", icon: ReceiptText },
    { label: "Usage & Limits", href: "/subscription/usage", icon: Activity },
  ];

  const activeItem =
    nav.find((item) => pathname === item.href) ??
    nav.find((item) => item.href !== "/subscription" && pathname.startsWith(`${item.href}/`)) ??
    nav[0];

  const sidebar = (
    <SubscriptionSidebar
      nav={nav}
      activeHref={activeItem.href}
      institutionName={institutionName}
      userName={userName}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] text-[#1E293B]">
      <div className="hidden lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-64">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <SubscriptionHeader
          title={activeItem.label}
          institutionName={institutionName}
          mobileOpen={mobileOpen}
          onToggleMobile={() => setMobileOpen((open) => !open)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
