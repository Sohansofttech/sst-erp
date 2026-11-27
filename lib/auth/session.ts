import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SessionUser } from "@/types";
import { AUTH_COOKIE_NAME, verifyToken, computePasswordSignature } from "./jwt";
import { UnauthorizedError, ForbiddenError } from "./errors";
import db from "@/lib/db";

export { UnauthorizedError, ForbiddenError };

export async function getSession(req?: NextRequest): Promise<SessionUser | null> {
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = req.cookies.get(AUTH_COOKIE_NAME)?.value || req.cookies.get("sst_session")?.value;
    }

    if (!token) {
      const rawCookie = req.headers.get("cookie");
      if (rawCookie) {
        const match = rawCookie.match(new RegExp(`(?:^|; )(?:${AUTH_COOKIE_NAME}|sst_session)=([^;]*)`));
        if (match) token = decodeURIComponent(match[1]);
      }
    }
  }

  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(AUTH_COOKIE_NAME)?.value || cookieStore.get("sst_session")?.value;
    } catch {
      // In non-request contexts
    }
  }

  if (!token) return null;
  const session = await verifyToken(token);
  if (session && session.role === "PARENT" && req) {
    const activeChildHeader = req.headers.get("x-active-child");
    let activeChildCookie = req.cookies.get("erp_active_child")?.value;
    if (!activeChildCookie) {
      const rawCookie = req.headers.get("cookie");
      if (rawCookie) {
        const match = rawCookie.match(/(?:^|; )erp_active_child=([^;]*)/);
        if (match) activeChildCookie = decodeURIComponent(match[1]);
      }
    }
    if (activeChildHeader) {
      session.activeChildId = activeChildHeader;
    } else if (activeChildCookie) {
      session.activeChildId = activeChildCookie;
    }
  }
  return session;
}

export async function requireAuth(req?: NextRequest): Promise<SessionUser> {
  const session = await getSession(req);
  if (!session) {
    throw new UnauthorizedError("Please log in to continue");
  }

  // Live account status and password revocation verification
  if (session.userId) {
    const userRecord = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, isActive: true, status: true, passwordHash: true },
    });

    if (!userRecord || !userRecord.isActive || userRecord.status !== "ACTIVE") {
      throw new UnauthorizedError("Account has been deactivated, suspended, or locked.");
    }

    // Reject legacy tokens that lack cryptographic password signature
    if (!session.passwordSig) {
      throw new UnauthorizedError("Session has expired or lacks required security signature. Please log in again.");
    }

    // Instant session invalidation: verify JWT password signature against current DB password hash
    const currentSig = computePasswordSignature(userRecord.passwordHash || "");
    if (session.passwordSig !== currentSig) {
      throw new UnauthorizedError("Session has been invalidated due to a password reset or change. Please log in with your current credentials.");
    }
  }

  // Server-side mandatory password change enforcement
  if (session.mustChangePassword) {
    const pathname = req?.nextUrl?.pathname || "";
    const isAllowedAuthRoute =
      pathname.startsWith("/api/auth/change-password") ||
      pathname.startsWith("/api/auth/me") ||
      pathname.startsWith("/api/auth/logout");

    if (!isAllowedAuthRoute) {
      throw new ForbiddenError(
        "Password change required: You must change your temporary password before accessing portal features."
      );
    }
  }

  return session;
}

export async function requireRole(
  req: NextRequest | undefined,
  allowedRoles: string[]
): Promise<SessionUser> {
  const session = await requireAuth(req);
  if (!allowedRoles.includes(session.role)) {
    throw new ForbiddenError(`Access denied: restricted to roles: ${allowedRoles.join(", ")}`);
  }
  return session;
}
