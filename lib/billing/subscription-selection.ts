export interface SubscriptionLifecycleEvent {
  id: string;
  action: string;
  createdAt: Date;
  details?: unknown;
}

export interface SubscriptionSelectionRecord {
  id: string;
  institutionId: string;
  planId?: string;
  plan?: { code: string };
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
  events?: readonly SubscriptionLifecycleEvent[];
}

export const SUBSCRIPTION_LIFECYCLE_EVENT_ACTIONS = [
  "ASSIGNED",
  "ASSIGNED_FREE",
  "ASSIGNED_PENDING_PAYMENT",
  "PURCHASED",
  "RENEWED",
  "REPLACED_BY_PAID_PLAN",
  "STATUS_ACTIVE",
  "STATUS_CANCELED",
  "STATUS_EXPIRED",
  "STATUS_SUSPENDED",
  "SUBSCRIPTION_ACTIVATED",
  "SUBSCRIPTION_RENEWED",
  "TRIAL_ASSIGNED",
  "TRIAL_EXPIRED",
] as const;

const ACTIVATION_EVENT_ACTIONS = new Set<string>([
  "ASSIGNED",
  "ASSIGNED_FREE",
  "PURCHASED",
  "RENEWED",
  "STATUS_ACTIVE",
  "SUBSCRIPTION_ACTIVATED",
  "SUBSCRIPTION_RENEWED",
  "TRIAL_ASSIGNED",
]);

const TERMINAL_EVENT_ACTIONS = new Set<string>([
  "STATUS_CANCELED",
  "STATUS_EXPIRED",
  "STATUS_SUSPENDED",
  "TRIAL_EXPIRED",
]);

