import { Suspense } from "react";
import { requireTenantPageSession } from "@/lib/security/tenant-page-guard";

async function StudentSessionGuard({ children }: { children: React.ReactNode }) {
  await requireTenantPageSession(["STUDENT"]);
  return children;
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#EEF1F5]" />}>
      <StudentSessionGuard>{children}</StudentSessionGuard>
    </Suspense>
  );
}
