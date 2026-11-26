import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getInstitutionSubscriptionStatus,
  getAvailableSubscriptionPlans,
} from "@/lib/services/subscription.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const subscriptionStatus = await getInstitutionSubscriptionStatus(institutionId);
    const availablePlans = await getAvailableSubscriptionPlans();

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
