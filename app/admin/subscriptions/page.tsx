import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import db from "@/lib/db";
import { countInstitutionStudents } from "@/lib/billing/student-usage";
import { hasStudentLimitColumn } from "@/lib/subscriptions/management-data";
import { planCompatibilityWhere } from "@/lib/institution-type-config";
import { InstitutionSubscriptions } from "@/components/admin/InstitutionSubscriptions";

export const instant = false;

export default async function InstitutionSubscriptionsPage() {
  await connection();
  let session;
  try {
    session = await requireRole(undefined, ["ADMIN"]);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/login");
    throw error;
  }

  const institutionId = session.institutionId;
  if (!institutionId) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Your admin account is not linked to an institution billing profile.</p>;
  }
  const institution = await db.platformInstitution.findFirst({
    where: { id: institutionId, archivedAt: null },
    select: { id: true, type: true },
  });
  if (!institution) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Your institution billing profile is unavailable. Contact your Super Admin.</p>;
  }

  const now = new Date();
  const studentLimitAvailable = await hasStudentLimitColumn();
  const planSelect = {
    name: true,
    price: true,
    currency: true,
    billingCycle: true,
    customCycleDays: true,
        storageLimitMb: true,
    ...(studentLimitAvailable ? { studentLimit: true } : {}),
  } as const;
  const [plans, subscriptions, invoices, registeredStudents, currentSubscription] = await Promise.all([
    db.subscriptionPlan.findMany({
      where: { isActive: true, archivedAt: null, ...planCompatibilityWhere(institution.type) },
      orderBy: { price: "asc" },
      take: 100,
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        billingCycle: true,
        customCycleDays: true,
            storageLimitMb: true,
        ...(studentLimitAvailable ? { studentLimit: true } : {}),
        features: {
          where: { enabled: true, feature: { isAvailable: true } },
          include: { feature: { select: { name: true } } },
        },
      },
    }),
    db.institutionSubscription.findMany({
      where: { institutionId: institution.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        planId: true,
        status: true,
        startsAt: true,
        endsAt: true,
        plan: { select: planSelect },
      },
    }),
    db.invoice.findMany({
      where: { institutionId: institution.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
          select: { amount: true, currency: true, status: true, provider: true, createdAt: true },
        },
      },
    }),
    countInstitutionStudents(db, institution.id),
    db.institutionSubscription.findFirst({
      where: {
        institutionId: institution.id,
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: "desc" },
      select: { plan: { select: planSelect } },
    }),
  ]);

  return (
    <InstitutionSubscriptions
      usage={{
        registeredStudents,
        studentLimitAvailable,
        activePlanName: currentSubscription?.plan.name ?? null,
        studentLimit: currentSubscription && "studentLimit" in currentSubscription.plan
          ? currentSubscription.plan.studentLimit
          : null,
        planPrice: currentSubscription ? Number(currentSubscription.plan.price) : null,
        planCurrency: currentSubscription?.plan.currency ?? null,
        billingCycle: currentSubscription?.plan.billingCycle ?? null,
        customCycleDays: currentSubscription?.plan.customCycleDays ?? null,
        storageLimitMb: currentSubscription?.plan.storageLimitMb?.toString() ?? null,
        hasActivePlan: currentSubscription !== null,
      }}
      plans={plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: Number(plan.price),
        currency: plan.currency,
        billingCycle: plan.billingCycle,
        customCycleDays: plan.customCycleDays,
        studentLimit: "studentLimit" in plan ? plan.studentLimit : null,
        storageLimitMb: plan.storageLimitMb?.toString() ?? null,
        features: plan.features.map((item) => item.feature.name),
      }))}
      subscriptions={subscriptions.map((subscription) => ({
        id: subscription.id,
        planId: subscription.planId,
        planName: subscription.plan.name,
        planPrice: Number(subscription.plan.price),
        planCurrency: subscription.plan.currency,
        billingCycle: subscription.plan.billingCycle,
        customCycleDays: subscription.plan.customCycleDays,
        studentLimit: "studentLimit" in subscription.plan ? subscription.plan.studentLimit : null,
        storageLimitMb: subscription.plan.storageLimitMb?.toString() ?? null,
        status: subscription.status,
        startsAt: subscription.startsAt.toISOString(),
        endsAt: subscription.endsAt?.toISOString() ?? null,
      }))}
      invoices={invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        description: invoice.description,
        total: Number(invoice.total),
        currency: invoice.currency,
        status: invoice.status,
        createdAt: invoice.createdAt.toISOString(),
        payments: invoice.payments.map((payment) => ({
          amount: Number(payment.amount),
          currency: payment.currency,
          status: payment.status,
          provider: payment.provider,
          createdAt: payment.createdAt.toISOString(),
        })),
      }))}
    />
  );
}
