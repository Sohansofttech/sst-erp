import { Suspense } from "react";
import { requireTenantPageSession } from "@/lib/security/tenant-page-guard";

async function ParentSessionGuard({ children }: { children: React.ReactNode }) {
  await requireTenantPageSession(["PARENT", "GUARDIAN"]);
  return children;
}

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#EEF2F6]" />}>
      <ParentSessionGuard>{children}</ParentSessionGuard>
    </Suspense>
  );
}
