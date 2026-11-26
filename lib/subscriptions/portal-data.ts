import "server-only";

import { getSession } from "@/lib/auth/session";
import { requireInstitutionAdminSession } from "@/lib/security/admin-auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import {
  currentInstitutionSubscription,
  institutionPaymentWhere,
  institutionSubscriptionStatus,
  institutionSubscriptionWhere,
  summarizePayments,
} from "@/lib/subscriptions/portal-metrics";

export type SubscriptionPortalScope =
  | { role: "SUPER_ADMIN"; institutionId?: never }
  | { role: "INSTITUTION_ADMIN"; institutionId: string };

export type PortalInstitutionRecord = {
  id: string;
  institution: string;
  code: string;
  administrator: string;
  plan: string;
  studentLimit: number | null;
  studentLimitAvailable: boolean;
  students: number | null;
  remainingCapacity: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  subscriptionStatus: string;
  paymentStatus: string;
  archived: boolean;
};

export type PortalTransaction = {
  id: string;
  reference: string;
  institution: string;
  plan: string;
  amount: number;
  currency: string;
  date: string | null;
  provider: string;
  status: string;
  orderId: string | null;
  orderIdAvailable: boolean;
  paymentId: string | null;
};

export type PortalInstitutionListData = {
  records: PortalInstitutionRecord[];
  error: string | null;
  warnings: string[];
  subscriptionDataAvailable: boolean;
  studentCountsAvailable: boolean;
  paymentStatusAvailable: boolean;
  studentLimitAvailable: boolean;
};

export type PortalPaymentListData = {
  records: PortalTransaction[];
  error: string | null;
  orderIdAvailable: boolean;
};

export type PortalOverviewData = {
  institutionCount: number | null;
  activeSubscriptions: number | null;
  pendingSubscriptions: number | null;
  expiredSubscriptions: number | null;
  successfulPayments: number | null;
  pendingPayments: number | null;
  failedPayments: number | null;
  totalPayments: number | null;
  revenueByCurrency: Array<{ currency: string; amount: number }>;
  revenueAvailable: boolean;
  subscriptionGrowth: Array<{ label: string; value: number }>;
  monthlyRevenue: Array<{ label: string; values: Array<{ currency: string; amount: number }> }>;
  upcomingRenewals: Array<{ institution: string; plan: string; date: string; status: string }>;
  expiringSubscriptions: Array<{ institution: string; plan: string; date: string; status: string }>;
  recentActivity: Array<{ id: string; institution: string; plan: string; status: string; date: string }>;
  recentTransactions: PortalTransaction[];
  institution: PortalInstitutionRecord | null;
  errors: string[];
};

type SubscriptionRow = {
  id: string;
  institutionId: string;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  renewsAt: Date | null;
  createdAt: Date;
  plan: { name: string; studentLimit?: number | null };
  institution: { name: string };
};

type PaymentRow = {
  id: string;
  invoiceId: string;
  amount: unknown;
  currency: string;
  status: string;
  provider: string | null;
  providerReference: string | null;
  providerOrderId?: string | null;
  paidAt: Date | null;
  createdAt: Date;
  invoice: {
    invoiceNumber: string;
    institutionId: string;
    subscriptionId: string | null;
    institution: { name: string };
    subscription: { plan: { name: string } } | null;
  };
};

type DataResult<T> = { value: T | null; error: string | null };

function logQueryFailure(source: string, error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "unknown";
  console.error(`[SubscriptionCenter] ${source} query failed (${code})`);
}

async function capture<T>(source: string, query: Promise<T>): Promise<DataResult<T>> {
  try {
    return { value: await query, error: null };
  } catch (error) {
    logQueryFailure(source, error);
    return { value: null, error: `${source} data could not be loaded.` };
  }
}

function asDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

