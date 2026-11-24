"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Building2,
  ChevronLeft,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  PackageOpen,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SubscriptionPortalRole = "SUPER_ADMIN" | "INSTITUTION_ADMIN";

const roleContext = createContext<SubscriptionPortalRole>("SUPER_ADMIN");

export function useSubscriptionPortalRole() {
  return useContext(roleContext);
}

type PortalNavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const superAdminNavigation: PortalNavigationItem[] = [
  { label: "Overview", href: "/subscriptions", icon: LayoutDashboard },
  { label: "Subscription Plans", href: "/subscriptions/plans", icon: PackageOpen },
  { label: "Institution Subscriptions", href: "/subscriptions/institutions", icon: Building2 },
  { label: "Payments & Transactions", href: "/subscriptions/payments", icon: CreditCard },
  { label: "Invoices & Receipts", href: "/subscriptions/invoices", icon: FileText },
  { label: "Renewals & Upgrades", href: "/subscriptions/renewals", icon: ArrowLeftRight },
  { label: "Revenue & Reports", href: "/subscriptions/reports", icon: BarChart3 },
  { label: "Settings", href: "/subscriptions/settings", icon: Settings2 },
];

const institutionAdminNavigation: PortalNavigationItem[] = [
  { label: "My Subscription", href: "/subscriptions", icon: LayoutDashboard },
  { label: "Available Plans", href: "/subscriptions/plans", icon: PackageOpen },
  { label: "Student Usage", href: "/subscriptions/institutions", icon: Building2 },
  { label: "Payment History", href: "/subscriptions/payments", icon: CreditCard },
  { label: "Invoices", href: "/subscriptions/invoices", icon: FileText },
  { label: "Renewals & Upgrades", href: "/subscriptions/renewals", icon: ArrowLeftRight },
];

export function SubscriptionPortalShell({
  role,
  children,
}: {
  role: SubscriptionPortalRole;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const navigation = role === "SUPER_ADMIN" ? superAdminNavigation : institutionAdminNavigation;
  const currentPage = [...superAdminNavigation, ...institutionAdminNavigation].find((item) => item.href === pathname) ?? navigation[0];
  const isDatabaseBackedPage = ["/subscriptions", "/subscriptions/institutions", "/subscriptions/payments"].includes(pathname);

  return (
    <roleContext.Provider value={role}>
      <div className={`sc-shell${collapsed ? " sc-shell-collapsed" : ""}`}>
        {mobileOpen && (
          <button
            aria-label="Close subscription navigation"
            className="sc-mobile-backdrop"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
        )}
        <aside className={`sc-sidebar${mobileOpen ? " sc-sidebar-open" : ""}`} aria-label="Subscription Center navigation">
          <Link className="sc-brand" href="/subscriptions" onClick={() => setMobileOpen(false)}>
            <span className="sc-brand-mark"><CreditCard size={22} strokeWidth={2.2} /></span>
            <span className="sc-brand-copy">
              <strong>SST SUBSCRIPTION</strong>
              <small>CENTER</small>
            </span>
          </Link>

          <div className="sc-sidebar-caption">BILLING WORKSPACE</div>
          <nav className="sc-navigation" aria-label="Subscription sections">
            {navigation.map(({ label, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`sc-nav-item${active ? " sc-nav-item-active" : ""}`}
                  href={href}
                  key={href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? label : undefined}
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
                  <span className="sc-nav-label">{label}</span>
                  {active && <span className="sc-nav-active-dot" aria-hidden="true" />}
                </Link>
              );
            })}
          </nav>

          <div className="sc-sidebar-footer">
            <div className="sc-workspace-user">
              <span className="sc-user-avatar">{role === "SUPER_ADMIN" ? "SA" : "IA"}</span>
              <span className="sc-user-copy">
                <strong>{role === "SUPER_ADMIN" ? "Super Admin" : "Institution Admin"}</strong>
                <small>{role === "SUPER_ADMIN" ? "Platform workspace" : "Institution workspace"}</small>
              </span>
            </div>
            <button
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="sc-collapse-button"
              onClick={() => setCollapsed((value) => !value)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              <ChevronLeft size={17} />
            </button>
          </div>
        </aside>

        <div className="sc-main">
          <header className="sc-topbar">
            <div className="sc-topbar-heading">
              <button
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
                className="sc-mobile-menu"
                onClick={() => setMobileOpen((value) => !value)}
                type="button"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div>
                <div className="sc-breadcrumb">
                  <span>SST Subscription Center</span><span aria-hidden="true">/</span><strong>{currentPage.label}</strong>
                </div>
                <h1>{currentPage.label}</h1>
              </div>
            </div>
            <div className="sc-topbar-actions">
              <span className="sc-role-badge">
                <ShieldCheck size={14} />
                {role === "SUPER_ADMIN" ? "Super Admin" : "Institution Admin"}
              </span>
              <span className="sc-topbar-divider" aria-hidden="true" />
              <span className="sc-sample-indicator"><Activity size={14} /> {isDatabaseBackedPage ? "DATABASE RECORDS" : "UI PREVIEW"}</span>
              <button aria-label="Notifications (preview only)" className="sc-icon-button" type="button" title="No notifications are connected">
                <Bell size={18} />
                <span className="sc-notification-dot" aria-hidden="true" />
              </button>
            </div>
          </header>
          <main className="sc-content">
            {isDatabaseBackedPage ? (
              <div className="sc-preview-notice sc-live-notice" role="note">
                <span className="sc-preview-icon"><Activity size={17} /></span>
                <span><strong>Database-backed view.</strong> Records are loaded from existing ERP data. Unavailable schema fields are identified; this portal does not initiate payments.</span>
              </div>
            ) : (
              <div className="sc-preview-notice" role="note">
                <span className="sc-preview-icon"><Activity size={17} /></span>
                <span><strong>UI preview · sample data only.</strong> Figures, institutions, plans and transactions shown here are illustrative placeholders, not live ERP or financial records.</span>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </roleContext.Provider>
  );
}
