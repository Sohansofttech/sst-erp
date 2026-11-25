export type SubscriptionPlanCycle = {
  billingCycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  customCycleDays: number | null;
};

export class InvalidBillingCycleError extends Error {
  constructor() {
    super("The selected subscription plan has an invalid billing cycle.");
    this.name = "InvalidBillingCycleError";
  }
}

function addMonthsClamped(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function getSubscriptionEnd(start: Date, plan: SubscriptionPlanCycle) {
  if (plan.billingCycle === "MONTHLY") return addMonthsClamped(start, 1);
  if (plan.billingCycle === "QUARTERLY") return addMonthsClamped(start, 3);
  if (plan.billingCycle === "YEARLY") return addMonthsClamped(start, 12);
  if (plan.billingCycle === "CUSTOM" && plan.customCycleDays && plan.customCycleDays > 0) {
    return new Date(start.getTime() + plan.customCycleDays * 24 * 60 * 60 * 1000);
  }
  throw new InvalidBillingCycleError();
}
