export type ManagedFeature = { id: string; name: string; code: string; isAvailable: boolean };
export type ManagedPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billingCycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  customCycleDays: number | null;
  price: number;
  currency: string;
  studentLimit: number | null;
  storageLimitMb: number | null;
  institutionTypes: Array<"COLLEGE" | "SCHOOL" | "ACADEMY">;
  isActive: boolean;
  subscriptionCount: number;
  features: Array<{ featureId: string; enabled: boolean; limitValue: number | null }>;
};
export type PlanCatalogue = { plans: ManagedPlan[]; features: ManagedFeature[]; studentLimitAvailable: boolean };
export type ActionResult = { success: true; message: string } | { success: false; message: string };
