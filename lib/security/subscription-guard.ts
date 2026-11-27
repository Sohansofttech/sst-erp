import {
  getInstitutionSubscriptionStatus,
  isValidSubscriptionInstitutionId,
} from "@/lib/services/subscription.service";

export class SubscriptionExpiredError extends Error {
  code = "SUBSCRIPTION_EXPIRED";
  upgradeUrl = "/subscription";

  constructor(
    message = "Your 14-day free trial has expired. Normal ERP operational features are restricted until a subscription is activated."
  ) {
    super(message);
    this.name = "SubscriptionExpiredError";
  }
}

/**
 * Checks subscription status for an institution.
 * - Super Admin is NEVER blocked.
 * - Trial active (TRIALING) within 14 days is permitted.
 * - Active paid subscription (ACTIVE) is permitted.
 * - Expired trial (EXPIRED) or lapsed subscription throws SubscriptionExpiredError.
 * - Institutional data is never modified or deleted.
 */
export async function assertActiveSubscription(
  institutionId: string,
  userRole?: string
): Promise<{ allowed: boolean; status: string }> {
  // Super Admin is completely exempt
  if (userRole === "SUPER_ADMIN" || userRole === "SUPERADMIN") {
    return { allowed: true, status: "SUPER_ADMIN_EXEMPT" };
  }

  if (!isValidSubscriptionInstitutionId(institutionId)) {
    throw new SubscriptionExpiredError(
      "A valid institutional tenant is required to access ERP operational features."
    );
  }

  const subStatus = await getInstitutionSubscriptionStatus(institutionId);

  if (subStatus.isExpired || subStatus.status === "EXPIRED") {
    throw new SubscriptionExpiredError(
      `Your 14-day free trial for ${subStatus.planName || "Free Trial"} has expired. Please upgrade your subscription to continue using ERP operational features.`
    );
  }

  if (["PAST_DUE", "SUSPENDED", "CANCELED"].includes(subStatus.status)) {
    throw new SubscriptionExpiredError(
      `Institutional subscription status is ${subStatus.statusLabel || subStatus.status}. Please visit the subscription portal to restore access.`
    );
  }

  if (!subStatus.canAccessErp) {
    throw new SubscriptionExpiredError(
      subStatus.statusLabel === "Scheduled"
        ? "The institutional subscription has not started yet."
        : "The institutional subscription is not currently effective."
    );
  }

  return { allowed: true, status: subStatus.status };
}
