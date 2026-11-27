import "server-only";
import { prisma } from "@/lib/super-admin/prisma";
import type { PlanCatalogue } from "./management-types";

export async function hasStudentLimitColumn() {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'SubscriptionPlan' AND column_name = 'studentLimit') AS "exists"
  `;
  return rows[0].exists;
}

export async function hasBillingDocumentColumns() {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) AS count FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND ((table_name = 'Invoice' AND column_name = 'description')
        OR (table_name = 'Payment' AND column_name = 'providerOrderId'))
  `;
  return Number(rows[0].count) === 2;
}

export async function getPlanCatalogue(): Promise<PlanCatalogue> {
  const studentLimitAvailable = await hasStudentLimitColumn();
  const [plans, features] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true, code: true, name: true, description: true, billingCycle: true, customCycleDays: true,
        price: true, currency: true, storageLimitMb: true, institutionTypes: true, isActive: true,
        ...(studentLimitAvailable ? { studentLimit: true } : {}),
        features: { select: { featureId: true, enabled: true, limitValue: true } },
        _count: { select: { subscriptions: true } },
      },
    }),
    prisma.platformFeature.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, isAvailable: true } }),
  ]);
  return {
    studentLimitAvailable,
    features,
    plans: plans.map((plan) => ({
      ...plan,
      price: Number(plan.price),
      storageLimitMb: plan.storageLimitMb === null ? null : Number(plan.storageLimitMb),
      studentLimit: "studentLimit" in plan && typeof plan.studentLimit === "number" ? plan.studentLimit : null,
      institutionTypes: plan.institutionTypes.filter(
        (type): type is "COLLEGE" | "SCHOOL" | "ACADEMY" =>
          type === "COLLEGE" || type === "SCHOOL" || type === "ACADEMY",
      ),
      subscriptionCount: plan._count.subscriptions,
    })),
  };
}

export async function getInvoiceRegister(institutionId?: string, requestedPage = 1, paymentInvoiceId?: string, requestedPaymentPage = 1) {
  const where = institutionId ? { institutionId } : undefined;
  const pageSize = 25;
  const total = await prisma.invoice.count({ where });
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / pageSize)));
  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true, invoiceNumber: true, status: true, total: true, currency: true, issuedAt: true, dueAt: true,
      institution: { select: { name: true } },
      subscription: { select: { plan: { select: { name: true } } } },
      _count: { select: { payments: true } },
      payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { id: true, status: true, amount: true, currency: true, providerReference: true, paidAt: true } },
    },
  });
  const paymentPage = Math.min(Math.max(1, Number.isSafeInteger(requestedPaymentPage) ? requestedPaymentPage : 1), 1000000);
  const selected = invoices.find((invoice) => invoice.id === paymentInvoiceId);
  if (selected && paymentPage > 1) {
    selected.payments = await prisma.payment.findMany({
      where: { invoiceId: selected.id, ...(institutionId ? { invoice: { institutionId } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (Math.min(paymentPage, Math.max(1, Math.ceil(selected._count.payments / 10))) - 1) * 10,
      take: 10,
      select: { id: true, status: true, amount: true, currency: true, providerReference: true, paidAt: true },
    });
  }
  const selectedPaymentPage = selected ? Math.min(paymentPage, Math.max(1, Math.ceil(selected._count.payments / 10))) : 1;
  return { page, total, pageSize, selectedPaymentPage, invoices: invoices.map((invoice) => ({
    ...invoice, total: Number(invoice.total), issuedAt: invoice.issuedAt?.toISOString() ?? null, dueAt: invoice.dueAt?.toISOString() ?? null,
    payments: invoice.payments.map((payment) => ({ ...payment, amount: Number(payment.amount), paidAt: payment.paidAt?.toISOString() ?? null })),
  })) };
}
