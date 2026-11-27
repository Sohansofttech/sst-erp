import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/super-admin/require-super-admin";
import { getPlanCatalogue } from "@/lib/subscriptions/management-data";
import { subscriptionApiError } from "@/lib/subscriptions/api-auth";
import { saveSubscriptionPlan } from "@/app/subscriptions/actions";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    await requireSuperAdmin();
    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: "Invalid plan ID." }, { status: 400 });
    const plan = (await getPlanCatalogue()).plans.find((item) => item.id === id.data);
    return plan ? NextResponse.json(plan) : NextResponse.json({ error: "Plan not found." }, { status: 404 });
  } catch (error) { return subscriptionApiError(error); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    await requireSuperAdmin();
    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: "Invalid plan ID." }, { status: 400 });
    const plan = (await getPlanCatalogue()).plans.find((item) => item.id === id.data);
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    const result = await saveSubscriptionPlan({ ...plan, ...body, id: id.data, description: (body as { description?: unknown }).description ?? plan.description ?? "" });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) { return subscriptionApiError(error); }
}
