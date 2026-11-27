import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const destination =
    next &&
    (
      next === "/super-admin" ||
      next.startsWith("/super-admin/") ||
      next === "/subscriptions" ||
      next.startsWith("/subscriptions/")
    ) &&
    !next.startsWith("//")
      ? next
      : "/super-admin";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, request.url));
  }
  return NextResponse.redirect(new URL("/super-admin/login?error=auth_callback", request.url));
}
