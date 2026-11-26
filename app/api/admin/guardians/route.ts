import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { isValidUuid } from "@/lib/utils/credential-helpers";
import {
  getGuardians,
  createGuardian,
  updateGuardian,
  archiveGuardian,
  restoreGuardian,
  getGuardianDependencies,
} from "@/lib/services/institution-admin.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");
    const checkDependencies = req.nextUrl.searchParams.get("dependencies") === "true";

    if (id && checkDependencies) {
      const deps = await getGuardianDependencies(institutionId, id);
      return NextResponse.json({
        success: true,
        data: deps,
      });
    }

    const guardians = await getGuardians(institutionId);

    return NextResponse.json({
      success: true,
      data: guardians,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (!body.fullName || !body.relationship || !body.phone || !body.email) {
      return NextResponse.json(
        { success: false, error: "Guardian full name, relationship, phone, and email are required." },
        { status: 400 }
      );
    }

    const guardian = await createGuardian(institutionId, body);
    return NextResponse.json({
      success: true,
      message: "Guardian registered successfully.",
      data: guardian,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const id = req.nextUrl.searchParams.get("id");
    const force = req.nextUrl.searchParams.get("force") === "true";

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { success: false, error: "Guardian ID is required." },
        { status: 400 }
      );
    }

    const cleanId = id.trim();
    if (!isValidUuid(cleanId) && !cleanId.startsWith("GRD-")) {
      return NextResponse.json(
        { success: false, error: "Invalid Guardian ID format. Must be a valid UUID or GRD-xxxx identifier." },
        { status: 400 }
      );
    }

    const result = await archiveGuardian(institutionId, cleanId, actorUserId, force);
    return NextResponse.json({
      success: true,
      message: result.message,
      data: (result as any).data,
      alreadyArchived: (result as any).alreadyArchived,
    });
  } catch (error: any) {
    if (error.statusCode === 409) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          hasActiveStudents: error.hasActiveStudents,
          linkedStudents: error.linkedStudents,
        },
        { status: 409 }
      );
    }
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { id, ...data } = body;

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { success: false, error: "Guardian ID is required." },
        { status: 400 }
      );
    }

    const cleanId = id.trim();
    if (!isValidUuid(cleanId) && !cleanId.startsWith("GRD-")) {
      return NextResponse.json(
        { success: false, error: "Invalid Guardian ID format. Must be a valid UUID or GRD-xxxx identifier." },
        { status: 400 }
      );
    }

    const updated = await updateGuardian(institutionId, cleanId, data, actorUserId);
    return NextResponse.json({
      success: true,
      message: "Guardian details updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { institutionId, userId: actorUserId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();
    const { id, action } = body;

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { success: false, error: "Guardian ID is required." },
        { status: 400 }
      );
    }

    const cleanId = id.trim();
    if (!isValidUuid(cleanId) && !cleanId.startsWith("GRD-")) {
      return NextResponse.json(
        { success: false, error: "Invalid Guardian ID format. Must be a valid UUID or GRD-xxxx identifier." },
        { status: 400 }
      );
    }

    if (action === "RESTORE") {
      const result = await restoreGuardian(institutionId, cleanId, actorUserId);
      return NextResponse.json({
        success: true,
        message: result.message,
        notArchived: (result as any).notArchived,
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action: ${action}. Expected RESTORE.` },
      { status: 400 }
    );
  } catch (error) {
    return handleAdminApiError(error);
  }
}
