"use client";

import React, { useState, useEffect, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { InstitutionProvider, useInstitution } from "@/lib/store";
import { DEFAULT_INSTITUTION_THEME } from "@/lib/theme-utils";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";

const AdminLayoutInner: React.FC<{
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
}> = ({ sidebarOpen, setSidebarOpen, children }) => {
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
        <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </Suspense>

      {/* Main Content Area with Fixed Header and Independent Main Scrolling */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Suspense fallback={<header className="h-16 bg-white border-b border-[#E2E8F0] shrink-0" />}>
          <AdminHeader onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        </Suspense>
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

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      return;
    }

    // Guard: Verify authenticated role on admin portal routes
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success || !json.data?.session) {
          router.replace("/login");
          return;
        }
        const role = json.data.session.role;
        if (role === "STUDENT" || role === "PARENT") {
          router.replace("/dashboard");
        } else if (role === "TEACHER") {
          const slug = (json.data.session.institutionName ? "APEX-TECH" : "demo-school").toLowerCase();
          router.replace(`/campus/${slug}/teacher`);
        }
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [isLoginPage, router]);

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
    <InstitutionProvider>
      <AdminLayoutInner sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
        {children}
      </AdminLayoutInner>
    </InstitutionProvider>
  );
};
