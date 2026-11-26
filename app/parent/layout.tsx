import { Suspense } from "react";
import { verifyPortalPageAccess } from "@/lib/security/portal-page-guard";

async function ParentAccessGuard({ children }: { children: React.ReactNode }) {
  await verifyPortalPageAccess("PARENT");
  return <>{children}</>;
}

export default function ParentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#EEF1F5]" />}>
      <ParentAccessGuard>{children}</ParentAccessGuard>
    </Suspense>
  );
}
