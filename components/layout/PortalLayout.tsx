"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MustChangePasswordBanner } from "@/components/shared/MustChangePasswordBanner";
import { fetchClientSession } from "@/lib/auth/client-session";

interface PortalLayoutProps {
  children: React.ReactNode;
  portalType?: "STUDENT" | "PARENT";
  pageTitle?: string;
  selectedChildId?: string;
  onSelectChild?: (childId: string) => void;
}

export const PortalLayout: React.FC<PortalLayoutProps> = ({
  children,
  portalType = "STUDENT",
  pageTitle,
  selectedChildId,
  onSelectChild,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [internalChildId, setInternalChildId] = useState<string>("");
  const [user, setUser] = useState<{
    fullName: string;
    role: "STUDENT" | "PARENT" | string;
    institutionName: string;
    email?: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("erp_active_child_id");
      if (stored) setInternalChildId(stored);
      try {
        const storedUser = localStorage.getItem("erp_user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed.fullName) {
            setUser({
              fullName: parsed.fullName,
              role: parsed.role || "STUDENT",
              institutionName: parsed.institutionName || "Campus Portal",
              email: parsed.email || "user@campus.portal",
            });
          }
        }
      } catch {}
    }
    const handleChildChanged = (e: any) => {
      if (e.detail?.childId) {
        setInternalChildId(e.detail.childId);
      }
    };
    window.addEventListener("activeChildChanged", handleChildChanged);
    return () => {
      window.removeEventListener("activeChildChanged", handleChildChanged);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchMe = async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("erp_token") : null;
        const json = await fetchClientSession(token);
        if (isMounted && json.success && json.data?.session) {
          const sess = json.data.session;
          const instName = sess.institutionName || "Campus Portal";
          if (typeof window !== "undefined") {
            localStorage.setItem("erp_institution_name", instName);
          }
          setUser({
            fullName: sess.fullName,
            role: sess.role,
            institutionName: instName,
            email: sess.email,
          });
        }
      } catch (err) {
        console.error("PortalLayout fetch error", err);
      }
    };
    fetchMe();
    return () => {
      isMounted = false;
    };
  }, []);

  const effectiveRole = user?.role === "PARENT" ? "PARENT" : "STUDENT";
  const currentChildId = selectedChildId || internalChildId;
  const handleSelect = (id: string) => {
    setInternalChildId(id);
    if (onSelectChild) onSelectChild(id);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#EEF1F5]">
      {/* Shared Responsive Sidebar */}
      <Sidebar
        portalType={effectiveRole}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        selectedChildId={currentChildId}
        userFullName={user?.fullName}
        userEmail={user?.email}
        institutionName={user?.institutionName}
      />

      {/* Main Content Area with Fixed Header and Independent Main Scrolling */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header
          portalType={effectiveRole}
          userFullName={user?.fullName || "User"}
          userRole={effectiveRole}
          userEmail={user?.email}
          institutionName={user?.institutionName || "Campus Portal"}
          selectedChildId={currentChildId}
          onSelectChild={handleSelect}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />

        <MustChangePasswordBanner />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl w-full mx-auto space-y-6">
            {pageTitle && (
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#1E293B]">
                  {pageTitle}
                </h1>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
