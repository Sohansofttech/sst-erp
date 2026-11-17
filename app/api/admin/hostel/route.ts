import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getHostelAllocations,
  createHostelAllocation,
  deleteHostelAllocation,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const allocations = await getHostelAllocations(institutionId);

    return NextResponse.json({
      success: true,
      data: allocations,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.studentId || !body.hostelName || !body.roomNumber || !body.bedNumber) {
      return NextResponse.json(
        { success: false, error: "Student ID, hostel name, room number, and bed number are required." },
        { status: 400 }
      );
    }

    const allocation = await createHostelAllocation(institutionId, {
      studentId: body.studentId,
      hostelName: body.hostelName,
      roomNumber: body.roomNumber,
      bedNumber: body.bedNumber,
      wardenName: body.wardenName || "Chief Warden",
      wardenContact: body.wardenContact || "+91 98450 11000",
    });

    return NextResponse.json({
      success: true,
      message: "Hostel accommodation allocated successfully.",
      data: allocation,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Allocation ID required." }, { status: 400 });
    }

    await deleteHostelAllocation(institutionId, id);
    return NextResponse.json({ success: true, message: "Hostel allocation released." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
