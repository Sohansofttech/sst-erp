import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { resolveInstitutionDomain } from "@/lib/institution-domain";
import { getRequestHostname, isMainErpHostname } from "@/lib/tenant-hostname";

async function resolveLogo(instId?: string | null): Promise<string | null> {
  if (!instId) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instId);
  if (!isUuid) return null;
  try {
    const branding = await db.institutionBranding.findUnique({
      where: { institutionId: instId },
      select: { logoUrl: true },
    });
    return branding?.logoUrl || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim();
    const email = searchParams.get("email")?.trim().toLowerCase();
    const slug = searchParams.get("slug")?.trim().toLowerCase();
    const hostname = getRequestHostname(req.headers);

    if (hostname && !isMainErpHostname(hostname) && !code && !slug && !email) {
      const tenant = await resolveInstitutionDomain(hostname);
      if (tenant.status === "ACTIVE") {
        return NextResponse.json({
          success: true,
          tenantScoped: true,
          id: tenant.institutionId,
          name: tenant.institutionName,
          code: tenant.institutionCode,
          slug: tenant.institutionSlug,
          type: tenant.institutionType,
          logo: tenant.logo,
        });
      }

      const messages: Record<string, string> = {
        PENDING: "This institution domain is pending verification.",
        VERIFIED: "This institution domain is verified but not activated yet.",
        SUSPENDED: "This institution domain is suspended.",
        REMOVED: "This institution domain is no longer available.",
        ARCHIVED: "This institution portal is archived.",
        UNKNOWN: "This domain is not registered to an institution.",
      };

      return NextResponse.json(
        {
          success: false,
          tenantScoped: true,
          status: tenant.status,
          error: messages[tenant.status] || "This institution domain is not available.",
        },
        { status: tenant.status === "UNKNOWN" ? 404 : 403 }
      );
    }

    // 1. If explicit college code or slug provided, resolve that institution
    if (code || slug) {
      const match = await db.institution.findFirst({
        where: {
          OR: [
            ...(code ? [{ code: { equals: code, mode: "insensitive" as const } }] : []),
            ...(code ? [{ id: { equals: code, mode: "insensitive" as const } }] : []),
            ...(slug ? [{ slug: { equals: slug, mode: "insensitive" as const } }] : []),
            ...(code ? [{ slug: { equals: code, mode: "insensitive" as const } }] : []),
          ],
        },
        select: { id: true, name: true, code: true, slug: true },
      });

      if (match?.name) {
        return NextResponse.json({
          success: true,
          id: match.id,
          name: match.name,
          code: match.code,
          slug: match.slug,
          logo: await resolveLogo(match.id),
        });
      }

      // Check platform institution as well
      const platMatch = await db.platformInstitution.findFirst({
        where: {
          OR: [
            ...(code ? [{ code: { equals: code, mode: "insensitive" as const } }] : []),
            ...(code ? [{ id: { equals: code, mode: "insensitive" as const } }] : []),
            ...(slug ? [{ slug: { equals: slug, mode: "insensitive" as const } }] : []),
            ...(code ? [{ slug: { equals: code, mode: "insensitive" as const } }] : []),
          ],
        },
        select: { id: true, name: true, code: true, slug: true },
      });

      if (platMatch?.name) {
        return NextResponse.json({
          success: true,
          id: platMatch.id,
          name: platMatch.name,
          code: platMatch.code,
          slug: platMatch.slug,
          logo: await resolveLogo(platMatch.id),
        });
      }
    }

    // 2. If user email provided, resolve user's assigned institution
    if (email) {
      const userMatch = await db.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" as const } },
        select: {
          institutionId: true,
          institution: { select: { id: true, name: true, code: true, slug: true } },
        },
      });

      if (userMatch?.institution?.name) {
        return NextResponse.json({
          success: true,
          id: userMatch.institution.id,
          name: userMatch.institution.name,
          code: userMatch.institution.code,
          slug: userMatch.institution.slug,
          logo: await resolveLogo(userMatch.institution.id),
        });
      }

      if (userMatch?.institutionId) {
        const platInst = await db.platformInstitution.findUnique({
          where: { id: userMatch.institutionId },
          select: { id: true, name: true, code: true, slug: true },
        });
        if (platInst?.name) {
          return NextResponse.json({
            success: true,
            id: platInst.id,
            name: platInst.name,
            code: platInst.code,
            slug: platInst.slug,
            logo: await resolveLogo(platInst.id),
          });
        }
      }
    }

    // 3. Check platform_settings for configured primary/active institution
    try {
      const settings = await db.platformSetting.findMany({
        where: { key: { in: ["primary_institution_id", "primary_institution_name"] } },
      });
      const idSetting = settings.find((s) => s.key === "primary_institution_id");
      const nameSetting = settings.find((s) => s.key === "primary_institution_name");

      if (idSetting && typeof idSetting.value === "string") {
        const inst =
          (await db.institution.findUnique({
            where: { id: idSetting.value },
            select: { id: true, name: true, code: true, slug: true },
          })) ||
          (await db.platformInstitution.findUnique({
            where: { id: idSetting.value },
            select: { id: true, name: true, code: true, slug: true },
          }));

        if (inst?.name) {
          return NextResponse.json({
            success: true,
            id: inst.id,
            name: inst.name,
            code: inst.code,
            slug: inst.slug,
            logo: await resolveLogo(inst.id),
          });
        }
      }

      if (nameSetting && typeof nameSetting.value === "string") {
        return NextResponse.json({
          success: true,
          name: nameSetting.value,
          logo: null,
        });
      }
    } catch {}

    // 4. Default to the latest active real institution created by administrators
    const latestRealInst = await db.institution.findFirst({
      where: {
        isActive: true,
        id: { not: "inst_apex" },
        slug: { notIn: ["apex-tech", "APEX-TECH"] },
        name: { not: { startsWith: "E2E" } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, code: true, slug: true },
    });

    if (latestRealInst?.name) {
      return NextResponse.json({
        success: true,
        id: latestRealInst.id,
        name: latestRealInst.name,
        code: latestRealInst.code,
        slug: latestRealInst.slug,
        logo: await resolveLogo(latestRealInst.id),
      });
    }

    // Check latest in platformInstitution as well
    const latestPlatInst = await db.platformInstitution.findFirst({
      where: {
        status: "ACTIVE",
        id: { not: "inst_apex" },
        slug: { notIn: ["apex-tech", "APEX-TECH"] },
        name: { not: { startsWith: "E2E" } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, code: true, slug: true },
    });

    if (latestPlatInst?.name) {
      return NextResponse.json({
        success: true,
        id: latestPlatInst.id,
        name: latestPlatInst.name,
        code: latestPlatInst.code,
        slug: latestPlatInst.slug,
        logo: await resolveLogo(latestPlatInst.id),
      });
    }

    // 5. Fallback to any active institution
    const anyActive = await db.institution.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, code: true, slug: true },
    });

    if (anyActive?.name) {
      return NextResponse.json({
        success: true,
        id: anyActive.id,
        name: anyActive.name,
        code: anyActive.code,
        slug: anyActive.slug,
        logo: await resolveLogo(anyActive.id),
      });
    }

    return NextResponse.json({
      success: true,
      name: "Campus Portal",
    });
  } catch {
    return NextResponse.json({
      success: true,
      name: "Campus Portal",
    });
  }
}
