import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, requireActiveSubscription, handleAdminApiError } from "@/lib/security/admin-auth";
import { PERMISSIONS } from "@/lib/security/rbac";
import {
  getTransportAllocations,
  createTransportAllocation,
  deleteTransportAllocation,
  getTransportCatalog,
  saveTransportCatalogItem,
  getTransportMaintenance,
  createTransportMaintenanceRecord,
} from "@/lib/services/institution-admin.service";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";
import { requireInstitutionFeatureAccess } from "@/lib/super-admin/feature-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req, {
      requiredPermission: PERMISSIONS.TRANSPORT_READ,
    });
    await requireReadReq(req, institutionId);
    // SAF-007: billable module entitlement (institution derived from server context).
    await requireInstitutionFeatureAccess(institutionId, "TRANSPORT");
    const [allocations, catalog, maintenance] = await Promise.all([
      getTransportAllocations(institutionId),
      getTransportCatalog(institutionId),
      getTransportMaintenance(institutionId),
    ]);

    return NextResponse.json({
      success: true,
      data: allocations,
      catalog,
      maintenance,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.TRANSPORT_WRITE,
    });
    await requireWriteReq(req, institutionId);
    // SAF-007: billable module entitlement (institution derived from server context).
    await requireInstitutionFeatureAccess(institutionId, "TRANSPORT");
    const body = await req.json();

    if (body.type === "SAVE_ROUTE") {
      const saved = await saveTransportCatalogItem(institutionId, {
        id: body.id,
        routeNumber: body.routeNumber,
        routeName: body.routeName,
        vehicleNumber: body.vehicleNumber,
        capacity: Number(body.capacity || 40),
        driverName: body.driverName,
        driverContact: body.driverContact,
        stops: body.stops,
        status: body.status,
        actorUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message: `Route ${saved.routeNumber} saved.`,
        data: saved,
      });
    }

    if (body.type === "MAINTENANCE") {
      const record = await createTransportMaintenanceRecord(institutionId, {
        vehicleNumber: body.vehicleNumber,
        summary: body.summary,
        cost: body.cost,
        status: body.status,
        actorUserId: userId,
      });
      return NextResponse.json({
        success: true,
        message: "Transport maintenance record saved.",
        data: record,
      });
    }

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
      vehicleCapacity: body.vehicleCapacity ? Number(body.vehicleCapacity) : undefined,
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
    const { institutionId } = await requireActiveSubscription(req, {
      requiredPermission: PERMISSIONS.TRANSPORT_WRITE,
    });
    await requireWriteReq(req, institutionId);
    // SAF-007: billable module entitlement (institution derived from server context).
    await requireInstitutionFeatureAccess(institutionId, "TRANSPORT");
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
