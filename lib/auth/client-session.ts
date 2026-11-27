/**
 * Client-side session fetching utility with concurrent request deduplication.
 * Prevents multiple simultaneous calls to /api/auth/me across mounting components.
 */

import type { InstitutionThemeConfig } from "@/lib/theme-utils";

const cachedMePromises = new Map<string, Promise<ClientSessionResponse>>();
let clientSessionCacheGeneration = 0;

export const CLIENT_SESSION_INVALIDATED_EVENT = "sst:client-session-invalidated";

export interface ClientSessionIdentityInput {
  userId?: string | null;
  email?: string | null;
  jti?: string;
  iat?: number;
  exp?: number;
  institutionId?: string | null;
  role?: string | null;
  permissions?: string[];
}

export interface ClientSessionUser
  extends Omit<ClientSessionIdentityInput, "userId" | "email" | "role"> {
  userId: string;
  email: string;
  role: string;
  fullName: string;
  institutionName: string;
  id?: string;
  name?: string;
  institutionCode?: string | null;
  institutionSlug?: string | null;
  institution?: ClientInstitutionSnapshot | null;
  studentId?: string;
  activeChildId?: string;
  mustChangePassword?: boolean;
}

export interface ClientInstitutionSnapshot {
  institutionId?: string | null;
  id?: string | null;
  name?: string | null;
  displayName?: string | null;
  code?: string | null;
  slug?: string | null;
  logoUrl?: string | null;
  logo?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  themeConfig?: InstitutionThemeConfig;
}

export type ClientSessionResponse =
  | {
      success: true;
      data: {
        session?: ClientSessionUser;
        branding?: ClientInstitutionSnapshot | null;
        institution?: ClientInstitutionSnapshot | null;
        landingRoute?: string;
        student?: unknown;
        guardian?: unknown;
      };
      error?: string;
    }
  | {
      success?: false;
      error?: string;
      data?: undefined;
    };

export interface ClientSessionRequestState {
  requestGeneration: number;
  currentGeneration: number;
  sessionIdentity: string | null;
  activeTenantId: string | null;
  requestTenantId?: string;
}

export interface CapturedClientSessionRequest {
  generation: number;
  sessionIdentity: string | null;
  tenantId: string | null;
}

export interface CurrentClientSessionContext {
  generation: number;
  sessionIdentity: string | null;
  tenantId: string | null;
}

export function getClientSessionIdentity(
  session?: ClientSessionIdentityInput | null
): string | null {
  if (!session) return null;
  const subject = session.userId || session.email;
  if (!subject) return null;

  return JSON.stringify([
    subject,
    session.jti || null,
    session.iat ?? null,
    session.exp ?? null,
    session.institutionId || null,
    (session.role || "").toUpperCase(),
    Array.isArray(session.permissions) ? [...session.permissions].sort() : null,
  ]);
}

export function getClientSessionIdentityFromResponse(
  response?: ClientSessionResponse | null
): string | null {
  if (!response || !response.success) return null;

  const session = response.data.session;
  if (!session) return null;

  const branding = response.data.branding || response.data.institution;
  return getClientSessionIdentity({
    ...session,
    institutionId: branding?.institutionId || branding?.id || session.institutionId,
  });
}

export function isClientSessionRequestCurrent({
  requestGeneration,
  currentGeneration,
  sessionIdentity,
  activeTenantId,
  requestTenantId,
}: ClientSessionRequestState): boolean {
  return (
    requestGeneration === currentGeneration &&
    sessionIdentity !== null &&
    activeTenantId !== null &&
    (requestTenantId === undefined || requestTenantId === activeTenantId)
  );
}

export function isCapturedClientSessionRequestCurrent(
  captured: CapturedClientSessionRequest,
  current: CurrentClientSessionContext
): boolean {
  if (
    !captured.sessionIdentity ||
    !captured.tenantId ||
    captured.sessionIdentity !== current.sessionIdentity
  ) {
    return false;
  }

  return isClientSessionRequestCurrent({
    requestGeneration: captured.generation,
    currentGeneration: current.generation,
    sessionIdentity: current.sessionIdentity,
    activeTenantId: current.tenantId,
    requestTenantId: captured.tenantId,
  });
}

export function invalidateGenerationIfCurrent(
  currentGeneration: number,
  cleanupGeneration: number
): number {
  return currentGeneration === cleanupGeneration
    ? currentGeneration + 1
    : currentGeneration;
}

export function getClientSessionCacheGeneration(): number {
  return clientSessionCacheGeneration;
}

export function isClientSessionCacheGenerationCurrent(
  generation: number
): boolean {
  return generation === clientSessionCacheGeneration;
}

