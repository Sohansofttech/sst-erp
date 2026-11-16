"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

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
              institutionName: parsed.institutionName || "Apex Institute of Technology",
              email: parsed.email || "john.doe@student.apex.edu",
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
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/auth/me", {
          credentials: "include",
          headers,
        });
        const json = await res.json();
        if (isMounted && json.success && json.data?.session) {
          setUser({
            fullName: json.data.session.fullName,
            role: json.data.session.role,
            institutionName: json.data.session.institutionName,
            email: json.data.session.email,
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
    <div className="min-h-screen bg-[#EEF2F6]">
      {/* Shared Responsive Sidebar */}
      <Sidebar
        portalType={effectiveRole}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        selectedChildId={currentChildId}
        userFullName={user?.fullName}
        userEmail={user?.email}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header
          portalType={effectiveRole}
          userFullName={user?.fullName || "John Doe"}
          userRole={effectiveRole}
          institutionName={user?.institutionName || "Apex Institute of Technology"}
          selectedChildId={currentChildId}
          onSelectChild={handleSelect}
          onMenuToggle={() => setSidebarOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {pageTitle && (
            <div className="mb-6">
              <h1 className="text-2xl sm:text-[28px] font-bold text-[#1E293B]">
                {pageTitle}
              </h1>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};
