import { Suspense } from "react";
import { requireTenantPageSession } from "@/lib/security/tenant-page-guard";

async function DashboardSessionGuard({ children }: { children: React.ReactNode }) {
  await requireTenantPageSession(["STUDENT", "PARENT", "GUARDIAN"]);

  return children;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#EEF2F6]" />}>
      <DashboardSessionGuard>{children}</DashboardSessionGuard>
    </Suspense>
  );
}
