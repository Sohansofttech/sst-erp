/**
 * Centralized Multi-Tenant Institution Branding Read Resolver (Phase 1)
 *
 * Precedence Rules (read-only, never mutates or overwrites DB records):
 * 1. Display Name:
 *    InstitutionBranding.displayName (non-empty)
 *      > Institution.name
 *      > PlatformInstitution.name
 *      > fallbackName
 *      > "Campus Portal"
 * 2. Code & Slug:
 *    Institution.code / PlatformInstitution.code
 *    Institution.slug / PlatformInstitution.slug
 * 3. Logo URL:
 *    InstitutionBranding.logoUrl (non-empty)
 *      > Institution.logoUrl (non-empty)
 *      > null
 * 4. Colors & 9-Token InstitutionThemeConfig:
 *    Base: DEFAULT_INSTITUTION_THEME
 *      + InstitutionBranding (primaryColor -> sidebarBackground;
 *        secondaryColor -> primaryButtonColor, activeSidebarNav, accentColor)
 *      + PlatformSetting ("theme:${institutionId}") validated hex tokens
 *        (highest precedence for Institution Admin customizer overrides)
 */

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import {
  DEFAULT_INSTITUTION_THEME,
  InstitutionThemeConfig,
  isValidHex,
  normalizeHex,
} from "@/lib/theme-utils";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
export const BRANDING_STORAGE_BUCKET =
  process.env.SUPABASE_BRANDING_BUCKET || "course-materials";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolvedInstitutionBranding {
  institutionId: string;
  displayName: string;
  code: string | null;
  slug: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  themeConfig: InstitutionThemeConfig;
}

