/**
 * ============================================================================
 * Module: lib/security/division-context.ts
 * Description: Production-grade server-side educational division context resolution
 *              and security guards for Multi-Division architecture.
 *
 * Rules Enforced:
 * 1. Two-Tier RBAC: Institution boundary (Tier 1) and Division boundary (Tier 2).
 * 2. Cross-Institution Protection: A user can NEVER access a division belonging to another institution.
 * 3. Cross-Division IDOR Protection: Division-scoped users (e.g. Principals, Teachers) are strictly
 *    confined to their verified division memberships.
 * 4. Global Admin Access: Institution Owners / Admins have verified access across all divisions.
 * 5. Resolution Precedence: Function parameter > Header (x-division-id) > Query param (?divisionId) > Cookie (sst_active_division).
 * ============================================================================
 */

import { NextRequest } from "next/server";
import { resolveAdminContext, ResolvedAdminContext, AdminContextOptions } from "./admin-auth";
import { ForbiddenError } from "@/lib/auth/session";
import { SessionUser } from "@/types";
import { DivisionType } from "@prisma/client";
import db from "@/lib/db";

export interface ResolvedDivisionContext extends ResolvedAdminContext {
  activeDivisionId?: string;
  activeDivisionCode?: string;
  activeDivisionName?: string;
  activeDivisionType?: DivisionType;
  isInstitutionWideAdmin: boolean;
  permittedDivisionIds: string[];
}

export interface DivisionContextOptions extends AdminContextOptions {
  /** If true, allows execution without an active division (for cross-division aggregate dashboards) */
  allowUnscoped?: boolean;
}

/**
 * Extracts the requested division ID from the incoming HTTP request.
 * Checks (in priority order):
 * 1. Header: 'x-division-id' or 'x-active-division'
 * 2. Query parameter: '?divisionId='
 * 3. Cookie: 'sst_active_division' or 'erp_active_division'
 */
