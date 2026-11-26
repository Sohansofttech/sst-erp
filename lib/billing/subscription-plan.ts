import { z } from "zod";

export const optionalPlanLimit = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.coerce.number().int().min(1).max(100000000).optional(),
);

export function getInitialSubscriptionStatus(price: number): "ACTIVE" | "PAST_DUE" {
  return price === 0 ? "ACTIVE" : "PAST_DUE";
}
