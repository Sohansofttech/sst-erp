import { NextRequest, NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/lib/services/payments/webhook-handler";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing webhook token query parameter" }, { status: 400 });
  }
  return handlePaymentWebhook(req, token);
}
