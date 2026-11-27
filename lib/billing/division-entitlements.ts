/**
 * ============================================================================
 * Service: lib/billing/division-entitlements.ts
 * Description: Backend enforcement of division subscription limits and
 *              division-specific feature entitlements.
 *
 * Rules:
 * 1. An active subscription (or valid trial) is required to manage divisions.
 * 2. Subscription plans enforce a maximum division count (e.g. Starter: 1, Growth: 3, Enterprise: Unlimited).
 * 3. Division-specific feature entitlements restrict specific DivisionTypes (e.g. Montessori, Higher Secondary)
 *    to permitted tiers or explicit platform feature grants.
 * 4. Institution-level feature overrides allow granting custom limits or division types.
 * 5. Strict isolation: Keeps institution subscription completely separate from division configuration.
 * ============================================================================
 */

import db from "@/lib/db";
import { Prisma, DivisionType, DivisionStatus } from "@prisma/client";

export class DivisionSubscriptionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 403,
    readonly code: string = "SUBSCRIPTION_LIMIT_EXCEEDED"
  ) {
    super(message);
    this.name = "DivisionSubscriptionError";
  }
}

export interface DivisionSubscriptionEntitlements {
  hasActiveSubscription: boolean;
  subscriptionStatus: string;
  planCode: string;
  planName: string;
  maxDivisions: number | null; // null represents unlimited divisions
  currentDivisionCount: number;
  remainingDivisions: number | null; // null if unlimited
  canCreateMore: boolean;
  allowedDivisionTypes: DivisionType[];
  disallowedDivisionTypes: DivisionType[];
}

/**
 * Standard tier configuration used when dynamic database feature flags are unset.
 */
export const DEFAULT_PLAN_DIVISION_CONFIG: Record<
  string,
  { maxDivisions: number | null; allowedTypes: DivisionType[] }
> = {
  FREE_TRIAL: {
    maxDivisions: 2, // Allows testing multi-division structures (e.g., School + College)
    allowedTypes: [
      DivisionType.MONTESSORI,
      DivisionType.SCHOOL,
      DivisionType.HIGHER_SECONDARY,
      DivisionType.COLLEGE,
      DivisionType.ACADEMY,
    ],
  },
  STARTER: {
    maxDivisions: 1, // Single-campus / single-division entry tier
    allowedTypes: [DivisionType.COLLEGE, DivisionType.SCHOOL],
  },
  GROWTH: {
    maxDivisions: 3, // Multi-division institution tier
    allowedTypes: [
      DivisionType.MONTESSORI,
      DivisionType.SCHOOL,
      DivisionType.HIGHER_SECONDARY,
      DivisionType.COLLEGE,
      DivisionType.ACADEMY,
    ],
  },
  ENTERPRISE: {
    maxDivisions: null, // Unlimited divisions for enterprise networks
    allowedTypes: [
      DivisionType.MONTESSORI,
      DivisionType.SCHOOL,
      DivisionType.HIGHER_SECONDARY,
      DivisionType.COLLEGE,
      DivisionType.ACADEMY,
    ],
  },
};

const ALL_DIVISION_TYPES: DivisionType[] = [
  DivisionType.MONTESSORI,
  DivisionType.SCHOOL,
  DivisionType.HIGHER_SECONDARY,
  DivisionType.COLLEGE,
  DivisionType.ACADEMY,
];

const ALL_DIVISION_TYPE_FEATURE_CODES = ALL_DIVISION_TYPES.map((t) => `DIVISION_TYPE_${t}`);

/**
 * Resolves the full division subscription entitlements for a given institution.
 */
