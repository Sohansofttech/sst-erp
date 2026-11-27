/**
 * ============================================================================
 * API Route: /api/admin/divisions
 * Description: Educational Division Management REST API
 * Operations:
 *   - GET: List divisions belonging to the authenticated institution.
 *   - POST: Create an educational division with duplicate code/slug prevention.
 *   - PATCH: Update division details, type, branding, or status.
 *   - DELETE: Safe deletion / archival with protection for records.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveDivisionContext } from "@/lib/security/division-context";
import { handleAdminApiError } from "@/lib/security/admin-auth";
import {
  listDivisions,
  createDivision,
  updateDivision,
  deleteDivision,
} from "@/lib/services/division.service";
import {
  getDivisionSubscriptionEntitlements,
  DivisionSubscriptionError,
} from "@/lib/billing/division-entitlements";
import { DivisionType, DivisionStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    const { searchParams } = new URL(req.url);

    const statusParam = searchParams.get("status") as DivisionStatus | null;
    const typeParam = searchParams.get("type") as DivisionType | null;
    const searchParam = searchParams.get("search") || undefined;

    const [divisions, entitlements] = await Promise.all([
      listDivisions(context.institutionId, {
        status: statusParam && Object.values(DivisionStatus).includes(statusParam) ? statusParam : undefined,
        type: typeParam && Object.values(DivisionType).includes(typeParam) ? typeParam : undefined,
        search: searchParam,
        includeCounts: false,
      }),
      getDivisionSubscriptionEntitlements(context.institutionId),
    ]);

    return NextResponse.json({
      success: true,
      data: divisions,
      entitlements,
      activeDivisionId: context.activeDivisionId,
      isInstitutionWideAdmin: context.isInstitutionWideAdmin,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    const body = await req.json();

    const {
      name,
      code,
      slug,
      type,
      status,
      isDefault,
      description,
      logoUrl,
      academicSettings,
    } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: "Division name is required and must be at least 2 characters long." },
        { status: 400 }
      );
    }

    if (type && !Object.values(DivisionType).includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid division type "${type}". Allowed types: ${Object.values(DivisionType).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const created = await createDivision(context.institutionId, {
      name,
      code,
      slug,
      type,
      status,
      isDefault,
      description,
      logoUrl,
      academicSettings,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Division created successfully.",
        data: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof DivisionSubscriptionError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    if (error.message && error.message.includes("already exists")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    const { searchParams } = new URL(req.url);
    const body = await req.json();

    const divisionId = searchParams.get("id") || body.id;
    if (!divisionId) {
      return NextResponse.json(
        { success: false, error: "Division ID is required." },
        { status: 400 }
      );
    }

    const updated = await updateDivision(context.institutionId, divisionId, {
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
    if (error instanceof DivisionSubscriptionError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    if (error.message && error.message.includes("already exists")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const context = await resolveDivisionContext(req, undefined, { allowUnscoped: true });
    const { searchParams } = new URL(req.url);

    const divisionId = searchParams.get("id");
    const forceArchive = searchParams.get("archive") === "true";

    if (!divisionId) {
      return NextResponse.json(
        { success: false, error: "Division ID is required as a query parameter (?id=)." },
        { status: 400 }
      );
    }

    const result = await deleteDivision(context.institutionId, divisionId, { forceArchive });

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
