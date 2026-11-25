export type SamplePlan = {
  id: string;
  name: string;
  description: string;
  priceLabel: string;
  samplePrice: string;
  currency: string;
  billingCycle: "Monthly" | "Quarterly" | "Yearly";
  studentLimit: number;
  features: string[];
  active: boolean;
};

export type SampleInstitutionSubscription = {
  id: string;
  institution: string;
  code: string;
  plan: string;
  studentLimit: number;
  students: number;
  startsAt: string;
  expiresAt: string;
  subscriptionStatus: "Active" | "Pending" | "Expired";
  paymentStatus: "Succeeded" | "Pending" | "Failed";
};

export type SampleTransaction = {
  id: string;
  institution: string;
  plan: string;
  amount: number;
  currency: string;
  date: string;
  method: string;
  status: "Succeeded" | "Pending" | "Failed";
};

export const SAMPLE_PLANS: SamplePlan[] = [
  {
    id: "sample-basic",
    name: "Basic",
    description: "Core tools for a growing institution.",
    priceLabel: "Sample pricing — not configured",
    samplePrice: "",
    currency: "INR",
    billingCycle: "Monthly",
    studentLimit: 500,
    features: ["Student management", "Academic records", "Email support"],
    active: true,
  },
  {
    id: "sample-standard",
    name: "Standard",
    description: "Expanded capacity and administration features.",
    priceLabel: "Sample pricing — not configured",
    samplePrice: "",
    currency: "INR",
    billingCycle: "Quarterly",
    studentLimit: 1_500,
    features: ["Everything in Basic", "Attendance tools", "Priority support"],
    active: true,
  },
  {
    id: "sample-premium",
    name: "Premium",
    description: "Advanced workflows for established institutions.",
    priceLabel: "Sample pricing — not configured",
    samplePrice: "",
    currency: "INR",
    billingCycle: "Yearly",
    studentLimit: 3_000,
    features: ["Everything in Standard", "Reports and analytics", "Dedicated support"],
    active: true,
  },
  {
    id: "sample-enterprise",
    name: "Enterprise",
    description: "High capacity for multi-campus operations.",
    priceLabel: "Sample pricing — not configured",
    samplePrice: "",
    currency: "INR",
    billingCycle: "Yearly",
    studentLimit: 10_000,
    features: ["Everything in Premium", "Multi-campus tools", "Priority onboarding"],
    active: false,
  },
];

export const SAMPLE_INSTITUTIONS: SampleInstitutionSubscription[] = [
  {
    id: "sample-inst-001",
    institution: "Northstar Demo Academy",
    code: "DEMO-001",
    plan: "Standard",
    studentLimit: 1_500,
    students: 1_126,
    startsAt: "2026-04-01",
    expiresAt: "2027-03-31",
    subscriptionStatus: "Active",
    paymentStatus: "Succeeded",
  },
  {
    id: "sample-inst-002",
    institution: "Cedar Grove Demo College",
    code: "DEMO-002",
    plan: "Basic",
    studentLimit: 500,
    students: 372,
    startsAt: "2026-08-01",
    expiresAt: "2027-07-31",
    subscriptionStatus: "Active",
    paymentStatus: "Succeeded",
  },
  {
    id: "sample-inst-003",
    institution: "Bluebird Demo Institute",
    code: "DEMO-003",
    plan: "Premium",
    studentLimit: 3_000,
    students: 2_614,
    startsAt: "2025-12-01",
    expiresAt: "2026-12-01",
    subscriptionStatus: "Active",
    paymentStatus: "Pending",
  },
  {
    id: "sample-inst-004",
    institution: "Summit Demo School",
    code: "DEMO-004",
    plan: "Basic",
    studentLimit: 500,
    students: 218,
    startsAt: "2025-09-01",
    expiresAt: "2026-09-01",
    subscriptionStatus: "Expired",
    paymentStatus: "Failed",
  },
  {
    id: "sample-inst-005",
    institution: "Willow Demo University",
    code: "DEMO-005",
    plan: "Enterprise",
    studentLimit: 10_000,
    students: 7_845,
    startsAt: "2026-11-01",
    expiresAt: "2027-10-31",
    subscriptionStatus: "Pending",
    paymentStatus: "Pending",
  },
  {
    id: "sample-inst-006",
    institution: "Harbor Demo School",
    code: "DEMO-006",
    plan: "Standard",
    studentLimit: 1_500,
    students: 984,
    startsAt: "2026-02-01",
    expiresAt: "2027-01-31",
    subscriptionStatus: "Active",
    paymentStatus: "Succeeded",
  },
  {
    id: "sample-inst-007",
    institution: "Meadow Demo College",
    code: "DEMO-007",
    plan: "Basic",
    studentLimit: 500,
    students: 491,
    startsAt: "2026-01-01",
    expiresAt: "2026-12-01",
    subscriptionStatus: "Active",
    paymentStatus: "Succeeded",
  },
];

