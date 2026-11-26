import { Suspense } from "react";
import { verifyPortalPageAccess } from "@/lib/security/portal-page-guard";

async function StudentAccessGuard({ children }: { children: React.ReactNode }) {
  await verifyPortalPageAccess("STUDENT");
  return <>{children}</>;
}

export default function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#EEF1F5]" />}>
      <StudentAccessGuard>{children}</StudentAccessGuard>
    </Suspense>
  );
}
