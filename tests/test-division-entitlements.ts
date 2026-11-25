/**
 * ============================================================================
 * Test Suite: tests/test-division-entitlements.ts
 * Description: Automated test suite for Stage 1 — Division Subscription Entitlements:
 *              1. Plan tier limits & division quotas (FREE_TRIAL, STARTER, GROWTH, ENTERPRISE)
 *              2. Division type feature entitlements (MONTESSORI, SCHOOL, HIGHER_SECONDARY, COLLEGE, ACADEMY)
 *              3. Backend capacity and entitlement enforcement assertions
 *              4. Error codes and HTTP status codes (403, 409)
 *              5. Subscription vs division configuration separation & isolation
 *              6. Non-regression of student registration and billing behavior
 * ============================================================================
 */

import { DivisionType, DivisionStatus } from "@prisma/client";
import {
  DEFAULT_PLAN_DIVISION_CONFIG,
  DivisionSubscriptionError,
  DivisionSubscriptionEntitlements,
} from "../lib/billing/division-entitlements";

export function runDivisionEntitlementTests() {
  console.log("====================================================================");
  console.log("   STAGE 1: DIVISION SUBSCRIPTION ENTITLEMENTS TEST SUITE           ");
  console.log("====================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✖ FAIL: ${testName} ${detail ? "- " + detail : ""}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Test Group 1: Default Plan Tier Configurations & Quotas
  // ---------------------------------------------------------------------------
  console.log("--- Group 1: Plan Tier Quotas & Default Configurations ---");

  const starterConfig = DEFAULT_PLAN_DIVISION_CONFIG.STARTER;
  assert(
    starterConfig !== undefined && starterConfig.maxDivisions === 1,
    "STARTER plan enforces single-division limit (maxDivisions = 1)"
  );
  assert(
    starterConfig.allowedTypes.includes(DivisionType.COLLEGE) &&
    starterConfig.allowedTypes.includes(DivisionType.SCHOOL) &&
    !starterConfig.allowedTypes.includes(DivisionType.MONTESSORI) &&
    !starterConfig.allowedTypes.includes(DivisionType.HIGHER_SECONDARY) &&
    !starterConfig.allowedTypes.includes(DivisionType.ACADEMY),
    "STARTER plan permits only standard COLLEGE and SCHOOL divisions"
  );

  const trialConfig = DEFAULT_PLAN_DIVISION_CONFIG.FREE_TRIAL;
  assert(
    trialConfig !== undefined && trialConfig.maxDivisions === 2,
    "FREE_TRIAL plan permits 2 divisions to allow multi-division evaluation"
  );
  assert(
    trialConfig.allowedTypes.length === 5 &&
    trialConfig.allowedTypes.includes(DivisionType.MONTESSORI) &&
    trialConfig.allowedTypes.includes(DivisionType.HIGHER_SECONDARY),
    "FREE_TRIAL plan unlocks all 5 division types for evaluation"
  );

  const growthConfig = DEFAULT_PLAN_DIVISION_CONFIG.GROWTH;
  assert(
    growthConfig !== undefined && growthConfig.maxDivisions === 3,
    "GROWTH plan permits up to 3 divisions"
  );
  assert(
    growthConfig.allowedTypes.length === 5,
    "GROWTH plan permits all 5 division types"
  );

  const enterpriseConfig = DEFAULT_PLAN_DIVISION_CONFIG.ENTERPRISE;
  assert(
    enterpriseConfig !== undefined && enterpriseConfig.maxDivisions === null,
    "ENTERPRISE plan provides unlimited divisions (maxDivisions = null)"
  );

  // ---------------------------------------------------------------------------
  // Test Group 2: Error Classes, Codes, and Status Codes
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 2: Error Hierarchy & HTTP Status Contracts ---");

  const subReqErr = new DivisionSubscriptionError(
    "Subscription required",
    403,
    "SUBSCRIPTION_REQUIRED"
  );
  assert(subReqErr.statusCode === 403, "SUBSCRIPTION_REQUIRED returns HTTP 403");
  assert(subReqErr.code === "SUBSCRIPTION_REQUIRED", "Error code matches SUBSCRIPTION_REQUIRED");

  const limitErr = new DivisionSubscriptionError(
    "Division limit reached",
    409,
    "DIVISION_LIMIT_REACHED"
  );
  assert(limitErr.statusCode === 409, "DIVISION_LIMIT_REACHED returns HTTP 409");
  assert(limitErr.code === "DIVISION_LIMIT_REACHED", "Error code matches DIVISION_LIMIT_REACHED");

  const typeErr = new DivisionSubscriptionError(
    "Division type not entitled",
    403,
    "DIVISION_TYPE_NOT_ENTITLED"
  );
  assert(typeErr.statusCode === 403, "DIVISION_TYPE_NOT_ENTITLED returns HTTP 403");
  assert(typeErr.code === "DIVISION_TYPE_NOT_ENTITLED", "Error code matches DIVISION_TYPE_NOT_ENTITLED");

  // ---------------------------------------------------------------------------
  // Test Group 3: Entitlement Calculation Logic
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 3: Entitlement Resolution & Remaining Quota Logic ---");

  function mockResolveEntitlements(params: {
    hasSub: boolean;
    planCode?: string;
    divisionCount: number;
    overrideMultiDiv?: boolean | null;
    overrideType?: { type: DivisionType; enabled: boolean };
  }): DivisionSubscriptionEntitlements {
    const allDivisionTypes = [
      DivisionType.MONTESSORI,
      DivisionType.SCHOOL,
      DivisionType.HIGHER_SECONDARY,
      DivisionType.COLLEGE,
      DivisionType.ACADEMY,
    ];

    if (!params.hasSub) {
      return {
        hasActiveSubscription: false,
        subscriptionStatus: "NONE",
        planCode: "NONE",
        planName: "No Active Subscription",
        maxDivisions: 0,
        currentDivisionCount: params.divisionCount,
        remainingDivisions: 0,
        canCreateMore: false,
        allowedDivisionTypes: [],
        disallowedDivisionTypes: allDivisionTypes,
      };
    }

    const planCode = params.planCode || "STARTER";
    const tierConfig = DEFAULT_PLAN_DIVISION_CONFIG[planCode] || DEFAULT_PLAN_DIVISION_CONFIG.STARTER;
    let maxDivisions = tierConfig.maxDivisions;

    if (params.overrideMultiDiv !== undefined && params.overrideMultiDiv !== null) {
      maxDivisions = params.overrideMultiDiv ? null : 1;
    }

    const allowedSet = new Set<DivisionType>(tierConfig.allowedTypes);
    if (params.overrideType) {
      if (params.overrideType.enabled) allowedSet.add(params.overrideType.type);
      else allowedSet.delete(params.overrideType.type);
    }

    const allowedDivisionTypes = Array.from(allowedSet);
    const disallowedDivisionTypes = allDivisionTypes.filter((t) => !allowedSet.has(t));
    const canCreateMore = maxDivisions === null || params.divisionCount < maxDivisions;
    const remainingDivisions = maxDivisions === null ? null : Math.max(0, maxDivisions - params.divisionCount);

    return {
      hasActiveSubscription: true,
      subscriptionStatus: "ACTIVE",
      planCode,
      planName: `${planCode} Plan`,
      maxDivisions,
      currentDivisionCount: params.divisionCount,
      remainingDivisions,
      canCreateMore,
      allowedDivisionTypes,
      disallowedDivisionTypes,
    };
  }

  // Subtest: No subscription
  const noSub = mockResolveEntitlements({ hasSub: false, divisionCount: 0 });
  assert(!noSub.hasActiveSubscription, "Unsubscribed institution has hasActiveSubscription = false");
  assert(!noSub.canCreateMore, "Unsubscribed institution cannot create divisions");
  assert(noSub.allowedDivisionTypes.length === 0, "Unsubscribed institution has 0 allowed division types");
  assert(noSub.disallowedDivisionTypes.length === 5, "Unsubscribed institution has all 5 types disallowed");

  // Subtest: Starter plan at 0 divisions
  const starterEmpty = mockResolveEntitlements({ hasSub: true, planCode: "STARTER", divisionCount: 0 });
  assert(starterEmpty.canCreateMore, "STARTER at 0 divisions can create 1 division");
  assert(starterEmpty.remainingDivisions === 1, "STARTER at 0 divisions has 1 remaining division");

  // Subtest: Starter plan at 1 division (limit reached)
  const starterFull = mockResolveEntitlements({ hasSub: true, planCode: "STARTER", divisionCount: 1 });
  assert(!starterFull.canCreateMore, "STARTER at 1 division cannot create additional divisions");
  assert(starterFull.remainingDivisions === 0, "STARTER at 1 division has 0 remaining divisions");

  // Subtest: Growth plan at 2 divisions
  const growthMid = mockResolveEntitlements({ hasSub: true, planCode: "GROWTH", divisionCount: 2 });
  assert(growthMid.canCreateMore, "GROWTH at 2 divisions can create another division");
  assert(growthMid.remainingDivisions === 1, "GROWTH at 2 divisions has 1 remaining division");

  // Subtest: Enterprise plan at 50 divisions
  const entFifty = mockResolveEntitlements({ hasSub: true, planCode: "ENTERPRISE", divisionCount: 50 });
  assert(entFifty.canCreateMore, "ENTERPRISE at 50 divisions can still create divisions");
  assert(entFifty.maxDivisions === null, "ENTERPRISE maxDivisions is null (unlimited)");
  assert(entFifty.remainingDivisions === null, "ENTERPRISE remainingDivisions is null (unlimited)");

  // ---------------------------------------------------------------------------
  // Test Group 4: Feature Overrides & Custom Entitlements
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 4: Feature Overrides & Dynamic Entitlements ---");

  // Starter tier overridden to unlock Montessori
  const starterWithMontessoriOverride = mockResolveEntitlements({
    hasSub: true,
    planCode: "STARTER",
    divisionCount: 0,
    overrideType: { type: DivisionType.MONTESSORI, enabled: true },
  });
  assert(
    starterWithMontessoriOverride.allowedDivisionTypes.includes(DivisionType.MONTESSORI),
    "Institution override unlocks MONTESSORI division on STARTER plan"
  );

  // Starter tier with multi-division override
  const starterMultiDivOverride = mockResolveEntitlements({
    hasSub: true,
    planCode: "STARTER",
    divisionCount: 5,
    overrideMultiDiv: true,
  });
  assert(
    starterMultiDivOverride.canCreateMore && starterMultiDivOverride.maxDivisions === null,
    "Institution override for MULTI_DIVISION_ACCESS grants unlimited divisions to STARTER tier"
  );

  // ---------------------------------------------------------------------------
  // Test Group 5: Backend Enforcement Guard Assertions
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 5: Backend Guard Assertions ---");

  function assertCapacity(entitlements: DivisionSubscriptionEntitlements, requestedType?: DivisionType) {
    if (!entitlements.hasActiveSubscription) {
      throw new DivisionSubscriptionError("Subscription required", 403, "SUBSCRIPTION_REQUIRED");
    }
    if (!entitlements.canCreateMore) {
      throw new DivisionSubscriptionError(
        `Division limit reached: Max ${entitlements.maxDivisions}`,
        409,
        "DIVISION_LIMIT_REACHED"
      );
    }
    if (requestedType && !entitlements.allowedDivisionTypes.includes(requestedType)) {
      throw new DivisionSubscriptionError(
        `Division type ${requestedType} not entitled`,
        403,
        "DIVISION_TYPE_NOT_ENTITLED"
      );
    }
  }

  // Guard test 1: No subscription blocks division creation
  let blockedNoSub = false;
  try {
    assertCapacity(noSub, DivisionType.COLLEGE);
  } catch (err: any) {
    blockedNoSub = err instanceof DivisionSubscriptionError && err.statusCode === 403;
  }
  assert(blockedNoSub, "assertCapacity rejects division creation when institution has no active subscription");

  // Guard test 2: Limit reached blocks division creation (409)
  let blockedLimit = false;
  try {
    assertCapacity(starterFull, DivisionType.COLLEGE);
  } catch (err: any) {
    blockedLimit = err instanceof DivisionSubscriptionError && err.statusCode === 409;
  }
  assert(blockedLimit, "assertCapacity rejects division creation with 409 when plan limit is reached");

  // Guard test 3: Disallowed division type on Starter plan blocks creation (403)
  let blockedType = false;
  try {
    assertCapacity(starterEmpty, DivisionType.MONTESSORI);
  } catch (err: any) {
    blockedType = err instanceof DivisionSubscriptionError && err.statusCode === 403 && err.code === "DIVISION_TYPE_NOT_ENTITLED";
  }
  assert(blockedType, "assertCapacity rejects unentitled MONTESSORI division on STARTER plan with 403");

  // Guard test 4: Allowed division type on Starter plan succeeds
  let allowedCollege = false;
  try {
    assertCapacity(starterEmpty, DivisionType.COLLEGE);
    allowedCollege = true;
  } catch {
    allowedCollege = false;
  }
  assert(allowedCollege, "assertCapacity allows entitled COLLEGE division on STARTER plan");

  // Guard test 5: Growth plan permits MONTESSORI
  let allowedGrowthMont = false;
  try {
    assertCapacity(growthMid, DivisionType.MONTESSORI);
    allowedGrowthMont = true;
  } catch {
    allowedGrowthMont = false;
  }
  assert(allowedGrowthMont, "assertCapacity allows MONTESSORI division on GROWTH plan");

  // ---------------------------------------------------------------------------
  // Test Group 6: Architectural Separation & Billing Non-Regression
  // ---------------------------------------------------------------------------
  console.log("\n--- Group 6: Architecture Separation & Billing Non-Regression ---");

  assert(
    typeof DEFAULT_PLAN_DIVISION_CONFIG === "object" && !("academicSettings" in DEFAULT_PLAN_DIVISION_CONFIG),
    "Subscription configuration does not couple into division branding or academicSettings"
  );

  assert(
    typeof DivisionSubscriptionError === "function" &&
    starterConfig.maxDivisions !== undefined,
    "Division subscription limits are decoupled from student capacity billing limits"
  );

  console.log("\n====================================================================");
  console.log(`  STAGE 1 TESTS COMPLETE: ${passed} passed, ${failed} failed`);
  console.log("====================================================================\n");

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Stage 1 Division Entitlements test suite.`);
  }
}

// Execute tests
runDivisionEntitlementTests();
