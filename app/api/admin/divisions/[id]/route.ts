/**
 * ============================================================================
 * API Route: /api/admin/divisions/[id]
 * Description: Individual Educational Division Management REST API
 * Operations:
 *   - GET: Retrieve division by ID.
 *   - PATCH: Update division details, type, branding, or status.
 *   - DELETE: Safe deletion or archival.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveDivisionContext } from "@/lib/security/division-context";
import { handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getDivisionById,
  updateDivision,
  deleteDivision,
} from "@/lib/services/division.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    await requireReadReq(req, context.institutionId);
    const { id } = await params;

    const division = await getDivisionById(context.institutionId, id);

    return NextResponse.json({
      success: true,
      data: division,
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
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    await requireWriteReq(req, context.institutionId);
    const { id } = await params;
    const body = await req.json();

    const updated = await updateDivision(context.institutionId, id, {
      name: body.name,
      code: body.code,
      slug: body.slug,
      type: body.type,
      status: body.status,
      isDefault: body.isDefault,
      description: body.description,
      logoUrl: body.logoUrl,
      academicSettings: body.academicSettings,
    });

    return NextResponse.json({
      success: true,
      message: "Division updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    if (error.message && error.message.includes("already exists")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    await requireWriteReq(req, context.institutionId);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const forceArchive = searchParams.get("archive") === "true";

    const result = await deleteDivision(context.institutionId, id, { forceArchive });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    if (error.message && error.message.includes("Cannot permanently delete division")) {
      return NextResponse.json(
        { success: false, error: error.message, requiresArchival: true },
        { status: 409 }
      );
    }
    return handleAdminApiError(error);
  }
}
