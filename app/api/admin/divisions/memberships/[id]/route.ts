import { NextRequest, NextResponse } from "next/server";
import { resolveDivisionContext } from "@/lib/security/division-context";
import { assertDivisionTenant } from "@/lib/security/tenant";
import { handleAdminApiError } from "@/lib/security/admin-auth";
import {
  updateDivisionMembership,
  deleteDivisionMembership,
} from "@/lib/services/division-membership.service";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    await requireReadReq(req, context.institutionId);
    const { id } = await params;

    const membership = await db.divisionMembership.findFirst({
      where: { id, institutionId: context.institutionId },
      include: {
        user: { select: { id: true, email: true, fullName: true, role: true } },
        division: { select: { id: true, name: true, code: true, type: true } },
        role: { select: { id: true, name: true, code: true } },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Division membership not found." },
        { status: 404 }
      );
    }

    assertDivisionTenant(context, membership.divisionId);

    return NextResponse.json({
      success: true,
      data: membership,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveDivisionContext(req);
    await requireWriteReq(req, context.institutionId);
    const { id } = await params;
    const body = await req.json();

    const existing = await db.divisionMembership.findFirst({
      where: { id, institutionId: context.institutionId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Division membership not found." },
        { status: 404 }
      );
    }

    assertDivisionTenant(context, existing.divisionId);

    const updated = await updateDivisionMembership(context.institutionId, id, {
      roleId: body.roleId,
      status: body.status,
    });

    return NextResponse.json({
      success: true,
      message: "Division membership updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveDivisionContext(req);
    await requireWriteReq(req, context.institutionId);
    const { id } = await params;

    const existing = await db.divisionMembership.findFirst({
      where: { id, institutionId: context.institutionId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Division membership not found." },
        { status: 404 }
      );
    }

    assertDivisionTenant(context, existing.divisionId);

    const result = await deleteDivisionMembership(context.institutionId, id);

    return NextResponse.json({
      success: true,
      message: "Division membership deleted successfully.",
      data: result,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
