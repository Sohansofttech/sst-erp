import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertSupportAccess, SUPPORT_READ } from "@/lib/security/support-access";
import db from "@/lib/db";
import {
  getInstitutionSubscriptionStatus,
  getAvailableSubscriptionPlans,
  getSubscriptionPlanById,
} from "@/lib/services/subscription.service";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session || !session.userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required to access Subscription Portal." },
        { status: 401 }
      );
    }

    const roleUpper = (session.role || "").toUpperCase();
    if (!["ADMIN", "INSTITUTION_ADMIN", "SUPER_ADMIN"].includes(roleUpper)) {
      return NextResponse.json(
        { success: false, error: "Access denied: Account is not authorized to manage institutional subscriptions." },
        { status: 403 }
      );
    }

    // Derive institution strictly from authenticated server session (never trust client-supplied ID)
    let institutionId: string | undefined = session.institutionId;

    if (!institutionId && session.userId) {
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { institutionId: true },
      });
      institutionId = user?.institutionId || undefined;
    }

    // Super Admin override for inspection
    if (roleUpper === "SUPER_ADMIN") {
      const requestedInstId = req.nextUrl.searchParams.get("institutionId") || req.headers.get("x-institution-id");
      if (requestedInstId) {
        // SAF-007: cross-institution inspection by a Super Admin requires an
        // approved READ_SUPPORT_CONTEXT session for that institution.
        await assertSupportAccess({
          actorId: session.userId,
          institutionId: requestedInstId,
          requiredAction: SUPPORT_READ,
        });
        institutionId = requestedInstId;
      }
    }

    if (!institutionId) {
      return NextResponse.json(
        { success: false, error: "No institutional tenant bound to authenticated session." },
        { status: 400 }
      );
    }

    const resolvedInstId: string = institutionId;

    // 1. Authoritative Current Subscription Status
    const currentSubscription = await getInstitutionSubscriptionStatus(resolvedInstId);

    // 2. All Available Active Plans
    const availablePlans = await getAvailableSubscriptionPlans(resolvedInstId);

    // 3. Optional Selected Plan Resolution by planId
    const planIdParam = req.nextUrl.searchParams.get("planId")?.trim();
    let selectedPlan = null;
    let selectedPlanError: string | null = null;

    if (planIdParam) {
      selectedPlan = await getSubscriptionPlanById(planIdParam);
      if (!selectedPlan) {
        selectedPlanError = "The selected subscription plan does not exist or is currently unavailable.";
      }
    }

    return NextResponse.json({
      success: true,
      institutionId,
      institutionName: session.institutionName || "Current Institution",
      data: {
        currentSubscription,
        availablePlans,
        selectedPlan,
        selectedPlanError,
      },
    });
  } catch (error: any) {
    console.error("[SubscriptionPortal:GET] Error:", error?.message || error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
