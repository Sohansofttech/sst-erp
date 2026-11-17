import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  getAcademicYears,
  createAcademicYear,
} from "@/lib/services/institution-admin.service";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const academicYears = await getAcademicYears(institutionId);

    return NextResponse.json({
      success: true,
      data: academicYears,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body.name || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { success: false, error: "Academic year name, start date, and end date are required." },
        { status: 400 }
      );
    }

    const ay = await createAcademicYear(institutionId, {
      name: body.name,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      isCurrent: body.isCurrent,
      terms: body.terms?.map((t: any, index: number) => ({
        name: t.name,
        termNumber: t.termNumber || index + 1,
        startDate: new Date(t.startDate || body.startDate),
        endDate: new Date(t.endDate || body.endDate),
        isCurrent: t.isCurrent,
      })),
    });

    return NextResponse.json({
      success: true,
      message: "Academic year created successfully.",
      data: ay,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const { id, isCurrent, name, startDate, endDate } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "Academic Year ID required." }, { status: 400 });
    }

    if (isCurrent) {
      await db.academicYear.updateMany({
        where: { institutionId },
        data: { isCurrent: false },
      });
    }

    const updated = await db.academicYear.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
        ...(typeof isCurrent === "boolean" ? { isCurrent } : {}),
      },
      include: { terms: true },
    });

    return NextResponse.json({
      success: true,
      message: "Academic year updated successfully.",
      data: updated,
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
      return NextResponse.json({ success: false, error: "Academic Year ID required." }, { status: 400 });
    }

    await db.academicYear.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Academic year deleted successfully.",
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
