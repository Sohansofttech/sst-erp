import { NextRequest, NextResponse } from "next/server";
import { resolveDivisionContext } from "@/lib/security/division-context";
import { assertDivisionTenant } from "@/lib/security/tenant";
import { handleAdminApiError } from "@/lib/security/admin-auth";
import {
  listDivisionMemberships,
  createDivisionMembership,
} from "@/lib/services/division-membership.service";

export async function GET(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    const { searchParams } = new URL(req.url);

    const requestedDivId = searchParams.get("divisionId") || undefined;
    const requestedUserId = searchParams.get("userId") || undefined;
    const requestedStatus = searchParams.get("status") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    // If division is specified, verify division tenant boundary
    if (requestedDivId) {
      assertDivisionTenant(context, requestedDivId);
    }

    const result = await listDivisionMemberships(context.institutionId, {
      divisionId: requestedDivId || (context.isInstitutionWideAdmin ? undefined : context.activeDivisionId),
      userId: requestedUserId,
      status: requestedStatus,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result.memberships,
      pagination: result.pagination,
      activeDivisionId: context.activeDivisionId,
      isInstitutionWideAdmin: context.isInstitutionWideAdmin,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req);
    const body = await req.json();

    const { userId, divisionId, roleId, status } = body;

    if (!userId || !divisionId || !roleId) {
      return NextResponse.json(
        { success: false, error: "userId, divisionId, and roleId are required." },
        { status: 400 }
      );
    }

    // Verify division tenant boundary for mutation
    assertDivisionTenant(context, divisionId);

    const membership = await createDivisionMembership(context.institutionId, {
      userId,
      divisionId,
      roleId,
      status,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Division membership created successfully.",
        data: membership,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
