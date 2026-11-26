import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import db from "@/lib/db";
import { AUTH_COOKIE_NAME } from "@/lib/auth/jwt";
import { isTemporaryPasswordActive } from "@/lib/services/credential-management.service";
import { getRoleLandingRoute, isAdminPortalRole } from "@/lib/security/rbac";
import { resolveUserPermissionsFromDb } from "@/lib/security/rbac-server";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    let additionalInfo: any = {};

    // Verify account active status (Safeguard: invalidates disabled sessions immediately)
    if (session.userId) {
      const userRecord = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, isActive: true, status: true, role: true, institutionId: true },
      });

      if (!userRecord || !userRecord.isActive || userRecord.status !== "ACTIVE") {
        return NextResponse.json(
          { success: false, error: "Account has been deactivated or locked." },
          { status: 401 }
        );
      }

      if (userRecord.role) {
        session.role = userRecord.role.toUpperCase() as any;
      }
      if (isAdminPortalRole(session.role)) {
        const rbac = await resolveUserPermissionsFromDb(
          userRecord.id,
          userRecord.institutionId || session.institutionId,
          session.role
        );
        session.assignedRoles = rbac.assignedRoles;
        session.permissions = rbac.permissions;
        additionalInfo.landingRoute = getRoleLandingRoute(session.role);
      }

      session.mustChangePassword = await isTemporaryPasswordActive(session.userId);
    }

    // Retrieve fresh details
    if (session.role === "STUDENT" && session.studentId) {
      additionalInfo.student = await db.student.findUnique({
        where: { id: session.studentId },
        include: {
          enrollments: {
            where: { status: "ACTIVE" },
            include: { course: true, academicYear: true },
          },
        },
      });
    } else if (session.role === "PARENT" && session.guardianId) {
      additionalInfo.guardian = await db.guardianAccount.findUnique({
        where: { id: session.guardianId },
        include: {
          guardianLinks: {
            where: { isVerified: true, canAccessPortal: true },
            include: {
              student: {
                include: {
                  enrollments: {
                    where: { status: "ACTIVE" },
                    include: { course: true },
                  },
                },
              },
            },
          },
        },
      });
    }

    // Retrieve live institution details from DB so any updates made by Admin/Super Admin immediately reflect in the portal
    const targetInstitutionId = session.institutionId || additionalInfo.student?.institutionId;
    let institutionDetails: any = null;
    if (targetInstitutionId) {
      try {
        let inst: any = await db.institution.findUnique({
          where: { id: targetInstitutionId },
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            address: true,
            phone: true,
            email: true,
            website: true,
            city: true,
            state: true,
            country: true,
          },
        });
        if (!inst) {
          try {
            const platInst = await db.platformInstitution.findUnique({
              where: { id: targetInstitutionId },
              select: {
                id: true,
                name: true,
                code: true,
                slug: true,
                address: true,
                phone: true,
                email: true,
                website: true,
                city: true,
                state: true,
                country: true,
                postalCode: true,
              },
            });
            if (platInst) inst = platInst;
          } catch {}
        }
        if (inst) {
          let logoUrl: string | null = null;
          const isUuid = (val?: string | null): boolean =>
            Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

          if (isUuid(inst.id)) {
            try {
              const branding = await db.institutionBranding.findUnique({
                where: { institutionId: inst.id },
                select: { logoUrl: true },
              });
              if (branding?.logoUrl) logoUrl = branding.logoUrl;
            } catch {}
          }

          institutionDetails = {
            id: inst.id,
            name: inst.name,
            code: inst.code || null,
            slug: inst.slug || null,
            logo: logoUrl,
            address: inst.address || null,
            phone: inst.phone || null,
            email: inst.email || null,
            website: inst.website || null,
            city: inst.city || null,
            state: inst.state || null,
            country: inst.country || null,
            postalCode: inst.postalCode || null,
          };
          session.institutionName = inst.name;
          session.institutionCode = inst.code || null;
          session.institutionSlug = inst.slug || null;
          session.institution = institutionDetails;
        }
      } catch (err) {
        console.warn("Live institution details fetch error:", err);
      }
    }

    // Strip internal security signatures from client session output
    const safeSession: any = {
      ...session,
      name: session.fullName,
      fullName: session.fullName,
      institution: institutionDetails,
      institutionName: institutionDetails?.name || session.institutionName,
      institutionCode: institutionDetails?.code || session.institutionCode || null,
      institutionSlug: institutionDetails?.slug || session.institutionSlug || null,
    };
    delete safeSession.passwordSig;

    return NextResponse.json({
      success: true,
      data: {
        session: safeSession,
        institution: institutionDetails,
        ...additionalInfo,
      },
    }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to get session" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    path: "/",
    expires: new Date(0),
  });

  response.cookies.set({
    name: "sst_session",
    value: "",
    path: "/",
    expires: new Date(0),
  });

  return response;
}
