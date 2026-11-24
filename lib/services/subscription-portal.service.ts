import "server-only";

import db from "@/lib/db";
import { connection } from "next/server";
import { requireAuth, ForbiddenError } from "@/lib/auth/session";
import {
  currentSubscriptionWhere,
} from "@/lib/services/institution-subscription-lifecycle.service";

export type SubscriptionPortalContext = {
  erpInstitutionId: string;
  platformInstitutionId: string;
  platformUserId: string;
  institutionName: string;
};

export async function resolveSubscriptionPortalContext(): Promise<SubscriptionPortalContext> {
  await connection();
  const session = await requireAuth();

  if (session.role !== "ADMIN") {
    throw new ForbiddenError(
      "Institution Admin access is required. Super Admins must use the institution management portal."
    );
  }

  const erpUser = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      institutionId: true,
      role: true,
      status: true,
      isActive: true,
    },
  });

  if (
    !erpUser ||
    !erpUser.isActive ||
    erpUser.status !== "ACTIVE" ||
    erpUser.role !== "ADMIN" ||
    erpUser.institutionId !== session.institutionId
  ) {
    throw new ForbiddenError("The Institution Admin identity or tenant mapping is invalid.");
  }

  const platformInstitution = await db.platformInstitution.findUnique({
    where: { id: session.institutionId },
    select: { id: true, name: true, archivedAt: true, status: true },
  });

  if (!platformInstitution || platformInstitution.archivedAt || platformInstitution.status === "SUSPENDED") {
    throw new ForbiddenError("The institution subscription mapping is unavailable or inactive.");
  }

  const platformUser = await db.platformUser.findUnique({
    where: { id: session.userId },
    select: { id: true, status: true },
  });

  if (!platformUser || platformUser.status !== "ACTIVE") {
    throw new ForbiddenError("The platform identity is missing or inactive.");
  }

  const memberships = await db.institutionMembership.findMany({
    where: {
      userId: platformUser.id,
      institutionId: platformInstitution.id,
      status: "ACTIVE",
    },
    include: {
      roles: {
        include: {
          role: { select: { code: true } },
        },
      },
    },
  });

  if (memberships.length !== 1) {
    throw new ForbiddenError("A unique active Institution Admin membership could not be verified.");
  }

  const membership = memberships[0];
  const isInstitutionAdmin = membership.roles.some(({ role }) =>
    role.code === "INSTITUTION_ADMIN" || role.code === "ADMIN"
  );
  if (!isInstitutionAdmin) {
    throw new ForbiddenError("The active membership does not include Institution Admin access.");
  }

  return {
    erpInstitutionId: erpUser.institutionId!,
    platformInstitutionId: platformInstitution.id,
    platformUserId: platformUser.id,
    institutionName: platformInstitution.name,
  };
}

function activeSubscriptionWhere(now = new Date()) {
  return {
    status: "ACTIVE" as const,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export async function getSubscriptionDashboard() {
  const context = await resolveSubscriptionPortalContext();
  const now = new Date();

  const [subscriptionCandidates, currentUsageMetrics, studentCount, staffCount, userCount] =
    await Promise.all([
      db.institutionSubscription.findMany({
        where: {
          institutionId: context.platformInstitutionId,
          OR: [
            { ...activeSubscriptionWhere(now) },
            { status: { in: ["TRIALING", "PAST_DUE", "EXPIRED", "CANCELED", "SUSPENDED"] } },
          ],
        },
        include: { plan: true },
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        take: 20,
      }),
      db.institutionUsageMetric.findMany({
        where: {
          institutionId: context.platformInstitutionId,
          OR: [{ metric: "storage_bytes" }, { metric: "STORAGE_BYTES" }],
        },
        orderBy: { measuredAt: "desc" },
        take: 1,
      }),
      db.student.count({ where: { institutionId: context.erpInstitutionId, status: "ACTIVE" } }),
      db.staff.count({ where: { institutionId: context.erpInstitutionId, status: "ACTIVE" } }),
      db.user.count({
        where: {
          institutionId: context.erpInstitutionId,
          isActive: true,
          status: "ACTIVE",
        },
      }),
    ]);

  const eligible = subscriptionCandidates.filter(
    (subscription) =>
      (subscription.status === "ACTIVE" || subscription.status === "TRIALING") &&
      subscription.startsAt <= now &&
      (!subscription.endsAt || subscription.endsAt > now)
  );

  const currentSubscription =
    eligible.length === 1
      ? eligible[0]
      : eligible.length === 0
        ? subscriptionCandidates[0] ?? null
        : null;

  return {
    institutionName: context.institutionName,
    currentSubscription,
    hasAmbiguousSubscriptions: eligible.length > 1,
    eligibleSubscriptionCount: eligible.length,
    studentCount,
    staffCount,
    userCount,
    storageUsage: currentUsageMetrics[0]
      ? {
          value: Number(currentUsageMetrics[0].value),
          unit: currentUsageMetrics[0].unit,
          measuredAt: currentUsageMetrics[0].measuredAt,
          source: currentUsageMetrics[0].source,
        }
      : null,
  };
}

export async function getSelectedSubscriptionPlan(planId: string | null) {
  await resolveSubscriptionPortalContext();
  if (!planId) {
    return { plan: null };
  }

  const plan = await db.subscriptionPlan.findFirst({
    where: {
      id: planId,
      archivedAt: null,
      isActive: true,
    },
  });

  return { plan };
}

export async function getSubscriptionPlans() {
  await resolveSubscriptionPortalContext();
  return {
    plans: await db.subscriptionPlan.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { price: "asc" },
    }),
  };
}

export async function getCurrentSubscription() {
  const context = await resolveSubscriptionPortalContext();
  const now = new Date();
  const subscriptions = await db.institutionSubscription.findMany({
    where: currentSubscriptionWhere(context.platformInstitutionId, now),
    include: { plan: true },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });

  return {
    subscriptions,
  };
}

export async function getSubscriptionHistory() {
  const context = await resolveSubscriptionPortalContext();
  return {
    subscriptions: await db.institutionSubscription.findMany({
      where: { institutionId: context.platformInstitutionId },
      include: {
        plan: true,
        events: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { actor: { select: { name: true, email: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  };
}

export async function getSubscriptionInvoices() {
  const context = await resolveSubscriptionPortalContext();
  return {
    invoices: await db.invoice.findMany({
      where: { institutionId: context.platformInstitutionId },
      include: { payments: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    }),
  };
}

export async function getSubscriptionUsage() {
  const context = await resolveSubscriptionPortalContext();
  const [studentCount, staffCount, userCount, metrics] = await Promise.all([
    db.student.count({ where: { institutionId: context.erpInstitutionId, status: "ACTIVE" } }),
    db.staff.count({ where: { institutionId: context.erpInstitutionId, status: "ACTIVE" } }),
    db.user.count({
      where: {
        institutionId: context.erpInstitutionId,
        isActive: true,
        status: "ACTIVE",
      },
    }),
    db.institutionUsageMetric.findMany({
      where: { institutionId: context.platformInstitutionId },
      orderBy: { measuredAt: "desc" },
      take: 50,
    }),
  ]);

  const subscriptions = await db.institutionSubscription.findMany({
    where: currentSubscriptionWhere(context.platformInstitutionId),
    include: { plan: true },
    orderBy: { startsAt: "desc" },
    take: 2,
  });

  return {
    institutionName: context.institutionName,
    studentCount,
    staffCount,
    userCount,
    metrics,
    subscription:
      subscriptions.length === 1
        ? subscriptions[0]
        : null,
    hasAmbiguousSubscriptions: subscriptions.length > 1,
  };
}
