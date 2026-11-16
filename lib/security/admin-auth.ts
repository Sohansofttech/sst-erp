import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import db from "@/lib/db";

export interface ResolvedAdminContext {
  institutionId: string;
  userId?: string;
  userRole: string;
  isDevFallback: boolean;
}

export async function resolveAdminContext(req: NextRequest): Promise<ResolvedAdminContext> {
  const session = await getSession(req);

  if (session) {
    if (session.role === "ADMIN" || session.role === "SUPER_ADMIN") {
      return {
        institutionId: session.institutionId,
        userId: session.userId,
        userRole: session.role,
        isDevFallback: false,
      };
    }
    throw new Error("Forbidden: Account does not have Institution Admin privileges.");
  }

  // Developer / Direct access fallback
  const requestedInstId = req.headers.get("x-institution-id");
  if (requestedInstId) {
    return {
      institutionId: requestedInstId,
      userRole: "ADMIN",
      isDevFallback: true,
    };
  }

  // Find first institution in database or default to apex
  let defaultInstId = "inst_apex";
  try {
    const firstInst = await db.institution.findFirst({ select: { id: true } });
    if (firstInst) {
      defaultInstId = firstInst.id;
    }
  } catch {
    // DB might be offline or initializing
  }

  return {
    institutionId: defaultInstId,
    userRole: "ADMIN",
    isDevFallback: true,
  };
}

export function handleAdminApiError(error: any) {
  if (error?.digest?.startsWith("NEXT_")) {
    throw error;
  }
  console.error("Admin API error:", error);
  const status = error.message?.includes("Forbidden") ? 403 : 500;
  return NextResponse.json(
    {
      success: false,
      error: error.message || "An unexpected error occurred in Institution Admin portal.",
    },
    { status }
  );
}
