"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  Activity, Bell, Building2, ChevronDown, CircleHelp, CreditCard, LayoutDashboard,
  Menu, Palette, Puzzle, Settings2, ShieldCheck, Users, X, ClipboardList, Globe2, KeyRound, Megaphone, Archive,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { superAdminNavigation } from "@/components/super-admin/navigation-items";
import { LogoutButton } from "@/components/super-admin/logout-button";

const navigationIcons: Record<string, LucideIcon> = {
  "/super-admin": LayoutDashboard, "/super-admin/institutions": Building2, "/super-admin/onboarding": ClipboardList,
  "/super-admin/subscription-plans": CreditCard, "/super-admin/billing": CreditCard, "/super-admin/branding": Palette,
  "/super-admin/domains": Globe2, "/super-admin/modules": Puzzle, "/super-admin/usage": Activity,
  "/super-admin/users": Users, "/super-admin/support": CircleHelp, "/super-admin/support-access": KeyRound,
  "/super-admin/notifications": Megaphone, "/super-admin/audit-logs": ShieldCheck,
  "/super-admin/deletion": Archive, "/super-admin/settings": Settings2,
};

export function SuperAdminShell({ children, userEmail, developmentMode = false }: { children: React.ReactNode; userEmail: string; developmentMode?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const activeItem = superAdminNavigation.find((item) => item.href === pathname || (item.href !== "/super-admin" && pathname.startsWith(`${item.href}/`))) ?? superAdminNavigation[0];

  return (
    <div className={`super-admin ${sidebarCollapsed ? "sa-sidebar-collapsed" : ""}`}>
      {menuOpen && <button aria-label="Close navigation" className="sa-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`sa-sidebar ${menuOpen ? "sa-sidebar-open" : ""}`} aria-label="Super Admin navigation">
        <div className="sa-brand">
          <div className="sa-brand-mark"><Image src="/sohan_logo.png" alt="Sohan Soft Tech logo" width={38} height={38} priority /></div>
          <div><div className="sa-brand-title">SST-ERP</div><div className="sa-brand-caption">Platform Console</div></div>
        </div>
        <nav className="sa-nav">
          <div className="sa-nav-label">Platform</div>
          {superAdminNavigation.map(({ label, href }) => {
            const Icon = navigationIcons[href] ?? LayoutDashboard;
            const isActive = activeItem.href === href;
            return (
              <Link key={href} href={href} aria-current={isActive ? "page" : undefined} className={`sa-nav-item ${isActive ? "sa-nav-item-active" : ""}`} onClick={() => setMenuOpen(false)} title={sidebarCollapsed ? label : undefined}>
                <Icon size={17} strokeWidth={1.8} /><span className="sa-nav-text">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sa-sidebar-footer"><span>SST-ERP Platform · {developmentMode ? "Development" : "Production"}</span><button type="button" className="sa-collapse-button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>{sidebarCollapsed ? "»" : "«"}</button></div>
      </aside>
      <div className="sa-main">
        <header className="sa-header">
          <div className="sa-header-left">
            <button className="sa-mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <div><h1>{activeItem.label}</h1><div className="sa-breadcrumb">Platform <span aria-hidden="true">/</span> {activeItem.label}</div></div>
          </div>
          <div className="sa-header-actions">
            {developmentMode && <span className="sa-dev-mode-indicator" role="status">Development Mode</span>}
            <Link href="/super-admin/notifications" className="sa-icon-button" aria-label="Open platform notifications" title="Platform notifications">
              <Bell size={18} /><span className="sa-notification-dot" />
            </Link>
            <div className="sa-profile" aria-label="Signed-in Super Admin profile">
              <div className="sa-avatar">SA</div>
              <div className="sa-profile-copy"><div className="sa-profile-name">Super Admin</div><div className="sa-profile-role">{userEmail}</div></div>
              <button type="button" className="sa-profile-toggle" aria-expanded={profileOpen} aria-label="Open profile menu" onClick={() => setProfileOpen((open) => !open)}><ChevronDown size={15} className="sa-profile-copy" color="#64748b" /></button>
              {profileOpen && <div className="sa-profile-menu"><strong>Signed in as</strong><span>{userEmail}</span><Link href="/super-admin/settings" onClick={() => setProfileOpen(false)}>Account settings</Link>{!developmentMode && <LogoutButton className="sa-logout-button" />}</div>}
            </div>
          </div>
        </header>
        <main className="sa-content">{children}</main>
      </div>
    </div>
  );
}
