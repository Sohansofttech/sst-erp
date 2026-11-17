import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SessionUser } from "@/types";
import { AUTH_COOKIE_NAME, verifyToken } from "./jwt";

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

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Access denied: insufficient permissions or tenant violation") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireAuth(req?: NextRequest): Promise<SessionUser> {
  const session = await getSession(req);
  if (!session) {
    throw new UnauthorizedError("Please log in to continue");
  }
  return session;
}

export async function requireRole(
  req: NextRequest | undefined,
  allowedRoles: string[]
): Promise<SessionUser> {
  const session = await requireAuth(req);
  if (!allowedRoles.includes(session.role)) {
    throw new ForbiddenError(`Access restricted to roles: ${allowedRoles.join(", ")}`);
  }
  return session;
}
