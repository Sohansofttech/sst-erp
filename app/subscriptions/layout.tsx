import { redirect } from "next/navigation";
import { ForbiddenError, getSession, UnauthorizedError } from "@/lib/auth/session";
import { requireInstitutionAdminSession } from "@/lib/security/admin-auth";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { SubscriptionPortalShell } from "@/components/subscriptions/SubscriptionPortalShell";
import "./subscriptions.css";

export const instant = false;

export default async function SubscriptionsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let session;
  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/login?error=institution_inactive");
    throw error;
  }

  if (session?.role === "ADMIN") {
    try {
      await requireInstitutionAdminSession();
    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError) redirect("/login");
      throw error;
    }

    return <SubscriptionPortalShell role="INSTITUTION_ADMIN">{children}</SubscriptionPortalShell>;
  }

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
