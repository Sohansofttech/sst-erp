import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";
import {
  getInstitutionSubscriptionStatus,
  getAvailableSubscriptionPlans,
} from "@/lib/services/subscription.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const subscriptionStatus = await getInstitutionSubscriptionStatus(institutionId);
    const availablePlans = await getAvailableSubscriptionPlans(institutionId);

    return NextResponse.json({
      success: true,
      institutionId,
      data: {
        ...subscriptionStatus,
        availablePlans,
      },
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
