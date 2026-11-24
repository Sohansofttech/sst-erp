import { NextResponse } from "next/server";
import {
  createGoogleOAuthParameters,
  getGooglePortalRole,
} from "@/lib/auth/google-oauth";
import { createClient } from "@/lib/supabase/server";

const cookiePath = "/api/auth/google/callback";

function setTransientCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: cookiePath,
    maxAge: 300,
  });
}

function errorRedirect(requestUrl: string, message: string, role?: string) {
  const params = new URLSearchParams({ google_error: message });
  if (role) params.set("role", role.toLowerCase().replace("_", "-"));
  return NextResponse.redirect(
    new URL(`/login?${params.toString()}`, requestUrl),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const portalModule = (url.searchParams.get("module") || "").trim().toLowerCase();
  const role = getGooglePortalRole(portalModule);
  if (!role) {
    return errorRedirect(request.url, "Select a valid portal before using Google sign-in.");
  }

  const hasSupabaseOAuth =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (hasSupabaseOAuth) {
    try {
      const supabase = await createClient();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
      const redirectTo = new URL("/api/auth/google/callback", siteUrl);
      redirectTo.searchParams.set("module", portalModule);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo.toString(),
          queryParams: { prompt: "select_account" },
        },
      });
      if (error || !data.url) {
        return errorRedirect(request.url, "Google sign-in is unavailable. Check the Supabase Google provider configuration.", role);
      }

      const response = NextResponse.redirect(data.url);
      setTransientCookie(response, "google_oauth_provider", "supabase");
      setTransientCookie(response, "post_login_module", portalModule);
      return response;
    } catch (error) {
      console.error("[GoogleAuth] Supabase authorization failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      return errorRedirect(request.url, "Google sign-in is unavailable. Check the Supabase Google provider configuration.", role);
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET?.trim() || !redirectUri) {
    return errorRedirect(
      request.url,
      "Google sign-in is not configured. Configure the Google OAuth credentials or enable Google in Supabase.",
      role,
    );
  }

  const { state, nonce, codeVerifier, codeChallenge } = createGoogleOAuthParameters();
  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const response = NextResponse.redirect(googleUrl);
  setTransientCookie(response, "google_oauth_provider", "direct");
  setTransientCookie(response, "google_oauth_state", state);
  setTransientCookie(response, "google_oauth_nonce", nonce);
  setTransientCookie(response, "google_oauth_verifier", codeVerifier);
  setTransientCookie(response, "post_login_module", portalModule);
  return response;
}
