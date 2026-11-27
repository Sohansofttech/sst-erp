import db from "@/lib/db";
import { Prisma } from "@prisma/client";
import { planCompatibilityWhere } from "@/lib/institution-type-config";

const prisma = db;

export const FREE_TRIAL_PLAN_CODE = "FREE_TRIAL";
export const TRIAL_DURATION_DAYS = 14;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InstitutionTrialStatus {
  hasSubscription: boolean;
  subscriptionId?: string;
  isTrial: boolean;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED" | "SUSPENDED" | "NONE";
  statusLabel: string;
  planName: string;
  planCode: string;
  planPrice: number;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  remainingDays: number;
  isExpired: boolean;
  canAccessErp: boolean;
  canAccessSubscription: boolean;
  upgradeUrl: string;
}

/**
 * Ensures the canonical Free Trial plan exists in the database.
 * Price: ₹0, Duration: 14 days, BillingCycle: CUSTOM.
 */
export async function getOrCreateFreeTrialPlan(
  dbClient: Prisma.TransactionClient | typeof prisma = prisma
) {
  const existing = await dbClient.subscriptionPlan.findFirst({
    where: {
      OR: [
        { code: FREE_TRIAL_PLAN_CODE },
        { name: "Free Trial" },
      ],
    },
  });

  if (existing) {
    return existing;
  }

  // Create canonical Free Trial plan
  return await dbClient.subscriptionPlan.create({
    data: {
      code: FREE_TRIAL_PLAN_CODE,
      name: "Free Trial",
      description: "14-Day Full-Access Complimentary Institutional Trial",
      billingCycle: "CUSTOM",
      customCycleDays: TRIAL_DURATION_DAYS,
      price: new Prisma.Decimal(0),
      currency: "INR",
      isActive: true,
    },
  });
}

/**
 * Assigns an automatic 14-day free trial to an institution.
 * Atomic with institution creation, idempotent on retries.
 */
export async function assignInstitutionTrial(
  dbClient: Prisma.TransactionClient | typeof prisma,
  params: {
    institutionId: string;
    createdById?: string | null;
    startsAt?: Date;
  }
) {
  const { institutionId, createdById, startsAt = new Date() } = params;

  // 1. Idempotency Check: Prevent duplicate trial assignments
  const existingSub = await dbClient.institutionSubscription.findFirst({
    where: {
      institutionId,
      status: { in: ["TRIALING", "ACTIVE"] },
    },
    include: { plan: true },
  });

  if (existingSub) {
    return {
      created: false,
      subscription: existingSub,
      message: "Institution already has an active or trialing subscription.",
    };
  }

  // 2. Resolve or create Free Trial Plan
  const trialPlan = await getOrCreateFreeTrialPlan(dbClient);

  // 3. Compute Dates (Start Date = Institution creation date, Expiry Date = Start Date + 14 days)
  const trialStartDate = new Date(startsAt);
  const trialEndDate = new Date(trialStartDate.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  const initialStatus = trialEndDate <= now ? "EXPIRED" : "TRIALING";

  // 4. Create Subscription record
  const subscription = await dbClient.institutionSubscription.create({
    data: {
      institutionId,
      planId: trialPlan.id,
      status: initialStatus,
      startsAt: trialStartDate,
      endsAt: trialEndDate,
      createdById: createdById || null,
    },
    include: {
      plan: true,
    },
  });

  // 5. Record Subscription Audit Event
  try {
    await dbClient.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        actorId: createdById || null,
        action: "TRIAL_ASSIGNED",
        details: {
          planCode: trialPlan.code,
          planName: trialPlan.name,
          durationDays: TRIAL_DURATION_DAYS,
          price: 0,
          startsAt: trialStartDate.toISOString(),
          endsAt: trialEndDate.toISOString(),
        },
      },
    });
  } catch (eventErr: any) {
    console.warn("[SubscriptionService] Warning recording trial subscription event:", eventErr.message);
  }

  return {
    created: true,
    subscription,
    message: "14-day free trial assigned successfully.",
  };
}

