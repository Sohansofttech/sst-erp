import "server-only";
import { NextResponse } from "next/server";

export function subscriptionApiError(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  const redirect = typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT");
  if (redirect) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (error instanceof Error && error.message.startsWith("Super Admin access is required")) return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
  console.error("[SubscriptionCenter] API request failed", error);
  return NextResponse.json({ error: "The request could not be completed." }, { status: 500 });
}