function nonEmpty(val?: string | null): string | null {
  const trimmed = typeof val === "string" ? val.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function mergeValidatedTheme(
  base: InstitutionThemeConfig,
  candidate: unknown
): InstitutionThemeConfig {
  if (!candidate || typeof candidate !== "object") {
    return base;
  }
  const raw = candidate as Record<string, unknown>;
  const pickHex = (key: keyof Omit<InstitutionThemeConfig, "chartPalette">, fallback: string) => {
    const val = raw[key];
    return typeof val === "string" && isValidHex(val) ? val : fallback;
  };

  const chartPalette =
    Array.isArray(raw.chartPalette) &&
    raw.chartPalette.length > 0 &&
    raw.chartPalette.every((c) => typeof c === "string" && isValidHex(c))
      ? (raw.chartPalette as string[])
      : base.chartPalette;

  return {
    sidebarBackground: pickHex("sidebarBackground", base.sidebarBackground),
    primaryButtonColor: pickHex("primaryButtonColor", base.primaryButtonColor),
    activeSidebarNav: pickHex("activeSidebarNav", base.activeSidebarNav),
    workspaceBackground: pickHex("workspaceBackground", base.workspaceBackground),
    cardBackground: pickHex("cardBackground", base.cardBackground),
    primaryTextColor: pickHex("primaryTextColor", base.primaryTextColor),
    secondaryTextColor: pickHex("secondaryTextColor", base.secondaryTextColor),
    accentColor: pickHex("accentColor", base.accentColor),
    chartPalette,
  };
}

export async function resolveInstitutionBranding(
  institutionId: string,
  fallbackName?: string | null
): Promise<ResolvedInstitutionBranding> {
  const isUuid = UUID_REGEX.test(institutionId);

  let instName: string | null = null;
  let instCode: string | null = null;
  let instSlug: string | null = null;
  let instLogoUrl: string | null = null;

  try {
    const inst = await db.institution.findUnique({
      where: { id: institutionId },
      select: { name: true, code: true, slug: true, logoUrl: true },
    });
    if (inst) {
      instName = nonEmpty(inst.name);
      instCode = nonEmpty(inst.code);
      instSlug = nonEmpty(inst.slug);
      instLogoUrl = nonEmpty(inst.logoUrl);
    }
  } catch {
    // Non-fatal fallback
  }

  if (!instName || !instCode || !instSlug) {
    try {
      const platInst = await db.platformInstitution.findUnique({
        where: { id: institutionId },
        select: { name: true, code: true, slug: true },
      });
      if (platInst) {
        instName = instName || nonEmpty(platInst.name);
        instCode = instCode || nonEmpty(platInst.code);
        instSlug = instSlug || nonEmpty(platInst.slug);
      }
    } catch {
      // Non-fatal fallback
    }
  }

  let brandingDisplayName: string | null = null;
  let brandingLogoUrl: string | null = null;
  let brandingPrimary: string | null = null;
  let brandingSecondary: string | null = null;

  if (isUuid) {
    try {
      const branding = await db.institutionBranding.findUnique({
        where: { institutionId },
        select: {
          displayName: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
        },
      });
      if (branding) {
        brandingDisplayName = nonEmpty(branding.displayName);
        brandingLogoUrl = nonEmpty(branding.logoUrl);
        brandingPrimary =
          typeof branding.primaryColor === "string" && isValidHex(branding.primaryColor)
            ? branding.primaryColor
            : null;
        brandingSecondary =
          typeof branding.secondaryColor === "string" && isValidHex(branding.secondaryColor)
            ? branding.secondaryColor
            : null;
      }
    } catch {
      // Non-fatal fallback
    }
  }

  let themeConfig: InstitutionThemeConfig = {
    ...DEFAULT_INSTITUTION_THEME,
    ...(brandingPrimary ? { sidebarBackground: brandingPrimary } : {}),
    ...(brandingSecondary
      ? {
          primaryButtonColor: brandingSecondary,
          activeSidebarNav: brandingSecondary,
          accentColor: brandingSecondary,
        }
      : {}),
  };

  try {
    const settingKey = `theme:${institutionId}`;
    const rows = await db.$queryRaw<Array<{ value: unknown }>>`
      SELECT value FROM "PlatformSetting" WHERE key = ${settingKey} LIMIT 1
    `;
    if (rows && rows.length > 0 && rows[0]?.value) {
      themeConfig = mergeValidatedTheme(themeConfig, rows[0].value);
    }
  } catch {
    // Non-fatal fallback when PlatformSetting is unavailable
  }

  const displayName =
    brandingDisplayName ||
    instName ||
    nonEmpty(fallbackName) ||
    "Campus Portal";

  const logoUrl = brandingLogoUrl || instLogoUrl || null;
  const primaryColor =
    themeConfig.sidebarBackground ||
    brandingPrimary ||
    DEFAULT_INSTITUTION_THEME.sidebarBackground;
  const secondaryColor =
    themeConfig.primaryButtonColor ||
    brandingSecondary ||
    DEFAULT_INSTITUTION_THEME.primaryButtonColor;

  return {
    institutionId,
    displayName,
    code: instCode,
    slug: instSlug,
    logoUrl,
    primaryColor,
    secondaryColor,
    themeConfig,
  };
}

export interface BrandingStorageClient {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        data: Buffer,
        options: { contentType: string; upsert: boolean }
      ) => Promise<{ error: { message?: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (
        paths: string[]
      ) => Promise<{ error: { message?: string } | null }>;
    };
  };
}

export function extractBrandingStorageObjectPath(
  logoUrl: string | null | undefined,
  institutionId: string,
  bucket: string = BRANDING_STORAGE_BUCKET
): string | null {
  if (!logoUrl || !institutionId || !bucket) return null;
  let parsed: URL;
  try {
    parsed = new URL(logoUrl);
  } catch {
    return null;
  }
  const escapedBucket = bucket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = parsed.pathname.match(
    new RegExp(`/storage/v1/object/(?:public|authenticated|sign)/${escapedBucket}/(.+)$`)
  );
  if (!match || !match[1]) return null;

  const decoded = decodeURIComponent(match[1]);
  if (!decoded || decoded.includes("..") || decoded.startsWith("/")) {
    return null;
  }
  const expectedPrefix = `${institutionId}/branding/`;
  if (!decoded.startsWith(expectedPrefix)) {
    return null;
  }
  return decoded;
}

