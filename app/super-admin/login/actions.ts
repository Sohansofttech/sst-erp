"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { z } from "zod";
import { hasSuperAdminRole } from "@/lib/super-admin/authorization";
import { prisma } from "@/lib/super-admin/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "@/lib/security/login-rate-limiter";
import {
  getAdminMfaRecord,
  signMfaChallengeToken,
  MFA_CHALLENGE_COOKIE,
} from "@/lib/security/totp-mfa";
import { getClientIp } from "@/lib/security/client-ip";

export type LoginState = { error: string | null };

const loginSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim(),
  password: z.string().min(1, { error: "Enter your password." }),
});

export async function signIn(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your email and password." };

  const headersList = await headers();
  const clientIp = getClientIp(headersList);

  const rateLimit = await checkLoginRateLimit({ ip: clientIp, identifier: parsed.data.email });
  if (!rateLimit.allowed) {
    return {
      error: rateLimit.reason === "DATABASE_UNAVAILABLE"
        ? "Authentication service temporarily unavailable. Rate limit check failed."
        : "Too many failed login attempts. Please wait before trying again.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    await recordFailedLogin({ ip: clientIp, identifier: parsed.data.email });
    return { error: "Email or password is incorrect." };
  }

  await recordSuccessfulLogin({ identifier: parsed.data.email });

  try {
    if (!(await hasSuperAdminRole(data.user.id))) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "This account does not have active Super Admin access." };
    }
  } catch {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { error: "We could not verify your platform access. Please try again later." };
  }

  try {
    await prisma.platformAuditLog.create({ data: { userId: data.user.id, action: "SUPER_ADMIN_LOGIN", entity: "User", entityId: data.user.id, result: "SUCCESS", requestId: crypto.randomUUID() } });
  } catch {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { error: "Sign-in could not be recorded. Try again after database access is restored." };
  }

  // Check if Super Admin has MFA enrolled
  try {
    const mfaRecord = await getAdminMfaRecord(data.user.id);
    if (mfaRecord && mfaRecord.isEnrolled) {
      const challengeToken = await signMfaChallengeToken({
        userId: data.user.id,
        email: parsed.data.email,
      });

      // Invalidate local Supabase session until MFA is fully verified
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

      const cookieStore = await cookies();
      cookieStore.set({
        name: MFA_CHALLENGE_COOKIE,
        value: challengeToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 300,
      });

      redirect("/super-admin/mfa/verify");
    }
  } catch (mfaErr: any) {
    if (mfaErr?.digest?.startsWith("NEXT_REDIRECT")) {
      throw mfaErr;
    }
    console.error("[Server Action] Database failure verifying Super Admin MFA (failing closed):", mfaErr);
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { error: "Authentication service temporarily unavailable. Security verification failed." };
  }

  redirect("/super-admin");
}
