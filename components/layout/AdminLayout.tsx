"use client";

import React, { useState, useEffect, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { InstitutionProvider, useInstitution } from "@/lib/store";
import { DivisionProvider } from "@/lib/division-store";
import { DEFAULT_INSTITUTION_THEME } from "@/lib/theme-utils";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";
import { MustChangePasswordBanner } from "@/components/shared/MustChangePasswordBanner";
import type { VerifiedAdminPageAuth } from "@/lib/security/admin-page-guard";
import {
  canAccessAdminPage,
  getRoleLandingRoute,
  isAdminPortalRole,
  isDepartmentalRole,
} from "@/lib/security/rbac";
import { isAdminPathAllowed, isGatedAdminPath } from "@/lib/institution-type-config";

const AdminLayoutInner: React.FC<{
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  userRole?: string;
  userPermissions?: string[];
  initialUser?: { fullName: string; email: string; role: string } | null;
  children: React.ReactNode;
}> = ({ sidebarOpen, setSidebarOpen, userRole, userPermissions, initialUser, children }) => {
  const { theme, institutionKind } = useInstitution();
  const activeTheme = theme || DEFAULT_INSTITUTION_THEME;
  const pathname = usePathname();
  const router = useRouter();
  // Modules that do not apply to this institution type are blocked by URL as well as hidden in navigation.
  const gatedPath = isGatedAdminPath(pathname);
  const pathAllowed = isAdminPathAllowed(institutionKind, pathname);

  useEffect(() => {
    if (gatedPath && institutionKind !== null && !pathAllowed) router.replace("/admin");
  }, [gatedPath, institutionKind, pathAllowed, router]);

  return (
    <div
      className="flex h-screen overflow-hidden transition-colors duration-200"
      style={
        {
          backgroundColor: activeTheme.workspaceBackground,
          color: activeTheme.primaryTextColor,
          "--admin-sidebar-bg": activeTheme.sidebarBackground,
          "--admin-primary-btn": activeTheme.primaryButtonColor,
          "--admin-active-nav": activeTheme.activeSidebarNav,
          "--admin-workspace-bg": activeTheme.workspaceBackground,
          "--admin-card-bg": activeTheme.cardBackground,
          "--admin-text-primary": activeTheme.primaryTextColor,
          "--admin-text-secondary": activeTheme.secondaryTextColor,
          "--admin-accent": activeTheme.accentColor,
          "--admin-chart-1": activeTheme.chartPalette?.[0] || "#123B5A",
          "--admin-chart-2": activeTheme.chartPalette?.[1] || "#F5A000",
          "--admin-chart-3": activeTheme.chartPalette?.[2] || "#14B8A6",
          "--admin-chart-4": activeTheme.chartPalette?.[3] || "#3B82F6",
          "--admin-chart-5": activeTheme.chartPalette?.[4] || "#8B5CF6",
        } as React.CSSProperties
      }
    >
      {/* Responsive Fixed/Sticky Left Sidebar with Independent Scrolling */}
      <Suspense fallback={<aside className="w-64 bg-[#123B5A] shrink-0 h-screen hidden lg:block" />}>
        <AdminSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userRole={userRole}
          userPermissions={userPermissions}
        />
      </Suspense>

      {/* Main Content Area with Fixed Header and Independent Main Scrolling */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Suspense fallback={<header className="h-16 bg-white border-b border-[#E2E8F0] shrink-0" />}>
          <AdminHeader
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            userRole={userRole}
            initialUser={initialUser}
          />
        </Suspense>
        <MustChangePasswordBanner />
        <main
          className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8"
          style={{ backgroundColor: activeTheme.workspaceBackground }}
        >
          <div className="max-w-7xl w-full mx-auto">
            <Suspense fallback={<div className="p-6 text-sm text-[#64748B]">Loading...</div>}>
              {gatedPath && !pathAllowed ? (
                <div className="p-6 text-sm text-[#64748B]" role="status">
                  {institutionKind === null
                    ? "Checking which modules are available for your institution..."
                    : "This module is not available for your institution type. Redirecting..."}
                </div>
              ) : (
                children
              )}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export const AdminLayout: React.FC<{
  children: React.ReactNode;
  initialAuth?: VerifiedAdminPageAuth | null;
}> = ({ children, initialAuth }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | undefined>(initialAuth?.role);
  const [userPermissions, setUserPermissions] = useState<string[]>(initialAuth?.permissions || []);
  const [sessionVerified, setSessionVerified] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      return;
    }

    let active = true;

    // Guard: Verify authenticated role on admin portal routes
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/admin/login");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!json) return;
        if (!active) return;
        if (!json.success || !json.data?.session) {
          router.replace("/admin/login");
          return;
        }
        const role = (json.data.session.role || "").toUpperCase();
        const perms: string[] = Array.isArray(json.data.session.permissions)
          ? json.data.session.permissions
          : [];
        setUserRole(role);
        setUserPermissions(perms);

        if (role === "STUDENT" || role === "PARENT") {
          router.replace("/dashboard");
        } else if (role === "TEACHER") {
          const institutionRoute = json.data.session.institutionSlug || json.data.session.institutionCode || json.data.session.institutionId;
          router.replace(institutionRoute ? `/campus/${encodeURIComponent(institutionRoute)}/teacher` : "/login?role=teacher");
        } else if (role === "SUPER_ADMIN") {
          router.replace("/super-admin");
        } else if (!isAdminPortalRole(role)) {
          router.replace("/admin/login");
        } else {
          if (isDepartmentalRole(role) && !canAccessAdminPage(role, perms, pathname)) {
            router.replace(getRoleLandingRoute(role));
          } else {
            setSessionVerified(true);
          }
        }
      })
      .catch(() => {
        if (active) router.replace("/admin/login");
      });
    return () => {
      active = false;
    };
  }, [isLoginPage, pathname, router]);

  if (isLoginPage) {
    return (
      <InstitutionProvider>
        <div className="min-h-screen bg-[#EEF1F5]">
          <Suspense fallback={<div className="p-6 text-sm text-[#64748B]">Loading...</div>}>
            {children}
          </Suspense>
        </div>
      </InstitutionProvider>
    );
  }

  if (!sessionVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF1F5] text-sm text-[#64748B]">
        Verifying Institution Admin access…
      </div>
    );
  }

  return (
    <InstitutionProvider>
      <DivisionProvider>
        <AdminLayoutInner
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          userRole={userRole}
          userPermissions={userPermissions}
          initialUser={initialAuth ? { fullName: initialAuth.fullName, email: initialAuth.email, role: initialAuth.role } : null}
        >
          {children}
        </AdminLayoutInner>
      </DivisionProvider>
    </InstitutionProvider>
  );
};
