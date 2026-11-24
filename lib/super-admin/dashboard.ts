import "server-only";
import { prisma } from "@/lib/super-admin/prisma";

type TimelinePoint = {
  label: string;
  institutions: number;
  students: number;
  users: number;
  subscriptions: number;
  revenue: number;
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(date: Date) {
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function createTimeline(from: Date, until: Date) {
  const firstMonth = new Date(from.getFullYear(), from.getMonth(), 1);
  const lastMonth = new Date(until.getFullYear(), until.getMonth(), 1);
  const points: TimelinePoint[] = [];
  for (const cursor = new Date(firstMonth); cursor < lastMonth && points.length < 24; cursor.setMonth(cursor.getMonth() + 1)) {
    points.push({ label: formatMonth(cursor), institutions: 0, students: 0, users: 0, subscriptions: 0, revenue: 0 });
  }
  if (points.length === 0) points.push({ label: formatMonth(firstMonth), institutions: 0, students: 0, users: 0, subscriptions: 0, revenue: 0 });
  return points;
}

function addToTimeline<T>(
  timeline: TimelinePoint[],
  records: T[],
  getDate: (record: T) => Date | null,
  field: "institutions" | "students" | "users" | "subscriptions" | "revenue",
  getValue: (record: T) => number = () => 1,
) {
  const index = new Map(timeline.map((point, position) => [point.label, position]));
  for (const record of records) {
    const date = getDate(record);
    if (!date) continue;
    const position = index.get(formatMonth(date));
    if (position !== undefined) timeline[position][field] += getValue(record);
  }
}

function sumBy<T>(records: T[], getKey: (record: T) => string, getValue: (record: T) => number) {
  const totals = new Map<string, number>();
  for (const record of records) totals.set(getKey(record), (totals.get(getKey(record)) ?? 0) + getValue(record));
  return totals;
}

export async function getDashboardSummary(filter?: { from?: Date; until?: Date }) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const from = filter?.from ?? defaultFrom;
  const until = filter?.until ?? new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const activityPeriod = { createdAt: { gte: from, lt: until } };
  const activeSubscriptionWhere = { status: "ACTIVE" as const, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };

  const [
    totalInstitutions,
    activeInstitutions,
    suspendedInstitutions,
    pendingInstitutions,
    totalStudents,
    totalUsers,
    activeSubscriptions,
    expiredSubscriptions,
    activePlanPrices,
    recentInstitutions,
    recentAuditLogs,
    recentNotifications,
    expiringSubscriptions,
    failedPayments,
    openSupportTickets,
    storageMetric,
    institutionsCreated,
    studentsCreated,
    usersCreated,
    subscriptionsCreated,
    paidPayments,
    subscriptionDistribution,
    subscriptionStatusDistribution,
    paymentStatusDistribution,
    institutionStatusDistribution,
    onboardingFunnel,
    institutionPerformance,
    studentPopulation,
    usageByInstitution,
    moduleUsage,
    roleDistribution,
  ] = await Promise.all([
    prisma.platformInstitution.count(),
    prisma.platformInstitution.count({ where: { status: "ACTIVE" } }),
    prisma.platformInstitution.count({ where: { status: "SUSPENDED" } }),
    prisma.platformInstitution.count({ where: { status: "PENDING" } }),
    prisma.student.count(),
    prisma.platformUser.count(),
    prisma.institutionSubscription.count({ where: activeSubscriptionWhere }),
    prisma.institutionSubscription.count({ where: { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endsAt: { lte: now } }] } }),
    prisma.institutionSubscription.findMany({
      where: activeSubscriptionWhere,
      select: { plan: { select: { price: true, currency: true, billingCycle: true, customCycleDays: true } } },
    }),
    prisma.platformInstitution.findMany({
      where: activityPeriod,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, type: true, status: true, createdAt: true },
    }),
    prisma.platformAuditLog.findMany({
      where: activityPeriod,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } }, institution: { select: { name: true } } },
    }),
    prisma.platformNotification.findMany({ where: { status: { in: ["PUBLISHED", "SCHEDULED"] } }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, title: true, status: true, createdAt: true } }),
    prisma.institutionSubscription.findMany({
      where: { ...activeSubscriptionWhere, endsAt: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) } },
      orderBy: { endsAt: "asc" },
      take: 5,
      select: { id: true, endsAt: true, institution: { select: { name: true } } },
    }),
    prisma.payment.count({ where: { status: "FAILED" } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_RESPONSE"] } } }),
    prisma.institutionUsageMetric.findMany({
      where: { metric: "storage_bytes" },
      distinct: ["institutionId"],
      orderBy: { measuredAt: "desc" },
      select: { value: true },
    }),
    prisma.platformInstitution.findMany({ where: activityPeriod, select: { createdAt: true } }),
    prisma.student.findMany({ where: { createdAt: activityPeriod.createdAt }, select: { createdAt: true } }),
    prisma.platformUser.findMany({ where: { createdAt: activityPeriod.createdAt }, select: { createdAt: true } }),
    prisma.institutionSubscription.findMany({ where: { createdAt: activityPeriod.createdAt }, select: { createdAt: true } }),
    prisma.payment.findMany({
      where: { status: "SUCCEEDED", paidAt: { gte: from, lt: until } },
      select: { amount: true, currency: true, paidAt: true, invoice: { select: { subscription: { select: { plan: { select: { name: true } } } } } } },
    }),
    prisma.institutionSubscription.groupBy({ by: ["planId"], where: activeSubscriptionWhere, _count: { _all: true } }).then(async (distribution) => {
      const plans = await prisma.subscriptionPlan.findMany({ where: { id: { in: distribution.map((item) => item.planId) } }, select: { id: true, name: true } });
      const names = new Map(plans.map((plan) => [plan.id, plan.name]));
      return distribution.map((item) => ({ label: names.get(item.planId) ?? "Unknown plan", value: item._count._all }));
    }),
    prisma.institutionSubscription.groupBy({ by: ["status"], _count: { _all: true } }).then((items) => items.map((item) => ({ label: item.status, value: item._count._all }))),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }).then((items) => items.map((item) => ({ label: item.status, value: item._count._all }))),
    prisma.platformInstitution.groupBy({ by: ["status"], _count: { _all: true } }).then((items) => items.map((item) => ({ label: item.status, value: item._count._all }))),
    prisma.platformInstitution.groupBy({ by: ["onboardingStage"], _count: { _all: true } }).then((items) => items.map((item) => ({ label: item.onboardingStage, value: item._count._all }))),
    prisma.platformInstitution.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        memberships: { where: { status: "ACTIVE" }, select: { id: true } },
        subscriptions: { where: activeSubscriptionWhere, orderBy: { startsAt: "desc" }, take: 1, select: { plan: { select: { name: true } } } },
      },
    }).then((institutions) => institutions.map((institution) => ({ id: institution.id, name: institution.name, status: institution.status, activeUsers: institution.memberships.length, plan: institution.subscriptions[0]?.plan.name ?? null }))),
    prisma.institution.findMany({ take: 100, select: { id: true, name: true, _count: { select: { students: true } } } }).then((institutions) => institutions.sort((a, b) => b._count.students - a._count.students).slice(0, 5).map((institution) => ({ id: institution.id, name: institution.name, students: institution._count.students }))),
    prisma.institutionUsageMetric.findMany({ orderBy: { measuredAt: "desc" }, take: 100, select: { institutionId: true, metric: true, value: true, unit: true, institution: { select: { name: true } } } }),
    prisma.institutionFeatureOverride.groupBy({ by: ["featureId"], where: { enabled: true }, _count: { _all: true } }).then(async (items) => {
      const features = await prisma.platformFeature.findMany({ where: { id: { in: items.map((item) => item.featureId) } }, select: { id: true, name: true } });
      const names = new Map(features.map((feature) => [feature.id, feature.name]));
      return items.map((item) => ({ label: names.get(item.featureId) ?? "Unknown feature", value: item._count._all }));
    }),
    prisma.platformUser.groupBy({ by: ["platformRole"], _count: { _all: true } }).then((items) => items.map((item) => ({ label: item.platformRole, value: item._count._all }))),
  ]);

  const timeline = createTimeline(from, until);
  addToTimeline(timeline, institutionsCreated, (record) => record.createdAt, "institutions");
  addToTimeline(timeline, studentsCreated, (record) => record.createdAt, "students");
  addToTimeline(timeline, usersCreated, (record) => record.createdAt, "users");
  addToTimeline(timeline, subscriptionsCreated, (record) => record.createdAt, "subscriptions");
  addToTimeline(timeline, paidPayments, (record) => record.paidAt, "revenue", (record) => Number(record.amount));

  const paymentCurrencies = new Set(paidPayments.map((payment) => payment.currency));
  const revenueByPlan = [...sumBy(paidPayments, (payment) => `${payment.invoice?.subscription?.plan.name ?? "Unassigned"}|${payment.currency}`, (payment) => Number(payment.amount))].map(([key, value]) => {
    const [label, currency] = key.split("|");
    return { label, value, currency };
  });

  const totalsByCurrency = new Map<string, number>();
  for (const { plan } of activePlanPrices) {
    const price = Number(plan.price);
    const monthly = plan.billingCycle === "MONTHLY" ? price : plan.billingCycle === "QUARTERLY" ? price / 3 : plan.billingCycle === "YEARLY" ? price / 12 : plan.customCycleDays ? price * 30 / plan.customCycleDays : null;
    if (monthly !== null) totalsByCurrency.set(plan.currency, (totalsByCurrency.get(plan.currency) ?? 0) + monthly);
  }

  const monthlyRecurringRevenue = totalsByCurrency.size === 1
    ? { currency: [...totalsByCurrency.keys()][0], amount: [...totalsByCurrency.values()][0] }
    : totalsByCurrency.size === 0 ? { currency: "INR", amount: 0 } : null;
  const latestUsage = new Map<string, { name: string; metric: string; value: number; unit: string }>();
  for (const metric of usageByInstitution) if (!latestUsage.has(`${metric.institutionId}:${metric.metric}`)) latestUsage.set(`${metric.institutionId}:${metric.metric}`, { name: metric.institution.name, metric: metric.metric, value: Number(metric.value), unit: metric.unit });

  return {
    totalInstitutions, activeInstitutions, suspendedInstitutions, pendingInstitutions, totalStudents, totalUsers, activeSubscriptions, expiredSubscriptions,
    monthlyRecurringRevenue, recentInstitutions, recentAuditLogs, recentNotifications, expiringSubscriptions, failedPayments, openSupportTickets,
    storageBytes: storageMetric.length === 0 ? null : storageMetric.reduce((total, metric) => total + Number(metric.value), 0),
    timeline, subscriptionDistribution, subscriptionStatusDistribution, paymentStatusDistribution, institutionStatusDistribution, onboardingFunnel,
    institutionPerformance, studentPopulation, usageByInstitution: [...latestUsage.values()].slice(0, 8), moduleUsage, roleDistribution,
    revenueByPlan, revenueCurrency: paymentCurrencies.size === 1 ? [...paymentCurrencies][0] : null,
  };
}

export type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;
