import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getTransportAllocations,
  createTransportAllocation,
  deleteTransportAllocation,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const allocations = await getTransportAllocations(institutionId);

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

    if (!body.studentId || !body.routeName || !body.routeNumber || !body.vehicleNumber) {
      return NextResponse.json(
        { success: false, error: "Student ID, route name, route number, and vehicle number are required." },
        { status: 400 }
      );
    }

    const allocation = await createTransportAllocation(institutionId, {
      studentId: body.studentId,
      routeName: body.routeName,
      routeNumber: body.routeNumber,
      vehicleNumber: body.vehicleNumber,
      driverName: body.driverName || "Fleet Driver",
      driverContact: body.driverContact || "+91 98450 22000",
      pickupPoint: body.pickupPoint || "Campus Gate",
      pickupTime: body.pickupTime || "07:30 AM",
      dropTime: body.dropTime || "05:00 PM",
    });

    return NextResponse.json({
      success: true,
      message: "Transport route allocated successfully.",
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

    await deleteTransportAllocation(institutionId, id);
    return NextResponse.json({ success: true, message: "Transport allocation revoked." });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
