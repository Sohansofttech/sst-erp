import db from "@/lib/db";

const prisma = db;

export class FeatureAccessError extends Error {
  readonly statusCode = 403;
  constructor(public readonly reason: string) {
    super(`Feature access denied: ${reason}`);
    this.name = "FeatureAccessError";
  }
}

export type FeatureAccessResult = {
  allowed: boolean;
  limit: number | null;
  reason:
    | "PLAN_ENTITLEMENT"
    | "INSTITUTION_OVERRIDE"
    | "INSTITUTION_DISABLED"
    | "NOT_INCLUDED_IN_PLAN"
    | "FEATURE_UNAVAILABLE"
    | "NO_ACTIVE_SUBSCRIPTION";
};

/**
 * Resolves feature access for an institution.
 *
 * Priority / policy (see lib/super-admin/feature-catalog.ts for catalogue):
 * 1. Invalid input fails safely (handled by require* wrapper).
 * 2. Missing or globally unavailable feature (isAvailable === false) -> denied.
 * 3. A valid ACTIVE or TRIALING subscription is required; start/end enforced.
 * 4. Inactive plans are denied.
 * 5. PAST_DUE / EXPIRED / CANCELED / SUSPENDED never grant access.
 * 6. Plan entitlement is checked.
 * 7. A valid (non-expired) institution override is applied, but it can NEVER
 *    bypass global unavailability or subscription/plan validity.
 * 8. Expired overrides are ignored (fall through to plan entitlement).
 */
export async function getInstitutionFeatureAccess(institutionId: string, featureCode: string): Promise<FeatureAccessResult> {
  const now = new Date();
  const [feature, subscription] = await Promise.all([
    prisma.platformFeature.findUnique({ where: { code: featureCode }, select: { id: true, isAvailable: true } }),
    prisma.institutionSubscription.findFirst({
      where: {
        institutionId,
        status: { in: ["ACTIVE", "TRIALING"] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: "desc" },
      select: {
        status: true,
        startsAt: true,
        endsAt: true,
        plan: {
          select: {
            isActive: true,
            features: { where: { feature: { code: featureCode } }, select: { enabled: true, limitValue: true } },
          },
        },
      },
    }),
  ]);

  // 2. Missing or globally unavailable feature -> denied (overrides cannot bypass).
  if (!feature || !feature.isAvailable) {
    return { allowed: false, limit: null, reason: "FEATURE_UNAVAILABLE" };
  }

  // 3-5. Subscription validity. The query already restricts to ACTIVE/TRIALING
  // and a live window; re-assert defensively so PAST_DUE/EXPIRED/CANCELED/
  // SUSPENDED and out-of-window rows can never grant access.
  if (!subscription) {
    return { allowed: false, limit: null, reason: "NO_ACTIVE_SUBSCRIPTION" };
  }
  const statusOk = subscription.status === "ACTIVE" || subscription.status === "TRIALING";
  const startOk = subscription.startsAt <= now;
  const endOk = !subscription.endsAt || subscription.endsAt > now;
  if (!statusOk || !startOk || !endOk) {
    return { allowed: false, limit: null, reason: "NO_ACTIVE_SUBSCRIPTION" };
  }

  // 4. Inactive plan -> denied.
  if (!subscription.plan.isActive) {
    return { allowed: false, limit: null, reason: "NO_ACTIVE_SUBSCRIPTION" };
  }

  const [planFeature] = subscription.plan.features;

  // 7-8. Valid institution override (never bypasses the checks above).
  const override = await prisma.institutionFeatureOverride.findUnique({
    where: { institutionId_featureId: { institutionId, featureId: feature.id } },
    select: { enabled: true, expiresAt: true },
  });

  if (override && (!override.expiresAt || override.expiresAt > now)) {
    return {
      allowed: override.enabled,
      limit: planFeature?.limitValue ?? null,
      reason: override.enabled ? "INSTITUTION_OVERRIDE" : "INSTITUTION_DISABLED",
    };
  }

  // 6. Plan entitlement.
  if (!planFeature?.enabled) {
    return { allowed: false, limit: null, reason: "NOT_INCLUDED_IN_PLAN" };
  }
  return { allowed: true, limit: planFeature.limitValue, reason: "PLAN_ENTITLEMENT" };
}

export async function requireInstitutionFeatureAccess(institutionId: string, featureCode: string) {
  if (!institutionId || !featureCode) {
    throw new FeatureAccessError("INVALID_INPUT");
  }
  const access = await getInstitutionFeatureAccess(institutionId, featureCode);
  if (!access.allowed) {
    throw new FeatureAccessError(access.reason);
  }
  return access;
}