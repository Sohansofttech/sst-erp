import type { SubscriptionPortalScope } from "@/lib/subscriptions/portal-data";

type SubscribablePeriod = {
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  status: string;
};

export function institutionSubscriptionWhere(scope: SubscriptionPortalScope) {
  return scope.role === "INSTITUTION_ADMIN" ? { institutionId: scope.institutionId } : undefined;
}

export function institutionPaymentWhere(scope: SubscriptionPortalScope) {
  return scope.role === "INSTITUTION_ADMIN"
    ? { invoice: { institutionId: scope.institutionId } }
    : undefined;
}

export function currentInstitutionSubscription<T extends SubscribablePeriod>(
  subscriptions: T[],
  now: Date,
): T | null {
  const ordered = [...subscriptions].sort((a, b) =>
    b.startsAt.getTime() - a.startsAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return ordered.find((subscription) =>
    subscription.startsAt <= now
      && (!subscription.endsAt || subscription.endsAt >= now)
      && subscription.status !== "EXPIRED",
  ) ?? ordered[0] ?? null;
}

export function institutionSubscriptionStatus(
  subscription: SubscribablePeriod | null,
  now: Date,
): string {
  if (!subscription) return "NO_SUBSCRIPTION";
  if (subscription.endsAt && subscription.endsAt < now && subscription.status !== "CANCELED") {
    return "EXPIRED";
  }
  return subscription.status;
}

export function summarizePayments(payments: Array<{ status: string; amount: number; currency: string }>) {
  const counts = new Map<string, number>();
  const revenueInMinorUnits = new Map<string, number>();
  for (const payment of payments) {
    counts.set(payment.status, (counts.get(payment.status) ?? 0) + 1);
    if (payment.status === "SUCCEEDED") {
      const amountInMinorUnits = Math.round(payment.amount * 100);
      revenueInMinorUnits.set(
        payment.currency,
        (revenueInMinorUnits.get(payment.currency) ?? 0) + amountInMinorUnits,
      );
    }
  }
  return {
    counts,
    revenueByCurrency: Array.from(revenueInMinorUnits, ([currency, amount]) => ({
      currency,
      amount: Number(amount) / 100,
    })),
  };
}
