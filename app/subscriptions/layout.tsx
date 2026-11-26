import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ForbiddenError, getSession, UnauthorizedError } from "@/lib/auth/session";
import { requireInstitutionAdminSession } from "@/lib/security/admin-auth";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { SubscriptionPortalShell } from "@/components/subscriptions/SubscriptionPortalShell";
import type { Metadata } from "next";
import "./subscriptions.css";

export const instant = false;
export const metadata: Metadata = { title: "Subscription Center | SST ERP" };

export default async function SubscriptionsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const session = await getSession();

  // Super Admin takes precedence. This prevents a Super Admin identity with an
  // institution-bound session field from entering the Institution Admin layout.
  if (session?.role === "SUPER_ADMIN") {
    try {
      await requireSuperAdmin();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Super Admin access is required")) {
        redirect("/login");
      }
      throw error;
    }
    return <SubscriptionPortalShell role="SUPER_ADMIN">{children}</SubscriptionPortalShell>;
  }

  if (session?.role === "ADMIN" || session?.role === "INSTITUTION_ADMIN") {
    // Some legacy Super Admin sessions may carry a role of ADMIN plus a verified
    // platformRole. Verify Super Admin independently before choosing the tenant layout.
    let verifiedSuperAdmin = false;
    try {
      await requireSuperAdmin();
      verifiedSuperAdmin = true;
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("Super Admin access is required"))) throw error;
    }
    if (verifiedSuperAdmin) {
      return <SubscriptionPortalShell role="SUPER_ADMIN">{children}</SubscriptionPortalShell>;
    }

    try {
      await requireInstitutionAdminSession();
    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError) redirect("/login");
      throw error;
    }

    return <SubscriptionPortalShell role="INSTITUTION_ADMIN">{children}</SubscriptionPortalShell>;
  }

  // Supabase fallback or another authenticated identity is handled by the
  // existing Super Admin verifier only after no ERP Institution Admin role matched.
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Super Admin access is required")) {
      redirect("/login");
    }
    throw error;
  }

  return <SubscriptionPortalShell role="SUPER_ADMIN">{children}</SubscriptionPortalShell>;
}