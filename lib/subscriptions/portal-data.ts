import "server-only";

import { connection } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { requireInstitutionAdminSession } from "@/lib/security/admin-auth";
import { db as prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import {
  currentInstitutionSubscription,
  institutionPaymentWhere,
  institutionSubscriptionStatus,
  institutionSubscriptionWhere,
} from "@/lib/subscriptions/portal-metrics";

export type SubscriptionPortalScope =
  | { role: "SUPER_ADMIN"; institutionId?: never }
  | { role: "INSTITUTION_ADMIN"; institutionId: string };

export type PortalInstitutionRecord = {
  id: string;
  billingLinked: boolean;
  reconciliationAvailable: boolean;
  /** Stored institution type (COLLEGE, SCHOOL, ACADEMY or legacy OTHER); used to offer only compatible plans. */
  institutionType: string;
  subscriptionId: string | null;
  institution: string;
  code: string;
  administrator: string;
  plan: string;
  pendingPlan: string | null;
  amount: number | null;
  currency: string | null;
  billingCycle: string | null;
  customCycleDays: number | null;
  storageLimitMb: number | null;
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
  plan: {
    name: string;
    price?: unknown;
    currency?: string;
    billingCycle?: string;
    customCycleDays?: number | null;
    storageLimitMb?: bigint | null;
    studentLimit?: number | null;
  };
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
  await connection();
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

async function queryPayments(scope: SubscriptionPortalScope, take?: number) {
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(take === undefined ? {} : { take }),
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
  await connection();
  const now = new Date();
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
        ? { name: true, price: true, currency: true, billingCycle: true, customCycleDays: true, storageLimitMb: true, studentLimit: true }
        : { name: true, price: true, currency: true, billingCycle: true, customCycleDays: true, storageLimitMb: true },
    },
    institution: { select: { name: true } },
  };

  const [institutionsResult, legacyInstitutionsResult, legacyIdentityResult, subscriptionsResult, countsResult] = await Promise.all([
    capture<Array<{
      id: string;
      name: string;
      code: string | null;
      slug: string;
      type: string;
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
          slug: true,
          type: true,
          status: true,
          archivedAt: true,
          primaryAdminUserId: true,
        },
      }),
    ),
    scope.role === "SUPER_ADMIN"
      ? capture<Array<{ id: string; name: string; code: string | null; slug: string | null; type: string | null }>>(
          "unlinked ERP institution",
          prisma.$queryRaw`
            SELECT e.id::text AS id, e.name, e.code, e.slug, e.type::text AS type
            FROM institutions e
            WHERE NOT EXISTS (SELECT 1 FROM "Institution" p WHERE p.id::text = e.id::text)
            ORDER BY e.name
          `,
        )
      : Promise.resolve({ value: [] as Array<{ id: string; name: string; code: string | null; slug: string | null; type: string | null }>, error: null }),
    capture<Array<{ id: string }>>(
      "ERP institution identity",
      institutionId
        ? prisma.$queryRaw`SELECT id::text AS id FROM institutions WHERE id = ${institutionId}::uuid`
        : prisma.$queryRaw`SELECT id::text AS id FROM institutions`,
    ),
    capture<SubscriptionRow[]>(
      "subscription",
      (async () => {
        const ids = await prisma.$queryRaw<Array<{ id: string }>>`
          WITH ranked AS (
            SELECT s.id, s.status,
              row_number() OVER (PARTITION BY s."institutionId" ORDER BY
                CASE WHEN s."startsAt" <= ${now} AND (s."endsAt" IS NULL OR s."endsAt" > ${now}) AND s.status IN ('ACTIVE', 'TRIALING') THEN 0
                     WHEN s."startsAt" <= ${now} AND (s."endsAt" IS NULL OR s."endsAt" > ${now}) AND s.status NOT IN ('EXPIRED', 'CANCELED') THEN 1 ELSE 2 END,
                s."startsAt" DESC, s."createdAt" DESC, s.id DESC) AS current_rank,
              row_number() OVER (PARTITION BY s."institutionId", s.status ORDER BY s."startsAt" DESC, s."createdAt" DESC, s.id DESC) AS status_rank
            FROM "InstitutionSubscription" s
            ${institutionId ? Prisma.sql`WHERE s."institutionId" = ${institutionId}::uuid` : Prisma.empty}
          )
          SELECT id FROM ranked WHERE current_rank = 1 OR (status = 'PAST_DUE' AND status_rank <= 2)
        `;
        return prisma.institutionSubscription.findMany({
          where: { id: { in: ids.map((item) => item.id) } },
          orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          select: subscriptionSelect,
        }) as Promise<SubscriptionRow[]>;
      })(),
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
  ]);

  const institutions = institutionsResult.value ?? [];
  const legacyInstitutionIds = new Set((legacyIdentityResult.value ?? []).map((entry) => entry.id));
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
  const selectedSubscriptions = institutions.map((institution) => ({
    institutionId: institution.id,
    subscriptionId: currentInstitutionSubscription(subscriptionsByInstitution.get(institution.id) ?? [], now)?.id ?? null,
  }));
  const paymentsResult = await capture<Array<{ institutionId: string; status: string; subscriptionId: string | null }>>(
    "institution payment status",
    selectedSubscriptions.length
      ? prisma.$queryRaw`
          WITH selected("institutionId", "subscriptionId") AS (VALUES ${Prisma.join(selectedSubscriptions.map((item) =>
            Prisma.sql`(${item.institutionId}::uuid, ${item.subscriptionId}::uuid)`))})
          SELECT s."institutionId"::text AS "institutionId", p.status::text AS status, s."subscriptionId"::text AS "subscriptionId"
          FROM selected s
          JOIN LATERAL (
            SELECT pay.status FROM "Payment" pay JOIN "Invoice" i ON i.id = pay."invoiceId"
            WHERE i."institutionId" = s."institutionId"
              AND (s."subscriptionId" IS NULL OR i."subscriptionId" = s."subscriptionId")
            ORDER BY pay."createdAt" DESC, pay.id DESC LIMIT 1
          ) p ON true
        `
      : Promise.resolve([]),
  );
  const studentCounts = new Map(
    (countsResult.value ?? []).map((entry: { institutionId: string; count: number }) => [entry.institutionId, entry.count]),
  );
  const paymentsByInstitution = new Map<string, Array<{ status: string; subscriptionId: string | null }>>();
  for (const payment of paymentsResult.value ?? []) {
    const entries = paymentsByInstitution.get(payment.institutionId) ?? [];
    entries.push({ status: payment.status, subscriptionId: payment.subscriptionId });
    paymentsByInstitution.set(payment.institutionId, entries);
  }

  const records = institutions.map((institution: {
    id: string;
    name: string;
    code: string | null;
    slug: string;
    type: string;
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
      billingLinked: legacyInstitutionIds.has(institution.id),
      reconciliationAvailable: false,
      institutionType: institution.type,
      subscriptionId: subscription?.id ?? null,
      institution: institution.name,
      code: institution.code ?? institution.slug,
      administrator: institution.primaryAdminUserId
        ? administrators.get(institution.primaryAdminUserId) ?? membershipAdministrators.get(institution.id) ?? "Unavailable"
        : membershipAdministrators.get(institution.id) ?? "Not assigned",
      plan: subscriptionsResult.error
        ? "Unavailable"
        : subscription?.plan.name ?? "No subscription assigned",
      pendingPlan: history.find((item) => item.status === "PAST_DUE" && item.id !== subscription?.id)?.plan.name ?? null,
      amount: subscription?.plan.price != null ? Number(subscription.plan.price) : null,
      currency: subscription?.plan.currency ?? null,
      billingCycle: subscription?.plan.billingCycle ?? null,
      customCycleDays: subscription?.plan.customCycleDays ?? null,
      storageLimitMb: subscription?.plan.storageLimitMb != null ? Number(subscription.plan.storageLimitMb) : null,
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
  records.push(...(legacyInstitutionsResult.value ?? []).map((institution): PortalInstitutionRecord => ({
    id: institution.id,
    billingLinked: false,
    reconciliationAvailable: true,
    institutionType: institution.type ?? "COLLEGE",
    subscriptionId: null,
    institution: institution.name,
    code: institution.code ?? institution.slug ?? institution.id,
    administrator: "Not linked to platform",
    plan: "Not linked to billing",
    pendingPlan: null,
    amount: null,
    currency: null,
    billingCycle: null,
    customCycleDays: null,
    storageLimitMb: null,
    studentLimit: null,
    studentLimitAvailable: capabilities.studentLimitAvailable,
    students: countsResult.error ? null : studentCounts.get(institution.id) ?? 0,
    remainingCapacity: null,
    startsAt: null,
    expiresAt: null,
    subscriptionStatus: "NOT_LINKED",
    paymentStatus: "NOT_LINKED",
    archived: false,
  })));

  const errors = [
    institutionsResult.error,
    legacyInstitutionsResult.error,
    legacyIdentityResult.error,
    subscriptionsResult.error,
    countsResult.error,
    paymentsResult.error,
    administratorsResult.error,
    membershipAdministratorsResult.error,
  ].filter((error): error is string => Boolean(error));

  return {
    records,
    error: institutionsResult.error ?? legacyInstitutionsResult.error,
    warnings: errors,
    subscriptionDataAvailable: !subscriptionsResult.error,
    studentCountsAvailable: !countsResult.error,
    paymentStatusAvailable: !paymentsResult.error,
    studentLimitAvailable: capabilities.studentLimitAvailable,
  };
}

export async function getPortalOverview(scope: SubscriptionPortalScope): Promise<PortalOverviewData> {
  const institutionId = scope.role === "INSTITUTION_ADMIN" ? scope.institutionId : undefined;
  await connection();
  const now = new Date();
  const renewalEnd = new Date(now);
  renewalEnd.setDate(renewalEnd.getDate() + 30);
  const subscriptionScope = institutionSubscriptionWhere(scope);
  const paymentScope = institutionPaymentWhere(scope);
  const current = { status: "ACTIVE" as const, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
  const months = Array.from({ length: 6 }, (_, index) => {
    const start = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - 4 + index, 1);
    return { start, end, label: start.toLocaleDateString("en-IN", { month: "short" }) };
  });
  const select = {
    id: true, institutionId: true, status: true, startsAt: true, endsAt: true, renewsAt: true, createdAt: true,
    institution: { select: { name: true } }, plan: { select: { name: true } },
  };
  const [institutionData, institutionCount, recentPayments, paymentStats, subscriptionStats] = await Promise.all([
    institutionId ? getPortalInstitutionList(scope) : Promise.resolve(null),
    capture("institution overview", scope.role === "SUPER_ADMIN"
      ? Promise.all([
          prisma.platformInstitution.count(),
          prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM institutions e WHERE NOT EXISTS (SELECT 1 FROM "Institution" p WHERE p.id::text = e.id::text)`,
        ]).then(([count, legacy]) => count + Number(legacy[0].count))
      : prisma.platformInstitution.count({ where: { id: institutionId } })),
    queryPayments(scope, 5),
    capture("payment overview", Promise.all([
      prisma.payment.groupBy({ by: ["status"], where: paymentScope, _count: { _all: true } }),
      prisma.payment.groupBy({ by: ["currency"], where: { ...paymentScope, status: "SUCCEEDED" }, _sum: { amount: true } }),
      Promise.all(months.map(({ start, end }) => prisma.payment.groupBy({
        by: ["currency"], where: { ...paymentScope, status: "SUCCEEDED", paidAt: { gte: start, lt: end } }, _sum: { amount: true },
      }))),
    ])),
    capture("subscription overview", Promise.all([
      prisma.institutionSubscription.count({ where: { ...subscriptionScope, ...current } }),
      prisma.institutionSubscription.count({ where: { ...subscriptionScope, status: "PAST_DUE" } }),
      prisma.institutionSubscription.count({ where: { ...subscriptionScope, OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endsAt: { lte: now } }] } }),
      Promise.all(months.map(({ start, end }) => prisma.institutionSubscription.count({ where: { ...subscriptionScope, createdAt: { gte: start, lt: end } } }))),
      prisma.institutionSubscription.findMany({ where: { ...subscriptionScope, ...current, OR: [
        { renewsAt: { gte: now, lte: renewalEnd } },
        { renewsAt: null, endsAt: { gte: now, lte: renewalEnd, gt: now } },
      ], AND: [{ OR: current.OR }] }, select }),
      prisma.institutionSubscription.findMany({ where: { ...subscriptionScope, ...current, endsAt: { gt: now, lte: renewalEnd } }, orderBy: { endsAt: "asc" }, select }),
      prisma.institutionSubscription.findMany({ where: subscriptionScope, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5, select }),
    ])),
  ]);
  const stats = subscriptionStats.value;
  const payment = paymentStats.value;
  const counts = new Map((payment?.[0] ?? []).map((item) => [item.status as string, item._count._all]));
  const upcoming = (stats?.[4] ?? []).sort((a, b) => (a.renewsAt ?? a.endsAt)!.getTime() - (b.renewsAt ?? b.endsAt)!.getTime());
  const transactionAvailable = !recentPayments.error;
  return {
    institutionCount: institutionCount.value,
    activeSubscriptions: stats?.[0] ?? null,
    pendingSubscriptions: stats?.[1] ?? null,
    expiredSubscriptions: stats?.[2] ?? null,
    successfulPayments: payment ? counts.get("SUCCEEDED") ?? 0 : null,
    pendingPayments: payment ? counts.get("PENDING") ?? 0 : null,
    failedPayments: payment ? counts.get("FAILED") ?? 0 : null,
    totalPayments: payment ? [...counts.values()].reduce((sum, count) => sum + count, 0) : null,
    revenueByCurrency: payment?.[1].map((item) => ({ currency: item.currency, amount: Number(item._sum.amount ?? 0) })) ?? [],
    revenueAvailable: Boolean(payment),
    subscriptionGrowth: stats ? months.map(({ label }, index) => ({ label, value: stats[3][index] })) : [],
    monthlyRevenue: payment ? months.map(({ label }, index) => ({ label, values: payment[2][index].map((item) => ({ currency: item.currency, amount: Number(item._sum.amount ?? 0) })) })) : [],
    upcomingRenewals: upcoming.map((item) => ({ institution: item.institution.name, plan: item.plan.name, date: asDate(item.renewsAt ?? item.endsAt) ?? "Unavailable", status: item.status })),
    expiringSubscriptions: (stats?.[5] ?? []).map((item) => ({ institution: item.institution.name, plan: item.plan.name, date: asDate(item.endsAt) ?? "Unavailable", status: item.status })),
    recentActivity: (stats?.[6] ?? []).map((item) => ({ id: item.id, institution: item.institution.name, plan: item.plan.name, status: item.status, date: asDate(item.createdAt) ?? "Unavailable" })),
    recentTransactions: transactionAvailable ? (recentPayments.value ?? []).map((row) => transactionFromRow(row, recentPayments.orderIdAvailable)) : [],
    institution: institutionData?.records[0] ?? null,
    errors: [institutionCount.error, ...(institutionData?.warnings ?? []), subscriptionStats.error, paymentStats.error, recentPayments.error].filter((error): error is string => Boolean(error)),
  };
}
