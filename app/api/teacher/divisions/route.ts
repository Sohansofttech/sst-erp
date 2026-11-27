import { NextRequest, NextResponse } from "next/server";
import { getSession, getAuthErrorStatus } from "@/lib/auth/session";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.institutionId) {
      return NextResponse.json({ success: false, error: "Unauthorized session" }, { status: 401 });
    }

    const institutionId = session.institutionId;
    const userId = session.userId;

    const teacherId = (session as any).teacherId;

    // 1. Fetch explicit staff division assignments
    const assignments = await db.staffDivisionAssignment.findMany({
      where: {
        institutionId,
        staff: {
          OR: [
            { userId },
            ...(teacherId ? [{ id: teacherId }] : []),
          ],
        },
        status: "ACTIVE",
      },
      include: {
        division: {
          select: { id: true, name: true, code: true, type: true, status: true },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    // 2. Fetch division memberships (e.g. Division Admin roles)
    const memberships = await db.divisionMembership.findMany({
      where: {
        institutionId,
        userId,
        status: "ACTIVE",
      },
      include: {
        division: {
          select: { id: true, name: true, code: true, type: true, status: true },
        },
      },
    });

    // Merge into distinct list of permitted divisions
    const divisionMap = new Map<string, { id: string; name: string; code: string; type: string; isPrimary: boolean; designation?: string }>();

    for (const a of assignments) {
      if (a.division && a.division.status === "ACTIVE") {
        divisionMap.set(a.division.id, {
          id: a.division.id,
          name: a.division.name,
          code: a.division.code,
          type: a.division.type,
          isPrimary: a.isPrimary,
          designation: a.designation,
        });
      }
    }

    for (const m of memberships) {
      if (m.division && m.division.status === "ACTIVE" && !divisionMap.has(m.division.id)) {
        divisionMap.set(m.division.id, {
          id: m.division.id,
          name: m.division.name,
          code: m.division.code,
          type: m.division.type,
          isPrimary: false,
          designation: "Division Member",
        });
      }
    }

    let assignedDivisions = Array.from(divisionMap.values());

    // Legacy fallback: If no explicit division assignment exists yet, fall back to institution default
    if (assignedDivisions.length === 0) {
      const defaultDiv = await db.institutionDivision.findFirst({
        where: { institutionId, status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, name: true, code: true, type: true },
      });
      if (defaultDiv) {
        assignedDivisions = [{
          id: defaultDiv.id,
          name: defaultDiv.name,
          code: defaultDiv.code,
          type: defaultDiv.type,
          isPrimary: true,
          designation: "Faculty",
        }];
      }
    }

    // Determine current active division (Priority: Cookie -> Primary assignment -> First assigned)
    const cookieDivId = req.cookies.get("sst_active_division")?.value;
    let activeDivision = assignedDivisions.find((d) => d.id === cookieDivId);

    if (!activeDivision) {
      activeDivision = assignedDivisions.find((d) => d.isPrimary) || assignedDivisions[0];
    }

    return NextResponse.json({
      success: true,
      divisions: assignedDivisions,
      hasMultipleDivisions: assignedDivisions.length > 1,
      activeDivisionId: activeDivision?.id || null,
      activeDivision: activeDivision || null,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: getAuthErrorStatus(error) ?? 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.institutionId) {
      return NextResponse.json({ success: false, error: "Unauthorized session" }, { status: 401 });
    }

    const { divisionId } = await req.json();
    if (!divisionId) {
      return NextResponse.json({ success: false, error: "divisionId is required" }, { status: 400 });
    }

    const institutionId = session.institutionId;
    const userId = session.userId;
    const teacherId = (session as any).teacherId;

    // Server-side authorization check: verify teacher has assignment or membership in target division
    const [assignment, membership, targetDiv] = await Promise.all([
      db.staffDivisionAssignment.findFirst({
        where: {
          institutionId,
          divisionId,
          staff: {
            OR: [
              { userId },
              ...(teacherId ? [{ id: teacherId }] : []),
            ],
          },
          status: "ACTIVE",
        },
      }),
      db.divisionMembership.findFirst({
        where: {
          institutionId,
          divisionId,
          userId,
          status: "ACTIVE",
        },
      }),
      db.institutionDivision.findFirst({
        where: { id: divisionId, institutionId, status: "ACTIVE" },
      }),
    ]);

    if (!targetDiv) {
      return NextResponse.json(
        { success: false, error: "Division not found or inactive in this institution." },
        { status: 404 }
      );
    }

    // If teacher has explicit assignments but not this one, reject!
    const totalAssignments = await db.staffDivisionAssignment.count({
      where: {
        institutionId,
        staff: {
          OR: [
            { userId },
            ...(teacherId ? [{ id: teacherId }] : []),
          ],
        },
        status: "ACTIVE",
      },
    });

    if (totalAssignments > 0 && !assignment && !membership) {
      return NextResponse.json(
        { success: false, error: "Security Violation: You are not assigned to this educational division." },
        { status: 403 }
      );
    }

    // Set cookie on response
    const response = NextResponse.json({
      success: true,
      message: "Active division switched successfully.",
      activeDivisionId: divisionId,
      activeDivisionName: targetDiv.name,
    });

    response.cookies.set({
      name: "sst_active_division",
      value: divisionId,
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: getAuthErrorStatus(error) ?? 500 });
  }
}
