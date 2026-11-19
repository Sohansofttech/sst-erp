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

    const isCurr = body.isCurrent ?? body.isActive;
    const ay = await createAcademicYear(institutionId, {
      name: body.name,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      isCurrent: isCurr,
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
    const body = await req.json();
    const { id, isCurrent, isActive, name, startDate, endDate, terms } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Academic Year ID required." }, { status: 400 });
    }

    const currentFlag = typeof isCurrent === "boolean" ? isCurrent : (typeof isActive === "boolean" ? isActive : undefined);

    const result = await db.academicYear.updateMany({
      where: { id, institutionId },
      data: {
        ...(name ? { name } : {}),
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
        ...(typeof currentFlag === "boolean" ? { isCurrent: currentFlag } : {}),
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Academic year not found or access denied." },
        { status: 404 }
      );
    }

    if (currentFlag) {
      await db.academicYear.updateMany({
        where: { institutionId, id: { not: id } },
        data: { isCurrent: false },
      });
    }

    // Safely update terms if provided
    if (terms && Array.isArray(terms)) {
      try {
        await db.academicTerm.deleteMany({
          where: { academicYearId: id, institutionId },
        });
        if (terms.length > 0) {
          await db.academicTerm.createMany({
            data: terms.map((t: any, index: number) => ({
              institutionId,
              academicYearId: id,
              name: t.name,
              termNumber: t.termNumber || index + 1,
              startDate: new Date(t.startDate || startDate || Date.now()),
              endDate: new Date(t.endDate || endDate || Date.now()),
              isCurrent: !!t.isCurrent,
            })),
          });
        }
      } catch (termErr: any) {
        console.warn("AcademicTerm update fallback:", termErr?.message);
      }
    }

    let updated: any = null;
    try {
      updated = await db.academicYear.findFirst({
        where: { id, institutionId },
        include: { terms: true },
      });
    } catch {
      updated = await db.academicYear.findFirst({
        where: { id, institutionId },
      });
    }

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

    const result = await db.academicYear.deleteMany({
      where: { id, institutionId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Academic year not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Academic year deleted successfully.",
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