function newestEventFirst(
  left: SubscriptionLifecycleEvent,
  right: SubscriptionLifecycleEvent
): number {
  return (
    right.createdAt.getTime() - left.createdAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}

function latestEvent(
  subscription: SubscriptionSelectionRecord
): SubscriptionLifecycleEvent | undefined {
  return [...(subscription.events ?? [])].sort(newestEventFirst)[0];
}

function latestActivationTime(subscription: SubscriptionSelectionRecord): number {
  const activationEvent = [...(subscription.events ?? [])]
    .filter((event) => ACTIVATION_EVENT_ACTIONS.has(event.action))
    .sort(newestEventFirst)[0];

  return Math.max(
    activationEvent?.createdAt.getTime() ?? Number.NEGATIVE_INFINITY,
    subscription.startsAt.getTime(),
    subscription.updatedAt?.getTime() ?? Number.NEGATIVE_INFINITY,
    subscription.createdAt.getTime()
  );
}

function hasElapsedTerm(
  subscription: SubscriptionSelectionRecord,
  now: Date
): boolean {
  return (
    (subscription.status === "ACTIVE" ||
      subscription.status === "TRIALING" ||
      subscription.status === "EXPIRED") &&
    Boolean(subscription.endsAt && subscription.endsAt.getTime() <= now.getTime())
  );
}

function latestBlockingTime(
  subscription: SubscriptionSelectionRecord,
  now: Date
): number {
  const statusEvent = [...(subscription.events ?? [])]
    .filter((event) => TERMINAL_EVENT_ACTIONS.has(event.action))
    .sort(newestEventFirst)[0];

  return Math.max(
    statusEvent?.createdAt.getTime() ?? Number.NEGATIVE_INFINITY,
    hasElapsedTerm(subscription, now)
      ? subscription.endsAt?.getTime() ?? Number.NEGATIVE_INFINITY
      : Number.NEGATIVE_INFINITY,
    subscription.status === "CANCELED"
      ? subscription.cancelledAt?.getTime() ?? Number.NEGATIVE_INFINITY
      : Number.NEGATIVE_INFINITY,
    subscription.updatedAt?.getTime() ?? Number.NEGATIVE_INFINITY,
    subscription.createdAt.getTime()
  );
}

function hasExplicitBlockingEvidence(subscription: SubscriptionSelectionRecord): boolean {
  return (
    (subscription.events ?? []).some((event) => TERMINAL_EVENT_ACTIONS.has(event.action)) ||
    (subscription.status === "CANCELED" && Boolean(subscription.cancelledAt))
  );
}

function getStringDetail(event: SubscriptionLifecycleEvent, key: string): string | null {
  if (!event.details || typeof event.details !== "object" || Array.isArray(event.details)) {
    return null;
  }

  const value = (event.details as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function newestFirst<T extends SubscriptionSelectionRecord>(left: T, right: T): number {
  return (
    right.startsAt.getTime() - left.startsAt.getTime() ||
    right.createdAt.getTime() - left.createdAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}

export function isSubscriptionCurrentlyEffective(
  subscription: SubscriptionSelectionRecord,
  now: Date
): boolean {
  return (
    (subscription.status === "ACTIVE" || subscription.status === "TRIALING") &&
    subscription.startsAt.getTime() <= now.getTime() &&
    (!subscription.endsAt || subscription.endsAt.getTime() > now.getTime())
  );
}

function isPendingPayment(subscription: SubscriptionSelectionRecord): boolean {
  return (
    subscription.status === "PAST_DUE" &&
    latestEvent(subscription)?.action === "ASSIGNED_PENDING_PAYMENT"
  );
}

function hasEffectivePaidReplacement(
  canceled: SubscriptionSelectionRecord,
  subscriptions: readonly SubscriptionSelectionRecord[],
  now: Date
): boolean {
  const replacementEvent = [...(canceled.events ?? [])]
    .filter((event) => event.action === "REPLACED_BY_PAID_PLAN")
    .sort(newestEventFirst)[0];
  if (
    !replacementEvent ||
    (canceled.events ?? []).some(
      (event) =>
        event.action !== "REPLACED_BY_PAID_PLAN" &&
        event.createdAt.getTime() >= replacementEvent.createdAt.getTime()
    )
  ) {
    return false;
  }

  const invoiceId = getStringDetail(replacementEvent, "invoiceId");
  const replacementPlanId = getStringDetail(replacementEvent, "replacementPlanId");
  if (!invoiceId || !replacementPlanId) {
    return false;
  }

  return subscriptions.some((replacement) => {
    if (
      replacement.id === canceled.id ||
      replacement.institutionId !== canceled.institutionId ||
      replacement.planId !== replacementPlanId ||
      !isSubscriptionCurrentlyEffective(replacement, now)
    ) {
      return false;
    }

    return (replacement.events ?? []).some(
      (event) =>
        event.action === "PURCHASED" &&
        event.createdAt.getTime() >= replacementEvent.createdAt.getTime() &&
        getStringDetail(event, "invoiceId") === invoiceId
    );
  });
}

function isBlockingSubscription(
  subscription: SubscriptionSelectionRecord,
  subscriptions: readonly SubscriptionSelectionRecord[],
  now: Date
): boolean {
  if (hasElapsedTerm(subscription, now)) {
    return true;
  }

  if (subscription.status === "CANCELED") {
    return !hasEffectivePaidReplacement(subscription, subscriptions, now);
  }

  if (subscription.status === "SUSPENDED" || subscription.status === "EXPIRED") {
    return true;
  }

  return subscription.status === "PAST_DUE" && !isPendingPayment(subscription);
}

function expiredTermIsSuperseded(
  blocker: SubscriptionSelectionRecord,
  current: SubscriptionSelectionRecord | undefined,
  now: Date
): boolean {
  return Boolean(
    current &&
    hasElapsedTerm(blocker, now) &&
    blocker.endsAt &&
    current.startsAt.getTime() >= blocker.endsAt.getTime()
  );
}

export function selectCurrentSubscription<T extends SubscriptionSelectionRecord>(
  subscriptions: readonly T[],
  institutionId: string,
  now: Date
): T | null {
  const tenantSubscriptions = subscriptions.filter(
    (subscription) => subscription.institutionId === institutionId
  );
  const effective = tenantSubscriptions
    .filter((subscription) => isSubscriptionCurrentlyEffective(subscription, now))
    .sort(
      (left, right) =>
        latestActivationTime(right) - latestActivationTime(left) ||
        newestFirst(left, right)
    );

  const blocking = tenantSubscriptions
    .filter(
      (subscription) =>
        subscription.startsAt.getTime() <= now.getTime() &&
        isBlockingSubscription(subscription, tenantSubscriptions, now)
    )
    .sort(
      (left, right) =>
        latestBlockingTime(right, now) - latestBlockingTime(left, now) ||
        newestFirst(left, right)
    );

  const current = effective[0];
  const latestBlocker = blocking[0];
  const blockerIsAtLeastAsRecent = latestBlocker
    ? !expiredTermIsSuperseded(latestBlocker, current, now) &&
      (latestBlockingTime(latestBlocker, now) >
        (current ? latestActivationTime(current) : -Infinity) ||
      (current &&
        latestBlockingTime(latestBlocker, now) === latestActivationTime(current) &&
        (hasExplicitBlockingEvidence(latestBlocker) ||
          newestFirst(latestBlocker, current) <= 0)))
    : false;
  if (
    latestBlocker &&
    (!current || blockerIsAtLeastAsRecent)
  ) {
    return latestBlocker;
  }

  if (current) {
    return current;
  }

  const started = tenantSubscriptions
    .filter((subscription) => subscription.startsAt.getTime() <= now.getTime())
    .sort(
      (left, right) =>
        latestBlockingTime(right, now) - latestBlockingTime(left, now) ||
        newestFirst(left, right)
    );

  if (started.length > 0) {
    return started[0];
  }

  return tenantSubscriptions.sort(
    (left, right) =>
      left.startsAt.getTime() - right.startsAt.getTime() || newestFirst(left, right)
  )[0] ?? null;
}

export function calculateSubscriptionRemainingDays(
  subscription: SubscriptionSelectionRecord,
  now: Date
): number {
  if (
    subscription.startsAt.getTime() > now.getTime() ||
    !subscription.endsAt ||
    subscription.endsAt.getTime() <= now.getTime()
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((subscription.endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );
}
