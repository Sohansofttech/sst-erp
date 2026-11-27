import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";
import { DEFAULT_INSTITUTION_THEME } from "@/lib/theme-utils";
import { InstitutionProfile, InstitutionType } from "@/types/institution";
import { applyDatabaseAuthority, normalizeInstitutionType } from "@/lib/institution-type-config";
import db from "@/lib/db";

const globalSettingsRegistry = new Map<string, InstitutionProfile>();

/** Fields that always come from the database; the in-memory cache and request body can never override them. */
const DATABASE_AUTHORITATIVE_KEYS = [
  "id", "name", "code", "type", "institutionType", "institutionCategory",
  "email", "phone", "website", "city", "state", "country",
] as const satisfies ReadonlyArray<keyof InstitutionProfile>;

function mapToInstitutionType(val?: string | null): InstitutionType {
  if (!val) return "Engineering & Technology";
  if (val === "UNIVERSITY") return "University";
  if (val === "SCHOOL" || val === "K12") return "K-12 School";
  if (val === "ACADEMY") return "Academy";
  if (val === "POLYTECHNIC") return "Polytechnic / Diploma";
  if (val === "MEDICAL") return "Medical & Health Sciences";
  if (val === "ARTS_SCIENCE") return "Arts & Science";
  if (
    val === "Engineering & Technology" ||
    val === "Arts & Science" ||
    val === "University" ||
    val === "Polytechnic / Diploma" ||
    val === "Medical & Health Sciences" ||
    val === "K-12 School" ||
    val === "Academy"
  ) {
    return val as InstitutionType;
  }
  return "Engineering & Technology";
}