async function getSchemaCapabilities() {
  try {
    const columns: Array<{ table_name: string; column_name: string }> = await prisma.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          (table_name = 'SubscriptionPlan' AND column_name = 'studentLimit')
          OR (table_name = 'Payment' AND column_name = 'providerOrderId')
        )
    `;
    const present = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
    return {
      studentLimitAvailable: present.has("SubscriptionPlan.studentLimit"),
      orderIdAvailable: present.has("Payment.providerOrderId"),
    };
  } catch (error) {
    logQueryFailure("subscription schema capability", error);
    return { studentLimitAvailable: false, orderIdAvailable: false };
  }
}

export async function getSubscriptionPortalScope(): Promise<SubscriptionPortalScope> {
  const session = await getSession();
  if (session?.role === "ADMIN") {
    const verifiedSession = await requireInstitutionAdminSession();
    return { role: "INSTITUTION_ADMIN", institutionId: verifiedSession.institutionId };
  }

  await requireSuperAdmin();
  return { role: "SUPER_ADMIN" };
}

function transactionFromRow(row: PaymentRow, orderIdAvailable: boolean): PortalTransaction {
  return {
    id: row.id,
    reference: row.id,
    institution: row.invoice.institution.name,
    plan: row.invoice.subscription?.plan.name ?? "Not linked",
    amount: Number(row.amount),
    currency: row.currency,
    date: asDate(row.paidAt),
    provider: row.provider ?? "Not specified",
    status: row.status,
    orderId: orderIdAvailable ? row.providerOrderId ?? null : null,
    orderIdAvailable,
    paymentId: row.providerReference,
  };
}

async function queryPayments(scope: SubscriptionPortalScope) {
  const capabilities = await getSchemaCapabilities();
  const select = {
    id: true,
    invoiceId: true,
    amount: true,
    currency: true,
    status: true,
    provider: true,
    providerReference: true,
    ...(capabilities.orderIdAvailable ? { providerOrderId: true } : {}),
    paidAt: true,
    createdAt: true,
    invoice: {
      select: {
        invoiceNumber: true,
        institutionId: true,
        subscriptionId: true,
        institution: { select: { name: true } },
        subscription: { select: { plan: { select: { name: true } } } },
      },
    },
  };

  const result = await capture<PaymentRow[]>(
    "payment",
    prisma.payment.findMany({
      where: institutionPaymentWhere(scope),
      orderBy: { createdAt: "desc" },
      select,
    }) as Promise<PaymentRow[]>,
  );
  return { ...result, orderIdAvailable: capabilities.orderIdAvailable };
}

export async function getPortalPaymentList(scope: SubscriptionPortalScope): Promise<PortalPaymentListData> {
  const result = await queryPayments(scope);
  return {
    records: result.value?.map((row) => transactionFromRow(row, result.orderIdAvailable)) ?? [],
    error: result.error,
    orderIdAvailable: result.orderIdAvailable,
  };
}

export async function getPortalInstitutionList(scope: SubscriptionPortalScope): Promise<PortalInstitutionListData> {
  const institutionId = scope.role === "INSTITUTION_ADMIN" ? scope.institutionId : undefined;
  const capabilities = await getSchemaCapabilities();
  const subscriptionSelect = {
    id: true,
    institutionId: true,
    status: true,
    startsAt: true,
    endsAt: true,
    renewsAt: true,
    createdAt: true,
    plan: {
      select: capabilities.studentLimitAvailable
        ? { name: true, studentLimit: true }
        : { name: true },
    },
    institution: { select: { name: true } },
  };

  const [institutionsResult, subscriptionsResult, countsResult, paymentsResult] = await Promise.all([
    capture<Array<{
      id: string;
      name: string;
      code: string | null;
      status: string;
      archivedAt: Date | null;
      primaryAdminUserId: string | null;
    }>>(
      "institution",
      prisma.platformInstitution.findMany({
        where: institutionId ? { id: institutionId } : undefined,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          archivedAt: true,
          primaryAdminUserId: true,
        },
      }),
    ),
    capture<SubscriptionRow[]>(
      "subscription",
      prisma.institutionSubscription.findMany({
        where: institutionSubscriptionWhere(scope),
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        select: subscriptionSelect,
      }) as Promise<SubscriptionRow[]>,
    ),
    capture<Array<{ institutionId: string; count: number }>>(
      "student count",
      institutionId
        ? prisma.student.count({ where: { institutionId } }).then((count: number) => [{ institutionId, count }])
        : prisma.student.groupBy({
            by: ["institutionId"],
            _count: { _all: true },
          }).then((groups: Array<{ institutionId: string; _count: { _all: number } }>) =>
            groups.map((group) => ({ institutionId: group.institutionId, count: group._count._all })),
          ),
    ),
    capture<Array<{
      status: string;
      createdAt: Date;
      invoice: { institutionId: string; subscriptionId: string | null };
    }>>(
      "institution payment status",
      prisma.payment.findMany({
        where: institutionPaymentWhere(scope),
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          createdAt: true,
          invoice: { select: { institutionId: true, subscriptionId: true } },
        },
      }),
    ),
  ]);

  const institutions = institutionsResult.value ?? [];
  const adminIds = institutions
    .map((institution: { primaryAdminUserId: string | null }) => institution.primaryAdminUserId)
    .filter((id: string | null): id is string => Boolean(id));
  const administratorsResult = adminIds.length
    ? await capture<Array<{ id: string; name: string }>>(
        "institution administrator",
        prisma.platformUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true },
        }),
      )
    : { value: [] as Array<{ id: string; name: string }>, error: null };
  const missingAdminInstitutionIds = institutions
    .filter((institution: { primaryAdminUserId: string | null }) => !institution.primaryAdminUserId)
    .map((institution: { id: string }) => institution.id);
  const membershipAdministratorsResult = missingAdminInstitutionIds.length
    ? await capture<Array<{ institutionId: string; user: { name: string } }>>(
        "institution administrator membership",
        prisma.institutionMembership.findMany({
          where: {
            institutionId: { in: missingAdminInstitutionIds },
            status: "ACTIVE",
            roles: {
              some: {
                role: { code: { in: ["INSTITUTION_ADMIN", "ADMIN"] } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          select: { institutionId: true, user: { select: { name: true } } },
        }),
      )
    : { value: [] as Array<{ institutionId: string; user: { name: string } }>, error: null };
  const administrators = new Map(
    (administratorsResult.value ?? []).map((user: { id: string; name: string }) => [user.id, user.name]),
  );
  const membershipAdministrators = new Map<string, string>();
  for (const membership of membershipAdministratorsResult.value ?? []) {
    if (!membershipAdministrators.has(membership.institutionId)) {
      membershipAdministrators.set(membership.institutionId, membership.user.name);
    }
  }
  const subscriptionsByInstitution = new Map<string, SubscriptionRow[]>();
  for (const subscription of subscriptionsResult.value ?? []) {
    const entries = subscriptionsByInstitution.get(subscription.institutionId) ?? [];
    entries.push(subscription);
    subscriptionsByInstitution.set(subscription.institutionId, entries);
  }
  const studentCounts = new Map(
    (countsResult.value ?? []).map((entry: { institutionId: string; count: number }) => [entry.institutionId, entry.count]),
  );
  const paymentsByInstitution = new Map<string, Array<{ status: string; subscriptionId: string | null }>>();
  for (const payment of paymentsResult.value ?? []) {
    const entries = paymentsByInstitution.get(payment.invoice.institutionId) ?? [];
    entries.push({ status: payment.status, subscriptionId: payment.invoice.subscriptionId });
    paymentsByInstitution.set(payment.invoice.institutionId, entries);
  }

  const now = new Date();
  const records = institutions.map((institution: {
    id: string;
    name: string;
    code: string | null;
    status: string;
    archivedAt: Date | null;
    primaryAdminUserId: string | null;
  }): PortalInstitutionRecord => {
    const history = subscriptionsByInstitution.get(institution.id) ?? [];
    const subscription = currentInstitutionSubscription(history, now);
    const paymentHistory = paymentsByInstitution.get(institution.id) ?? [];
    const relevantPayments = subscription
      ? paymentHistory.filter((payment) => payment.subscriptionId === subscription.id)
      : paymentHistory;
    const latestPayment = relevantPayments[0];
    const registeredStudents = countsResult.error ? null : studentCounts.get(institution.id) ?? 0;
    const studentLimit = subscription && capabilities.studentLimitAvailable
      ? subscription.plan.studentLimit ?? null
      : null;
    const status = institutionSubscriptionStatus(subscription, now);

    return {
      id: institution.id,
      institution: institution.name,
      code: institution.code ?? "—",
      administrator: institution.primaryAdminUserId
        ? administrators.get(institution.primaryAdminUserId) ?? membershipAdministrators.get(institution.id) ?? "Unavailable"
        : membershipAdministrators.get(institution.id) ?? "Not assigned",
      plan: subscriptionsResult.error
        ? "Unavailable"
        : subscription?.plan.name ?? "No subscription assigned",
      studentLimit,
      studentLimitAvailable: capabilities.studentLimitAvailable,
      students: registeredStudents,
      remainingCapacity: studentLimit === null || registeredStudents === null
        ? null
        : Math.max(0, studentLimit - registeredStudents),
      startsAt: subscription ? asDate(subscription.startsAt) : null,
      expiresAt: subscription ? asDate(subscription.endsAt) : null,
      subscriptionStatus: subscriptionsResult.error ? "UNAVAILABLE" : status,
      paymentStatus: paymentsResult.error
        ? "UNAVAILABLE"
        : latestPayment?.status ?? "NO_PAYMENT_RECORD",
      archived: Boolean(institution.archivedAt),
    };
  });

  const errors = [
    institutionsResult.error,
    subscriptionsResult.error,
    countsResult.error,
    paymentsResult.error,
    administratorsResult.error,
    membershipAdministratorsResult.error,
  ].filter((error): error is string => Boolean(error));

  return {
    records,
    error: institutionsResult.error,
    warnings: errors,
    subscriptionDataAvailable: !subscriptionsResult.error,
    studentCountsAvailable: !countsResult.error,
    paymentStatusAvailable: !paymentsResult.error,
    studentLimitAvailable: capabilities.studentLimitAvailable,
  };
}

export async function getPortalOverview(scope: SubscriptionPortalScope): Promise<PortalOverviewData> {
  const institutionId = scope.role === "INSTITUTION_ADMIN" ? scope.institutionId : undefined;
  const now = new Date();
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const renewalEnd = new Date(now);
  renewalEnd.setDate(renewalEnd.getDate() + 30);
  const [institutionData, paymentData, subscriptionsResult] = await Promise.all([
    getPortalInstitutionList(scope),
    queryPayments(scope),
    capture<SubscriptionRow[]>(
      "subscription overview",
      prisma.institutionSubscription.findMany({
        where: institutionSubscriptionWhere(scope),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          institutionId: true,
          status: true,
          startsAt: true,
          endsAt: true,
          renewsAt: true,
          createdAt: true,
          institution: { select: { name: true } },
          plan: { select: { name: true } },
        },
      }) as Promise<SubscriptionRow[]>,
    ),
  ]);

  const institutionCountResult = await capture<number>(
    "institution count",
    prisma.platformInstitution.count({ where: institutionId ? { id: institutionId } : undefined }),
  );
  const subscriptions = subscriptionsResult.value ?? [];
  const payments = paymentData.value ?? [];
  const paymentSummary = summarizePayments(payments.map((payment) => ({
    status: payment.status,
    amount: Number(payment.amount),
    currency: payment.currency,
  })));
  const revenueByMonth = new Map<string, Map<string, number>>();
  const growthByMonth = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== "SUCCEEDED" || !payment.paidAt) continue;
    const amount = Math.round(Number(payment.amount) * 100);
    const paidDate = payment.paidAt;
    if (paidDate < trendStart) continue;
    const monthKey = `${paidDate.getFullYear()}-${String(paidDate.getMonth() + 1).padStart(2, "0")}`;
    const values = revenueByMonth.get(monthKey) ?? new Map<string, number>();
    values.set(payment.currency, (values.get(payment.currency) ?? 0) + amount);
    revenueByMonth.set(monthKey, values);
  }
  for (const subscription of subscriptions) {
    if (subscription.createdAt < trendStart) continue;
    const monthKey = `${subscription.createdAt.getFullYear()}-${String(subscription.createdAt.getMonth() + 1).padStart(2, "0")}`;
    growthByMonth.set(monthKey, (growthByMonth.get(monthKey) ?? 0) + 1);
  }
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: date.toLocaleDateString("en-IN", { month: "short" }),
    };
  });
  const dateIsCurrent = (subscription: SubscriptionRow) =>
    subscription.startsAt <= now && (!subscription.endsAt || subscription.endsAt > now);
  const activeSubscriptions = subscriptions.filter((item) => item.status === "ACTIVE" && dateIsCurrent(item)).length;
  const pendingSubscriptions = subscriptions.filter((item) => item.status === "PAST_DUE").length;
  const expiredSubscriptions = subscriptions.filter((item) =>
    item.status === "EXPIRED" || Boolean(item.status === "ACTIVE" && item.endsAt && item.endsAt <= now),
  ).length;
  const upcoming = subscriptions
    .filter((item) => {
      const renewalDate = item.renewsAt ?? item.endsAt;
      return item.status === "ACTIVE"
        && dateIsCurrent(item)
        && renewalDate !== null
        && renewalDate >= now
        && renewalDate <= renewalEnd;
    })
    .sort((a, b) => {
      const aDate = a.renewsAt ?? a.endsAt;
      const bDate = b.renewsAt ?? b.endsAt;
      return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0);
    });
  const expiring = subscriptions
    .filter((item) =>
      item.status === "ACTIVE"
      && dateIsCurrent(item)
      && item.endsAt !== null
      && item.endsAt >= now
      && item.endsAt <= renewalEnd,
    )
    .sort((a, b) => (a.endsAt?.getTime() ?? 0) - (b.endsAt?.getTime() ?? 0));
  const recentSubscriptions = subscriptions.slice(0, 5);
  const institutionsAvailable = institutionData.error === null && institutionCountResult.error === null;
  const subscriptionDataAvailable = subscriptionsResult.error === null;
  const paymentDataAvailable = paymentData.error === null;

  return {
    institutionCount: institutionsAvailable ? institutionCountResult.value : null,
    activeSubscriptions: subscriptionDataAvailable ? activeSubscriptions : null,
    pendingSubscriptions: subscriptionDataAvailable ? pendingSubscriptions : null,
    expiredSubscriptions: subscriptionDataAvailable ? expiredSubscriptions : null,
    successfulPayments: paymentDataAvailable ? paymentSummary.counts.get("SUCCEEDED") ?? 0 : null,
    pendingPayments: paymentDataAvailable ? paymentSummary.counts.get("PENDING") ?? 0 : null,
    failedPayments: paymentDataAvailable ? paymentSummary.counts.get("FAILED") ?? 0 : null,
    totalPayments: paymentDataAvailable ? payments.length : null,
    revenueByCurrency: paymentDataAvailable
      ? paymentSummary.revenueByCurrency
      : [],
    revenueAvailable: paymentDataAvailable,
    subscriptionGrowth: subscriptionDataAvailable
      ? months.map(({ key, label }) => ({ label, value: growthByMonth.get(key) ?? 0 }))
      : [],
    monthlyRevenue: paymentDataAvailable
      ? months.map(({ key, label }) => ({
          label,
          values: Array.from(revenueByMonth.get(key) ?? [], ([currency, amount]) => ({
            currency,
            amount: amount / 100,
          })),
        }))
      : [],
    upcomingRenewals: subscriptionDataAvailable
      ? upcoming.map((item) => ({
          institution: item.institution.name,
          plan: item.plan.name,
          date: asDate(item.renewsAt ?? item.endsAt) ?? "Unavailable",
          status: item.status,
        }))
      : [],
    expiringSubscriptions: subscriptionDataAvailable
      ? expiring.map((item) => ({
          institution: item.institution.name,
          plan: item.plan.name,
          date: asDate(item.endsAt) ?? "Unavailable",
          status: item.status,
        }))
      : [],
    recentActivity: subscriptionDataAvailable
      ? recentSubscriptions.map((item) => ({
          id: item.id,
          institution: item.institution.name,
          plan: item.plan.name,
          status: item.status,
          date: asDate(item.createdAt) ?? "Unavailable",
        }))
      : [],
    recentTransactions: paymentDataAvailable
      ? payments.slice(0, 5).map((row) => transactionFromRow(row, paymentData.orderIdAvailable))
      : [],
    institution: institutionId ? institutionData.records[0] ?? null : null,
    errors: [
      institutionData.error,
      ...institutionData.warnings,
      institutionCountResult.error,
      subscriptionsResult.error,
      paymentData.error,
    ].filter((error): error is string => Boolean(error)),
  };
}
