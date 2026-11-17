"use client";

import React, { useState, useEffect, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { InstitutionProvider } from "@/lib/store";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";
import { MustChangePasswordBanner } from "@/components/shared/MustChangePasswordBanner";

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      router.replace("/login");
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
      <div className="min-h-screen bg-[#EEF1F5] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#123B5A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <InstitutionProvider>
      <div className="flex h-screen overflow-hidden bg-[#EEF1F5]">
        {/* Responsive Fixed/Sticky Left Sidebar with Independent Scrolling */}
        <Suspense fallback={<aside className="w-64 bg-[#123B5A] shrink-0 h-screen hidden lg:block" />}>
          <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </Suspense>

        {/* Main Content Area with Fixed Header and Independent Main Scrolling */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <Suspense fallback={<header className="h-16 bg-white border-b border-[#E2E8F0] shrink-0" />}>
            <AdminHeader onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
          </Suspense>
          <MustChangePasswordBanner />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl w-full mx-auto">
              <Suspense fallback={<div className="p-6 text-sm text-[#64748B]">Loading...</div>}>
                {children}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </InstitutionProvider>
  );
};