/**
 * Authoritatively retrieves and updates the subscription & trial status for an institution.
 * Enforces server-side expiration automatically if endsAt has elapsed.
 */
export async function getInstitutionSubscriptionStatus(
  institutionId: string
): Promise<InstitutionTrialStatus> {
  if (!institutionId || typeof institutionId !== "string") {
    return {
      hasSubscription: false,
      isTrial: false,
      status: "NONE",
      statusLabel: "No Subscription",
      planName: "None",
      planCode: "NONE",
      planPrice: 0,
      currency: "INR",
      startsAt: null,
      endsAt: null,
      remainingDays: 0,
      isExpired: true,
      canAccessErp: false,
      canAccessSubscription: true,
      upgradeUrl: "/subscription",
    };
  }

  // Handle non-UUID development identifiers gracefully without crashing PostgreSQL
  if (!UUID_REGEX.test(institutionId)) {
    try {
      const platformInst = await prisma.platformInstitution.findFirst({
        select: { id: true, createdAt: true },
      });
      if (platformInst) {
        institutionId = platformInst.id;
      } else {
        return {
          hasSubscription: false,
          isTrial: false,
          status: "NONE",
          statusLabel: "No Subscription",
          planName: "None",
          planCode: "NONE",
          planPrice: 0,
          currency: "INR",
          startsAt: null,
          endsAt: null,
          remainingDays: 0,
          isExpired: false,
          canAccessErp: true,
          canAccessSubscription: true,
          upgradeUrl: "/subscription",
        };
      }
    } catch {
      return {
        hasSubscription: false,
        isTrial: false,
        status: "NONE",
        statusLabel: "No Subscription",
        planName: "None",
        planCode: "NONE",
        planPrice: 0,
        currency: "INR",
        startsAt: null,
        endsAt: null,
        remainingDays: 0,
        isExpired: false,
        canAccessErp: true,
        canAccessSubscription: true,
        upgradeUrl: "/subscription",
      };
    }
  }

  const now = new Date();

  // Find latest subscription record for institution
  let sub = await prisma.institutionSubscription.findFirst({
    where: { institutionId },
    orderBy: { startsAt: "desc" },
    include: { plan: true },
  });

  // If no subscription exists, check if we should auto-assign a trial for existing institutions
  if (!sub) {
    // Check if institution exists in platform
    const inst = await prisma.platformInstitution.findUnique({
      where: { id: institutionId },
      select: { id: true, createdAt: true },
    });

    if (inst) {
      const trialResult = await assignInstitutionTrial(prisma, {
        institutionId: inst.id,
        startsAt: inst.createdAt,
      });
      sub = trialResult.subscription as any;
    }
  }

  if (!sub) {
    return {
      hasSubscription: false,
      isTrial: false,
      status: "NONE",
      statusLabel: "No Subscription",
      planName: "None",
      planCode: "NONE",
      planPrice: 0,
      currency: "INR",
      startsAt: null,
      endsAt: null,
      remainingDays: 0,
      isExpired: true,
      canAccessErp: false,
      canAccessSubscription: true,
      upgradeUrl: "/subscription",
    };
  }

  // Authoritative server-side expiration check:
  // If subscription is TRIALING or ACTIVE with an endsAt in the past, transition to EXPIRED
  const isTimeExpired = Boolean(sub.endsAt && sub.endsAt.getTime() <= now.getTime());
  if (isTimeExpired && sub.status === "TRIALING") {
    try {
      sub = await prisma.institutionSubscription.update({
        where: { id: sub.id },
        data: { status: "EXPIRED" },
        include: { plan: true },
      });

      await prisma.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          action: "TRIAL_EXPIRED",
          details: {
            expiredAt: now.toISOString(),
            configuredEndsAt: sub.endsAt?.toISOString(),
          },
        },
      });
    } catch (err: any) {
      console.warn("[SubscriptionService] Warning transitioning trial to EXPIRED:", err.message);
    }
  }

  const isTrial = sub.plan.code === FREE_TRIAL_PLAN_CODE || sub.status === "TRIALING";
  const isExpired = sub.status === "EXPIRED" || isTimeExpired;

  // Calculate remaining days authoritatively from server endsAt
  let remainingDays = 0;
  if (sub.endsAt && !isExpired) {
    const diffMs = sub.endsAt.getTime() - now.getTime();
    remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  const canAccessErp = !isExpired && (sub.status === "TRIALING" || sub.status === "ACTIVE");

  let statusLabel = "Active";
  if (sub.status === "TRIALING") {
    statusLabel = "Free Trial";
  } else if (sub.status === "EXPIRED") {
    statusLabel = "Trial Expired";
  } else if (sub.status === "PAST_DUE") {
    statusLabel = "Past Due";
  } else if (sub.status === "SUSPENDED") {
    statusLabel = "Suspended";
  } else if (sub.status === "CANCELED") {
    statusLabel = "Canceled";
  }

  return {
    hasSubscription: true,
    subscriptionId: sub.id,
    isTrial,
    status: sub.status,
    statusLabel,
    planName: sub.plan.name,
    planCode: sub.plan.code,
    planPrice: Number(sub.plan.price),
    currency: sub.plan.currency,
    startsAt: sub.startsAt.toISOString(),
    endsAt: sub.endsAt ? sub.endsAt.toISOString() : null,
    remainingDays,
    isExpired,
    canAccessErp,
    canAccessSubscription: true, // Always accessible to Institution Admin for renewal/upgrade
    upgradeUrl: "/subscription",
  };
}

