"use client";

import { createContext, useContext, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { PortalLayout } from "@/components/layout/PortalLayout";

export type SubscriptionPortalRole = "SUPER_ADMIN" | "INSTITUTION_ADMIN";

const roleContext = createContext<SubscriptionPortalRole>("SUPER_ADMIN");

export function useSubscriptionPortalRole() {
  return useContext(roleContext);
}

const navigation = [
  ["Overview", "/subscriptions"],
  ["Subscription Plans", "/subscriptions/plans"],
  ["Institution Subscriptions", "/subscriptions/institutions"],
  ["Payments & Transactions", "/subscriptions/payments"],
  ["Invoices & Receipts", "/subscriptions/invoices"],
  ["Renewals & Upgrades", "/subscriptions/renewals"],
  ["Revenue & Reports", "/subscriptions/reports"],
  ["Settings", "/subscriptions/settings"],
] as const;

export function SubscriptionPortalShell({ children, role }: { children: React.ReactNode; role: SubscriptionPortalRole }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (role === "INSTITUTION_ADMIN") {
    return <roleContext.Provider value={role}><PortalLayout portalType="INSTITUTION_ADMIN">{children}</PortalLayout></roleContext.Provider>;
  }
  const current = navigation.find((item) => item[1] === pathname)?.[0] ?? "Subscription Center";
  return (
    <roleContext.Provider value={role}>
      <div className="sc-shell">
        {open && <button className="sc-mobile-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} type="button" />}
        <aside className={`sc-sidebar${open ? " sc-sidebar-open" : ""}`} aria-label="Subscription Center navigation">
          <Link className="sc-brand" href="/subscriptions" onClick={() => setOpen(false)}>
            <span className="sc-brand-mark">
              <Image src="/sohan_logo.png" alt="Sohan Soft Tech" width={32} height={32} priority style={{ width: "auto", height: "auto", maxWidth: 32, maxHeight: 32 }} />
            </span>
            <span className="sc-brand-copy"><strong>Sohan Soft Tech</strong><small>SUBSCRIPTION CENTER</small></span>
          </Link>
          <div className="sc-sidebar-caption">SUPER ADMIN</div>
          <nav className="sc-navigation">
            {navigation.map(([label, href]) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
                className={`sc-nav-item${pathname === href ? " sc-nav-item-active" : ""}`} onClick={() => setOpen(false)}>
                <span className="sc-nav-label">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="sc-sidebar-footer"><div className="sc-workspace-user"><span className="sc-user-avatar">SA</span><span className="sc-user-copy"><strong>Super Admin</strong><small>Platform workspace</small></span></div></div>
        </aside>
        <div className="sc-main">
          <header className="sc-topbar">
            <div className="sc-topbar-heading">
              <button className="sc-mobile-menu" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} type="button">{open ? <X size={20} /> : <Menu size={20} />}</button>
              <div><div className="sc-breadcrumb"><span>Sohan Soft Tech / Super Admin / Subscription Center</span></div><h1>{current}</h1></div>
            </div>
            <div className="sc-topbar-actions"><span className="sc-role-badge">Super Admin</span><Link className="sc-button" href="/super-admin">Super Admin Home</Link></div>
          </header>
          <main className="sc-content">{children}</main>
        </div>
      </div>
    </roleContext.Provider>
  );
}
