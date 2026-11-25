import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  listStaffDivisionAssignments,
  assignStaffToDivision,
  removeStaffDivisionAssignment,
} from "@/lib/services/division-membership.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id: staffId } = await params;

    const assignments = await listStaffDivisionAssignments(institutionId, { staffId });
    return NextResponse.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id: staffId } = await params;
    const body = await req.json();

    const { divisionId, designation, isPrimary } = body;
    if (!divisionId || !designation) {
      return NextResponse.json(
        { success: false, error: "divisionId and designation are mandatory." },
        { status: 400 }
      );
    }

    const assignment = await assignStaffToDivision(institutionId, {
      staffId,
      divisionId,
      designation,
      isPrimary: Boolean(isPrimary),
    });

    return NextResponse.json(
      {
        success: true,
        message: "Staff member assigned to division successfully.",
        data: assignment,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id: staffId } = await params;
    const { searchParams } = new URL(req.url);
    const assignmentId = searchParams.get("assignmentId");

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: "Query parameter 'assignmentId' is required." },
        { status: 400 }
      );
    }

    const result = await removeStaffDivisionAssignment(institutionId, assignmentId);
    return NextResponse.json({
      success: true,
      message: "Staff division assignment removed successfully.",
      data: result,
    });
  } catch (error: any) {
    return handleAdminApiError(error);
  }
}
