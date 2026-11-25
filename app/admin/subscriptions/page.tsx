import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import db from "@/lib/db";
import { countInstitutionStudents } from "@/lib/billing/student-usage";
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
    select: { id: true },
  });
  if (!institution) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Your institution billing profile is unavailable. Contact your Super Admin.</p>;
  }

  const now = new Date();
  const [plans, subscriptions, invoices, registeredStudents, currentSubscription] = await Promise.all([
    db.subscriptionPlan.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { price: "asc" },
      take: 100,
      include: {
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
      include: { plan: { select: { name: true, studentLimit: true } } },
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
      select: { plan: { select: { name: true, studentLimit: true } } },
    }),
  ]);

  return (
    <InstitutionSubscriptions
      usage={{
        registeredStudents,
        activePlanName: currentSubscription?.plan.name ?? null,
        studentLimit: currentSubscription?.plan.studentLimit ?? null,
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
        studentLimit: plan.studentLimit,
        storageLimitMb: plan.storageLimitMb?.toString() ?? null,
        features: plan.features.map((item) => item.feature.name),
      }))}
      subscriptions={subscriptions.map((subscription) => ({
        id: subscription.id,
        planId: subscription.planId,
        planName: subscription.plan.name,
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
