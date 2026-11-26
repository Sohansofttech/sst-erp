import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { verifyAdminPageAccess } from "@/lib/security/admin-page-guard";

export const metadata: Metadata = {
  title: "Institution Admin Portal — SST ERP",
  description: "Administrative governance, academic setup, and institutional controls for SST ERP",
};

async function AdminAccessGuard({ children }: { children: React.ReactNode }) {
  const initialAuth = await verifyAdminPageAccess();
  return <AdminLayout initialAuth={initialAuth}>{children}</AdminLayout>;
}

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC]" />}>
      <AdminAccessGuard>{children}</AdminAccessGuard>
    </Suspense>
  );
}