export function extractRequestedDivisionId(req: NextRequest): string | undefined {
  // 1. Header check
  const headerDiv = req.headers.get("x-division-id") || req.headers.get("x-active-division");
  if (headerDiv && headerDiv.trim() !== "") {
    return headerDiv.trim();
  }

  // 2. Query parameter check
  try {
    const searchParam = req.nextUrl?.searchParams?.get("divisionId");
    if (searchParam && searchParam.trim() !== "") {
      return searchParam.trim();
    }
  } catch {
    // In case nextUrl is not fully constructed in test harnesses
  }

  // 3. Cookie store check
  const cookieDiv = req.cookies.get("sst_active_division")?.value || req.cookies.get("erp_active_division")?.value;
  if (cookieDiv && cookieDiv.trim() !== "") {
    return cookieDiv.trim();
  }

  // 4. Raw cookie header fallback
  const rawCookie = req.headers.get("cookie");
  if (rawCookie) {
    const match = rawCookie.match(/(?:^|; )(?:sst_active_division|erp_active_division)=([^;]*)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }

  return undefined;
}

/**
 * Resolves the authenticated admin division context with cryptographic session and DB verification.
 */
export async function resolveDivisionContext(
  req: NextRequest,
  requestedDivisionId?: string,
  options?: DivisionContextOptions
): Promise<ResolvedDivisionContext> {
  // 1. Verify underlying Admin Context (validates token, user status, and password signature)
  const adminContext = await resolveAdminContext(req, options);
  const userId = adminContext.userId!;
  const institutionId = adminContext.institutionId;

  // Determine requested division ID
  const targetDivisionId = (requestedDivisionId || extractRequestedDivisionId(req))?.trim();

  // 2. Check if user is Institution Owner or Global Admin
  const roleUpper = (adminContext.userRole || "").toUpperCase();
  const isGlobalAdmin = ["ADMIN", "INSTITUTION_ADMIN", "SUPER_ADMIN", "OWNER"].includes(roleUpper);

  if (isGlobalAdmin) {
    // Global admins have access to all active divisions under their verified institution
    const allDivisions = await db.institutionDivision.findMany({
      where: {
        institutionId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    const permittedIds = allDivisions.map((d) => d.id);

    // If a specific division was requested, verify it belongs strictly to this institution
    let activeDivision = allDivisions.find((d) => d.id === targetDivisionId);

    if (targetDivisionId && !activeDivision) {
      // Query DB directly to check if division exists in another institution (Cross-Tenant Security Violation)
      const foreignDivision = await db.institutionDivision.findUnique({
        where: { id: targetDivisionId },
        select: { institutionId: true, name: true },
      });

      if (foreignDivision) {
        if (foreignDivision.institutionId !== institutionId) {
          throw new ForbiddenError("Security Violation: Division does not belong to the verified institution.");
        }
      } else {
        throw new ForbiddenError("Requested educational division does not exist or has been archived.");
      }
    }

    if (!activeDivision && !options?.allowUnscoped) {
      // Default to default division or first available division
      activeDivision = allDivisions.find((d) => d.isDefault) || allDivisions[0];
    }

    return {
      ...adminContext,
      activeDivisionId: activeDivision?.id,
      activeDivisionCode: activeDivision?.code,
      activeDivisionName: activeDivision?.name,
      activeDivisionType: activeDivision?.type,
      isInstitutionWideAdmin: true,
      permittedDivisionIds: permittedIds,
    };
  }

  // 3. For Division-Scoped Users (e.g. Division Admins, Teachers):
  // Resolve verified active memberships from the database
  const memberships = await db.divisionMembership.findMany({
    where: {
      userId,
      institutionId,
      status: "ACTIVE",
    },
    include: {
      division: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          status: true,
          institutionId: true,
        },
      },
      role: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  // Filter to active divisions belonging to this institution
  const validMemberships = memberships.filter(
    (m) => m.division && m.division.status === "ACTIVE" && m.division.institutionId === institutionId
  );

  const permittedIds = validMemberships.map((m) => m.divisionId);

  if (permittedIds.length === 0) {
    throw new ForbiddenError("Access denied: You have no active division assignments in this institution.");
  }

  let selectedMembership = validMemberships[0];

  if (targetDivisionId) {
    if (!permittedIds.includes(targetDivisionId)) {
      // Check if target division belongs to another institution
      const targetDiv = await db.institutionDivision.findUnique({
        where: { id: targetDivisionId },
        select: { institutionId: true },
      });

      if (targetDiv && targetDiv.institutionId !== institutionId) {
        throw new ForbiddenError("Security Violation: Division does not belong to the verified institution.");
      }

      throw new ForbiddenError("Security Violation: You are not authorized to access this educational division.");
    }
    selectedMembership = validMemberships.find((m) => m.divisionId === targetDivisionId) || validMemberships[0];
  }

  return {
    ...adminContext,
    activeDivisionId: selectedMembership.division.id,
    activeDivisionCode: selectedMembership.division.code,
    activeDivisionName: selectedMembership.division.name,
    activeDivisionType: selectedMembership.division.type,
    isInstitutionWideAdmin: false,
    permittedDivisionIds: permittedIds,
  };
}

/**
 * Resolves division context for general session users (e.g. Teachers, Students, Parents).
 */
export async function resolveSessionDivisionContext(
  session: SessionUser,
  requestedDivisionId?: string
): Promise<{
  activeDivisionId?: string;
  activeDivisionType?: DivisionType;
  isInstitutionWideAdmin: boolean;
  permittedDivisionIds: string[];
}> {
  const roleUpper = (session.role || "").toUpperCase();
  const isGlobalAdmin = ["ADMIN", "INSTITUTION_ADMIN", "SUPER_ADMIN", "OWNER"].includes(roleUpper);

  if (isGlobalAdmin) {
    const allDivisions = await db.institutionDivision.findMany({
      where: { institutionId: session.institutionId, status: "ACTIVE" },
      select: { id: true, type: true, isDefault: true },
    });
    const permittedIds = allDivisions.map((d) => d.id);
    const matched = allDivisions.find((d) => d.id === requestedDivisionId) || allDivisions.find((d) => d.isDefault) || allDivisions[0];

    return {
      activeDivisionId: matched?.id,
      activeDivisionType: matched?.type,
      isInstitutionWideAdmin: true,
      permittedDivisionIds: permittedIds,
    };
  }

  // Check if student: student is permitted to access divisions where they hold an active enrollment
  if (roleUpper === "STUDENT" && session.studentId) {
    const student = await db.student.findUnique({
      where: { id: session.studentId },
      select: {
        currentDivisionId: true,
        enrollments: {
          where: { status: "ACTIVE", divisionId: { not: null } },
          select: { divisionId: true, isPrimary: true, division: { select: { id: true, type: true } } },
          orderBy: [{ isPrimary: "desc" }, { enrolledDate: "desc" }],
        },
      },
    });

    const activeEnrollments = student?.enrollments || [];
    const permittedIds = activeEnrollments.map((e) => e.divisionId!).filter(Boolean);

    if (student?.currentDivisionId && !permittedIds.includes(student.currentDivisionId)) {
      permittedIds.push(student.currentDivisionId);
    }

    const matchedEnrollment = activeEnrollments.find((e) => e.divisionId === requestedDivisionId);
    const activeDivId = matchedEnrollment ? matchedEnrollment.divisionId : (student?.currentDivisionId || permittedIds[0]);
    const activeDiv = matchedEnrollment?.division || activeEnrollments.find((e) => e.divisionId === activeDivId)?.division;

    return {
      activeDivisionId: activeDivId || undefined,
      activeDivisionType: activeDiv?.type,
      isInstitutionWideAdmin: false,
      permittedDivisionIds: permittedIds,
    };
  }

  // Check if teacher / staff: permitted to access explicitly assigned divisions
  if (roleUpper === "TEACHER" || roleUpper === "STAFF" || roleUpper === "FACULTY") {
    const teacherId = (session as any).teacherId;
    const [assignments, memberships] = await Promise.all([
      db.staffDivisionAssignment.findMany({
        where: {
          institutionId: session.institutionId,
          staff: {
            OR: [
              { userId: session.userId },
              ...(teacherId ? [{ id: teacherId }] : []),
            ],
          },
          status: "ACTIVE",
        },
        include: { division: { select: { id: true, type: true } } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      }),
      db.divisionMembership.findMany({
        where: {
          userId: session.userId,
          institutionId: session.institutionId,
          status: "ACTIVE",
        },
        include: { division: { select: { id: true, type: true } } },
      }),
    ]);

    const permittedMap = new Map<string, DivisionType | undefined>();
    for (const a of assignments) {
      if (a.division) permittedMap.set(a.division.id, a.division.type);
    }
    for (const m of memberships) {
      if (m.division && !permittedMap.has(m.division.id)) permittedMap.set(m.division.id, m.division.type);
    }

    let permittedIds = Array.from(permittedMap.keys());

    // Fallback to default division if no explicit assignments exist
    if (permittedIds.length === 0) {
      const defDiv = await db.institutionDivision.findFirst({
        where: { institutionId: session.institutionId, status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, type: true },
      });
      if (defDiv) {
        permittedMap.set(defDiv.id, defDiv.type);
        permittedIds = [defDiv.id];
      }
    }

    const activeDivId = (requestedDivisionId && permittedIds.includes(requestedDivisionId))
      ? requestedDivisionId
      : (assignments.find((a) => a.isPrimary)?.divisionId || permittedIds[0]);

    return {
      activeDivisionId: activeDivId || undefined,
      activeDivisionType: permittedMap.get(activeDivId || ""),
      isInstitutionWideAdmin: false,
      permittedDivisionIds: permittedIds,
    };
  }

  // Check division memberships for general staff / division admin
  const memberships = await db.divisionMembership.findMany({
    where: {
      userId: session.userId,
      institutionId: session.institutionId,
      status: "ACTIVE",
    },
    include: { division: { select: { id: true, type: true } } },
  });

  const permittedIds = memberships.map((m) => m.divisionId);
  const matched = memberships.find((m) => m.divisionId === requestedDivisionId) || memberships[0];

  return {
    activeDivisionId: matched?.division?.id,
    activeDivisionType: matched?.division?.type,
    isInstitutionWideAdmin: false,
    permittedDivisionIds: permittedIds,
  };
}
