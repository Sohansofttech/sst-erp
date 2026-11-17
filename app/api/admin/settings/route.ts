import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { initialInstitutionProfile } from "@/lib/mock-data";
import { InstitutionProfile } from "@/types/institution";
import db from "@/lib/db";

const globalSettingsRegistry = new Map<string, InstitutionProfile | (Record<string, unknown> & { name?: string; id?: string })>();
globalSettingsRegistry.set("inst_apex", initialInstitutionProfile);

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);

    // 1. Try finding in table "institutions"
    try {
      const inst = await db.institution.findUnique({
        where: { id: institutionId },
      });
      if (inst) {
        const cached = globalSettingsRegistry.get(institutionId);
        const merged = cached ? { ...inst, ...cached, id: inst.id } : inst;
        return NextResponse.json({
          success: true,
          institutionId,
          data: merged,
        });
      }
    } catch {
      // DB fallback
    }

    // 2. Try finding in table "Institution" (PlatformInstitution)
    try {
      const platformRows: any = await db.$queryRaw`
        SELECT id, name, code, slug, type, status, email, phone, address, city, state, "postalCode", country, website
        FROM "Institution"
        WHERE id::text = ${institutionId}
        LIMIT 1
      `;
      if (platformRows && platformRows.length > 0) {
        const row = platformRows[0];
        const mappedProfile: InstitutionProfile = {
          ...initialInstitutionProfile,
          id: row.id,
          name: row.name || initialInstitutionProfile.name,
          code: row.code || row.slug || "INST",
          type: row.type || "COLLEGE",
          email: row.email || "",
          phone: row.phone || "",
          addressLine1: row.address || "",
          city: row.city || "",
          state: row.state || "",
          postalCode: row.postalCode || "",
          country: row.country || "India",
          website: row.website || "",
        };

        const cached = globalSettingsRegistry.get(institutionId);
        const merged = cached ? { ...mappedProfile, ...cached, id: row.id } : mappedProfile;
        globalSettingsRegistry.set(institutionId, merged);

        return NextResponse.json({
          success: true,
          institutionId,
          data: merged,
        });
      }
    } catch (err) {
      console.warn("Platform institution lookup error in settings GET:", err);
    }

    const cached = globalSettingsRegistry.get(institutionId) || {
      ...initialInstitutionProfile,
      id: institutionId,
    };

    return NextResponse.json({
      success: true,
      institutionId,
      data: cached,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Settings payload required." },
        { status: 400 }
      );
    }

    const current = globalSettingsRegistry.get(institutionId) || initialInstitutionProfile;
    const updated = { ...current, ...body, id: institutionId };
    globalSettingsRegistry.set(institutionId, updated);

    // Update table "institutions"
    try {
      await db.institution.update({
        where: { id: institutionId },
        data: {
          name: body.name || undefined,
          email: body.email || undefined,
          phone: body.phone || undefined,
          website: body.website || undefined,
          city: body.city || undefined,
          state: body.state || undefined,
          country: body.country || undefined,
        },
      });
    } catch {
      // DB fallback
    }

    // Update table "Institution" (PlatformInstitution)
    try {
      await db.$executeRaw`
        UPDATE "Institution"
        SET name = COALESCE(${body.name || null}, name),
            email = COALESCE(${body.email || null}, email),
            phone = COALESCE(${body.phone || null}, phone),
            website = COALESCE(${body.website || null}, website),
            city = COALESCE(${body.city || null}, city),
            state = COALESCE(${body.state || null}, state),
            country = COALESCE(${body.country || null}, country),
            "updatedAt" = NOW()
        WHERE id::text = ${institutionId}
      `;
    } catch {
      // Non-critical mirror update
    }

    return NextResponse.json({
      success: true,
      message: "Institution settings updated successfully.",
      data: updated,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}