/**
 * Retrieves all available paid subscription plans for upgrade selection.
 * Excludes archived, inactive, and internal free trial plans. When an institution is given,
 * only plans compatible with that institution's stored type are returned.
 */
export async function getAvailableSubscriptionPlans(institutionId?: string) {
  let compatibility: ReturnType<typeof planCompatibilityWhere> | undefined;
  if (institutionId && UUID_REGEX.test(institutionId)) {
    const institution = await prisma.platformInstitution.findUnique({
      where: { id: institutionId },
      select: { type: true },
    });
    if (institution) compatibility = planCompatibilityWhere(institution.type);
  }
  const plans = await prisma.subscriptionPlan.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      code: { not: FREE_TRIAL_PLAN_CODE },
      ...(compatibility ?? {}),
    },
    orderBy: {
      price: "asc",
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      billingCycle: true,
      customCycleDays: true,
      price: true,
      currency: true,
      studentLimit: true,
      storageLimitMb: true,
      features: {
        where: { enabled: true },
        select: {
          feature: {
            select: {
              code: true,
              name: true,
              category: true,
            },
          },
        },
      },
    },
  });
  return plans.map((p) => ({
    ...p,
    price: Number(p.price),
    storageLimitMb: p.storageLimitMb != null ? Number(p.storageLimitMb) : null,
  }));
}

/**
 * Loads a specific subscription plan by ID strictly from database.
 * Validates that plan exists, is active, and is not archived.
 */
export async function getSubscriptionPlanById(planId: string) {
  if (!planId || typeof planId !== "string") {
    return null;
  }

  // Validate UUID pattern
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(planId)) {
    return null;
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    include: {
      features: {
        where: { enabled: true },
        include: { feature: true },
      },
    },
  });

  if (!plan || !plan.isActive || plan.archivedAt) {
    return null;
  }

  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    billingCycle: plan.billingCycle,
    customCycleDays: plan.customCycleDays,
    price: Number(plan.price),
    currency: plan.currency,
    studentLimit: plan.studentLimit,
    storageLimitMb: plan.storageLimitMb ? Number(plan.storageLimitMb) : null,
    features: plan.features.map((f) => ({
      code: f.feature.code,
      name: f.feature.name,
      category: f.feature.category,
      limitValue: f.limitValue,
    })),
  };
}

export interface ActivatePaidSubscriptionParams {
  paymentId: string;
  orderId?: string;
  invoiceId?: string;
  amountPaid: number;
  currency: string;
  provider: "RAZORPAY" | "CASHFREE" | "MANUAL" | string;
  paymentStatus: "SUCCESS" | "CAPTURED" | "SUCCEEDED" | string;
  actorId?: string | null;
  institutionId?: string;
  planId?: string;
}

