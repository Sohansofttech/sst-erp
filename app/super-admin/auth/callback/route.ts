import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSuperAdminRole } from "@/lib/super-admin/authorization";
import {
  getAdminMfaRecord,
  signMfaChallengeToken,
  MFA_CHALLENGE_COOKIE,
} from "@/lib/security/totp-mfa";

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      const isSuperAdmin = await hasSuperAdminRole(data.user.id);
      if (isSuperAdmin) {
        try {
          const mfaRecord = await getAdminMfaRecord(data.user.id);
          if (mfaRecord && mfaRecord.isEnrolled) {
            const challengeToken = await signMfaChallengeToken({
              userId: data.user.id,
              email: data.user.email || "",
            });
            await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
            const res = NextResponse.redirect(new URL("/super-admin/mfa/verify", request.url));
            res.cookies.set({
              name: MFA_CHALLENGE_COOKIE,
              value: challengeToken,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              path: "/",
              maxAge: 300,
            });
            return res;
          }
        } catch (mfaErr) {
          console.error("[OAuth Callback] Database failure checking Super Admin MFA (failing closed):", mfaErr);
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          return NextResponse.redirect(new URL("/super-admin/login?error=security_verification_failed", request.url));
        }
      }
      return NextResponse.redirect(new URL(destination, request.url));
    }
  }
  return NextResponse.redirect(new URL("/super-admin/login?error=auth_callback", request.url));
}