function createDefaultInstitutionProfile(id: string, name: string, code: string = "INST"): InstitutionProfile {
  return {
    id,
    name: name || "Educational Institution",
    code: code || "INST",
    type: "Engineering & Technology",
    institutionType: "COLLEGE",
    email: "",
    phone: "",
    alternatePhone: "",
    affiliation: "",
    accreditation: "",
    establishedYear: new Date().getFullYear(),
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
    website: "",
    logoUrl: "",
    primaryColor: "#123B5A",
    accentColor: "#F5A000",
    academicCalendarType: "Semester",
    currencySymbol: "₹",
    themeConfig: DEFAULT_INSTITUTION_THEME,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { institutionId, institutionName } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);

    // Resolve saved theme for this institution (database PlatformSetting -> Branding -> Registry -> Default)
    let savedTheme: any = null;
    try {
      const settingKey = `theme:${institutionId}`;
      const rows: any = await db.$queryRaw`
        SELECT value FROM "PlatformSetting" WHERE key = ${settingKey} LIMIT 1
      `;
      if (rows && rows.length > 0 && rows[0]?.value) {
        savedTheme = rows[0].value;
      }
    } catch {}

    if (!savedTheme) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(institutionId);
        if (isUuid) {
          const branding = await db.institutionBranding.findUnique({
            where: { institutionId },
          });
          if (branding) {
            savedTheme = {
              ...DEFAULT_INSTITUTION_THEME,
              sidebarBackground: branding.primaryColor || DEFAULT_INSTITUTION_THEME.sidebarBackground,
              primaryButtonColor: branding.secondaryColor || DEFAULT_INSTITUTION_THEME.primaryButtonColor,
              activeSidebarNav: branding.secondaryColor || DEFAULT_INSTITUTION_THEME.activeSidebarNav,
            };
          }
        }
      } catch {}
    }

    // 1. Try finding in table "institutions"
    try {
      const inst = await db.institution.findUnique({
        where: { id: institutionId },
      });
      if (inst) {
        const base = createDefaultInstitutionProfile(inst.id, inst.name, inst.code || "INST");
        const profile: InstitutionProfile = {
          ...base,
          name: inst.name || base.name,
          code: inst.code || base.code,
          type: mapToInstitutionType(inst.type),
          institutionType: normalizeInstitutionType(inst.type),
          institutionCategory: inst.category || undefined,
          email: inst.email || "",
          phone: inst.phone || "",
          addressLine1: inst.address || "",
          city: inst.city || "",
          state: inst.state || "",
          country: inst.country || "India",
          website: inst.website || "",
        };
        const cached = globalSettingsRegistry.get(institutionId);
        const merged = applyDatabaseAuthority(profile, cached, DATABASE_AUTHORITATIVE_KEYS);
        const effectiveTheme = savedTheme || merged.themeConfig || DEFAULT_INSTITUTION_THEME;
        merged.themeConfig = effectiveTheme;
        merged.primaryColor = effectiveTheme.sidebarBackground || merged.primaryColor;
        merged.accentColor = effectiveTheme.accentColor || merged.accentColor;
        globalSettingsRegistry.set(institutionId, merged);

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
        SELECT id, name, code, category, slug, type, status, email, phone, address, city, state, "postalCode", country, website
        FROM "Institution"
        WHERE id::text = ${institutionId}
        LIMIT 1
      `;
      if (platformRows && platformRows.length > 0) {
        const row = platformRows[0];
        const base = createDefaultInstitutionProfile(row.id, row.name || institutionName || "Educational Institution", row.code || row.slug || "INST");
        const mappedProfile: InstitutionProfile = {
          ...base,
          name: row.name || base.name,
          code: row.code || row.slug || "INST",
          type: mapToInstitutionType(row.type),
          institutionType: normalizeInstitutionType(row.type),
          institutionCategory: row.category || undefined,
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
        const merged = applyDatabaseAuthority(mappedProfile, cached, DATABASE_AUTHORITATIVE_KEYS);
        const effectiveTheme = savedTheme || merged.themeConfig || DEFAULT_INSTITUTION_THEME;
        merged.themeConfig = effectiveTheme;
        merged.primaryColor = effectiveTheme.sidebarBackground || merged.primaryColor;
        merged.accentColor = effectiveTheme.accentColor || merged.accentColor;
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

    const cached = globalSettingsRegistry.get(institutionId) || createDefaultInstitutionProfile(
      institutionId,
      institutionName || "Educational Institution"
    );
    if (savedTheme) {
      cached.themeConfig = savedTheme;
      cached.primaryColor = savedTheme.sidebarBackground || cached.primaryColor;
      cached.accentColor = savedTheme.accentColor || cached.accentColor;
    }

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
    const { institutionId, institutionName } = await resolveAdminContext(req);
    await requireWriteReq(req, institutionId);
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Settings payload required." },
        { status: 400 }
      );
    }

    // Protection: reject hardcoded mock template overrides
    if (body.id === "inst-sst-01" && institutionId !== "inst-sst-01") {
      return NextResponse.json(
        { success: false, error: "Mock institution id cannot be assigned to authenticated tenant." },
        { status: 400 }
      );
    }
    if (body.email === "admin@sohansoft.in" && !body.emailVerified) {
      return NextResponse.json(
        { success: false, error: "Mock placeholder contact email cannot be saved as genuine institutional address." },
        { status: 400 }
      );
    }

    const current = globalSettingsRegistry.get(institutionId) || createDefaultInstitutionProfile(
      institutionId,
      body.name || institutionName || "Educational Institution"
    );
    // The institution type and code are managed by the platform (Super Admin); never accept them from the browser.
    const { type: _ignoredType, institutionType: _ignoredKind, institutionCategory: _ignoredCategory, code: _ignoredCode, ...safeBody } = body;
    void _ignoredType; void _ignoredKind; void _ignoredCategory; void _ignoredCode;
    const updated = { ...current, ...safeBody, id: institutionId };
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

    if (body.themeConfig) {
      try {
        const settingKey = `theme:${institutionId}`;
        const themeJson = JSON.stringify(body.themeConfig);
        await db.$executeRawUnsafe(
          `INSERT INTO "PlatformSetting" (id, key, value, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
          settingKey,
          themeJson
        );
      } catch (themeDbErr: any) {
        console.warn("Could not persist themeConfig to PlatformSetting:", themeDbErr.message);
      }
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