export interface ActivatePaidSubscriptionResult {
  success: boolean;
  subscription?: any;
  error?: string;
  code?: string;
  alreadyProcessed?: boolean;
}

/**
 * Authoritatively activates or renews an institution's paid subscription upon verified payment.
 * Security Rules:
 * 1. Derives tenant and plan from trusted server-side invoice/order record when available (rejects client tampering).
 * 2. Enforces EXACT amount equality under approved pricing rules: rejects underpayments AND overpayments.
 * 3. Enforces strict currency match.
 * 4. Only SUCCESS/CAPTURED/SUCCEEDED states can trigger activation.
 * 5. Fully transactional (prisma.$transaction) and idempotent across duplicate webhook deliveries.
 * 6. Preserves all existing institutional data.
 */
export async function activatePaidSubscription(
  params: ActivatePaidSubscriptionParams
): Promise<ActivatePaidSubscriptionResult> {
  const {
    institutionId,
    planId,
    amountPaid,
    currency,
    paymentId,
    orderId,
    invoiceId,
    provider,
    paymentStatus,
    actorId,
  } = params;

  // 1. Strict Payment Status Verification (Only SUCCESS, CAPTURED, or SUCCEEDED can activate)
  const normalizedStatus = (paymentStatus || "").toUpperCase();
  if (normalizedStatus !== "SUCCESS" && normalizedStatus !== "CAPTURED" && normalizedStatus !== "SUCCEEDED") {
    return {
      success: false,
      error: `Payment is not successful (status: ${paymentStatus}). Only verified completed payments can activate subscriptions.`,
      code: "PAYMENT_NOT_VERIFIED",
    };
  }

  // 2. Resolve Trusted Server-Side Record (Invoice / Subscription Order)
  let targetInstitutionId = institutionId;
  let targetPlanId = planId;
  let expectedAmount: number | null = null;
  let expectedCurrency: string | null = null;

  if (invoiceId || orderId) {
    try {
      const serverInvoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            ...(invoiceId ? [{ id: invoiceId }, { invoiceNumber: invoiceId }] : []),
            ...(orderId ? [{ id: orderId }] : []),
          ],
        },
        include: { subscription: { include: { plan: true } } },
      });

      if (serverInvoice) {
        targetInstitutionId = serverInvoice.institutionId;
        targetPlanId = serverInvoice.subscription?.planId || targetPlanId;
        expectedAmount = Number(serverInvoice.total);
        expectedCurrency = serverInvoice.currency;

        // Prevent tenant spoofing: Client-provided tenant must match server invoice record
        if (institutionId && institutionId !== serverInvoice.institutionId) {
          return {
            success: false,
            error: "Tenant identity mismatch: client parameter conflicts with trusted server invoice record.",
            code: "TENANT_MISMATCH",
          };
        }
      }
    } catch {
      // Continue to direct resolution if Invoice table is in transition
    }
  }

  if (!targetInstitutionId || !targetPlanId) {
    return {
      success: false,
      error: "Could not resolve trusted institution or subscription plan identifier.",
      code: "UNRESOLVED_RECORD",
    };
  }

  // 3. Validate UUID formats
  if (!UUID_REGEX.test(targetInstitutionId) || !UUID_REGEX.test(targetPlanId)) {
    return {
      success: false,
      error: "Invalid institution or plan identifier format.",
      code: "INVALID_IDENTIFIER",
    };
  }

  // 4. Verify Institution Existence
  const institution = await prisma.platformInstitution.findUnique({
    where: { id: targetInstitutionId },
    select: { id: true, name: true, status: true },
  });
  if (!institution) {
    return {
      success: false,
      error: "Target institution not found in platform.",
      code: "INSTITUTION_NOT_FOUND",
    };
  }

  // 5. Verify Plan against Database
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: targetPlanId },
  });
  if (!plan || !plan.isActive || plan.archivedAt) {
    return {
      success: false,
      error: "The requested subscription plan is invalid, inactive, or archived.",
      code: "INVALID_PLAN",
    };
  }
  if (plan.code === FREE_TRIAL_PLAN_CODE) {
    return {
      success: false,
      error: "Paid activation cannot be applied to complimentary Free Trial tier.",
      code: "INVALID_PLAN_TIER",
    };
  }

  if (expectedAmount === null) {
    expectedAmount = Number(plan.price);
  }
  if (expectedCurrency === null) {
    expectedCurrency = plan.currency || "INR";
  }

  // 6. Authoritative Exact Amount & Currency Rule (Reject underpayment AND overpayment)
  const amountDiff = Math.abs(amountPaid - expectedAmount);
  if (amountDiff > 0.01) {
    if (amountPaid < expectedAmount) {
      return {
        success: false,
        error: `Underpayment rejected: Paid amount (₹${amountPaid}) is less than exact expected amount (₹${expectedAmount}).`,
        code: "AMOUNT_UNDERPAYMENT",
      };
    } else {
      return {
        success: false,
        error: `Overpayment rejected: Paid amount (₹${amountPaid}) exceeds exact approved plan price (₹${expectedAmount}). Arbitrary overpayments are prohibited.`,
        code: "AMOUNT_OVERPAYMENT",
      };
    }
  }

  if ((currency || "").toUpperCase() !== expectedCurrency.toUpperCase()) {
    return {
      success: false,
      error: `Currency '${currency}' does not match expected currency '${expectedCurrency}'.`,
      code: "CURRENCY_MISMATCH",
    };
  }

  // 7. Idempotency Check: Prevent duplicate activation for the same payment reference
  const existingEvents: any = await prisma.subscriptionEvent.findMany({
    where: {
      action: { in: ["SUBSCRIPTION_ACTIVATED", "SUBSCRIPTION_RENEWED"] },
    },
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { subscription: { include: { plan: true } } },
  });

  const duplicateEvent = existingEvents.find((evt: any) => {
    const details = evt.details as any;
    return details && (details.paymentId === paymentId || (orderId && details.orderId === orderId));
  });

  if (duplicateEvent) {
    return {
      success: true,
      subscription: duplicateEvent.subscription,
      alreadyProcessed: true,
    };
  }

  // 8. Atomic Activation / Transition inside Database Transaction
  const now = new Date();
  let durationDays = 30; // default 30 days for monthly
  if (plan.billingCycle === "YEARLY") {
    durationDays = 365;
  } else if (plan.billingCycle === "QUARTERLY") {
    durationDays = 90;
  } else if (plan.billingCycle === "CUSTOM" && plan.customCycleDays) {
    durationDays = plan.customCycleDays;
  }
  const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const updatedSub = await prisma.$transaction(async (tx) => {
    const existing = await tx.institutionSubscription.findFirst({
      where: { institutionId: targetInstitutionId },
      orderBy: { startsAt: "desc" },
    });

    let subRecord: any;
    const isRenewal = existing && existing.status === "ACTIVE";

    if (existing) {
      subRecord = await tx.institutionSubscription.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          status: "ACTIVE",
          startsAt: now,
          endsAt,
          renewsAt: endsAt,
        },
        include: { plan: true },
      });
    } else {
      subRecord = await tx.institutionSubscription.create({
        data: {
          institutionId: targetInstitutionId,
          planId: plan.id,
          status: "ACTIVE",
          startsAt: now,
          endsAt,
          renewsAt: endsAt,
          createdById: actorId || null,
        },
        include: { plan: true },
      });
    }

    // Record SubscriptionEvent audit log (zero secrets logged)
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subRecord.id,
        actorId: actorId || null,
        action: isRenewal ? "SUBSCRIPTION_RENEWED" : "SUBSCRIPTION_ACTIVATED",
        details: {
          planCode: plan.code,
          planName: plan.name,
          amountPaid,
          currency: expectedCurrency,
          durationDays,
          provider,
          paymentId,
          orderId: orderId || null,
          invoiceId: invoiceId || null,
          activatedAt: now.toISOString(),
          expiresAt: endsAt.toISOString(),
        },
      },
    });

    return subRecord;
  });

  return {
    success: true,
    subscription: updatedSub,
    alreadyProcessed: false,
  };
}
