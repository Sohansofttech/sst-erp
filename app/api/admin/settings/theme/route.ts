import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import {
  DEFAULT_INSTITUTION_THEME,
  PRESET_THEMES,
  isValidHex,
  normalizeHex,
  checkThemeAccessibility,
  InstitutionThemeConfig,
} from "@/lib/theme-utils";
import db from "@/lib/db";
import { requireReadReq, requireWriteReq } from "@/lib/security/support-access";


// Global in-memory multi-tenant theme registry (resilient fallback when DB is disconnected)
const globalThemeRegistry = new Map<string, InstitutionThemeConfig>();

// Seed preset multi-tenant themes for testing
globalThemeRegistry.set("inst_apex", DEFAULT_INSTITUTION_THEME);
globalThemeRegistry.set("inst_horizon", PRESET_THEMES.horizon.theme);
globalThemeRegistry.set("inst_crimson", PRESET_THEMES.crimson.theme);

const isUuid = (val: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);
    await requireReadReq(req, institutionId);

    // 1. Try complete 9-token theme persistence from PlatformSetting (PostgreSQL JSONB)
    try {
      const settingKey = `theme:${institutionId}`;
      const rows: any = await db.$queryRaw`
        SELECT value FROM "PlatformSetting" WHERE key = ${settingKey} LIMIT 1
      `;
      if (rows && rows.length > 0 && rows[0]?.value) {
        const dbTheme = rows[0].value as InstitutionThemeConfig;
        globalThemeRegistry.set(institutionId, dbTheme);
        return NextResponse.json({
          success: true,
          institutionId,
          theme: dbTheme,
          source: "DATABASE_FULL",
        });
      }
    } catch {
      // PlatformSetting lookup fallback
    }

    // 2. Try DB branding if institutionId is a valid UUID
    if (isUuid(institutionId)) {
      try {
        const branding = await db.institutionBranding.findUnique({
          where: { institutionId },
        });
        if (branding) {
          const cached = globalThemeRegistry.get(institutionId);
          const theme: InstitutionThemeConfig = cached || {
            ...DEFAULT_INSTITUTION_THEME,
            sidebarBackground: branding.primaryColor || DEFAULT_INSTITUTION_THEME.sidebarBackground,
            primaryButtonColor: branding.secondaryColor || DEFAULT_INSTITUTION_THEME.primaryButtonColor,
            activeSidebarNav: branding.secondaryColor || DEFAULT_INSTITUTION_THEME.activeSidebarNav,
          };
          return NextResponse.json({
            success: true,
            institutionId,
            theme,
            source: "DATABASE",
          });
        }
      } catch {
        // DB unreachable or table not migrated; fall through to registry
      }
    }

    // 3. Registry / Multi-Tenant Fallback
    const theme = globalThemeRegistry.get(institutionId) || DEFAULT_INSTITUTION_THEME;

    return NextResponse.json({
      success: true,
      institutionId,
      theme,
      source: "REGISTRY",
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

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid theme payload: JSON object expected." },
        { status: 400 }
      );
    }

    // Check Reset Action
    if (body.action === "RESET") {
      globalThemeRegistry.set(institutionId, DEFAULT_INSTITUTION_THEME);
      try {
        const settingKey = `theme:${institutionId}`;
        await db.$executeRaw`DELETE FROM "PlatformSetting" WHERE key = ${settingKey}`;
      } catch {}
      return NextResponse.json({
        success: true,
        message: "Theme reset to default institutional tokens.",
        theme: DEFAULT_INSTITUTION_THEME,
      });
    }

    // Validate the 9 customizable properties
    const requiredColorFields = [
      "sidebarBackground",
      "primaryButtonColor",
      "activeSidebarNav",
      "workspaceBackground",
      "cardBackground",
      "primaryTextColor",
      "secondaryTextColor",
      "accentColor",
    ] as const;

    for (const field of requiredColorFields) {
      if (body[field] && !isValidHex(body[field])) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid hex code format for ${field}: "${body[field]}". Must be a valid 3 or 6 digit hex (e.g. #123B5A).`,
          },
          { status: 400 }
        );
      }
    }

    // Validate Chart Palette
    if (body.chartPalette) {
      if (!Array.isArray(body.chartPalette) || body.chartPalette.length === 0) {
        return NextResponse.json(
          { success: false, error: "chartPalette must be an array of valid hex color strings." },
          { status: 400 }
        );
      }
      for (const color of body.chartPalette) {
        if (!isValidHex(color)) {
          return NextResponse.json(
            { success: false, error: `Invalid hex color in chartPalette: "${color}".` },
            { status: 400 }
          );
        }
      }
    }

    // Construct sanitized theme
    const currentTheme = globalThemeRegistry.get(institutionId) || DEFAULT_INSTITUTION_THEME;
    const sanitizedTheme: InstitutionThemeConfig = {
      sidebarBackground: normalizeHex(body.sidebarBackground || currentTheme.sidebarBackground),
      primaryButtonColor: normalizeHex(body.primaryButtonColor || currentTheme.primaryButtonColor),
      activeSidebarNav: normalizeHex(body.activeSidebarNav || currentTheme.activeSidebarNav),
      workspaceBackground: normalizeHex(body.workspaceBackground || currentTheme.workspaceBackground),
      cardBackground: normalizeHex(body.cardBackground || currentTheme.cardBackground),
      primaryTextColor: normalizeHex(body.primaryTextColor || currentTheme.primaryTextColor),
      secondaryTextColor: normalizeHex(body.secondaryTextColor || currentTheme.secondaryTextColor),
      chartPalette: Array.isArray(body.chartPalette) && body.chartPalette.length > 0
        ? body.chartPalette.map((c: string) => normalizeHex(c))
        : currentTheme.chartPalette,
      accentColor: normalizeHex(body.accentColor || currentTheme.accentColor),
    };

    // Calculate Accessibility & Contrast warnings (WCAG 2.1 AA)
    const accessibility = checkThemeAccessibility(sanitizedTheme);

    // Save to multi-tenant in-memory registry
    globalThemeRegistry.set(institutionId, sanitizedTheme);

    // 1. Complete 9-token persistence into PlatformSetting (PostgreSQL JSONB)
    try {
      const settingKey = `theme:${institutionId}`;
      await db.$executeRaw`
        INSERT INTO "PlatformSetting" (key, value, description, "updatedAt")
        VALUES (${settingKey}, ${JSON.stringify(sanitizedTheme)}::jsonb, 'Institution 9-token theme configuration', NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW();
      `;
    } catch (settingErr) {
      console.warn("Could not persist full theme to PlatformSetting:", settingErr);
    }

    // 2. Dual persistence to InstitutionBranding if UUID
    if (isUuid(institutionId)) {
      try {
        await db.institutionBranding.upsert({
          where: { institutionId },
          update: {
            primaryColor: sanitizedTheme.sidebarBackground,
            secondaryColor: sanitizedTheme.primaryButtonColor,
          },
          create: {
            institutionId,
            displayName: "Institution",
            primaryColor: sanitizedTheme.sidebarBackground,
            secondaryColor: sanitizedTheme.primaryButtonColor,
          },
        });
      } catch (dbErr) {
        console.warn("Could not persist branding to database:", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Institution theme customization applied successfully.",
      institutionId,
      theme: sanitizedTheme,
      isAccessible: accessibility.isAccessible,
      warnings: accessibility.warnings,
    });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  const { institutionId } = await resolveAdminContext(req);
  await requireWriteReq(req, institutionId);
  return POST(req);
}
