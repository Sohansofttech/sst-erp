import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, requireActiveSubscription, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import {
  getHostelAllocations,
  createHostelAllocation,
  vacateHostelBed,
  getHostelCatalog,
  saveHostelCatalogRoom,
  transferHostelAllocation,
  getHostelOperations,
  createHostelOperationRecord,
  updateHostelOperationStatus,
} from "@/lib/services/institution-admin.service";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.HOSTEL_READ,
    });
    const [allocations, rooms, operations] = await Promise.all([
      getHostelAllocations(institutionId),
      getHostelCatalog(institutionId),
      getHostelOperations(institutionId),
    ]);

    return NextResponse.json({
      success: true,
      data: allocations,
      rooms,
      operations,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.HOSTEL_WRITE,
    });
    const body = await req.json();

    if (body.type === "SAVE_ROOM") {
      const room = await saveHostelCatalogRoom(institutionId, {
        id: body.id,
        hostelName: body.hostelName,
        roomNumber: body.roomNumber,
        capacity: Number(body.capacity || 2),
        wardenName: body.wardenName,
        wardenContact: body.wardenContact,
        actorUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message: `Hostel room ${room.roomNumber} saved.`,
        data: room,
      });
    }

    if (body.type === "OPERATION") {
      const record = await createHostelOperationRecord(institutionId, {
        type: body.operationType === "ATTENDANCE" ? "ATTENDANCE" : "MAINTENANCE",
        hostelName: body.hostelName,
        roomNumber: body.roomNumber,
        summary: body.summary,
        status: body.status,
        actorUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message: "Hostel operation record saved.",
        data: record,
      });
    }

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

export async function PUT(req: NextRequest) {
  try {
    const { institutionId, userId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.HOSTEL_WRITE,
    });
    const body = await req.json();
    if (body.action === "UPDATE_OPERATION" && body.operationId) {
      const updatedOp = await updateHostelOperationStatus(
        institutionId,
        body.operationId,
        body.status || "RESOLVED",
        userId
      );
      return NextResponse.json({
        success: true,
        message: "Hostel operation status updated.",
        data: updatedOp,
      });
    }
    const id = body.id || body.allocationId;
    if (!id) {
      return NextResponse.json({ success: false, error: "Allocation ID is required." }, { status: 400 });
    }
    const transferred = await transferHostelAllocation(institutionId, id, {
      hostelName: body.hostelName,
      roomNumber: body.roomNumber,
      bedNumber: body.bedNumber,
      wardenName: body.wardenName,
      wardenContact: body.wardenContact,
      actorUserId: userId,
    });
    return NextResponse.json({
      success: true,
      message: "Hostel bed transfer completed.",
      data: transferred,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { institutionId, userId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.HOSTEL_WRITE,
    });
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Allocation ID required." }, { status: 400 });
    }

    await vacateHostelBed(institutionId, id, userId);
    return NextResponse.json({ success: true, message: "Hostel allocation vacated successfully." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