export const SAMPLE_TRANSACTIONS: SampleTransaction[] = [
  { id: "SAMPLE-TXN-001", institution: "Northstar Demo Academy", plan: "Standard", amount: 12_500, currency: "INR", date: "2026-11-23", method: "Sample card", status: "Succeeded" },
  { id: "SAMPLE-TXN-002", institution: "Cedar Grove Demo College", plan: "Basic", amount: 4_500, currency: "INR", date: "2026-11-22", method: "Sample UPI", status: "Pending" },
  { id: "SAMPLE-TXN-003", institution: "Bluebird Demo Institute", plan: "Premium", amount: 36_000, currency: "INR", date: "2026-11-21", method: "Sample bank transfer", status: "Succeeded" },
  { id: "SAMPLE-TXN-004", institution: "Summit Demo School", plan: "Basic", amount: 4_500, currency: "INR", date: "2026-11-20", method: "Sample UPI", status: "Failed" },
  { id: "SAMPLE-TXN-005", institution: "Willow Demo University", plan: "Enterprise", amount: 95_000, currency: "INR", date: "2026-11-19", method: "Sample card", status: "Pending" },
  { id: "SAMPLE-TXN-006", institution: "Harbor Demo School", plan: "Standard", amount: 12_500, currency: "INR", date: "2026-11-18", method: "Sample bank transfer", status: "Succeeded" },
];

export const SAMPLE_MONTHS = [
  { label: "Jun", subscriptions: 38, revenue: 72 },
  { label: "Jul", subscriptions: 44, revenue: 81 },
  { label: "Aug", subscriptions: 51, revenue: 68 },
  { label: "Sep", subscriptions: 57, revenue: 93 },
  { label: "Oct", subscriptions: 63, revenue: 88 },
  { label: "Nov", subscriptions: 71, revenue: 100 },
];

export const SAMPLE_RENEWALS = [
  { institution: "Bluebird Demo Institute", plan: "Premium", date: "01 Dec 2026", days: 7 },
  { institution: "Meadow Demo College", plan: "Basic", date: "01 Dec 2026", days: 7 },
  { institution: "Cedar Grove Demo College", plan: "Basic", date: "15 Dec 2026", days: 21 },
];

export const SAMPLE_ACTIVITY = [
  { title: "Sample subscription activated", detail: "Northstar Demo Academy · Standard", time: "2 hours ago" },
  { title: "Sample plan change requested", detail: "Harbor Demo School · Standard", time: "Yesterday" },
  { title: "Sample renewal reminder queued", detail: "Bluebird Demo Institute · Premium", time: "2 days ago" },
];

export const SAMPLE_INSTITUTION_ADMIN = {
  plan: "Standard (sample)",
  studentLimit: 1_500,
  registeredStudents: 1_126,
  startsAt: "01 Apr 2026",
  expiresAt: "31 Mar 2027",
};
