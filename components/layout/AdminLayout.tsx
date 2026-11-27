"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { InstitutionProvider, useInstitution } from "@/lib/store";
import { DivisionProvider } from "@/lib/division-store";
import {
  fetchClientSession,
  getClientSessionIdentityFromResponse,
  type ClientSessionResponse,
} from "@/lib/auth/client-session";
import { DEFAULT_INSTITUTION_THEME, InstitutionThemeConfig } from "@/lib/theme-utils";
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

const AdminRoleContext = React.createContext<string | undefined>(undefined);

export function useAdminRole(): string | undefined {
  return React.useContext(AdminRoleContext);
}

const AdminLayoutInner: React.FC<{
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  userRole?: string;
  userPermissions?: string[];
  initialUser?: { fullName: string; email: string; role: string } | null;
  children: React.ReactNode;
}> = ({ sidebarOpen, setSidebarOpen, userRole, userPermissions, initialUser, children }) => {
  const { theme } = useInstitution();
  const activeTheme = theme || DEFAULT_INSTITUTION_THEME;

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
              {children}
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
  const [sessionSnapshot, setSessionSnapshot] = useState<ClientSessionResponse | null>(null);
  const sessionIdentityRef = useRef<string | null>(initialAuth?.sessionIdentity ?? null);
  const hasObservedSessionRef = useRef(Boolean(initialAuth?.sessionIdentity));
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      sessionIdentityRef.current = null;
      hasObservedSessionRef.current = false;
      setSessionSnapshot(null);
      setUserRole(undefined);
      setUserPermissions([]);
      return;
    }

    let cancelled = false;
    let requestGeneration = 0;

    const verifySession = async () => {
      const currentRequestGeneration = ++requestGeneration;
      try {
        const json = await fetchClientSession(undefined, sessionIdentityRef.current);
        if (cancelled || currentRequestGeneration !== requestGeneration) return;
        if (!json.success || !json.data?.session) {
          if (hasObservedSessionRef.current) {
            sessionIdentityRef.current = null;
            hasObservedSessionRef.current = false;
            setSessionSnapshot(json);
          }
          setUserRole(undefined);
          setUserPermissions([]);
          router.replace("/admin/login");
          return;
        }

        const session = json.data.session;
        const role = (session.role || "").toUpperCase();
        const perms: string[] = Array.isArray(json.data.session.permissions)
          ? json.data.session.permissions
          : [];
        const nextSessionIdentity = getClientSessionIdentityFromResponse(json);
        if (!hasObservedSessionRef.current || nextSessionIdentity !== sessionIdentityRef.current) {
          sessionIdentityRef.current = nextSessionIdentity;
          hasObservedSessionRef.current = true;
          setSessionSnapshot(json);
        }
        setUserRole(role);
        setUserPermissions((previous) =>
          previous.length === perms.length && previous.every((permission, index) => permission === perms[index])
            ? previous
            : perms
        );

        if (role === "STUDENT" || role === "PARENT") {
          router.replace("/dashboard");
        } else if (role === "TEACHER") {
          const slug = (json.data.session.institutionSlug || json.data.session.institutionCode || json.data.session.institutionId || "vidyaniketan").toLowerCase();
          router.replace(`/campus/${slug}/teacher`);
        } else if (!isAdminPortalRole(role)) {
          router.replace("/login");
        } else if (isDepartmentalRole(role) && !canAccessAdminPage(role, perms, pathname)) {
          router.replace(getRoleLandingRoute(role));
        }
      } catch {
        if (cancelled || currentRequestGeneration !== requestGeneration) return;
        router.replace("/login");
      }
    };

    const refreshVisibleSession = () => {
      if (document.visibilityState === "visible") {
        void verifySession();
      }
    };

    void verifySession();
    const intervalId = window.setInterval(() => {
      void verifySession();
    }, 60_000);
    window.addEventListener("focus", refreshVisibleSession);
    document.addEventListener("visibilitychange", refreshVisibleSession);

    return () => {
      cancelled = true;
      requestGeneration += 1;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleSession);
      document.removeEventListener("visibilitychange", refreshVisibleSession);
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

  return (
    <AdminRoleContext.Provider value={userRole}>
      <InstitutionProvider
        key={initialAuth?.sessionIdentity || "anonymous"}
        initialProfile={
          initialAuth?.branding
            ? {
                id: initialAuth.branding.institutionId,
                name: initialAuth.branding.displayName,
                code: initialAuth.branding.code || "",
                logoUrl: initialAuth.branding.logoUrl || "",
                primaryColor: initialAuth.branding.primaryColor,
                accentColor: initialAuth.branding.secondaryColor,
                themeConfig: initialAuth.branding.themeConfig,
              }
            : undefined
        }
        initialTheme={initialAuth?.branding?.themeConfig}
        sessionSnapshot={sessionSnapshot}
      >
        <DivisionProvider userRole={userRole}>
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
    </AdminRoleContext.Provider>
  );
};
