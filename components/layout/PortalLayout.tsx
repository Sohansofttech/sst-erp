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
    institutionCode?: string | null;
    institutionLogo?: string | null;
    email?: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("erp_active_child_id");
      if (stored) setInternalChildId(stored);
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
          const inst = sess.institution || json.data.institution;
          const instName = inst?.name || sess.institutionName || "";
          const instCode = inst?.code || sess.institutionCode || null;
          const instLogo = inst?.logo || null;
          if (typeof window !== "undefined") {
            if (instName) localStorage.setItem("erp_institution_name", instName);
            if (inst) localStorage.setItem("erp_institution", JSON.stringify(inst));
          }
          setUser({
            fullName: sess.fullName || sess.name || "Student",
            role: sess.role,
            institutionName: instName,
            institutionCode: instCode,
            institutionLogo: instLogo,
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

  const effectiveRole = user?.role === "PARENT" || (!user && portalType === "PARENT") ? "PARENT" : "STUDENT";
  const currentChildId = selectedChildId || internalChildId;
  const handleSelect = (id: string) => {
    setInternalChildId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("erp_active_child_id", id);
      document.cookie = `erp_active_child=${id}; path=/; max-age=86400`;
      window.dispatchEvent(new CustomEvent("activeChildChanged", { detail: { childId: id } }));
    }
    if (onSelectChild) onSelectChild(id);
  };

  return (
    <div className="flex min-h-screen lg:h-screen lg:overflow-hidden bg-[#EEF1F5]">
      {/* Shared Responsive Sidebar - Hidden in Print */}
      <div className="print:hidden">
        <Sidebar
          portalType={effectiveRole}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          selectedChildId={currentChildId}
          userFullName={user?.fullName}
          userEmail={user?.email}
          institutionName={user?.institutionName}
          institutionCode={user?.institutionCode}
          institutionLogo={user?.institutionLogo}
        />
      </div>

      {/* Main Content Area with Fixed Header and Independent Main Scrolling */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen lg:h-screen lg:overflow-hidden print:h-auto print:overflow-visible">
        <div className="print:hidden">
          <Header
            portalType={effectiveRole}
            userFullName={user?.fullName || "User"}
            userRole={effectiveRole}
            userEmail={user?.email}
            institutionName={user?.institutionName || "Campus Portal"}
            institutionCode={user?.institutionCode}
            institutionLogo={user?.institutionLogo}
            selectedChildId={currentChildId}
            onSelectChild={handleSelect}
            onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          />

          <MustChangePasswordBanner />
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 print:p-0 print:overflow-visible">
          <div className="max-w-7xl w-full mx-auto space-y-6 print:max-w-none print:space-y-4">
            {pageTitle && (
              <div className="print:hidden">
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