export async function getDivisionSubscriptionEntitlements(
  institutionId: string,
  txOrDb: Prisma.TransactionClient | typeof db = db
): Promise<DivisionSubscriptionEntitlements> {
  const now = new Date();

  // 1. Fetch active/trialing subscription with plan features and overrides
  const [subscription, activeDivisionsCount, featureOverrides, globalFeatures] = await Promise.all([
    txOrDb.institutionSubscription.findFirst({
      where: {
        institutionId,
        status: { in: ["ACTIVE", "TRIALING"] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: "desc" },
      include: {
        plan: {
          include: {
            features: {
              include: {
                feature: true,
              },
            },
          },
        },
      },
    }),
    txOrDb.institutionDivision.count({
      where: {
        institutionId,
        status: { not: DivisionStatus.ARCHIVED },
      },
    }),
    txOrDb.institutionFeatureOverride.findMany({
      where: {
        institutionId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        feature: true,
      },
    }),
    // Global PlatformFeature catalogue for the relevant division codes. This is
    // the authoritative source for isAvailable and takes precedence over plan
    // features, institution overrides, and tier defaults.
    txOrDb.platformFeature.findMany({
      where: {
        code: {
          in: [
            "MULTI_DIVISION_ACCESS",
            ...ALL_DIVISION_TYPE_FEATURE_CODES,
          ],
        },
      },
      select: { code: true, isAvailable: true },
    }),
  ]);

  const allDivisionTypes = ALL_DIVISION_TYPES;

  if (!subscription || !subscription.plan.isActive) {
    return {
      hasActiveSubscription: false,
      subscriptionStatus: subscription ? subscription.status : "NONE",
      planCode: "NONE",
      planName: "No Active Subscription",
      maxDivisions: 0,
      currentDivisionCount: activeDivisionsCount,
      remainingDivisions: 0,
      canCreateMore: false,
      allowedDivisionTypes: [],
      disallowedDivisionTypes: allDivisionTypes,
    };
  }

  const planCode = (subscription.plan.code || "").toUpperCase();
  const planName = subscription.plan.name || planCode;

  // Authoritative global availability from the PlatformFeature catalogue.
  // A record with isAvailable === false hard-disables the feature regardless of
  // plan tier, plan feature, or institution override. A missing record preserves
  // existing tier fallback behaviour.
  const globalFeatureByCode = new Map<string, boolean>(
    globalFeatures.map((f) => [f.code, f.isAvailable])
  );
  const isGloballyDisabled = (code: string): boolean =>
    globalFeatureByCode.get(code) === false;

  // 2. Resolve max divisions limit
  // Priority: 0. Global hard-disable (MULTI_DIVISION_ACCESS unavailable -> 1)
  //           1. Feature override for MULTI_DIVISION_ACCESS
  //           2. Plan feature for MULTI_DIVISION_ACCESS
  //           3. Tier default configuration
  let maxDivisions: number | null = 1;
  if (isGloballyDisabled("MULTI_DIVISION_ACCESS")) {
    maxDivisions = 1;
  } else {
    const multiDivOverride = featureOverrides.find(
      (o) => o.feature?.code === "MULTI_DIVISION_ACCESS"
    );
    const multiDivPlanFeature = subscription.plan.features.find(
      (pf) => pf.feature?.code === "MULTI_DIVISION_ACCESS"
    );

    if (multiDivOverride) {
      if (!multiDivOverride.enabled) {
        maxDivisions = 1;
      } else {
        maxDivisions = null; // Override explicitly grants multi-division
      }
    } else if (multiDivPlanFeature) {
      if (!multiDivPlanFeature.enabled) {
        maxDivisions = 1;
      } else {
        maxDivisions = multiDivPlanFeature.limitValue ?? null;
      }
    } else {
      // Fall back to plan tier defaults
      const tierConfig = DEFAULT_PLAN_DIVISION_CONFIG[planCode] || {
        maxDivisions: 1,
        allowedTypes: [DivisionType.COLLEGE, DivisionType.SCHOOL],
      };
      maxDivisions = tierConfig.maxDivisions;
    }
  }

  // 3. Resolve allowed division types
  // Check if any specific division type features are gated
  const tierConfig = DEFAULT_PLAN_DIVISION_CONFIG[planCode] || {
    maxDivisions: 1,
    allowedTypes: [DivisionType.COLLEGE, DivisionType.SCHOOL],
  };
  const baseAllowedTypes = new Set<DivisionType>(tierConfig.allowedTypes);

  // Apply feature overrides and plan features for specific types. A globally
  // unavailable feature (isAvailable === false in the catalogue) hard-excludes the
  // type regardless of tier default, override, or plan feature.
  for (const type of allDivisionTypes) {
    const featureCode = `DIVISION_TYPE_${type}`;
    if (isGloballyDisabled(featureCode)) {
      baseAllowedTypes.delete(type);
      continue;
    }
    const override = featureOverrides.find((o) => o.feature?.code === featureCode);
    const planFeature = subscription.plan.features.find((pf) => pf.feature?.code === featureCode);

    if (override) {
      if (override.enabled) baseAllowedTypes.add(type);
      else baseAllowedTypes.delete(type);
    } else if (planFeature) {
      if (planFeature.enabled) baseAllowedTypes.add(type);
      else baseAllowedTypes.delete(type);
    }
  }

  const allowedDivisionTypes = Array.from(baseAllowedTypes);
  const disallowedDivisionTypes = allDivisionTypes.filter(
    (t) => !baseAllowedTypes.has(t)
  );

  const canCreateMore = maxDivisions === null || activeDivisionsCount < maxDivisions;
  const remainingDivisions =
    maxDivisions === null ? null : Math.max(0, maxDivisions - activeDivisionsCount);

  return {
    hasActiveSubscription: true,
    subscriptionStatus: subscription.status,
    planCode,
    planName,
    maxDivisions,
    currentDivisionCount: activeDivisionsCount,
    remainingDivisions,
    canCreateMore,
    allowedDivisionTypes,
    disallowedDivisionTypes,
  };
}

/**
 * Asserts that the institution has capacity to create an additional division,
 * and that the requested division type is entitled under its subscription.
 */
export async function assertDivisionCreationCapacity(
  txOrDb: Prisma.TransactionClient | typeof db,
  institutionId: string,
  requestedType?: DivisionType
) {
  const entitlements = await getDivisionSubscriptionEntitlements(institutionId, txOrDb);

  if (!entitlements.hasActiveSubscription) {
    throw new DivisionSubscriptionError(
      "An active subscription or valid trial is required before creating educational divisions.",
      403,
      "SUBSCRIPTION_REQUIRED"
    );
  }

  if (!entitlements.canCreateMore) {
    throw new DivisionSubscriptionError(
      `Division limit reached: Your current subscription plan (${entitlements.planName}) allows a maximum of ${entitlements.maxDivisions} division(s). Please upgrade your subscription plan to create additional divisions.`,
      409,
      "DIVISION_LIMIT_REACHED"
    );
  }

  if (requestedType) {
    assertDivisionTypeEntitledFromMetadata(entitlements, requestedType);
  }

  return entitlements;
}

/**
 * Asserts that the institution is entitled to operate a specific division type.
 */
export async function assertDivisionTypeEntitled(
  txOrDb: Prisma.TransactionClient | typeof db,
  institutionId: string,
  requestedType: DivisionType
) {
  const entitlements = await getDivisionSubscriptionEntitlements(institutionId, txOrDb);
  assertDivisionTypeEntitledFromMetadata(entitlements, requestedType);
  return entitlements;
}

function assertDivisionTypeEntitledFromMetadata(
  entitlements: DivisionSubscriptionEntitlements,
  requestedType: DivisionType
) {
  if (!entitlements.hasActiveSubscription) {
    throw new DivisionSubscriptionError(
      "An active subscription or valid trial is required to operate educational divisions.",
      403,
      "SUBSCRIPTION_REQUIRED"
    );
  }

  if (!entitlements.allowedDivisionTypes.includes(requestedType)) {
    throw new DivisionSubscriptionError(
      `Your current subscription plan (${entitlements.planName}) does not include entitlement for '${requestedType}' divisions. Please upgrade your subscription plan to unlock this division type.`,
      403,
      "DIVISION_TYPE_NOT_ENTITLED"
    );
  }
}
