import { NextRequest } from "next/server";
import { handlePaymentWebhook } from "@/lib/services/payments/webhook-handler";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const resolvedParams = await params;
  return handlePaymentWebhook(req, resolvedParams.token);
}