async function tryRemoveStorageObject(
  storageClient: BrandingStorageClient,
  objectPath: string,
  reason: string
): Promise<void> {
  try {
    const { error } = await storageClient.storage
      .from(BRANDING_STORAGE_BUCKET)
      .remove([objectPath]);
    if (error) {
      console.warn(
        `[Branding Storage] Failed to remove ${reason} object "${objectPath}":`,
        error.message || error
      );
    }
  } catch (err) {
    console.warn(
      `[Branding Storage] Exception removing ${reason} object "${objectPath}":`,
      err instanceof Error ? err.message : err
    );
  }
}

export interface SaveInstitutionBrandingInput {
  institutionId: string;
  displayName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  themeConfig?: InstitutionThemeConfig | null;
}

export function validateBrandingLogoUrl(raw?: string | null): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^data:/i.test(trimmed)) {
    throw new Error(
      "Base64 data URLs are not allowed for institution logos. Upload the image file to object storage or provide an HTTPS URL."
    );
  }
  if (trimmed.length > 2048) {
    throw new Error("Logo URL exceeds maximum allowed length.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid logo URL format. Must be a valid HTTPS or HTTP URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Invalid logo URL protocol. Only HTTPS and HTTP URLs are permitted.");
  }
  return parsed.toString();
}

export function validateBrandingLogoBuffer(buffer: Buffer): {
  ext: "png" | "jpg" | "webp";
  contentType: string;
} {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Logo file is empty.");
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new Error("Logo file exceeds the 2 MB maximum size limit.");
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: "png", contentType: "image/png" };
  }

  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }

  throw new Error("Unsupported or invalid image file. Only verified PNG, JPEG, and WebP images are allowed.");
}

export async function saveInstitutionBranding(
  input: SaveInstitutionBrandingInput
): Promise<ResolvedInstitutionBranding> {
  const { institutionId } = input;
  const isUuid = UUID_REGEX.test(institutionId);
  const current = await resolveInstitutionBranding(institutionId);

  const nextDisplayName =
    input.displayName !== undefined
      ? nonEmpty(input.displayName) || current.displayName
      : current.displayName;

  const nextLogoUrl =
    input.logoUrl !== undefined
      ? validateBrandingLogoUrl(input.logoUrl)
      : current.logoUrl;

  let nextTheme: InstitutionThemeConfig = current.themeConfig;
  if (input.themeConfig) {
    nextTheme = mergeValidatedTheme(current.themeConfig, input.themeConfig);
  }
  if (input.primaryColor && isValidHex(input.primaryColor)) {
    const p = normalizeHex(input.primaryColor);
    nextTheme = { ...nextTheme, sidebarBackground: p };
  }
  if (input.secondaryColor && isValidHex(input.secondaryColor)) {
    const s = normalizeHex(input.secondaryColor);
    nextTheme = {
      ...nextTheme,
      primaryButtonColor: s,
      activeSidebarNav: s,
      accentColor: s,
    };
  }

  const nextPrimary = normalizeHex(
    nextTheme.sidebarBackground || DEFAULT_INSTITUTION_THEME.sidebarBackground
  );
  const nextSecondary = normalizeHex(
    nextTheme.primaryButtonColor || DEFAULT_INSTITUTION_THEME.primaryButtonColor
  );

  await db.$transaction(async (tx) => {
    if (isUuid) {
      await tx.institutionBranding.upsert({
        where: { institutionId },
        update: {
          ...(input.displayName !== undefined ? { displayName: nextDisplayName } : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: nextLogoUrl } : {}),
          primaryColor: nextPrimary,
          secondaryColor: nextSecondary,
        },
        create: {
          institutionId,
          displayName: nextDisplayName,
          logoUrl: nextLogoUrl,
          primaryColor: nextPrimary,
          secondaryColor: nextSecondary,
        },
      });
    }

    const existingInst = await tx.institution.findUnique({
      where: { id: institutionId },
      select: { id: true },
    });
    if (existingInst) {
      await tx.institution.update({
        where: { id: institutionId },
        data: {
          ...(input.displayName !== undefined ? { name: nextDisplayName } : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: nextLogoUrl } : {}),
        },
      });
    }

    if (input.displayName !== undefined) {
      const existingPlatformInst = await tx.platformInstitution.findUnique({
        where: { id: institutionId },
        select: { id: true },
      });
      if (existingPlatformInst) {
        await tx.platformInstitution.update({
          where: { id: institutionId },
          data: { name: nextDisplayName },
        });
      }
    }

    if (input.themeConfig || input.primaryColor || input.secondaryColor) {
      const settingKey = `theme:${institutionId}`;
      const themeValue = JSON.parse(
        JSON.stringify(nextTheme)
      ) as Prisma.InputJsonValue;
      await tx.platformSetting.upsert({
        where: { key: settingKey },
        create: {
          key: settingKey,
          value: themeValue,
        },
        update: {
          value: themeValue,
        },
      });
    }
  });

  return resolveInstitutionBranding(institutionId);
}

