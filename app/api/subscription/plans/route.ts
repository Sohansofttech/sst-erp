import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { getPlanCatalogue } from "@/lib/subscriptions/management-data";
import { subscriptionApiError } from "@/lib/subscriptions/api-auth";
import { saveSubscriptionPlan } from "@/app/subscriptions/actions";
import { z } from "zod";

const optionalNumber = z.coerce.number().nullable().optional().transform((value) => value ?? null);
const createBody = z.object({
  code: z.string(), name: z.string(), description: z.string().optional().default(""),
  price: z.coerce.number(), currency: z.string().optional().default("INR"),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  customCycleDays: optionalNumber, studentLimit: optionalNumber, storageLimitMb: optionalNumber,
  institutionTypes: z.array(z.enum(["COLLEGE", "SCHOOL", "ACADEMY"])).max(3).optional().default([]),
  isActive: z.boolean().optional().default(true),
  features: z.array(z.object({ featureId: z.string(), enabled: z.boolean(), limitValue: optionalNumber })).optional().default([]),
});

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
    const active = request.nextUrl.searchParams.get("active");
    const skip = Number(request.nextUrl.searchParams.get("skip") ?? 0);
    const take = Number(request.nextUrl.searchParams.get("take") ?? 20);
    if (!Number.isInteger(skip) || skip < 0 || !Number.isInteger(take) || take < 1 || take > 100 || (active !== null && active !== "true" && active !== "false")) {
      return NextResponse.json({ error: "Invalid filter or pagination." }, { status: 400 });
    }
    const catalogue = await getPlanCatalogue();
    const plans = catalogue.plans.filter((plan) => active === null || plan.isActive === (active === "true"));
    return NextResponse.json({ data: plans.slice(skip, skip + take), pagination: { skip, take, total: plans.length }, studentLimitAvailable: catalogue.studentLimitAvailable });
  } catch (error) { return subscriptionApiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = createBody.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid plan data." }, { status: 400 });
    const result = await saveSubscriptionPlan(body.data);
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch (error) { return subscriptionApiError(error); }
}
