import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { signGoogleLoginProof } from "@/lib/auth/jwt";
import {
  GoogleOAuthError,
  getGooglePortalRole,
  hasVerifiedSupabaseOAuthEmail,
  verifyGoogleIdToken,
} from "@/lib/auth/google-oauth";
import { normalizeEmail } from "@/lib/auth/email";
import { POST as loginWithCredentials } from "@/app/api/auth/login/route";
import { createClient } from "@/lib/supabase/server";

const cookiePath = "/api/auth/google/callback";
const transientCookieNames = [
  "google_oauth_provider",
  "google_oauth_state",
  "google_oauth_nonce",
  "google_oauth_verifier",
  "post_login_module",
];

type LoginResponse = {
  success?: boolean;
  error?: string;
  data?: { redirectUrl?: string };
};

function secureStringEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function clearTransientCookies(response: NextResponse) {
  for (const name of transientCookieNames) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: cookiePath,
      maxAge: 0,
    });
  }
}

function errorRedirect(requestUrl: string, message: string, role?: string) {
  const params = new URLSearchParams({ google_error: message });
  if (role) params.set("role", role.toLowerCase().replace("_", "-"));
  const response = NextResponse.redirect(
    new URL(`/login?${params.toString()}`, requestUrl),
  );
  clearTransientCookies(response);
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const provider = cookieStore.get("google_oauth_provider")?.value;
  const portalModule =
    cookieStore.get("post_login_module")?.value ||
    url.searchParams.get("module") ||
    "";
  const role = getGooglePortalRole(portalModule);
  const code = url.searchParams.get("code");

  if (!role) {
    return errorRedirect(request.url, "Google sign-in request has no valid portal selection.");
  }
  if (!code) {
    return errorRedirect(request.url, "Google sign-in was not completed.", role);
  }

  try {
    let email: string;

    if (provider === "supabase") {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user?.email) {
        return errorRedirect(request.url, "Google sign-in could not verify your account.", role);
      }

      const emailVerified =
        role === "SUPER_ADMIN"
          ? hasVerifiedSupabaseOAuthEmail(data.user)
          : Boolean(data.user.email_confirmed_at) ||
            data.user.user_metadata?.email_verified === true;
      if (!emailVerified) {
        return errorRedirect(request.url, "Google account email is not verified.", role);
      }
      email = normalizeEmail(data.user.email);
    } else if (provider === "direct") {
      const state = url.searchParams.get("state");
      const storedState = cookieStore.get("google_oauth_state")?.value;
      const nonce = cookieStore.get("google_oauth_nonce")?.value;
      const codeVerifier = cookieStore.get("google_oauth_verifier")?.value;
      const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

      if (
        !state ||
        !storedState ||
        !secureStringEqual(state, storedState) ||
        !nonce ||
        !codeVerifier ||
        !clientId ||
        !clientSecret ||
        !redirectUri
      ) {
        return errorRedirect(request.url, "Google sign-in state is invalid or expired.", role);
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        }).toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok) {
        return errorRedirect(request.url, "Google authorization code could not be exchanged.", role);
      }

      const tokenData: unknown = await tokenResponse.json();
      const idToken =
        tokenData && typeof tokenData === "object" && "id_token" in tokenData
          ? tokenData.id_token
          : undefined;
      if (typeof idToken !== "string" || !idToken) {
        return errorRedirect(request.url, "Google did not return a valid identity token.", role);
      }

      const profile = await verifyGoogleIdToken(idToken, clientId, nonce);
      email = profile.email;
    } else {
      return errorRedirect(request.url, "Google sign-in state is missing or expired.", role);
    }

    const googleProof = await signGoogleLoginProof({ email, role });
    const loginResponse = await loginWithCredentials(
      new NextRequest(new URL("/api/auth/login", url.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginType: "GOOGLE", googleProof }),
      }),
    );
    const loginData = await loginResponse.json() as LoginResponse;
    const destination = loginData.data?.redirectUrl;

    if (
      !loginResponse.ok ||
      !loginData.success ||
      typeof destination !== "string" ||
      !destination.startsWith("/") ||
      destination.startsWith("//")
    ) {
      const message = loginResponse.status === 403
        ? "This Google account does not belong to the selected portal."
        : "This Google account is not authorized to sign in.";
      return errorRedirect(request.url, message, role);
    }

    const response = NextResponse.redirect(new URL(destination, url.origin));
    for (const cookie of loginResponse.cookies.getAll()) {
      response.cookies.set(cookie);
    }
    clearTransientCookies(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[GoogleAuth] Callback failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      reason: error instanceof GoogleOAuthError ? error.message : undefined,
    });
    return errorRedirect(request.url, "Google sign-in failed. Please try again.", role);
  }
}
