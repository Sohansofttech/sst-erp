import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getEvents,
  createEvent,
  getResourceBookings,
  updateResourceBookingStatus,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);
    const view = req.nextUrl.searchParams.get("view");

    if (view === "bookings") {
      const bookings = await getResourceBookings(institutionId);
      return NextResponse.json({ success: true, data: bookings });
    }

    const [events, bookings] = await Promise.all([
      getEvents(institutionId),
      getResourceBookings(institutionId),
    ]);

    return NextResponse.json({
      success: true,
      data: { events, bookings },
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

    if (!body.title || !body.eventDate || !body.venue) {
      return NextResponse.json(
        { success: false, error: "Event title, date, and venue are required." },
        { status: 400 }
      );
    }

    const event = await createEvent(institutionId, {
      title: body.title,
      description: body.description || "",
      category: body.category || "ACADEMIC",
      eventDate: new Date(body.eventDate),
      venue: body.venue,
      organizer: body.organizer || "Administrative Office",
    });

    return NextResponse.json({
      success: true,
      message: "Event scheduled successfully.",
      data: event,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const { bookingId, status } = await req.json();

    if (!bookingId || !status) {
      return NextResponse.json({ success: false, error: "Booking ID and status required." }, { status: 400 });
    }

    const updated = await updateResourceBookingStatus(institutionId, bookingId, status);
    return NextResponse.json({
      success: true,
      message: `Resource booking status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