export async function resetInstitutionBrandingTheme(
  institutionId: string
): Promise<ResolvedInstitutionBranding> {
  const isUuid = UUID_REGEX.test(institutionId);
  const current = await resolveInstitutionBranding(institutionId);

  await db.$transaction(async (tx) => {
    const settingKey = `theme:${institutionId}`;
    await tx.$executeRaw`DELETE FROM "PlatformSetting" WHERE key = ${settingKey}`;

    if (isUuid) {
      await tx.institutionBranding.upsert({
        where: { institutionId },
        update: {
          primaryColor: DEFAULT_INSTITUTION_THEME.sidebarBackground,
          secondaryColor: DEFAULT_INSTITUTION_THEME.primaryButtonColor,
        },
        create: {
          institutionId,
          displayName: current.displayName,
          logoUrl: current.logoUrl,
          primaryColor: DEFAULT_INSTITUTION_THEME.sidebarBackground,
          secondaryColor: DEFAULT_INSTITUTION_THEME.primaryButtonColor,
        },
      });
    }
  });

  return resolveInstitutionBranding(institutionId);
}

export async function uploadAndSaveInstitutionLogo(params: {
  institutionId: string;
  buffer: Buffer;
  storageClient?: BrandingStorageClient;
}): Promise<ResolvedInstitutionBranding> {
  const { institutionId, buffer } = params;
  const { ext, contentType } = validateBrandingLogoBuffer(buffer);

  const storageClient: BrandingStorageClient =
    params.storageClient || (await import("@/lib/supabase/storage")).supabaseStorage;

  const previousBranding = await resolveInstitutionBranding(institutionId);
  const previousLogoUrl = previousBranding.logoUrl;

  const objectPath = `${institutionId}/branding/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await storageClient.storage
    .from(BRANDING_STORAGE_BUCKET)
    .upload(objectPath, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Logo upload failed: ${uploadError.message || "Storage provider error"}`
    );
  }

  let saved: ResolvedInstitutionBranding;
  try {
    const { data: publicUrlData } = storageClient.storage
      .from(BRANDING_STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    const publicUrl = validateBrandingLogoUrl(publicUrlData?.publicUrl);
    if (!publicUrl) {
      throw new Error("Logo upload succeeded but storage did not return a valid public URL.");
    }

    saved = await saveInstitutionBranding({
      institutionId,
      logoUrl: publicUrl,
    });
  } catch (err) {
    await tryRemoveStorageObject(storageClient, objectPath, "orphaned-upload");
    throw err;
  }

  const previousObjectPath = extractBrandingStorageObjectPath(previousLogoUrl, institutionId);
  if (previousObjectPath && previousObjectPath !== objectPath) {
    await tryRemoveStorageObject(storageClient, previousObjectPath, "replaced-previous-logo");
  }

  return saved;
}

export async function deleteInstitutionLogo(params: {
  institutionId: string;
  storageClient?: BrandingStorageClient;
}): Promise<ResolvedInstitutionBranding> {
  const { institutionId } = params;
  const storageClient: BrandingStorageClient =
    params.storageClient || (await import("@/lib/supabase/storage")).supabaseStorage;

  const previousBranding = await resolveInstitutionBranding(institutionId);
  const saved = await saveInstitutionBranding({
    institutionId,
    logoUrl: null,
  });

  const previousObjectPath = extractBrandingStorageObjectPath(
    previousBranding.logoUrl,
    institutionId
  );
  if (previousObjectPath) {
    await tryRemoveStorageObject(storageClient, previousObjectPath, "deleted-logo");
  }

  return saved;
}