export async function fetchClientSession(
  token?: string | null,
  expectedSessionIdentity?: string | null
): Promise<ClientSessionResponse> {
  const cacheKey = JSON.stringify([expectedSessionIdentity ?? "__default__", token ?? null]);
  const cached = cachedMePromises.get(cacheKey);
  if (cached) return cached;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const request = fetch("/api/auth/me", {
    cache: "no-store",
    credentials: "include",
    headers,
  })
    .then(async (res) => {
      const data = (await res.json()) as ClientSessionResponse;
      return data;
    });

  if (!cacheKey) return request;

  let sharedRequest: Promise<ClientSessionResponse>;
  sharedRequest = request.finally(() => {
    if (cachedMePromises.get(cacheKey) === sharedRequest) {
      cachedMePromises.delete(cacheKey);
    }
  });
  cachedMePromises.set(cacheKey, sharedRequest);
  return sharedRequest;
}

export function clearClientSessionCache(): void {
  clientSessionCacheGeneration += 1;
  cachedMePromises.clear();
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof Event === "function") {
    try {
      window.dispatchEvent(new Event(CLIENT_SESSION_INVALIDATED_EVENT));
    } catch {
      // Ignore event dispatch errors in restricted/mock environments
    }
  }
}

const STATIC_AUTH_AND_BRANDING_KEYS = [
  "erp_token",
  "erp_user",
  "erp_institution_name",
  "erp_institution",
  "erp_active_child_id",
  "sst_erp_inst_admin_profile",
  "sst_erp_inst_admin_theme_active",
] as const;

const THEME_STORAGE_PREFIX = "sst_erp_inst_admin_theme_";
const THEME_COOKIE_PREFIX = "sst_theme_";

const PORTAL_CSS_VARS = [
  "--admin-sidebar-bg",
  "--admin-primary-btn",
  "--admin-active-nav",
  "--admin-workspace-bg",
  "--admin-card-bg",
  "--admin-text-primary",
  "--admin-text-secondary",
  "--admin-accent",
  "--admin-chart-1",
  "--admin-chart-2",
  "--admin-chart-3",
  "--admin-chart-4",
  "--admin-chart-5",
  "--portal-sidebar-bg",
  "--portal-primary-btn",
  "--portal-active-nav",
  "--portal-workspace-bg",
  "--portal-card-bg",
  "--portal-text-primary",
  "--portal-text-secondary",
  "--portal-accent",
  "--portal-chart-1",
  "--portal-chart-2",
  "--portal-chart-3",
  "--portal-chart-4",
  "--portal-chart-5",
] as const;

/**
 * Clears client-side authentication, branding, theme, and active-child caches
 * across all ERP portals. Safe to call repeatedly and in non-browser or
 * restricted-storage environments without throwing.
 */
export function clearClientAuthAndBrandingCache(): void {
  clearClientSessionCache();

  if (typeof window !== "undefined") {
    try {
      const storage = window.localStorage;
      if (storage) {
        for (const key of STATIC_AUTH_AND_BRANDING_KEYS) {
          try {
            storage.removeItem(key);
          } catch {
            // Ignore individual storage errors
          }
        }

        if (typeof storage.length === "number" && typeof storage.key === "function") {
          const dynamicThemeKeys: string[] = [];
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key && key.startsWith(THEME_STORAGE_PREFIX)) {
              dynamicThemeKeys.push(key);
            }
          }
          for (const key of dynamicThemeKeys) {
            try {
              storage.removeItem(key);
            } catch {
              // Ignore individual storage errors
            }
          }
        }
      }
    } catch {
      // Ignore unavailable localStorage
    }
  }

  if (typeof document !== "undefined") {
    try {
      const expired = "path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
      const cookiesToClear = new Set<string>(["sst_theme_active", "erp_active_child"]);

      if (typeof document.cookie === "string" && document.cookie.length > 0) {
        for (const part of document.cookie.split(";")) {
          const eqIdx = part.indexOf("=");
          const rawName = (eqIdx >= 0 ? part.slice(0, eqIdx) : part).trim();
          if (rawName && rawName.startsWith(THEME_COOKIE_PREFIX)) {
            cookiesToClear.add(rawName);
          }
        }
      }

      for (const cookieName of cookiesToClear) {
        document.cookie = `${cookieName}=; ${expired}`;
      }
    } catch {
      // Ignore cookie write errors
    }

    try {
      const rootStyle = document.documentElement?.style;
      if (rootStyle && typeof rootStyle.removeProperty === "function") {
        for (const cssVar of PORTAL_CSS_VARS) {
          rootStyle.removeProperty(cssVar);
        }
      }
    } catch {
      // Ignore DOM style errors
    }
  }
}
