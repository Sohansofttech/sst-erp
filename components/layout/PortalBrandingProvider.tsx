"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CLIENT_SESSION_INVALIDATED_EVENT,
  fetchClientSession,
  getClientSessionCacheGeneration,
  getClientSessionIdentityFromResponse,
  isClientSessionCacheGenerationCurrent,
  type ClientSessionResponse,
} from "@/lib/auth/client-session";
import {
  DEFAULT_INSTITUTION_THEME,
  isValidHex,
  type InstitutionThemeConfig,
} from "@/lib/theme-utils";

export interface PortalBrandingSnapshot {
  institutionId: string;
  fullName: string;
  email: string;
  role: "STUDENT" | "PARENT";
  institutionName: string;
  institutionCode: string | null;
  institutionLogo: string | null;
  themeConfig: InstitutionThemeConfig;
  sessionIdentity: string | null;
}

const PortalBrandingContext = createContext<PortalBrandingSnapshot | null>(null);

export function getPortalBrandingProviderKey(
  branding: PortalBrandingSnapshot | null
): string {
  return JSON.stringify([
    branding?.sessionIdentity ?? null,
    branding?.institutionId ?? null,
    branding?.fullName ?? null,
    branding?.email ?? null,
    branding?.role ?? null,
    branding?.institutionName ?? null,
    branding?.institutionCode ?? null,
    branding?.institutionLogo ?? null,
    branding?.themeConfig ?? null,
  ]);
}

export function isPortalBrandingSnapshotForSession(
  branding: PortalBrandingSnapshot,
  expectedSessionIdentity: string | null,
  expectedInstitutionId: string | null
): boolean {
  return (
    (!expectedSessionIdentity ||
      branding.sessionIdentity === expectedSessionIdentity) &&
    (!expectedInstitutionId || branding.institutionId === expectedInstitutionId)
  );
}

function resolveTheme(
  rawTheme: Partial<InstitutionThemeConfig> | null | undefined,
  primaryColor: string | null | undefined,
  secondaryColor: string | null | undefined,
): InstitutionThemeConfig {
  const primary =
    typeof primaryColor === "string" && isValidHex(primaryColor)
      ? primaryColor
      : undefined;
  const secondary =
    typeof secondaryColor === "string" && isValidHex(secondaryColor)
      ? secondaryColor
      : undefined;
  const theme = rawTheme ?? {};
  const color = (value: string | undefined, fallback: string): string =>
    typeof value === "string" && isValidHex(value) ? value : fallback;

  return {
    ...DEFAULT_INSTITUTION_THEME,
    sidebarBackground: color(theme.sidebarBackground, primary ?? DEFAULT_INSTITUTION_THEME.sidebarBackground),
    activeSidebarNav: color(theme.activeSidebarNav, secondary ?? DEFAULT_INSTITUTION_THEME.activeSidebarNav),
    primaryButtonColor: color(theme.primaryButtonColor, secondary ?? DEFAULT_INSTITUTION_THEME.primaryButtonColor),
    workspaceBackground: color(theme.workspaceBackground, DEFAULT_INSTITUTION_THEME.workspaceBackground),
    cardBackground: color(theme.cardBackground, DEFAULT_INSTITUTION_THEME.cardBackground),
    primaryTextColor: color(theme.primaryTextColor, DEFAULT_INSTITUTION_THEME.primaryTextColor),
    secondaryTextColor: color(theme.secondaryTextColor, DEFAULT_INSTITUTION_THEME.secondaryTextColor),
    accentColor: color(theme.accentColor, secondary ?? DEFAULT_INSTITUTION_THEME.accentColor),
    chartPalette:
      Array.isArray(theme.chartPalette) && theme.chartPalette.every(isValidHex)
        ? theme.chartPalette
        : DEFAULT_INSTITUTION_THEME.chartPalette,
  };
}

export function getPortalBrandingSnapshot(
  response: ClientSessionResponse,
): PortalBrandingSnapshot | null {
  if (!response.success || !response.data?.session) return null;

  const session = response.data.session;
  const branding = response.data.branding;
  const institution = session.institution;
  const brandingInstitutionId = branding?.institutionId || branding?.id || "";
  const sessionInstitutionId = session.institutionId || institution?.institutionId || institution?.id || "";
  if (
    brandingInstitutionId &&
    sessionInstitutionId &&
    brandingInstitutionId !== sessionInstitutionId
  ) {
    return null;
  }
  const institutionId = brandingInstitutionId || sessionInstitutionId;
  const role = session.role.toUpperCase();
  if (!institutionId || (role !== "STUDENT" && role !== "PARENT")) return null;

  const rawTheme = branding?.themeConfig ?? institution?.themeConfig;
  return {
    institutionId,
    fullName: session.fullName || session.name || "",
    email: session.email || "",
    role,
    institutionName:
      branding?.displayName || institution?.name || session.institutionName || "Campus Portal",
    institutionCode: branding?.code || institution?.code || null,
    institutionLogo: branding?.logoUrl || institution?.logoUrl || null,
    themeConfig: resolveTheme(
      rawTheme,
      branding?.primaryColor || institution?.primaryColor,
      branding?.secondaryColor || institution?.secondaryColor,
    ),
    sessionIdentity: getClientSessionIdentityFromResponse(response),
  };
}

function sameBranding(
  left: PortalBrandingSnapshot | null,
  right: PortalBrandingSnapshot | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.institutionId === right.institutionId &&
    left.fullName === right.fullName &&
    left.email === right.email &&
    left.role === right.role &&
    left.institutionName === right.institutionName &&
    left.institutionCode === right.institutionCode &&
    left.institutionLogo === right.institutionLogo &&
    left.sessionIdentity === right.sessionIdentity &&
    JSON.stringify(left.themeConfig) === JSON.stringify(right.themeConfig)
  );
}

function cacheVerifiedInstitution(branding: PortalBrandingSnapshot): void {
  try {
    const previous = localStorage.getItem("erp_institution");
    if (previous) {
      const previousId = (JSON.parse(previous) as { id?: string }).id;
      if (previousId && previousId !== branding.institutionId) {
        localStorage.removeItem("erp_institution");
        localStorage.removeItem("erp_institution_name");
      }
    }

    localStorage.setItem("erp_institution_name", branding.institutionName);
    localStorage.setItem(
      "erp_institution",
      JSON.stringify({
        id: branding.institutionId,
        name: branding.institutionName,
        code: branding.institutionCode,
        logo: branding.institutionLogo,
      }),
    );
  } catch (error) {
    console.warn("Unable to cache verified institution branding.", error);
  }
}

function clearCachedPortalInstitution(): void {
  try {
    localStorage.removeItem("erp_institution");
    localStorage.removeItem("erp_institution_name");
  } catch (error) {
    console.warn("Unable to clear cached institution branding.", error);
  }
}

export function PortalBrandingProvider({
  initialBranding,
  children,
}: {
  initialBranding: PortalBrandingSnapshot | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [branding, setBranding] = useState(initialBranding);
  const requestGeneration = useRef(0);
  const expectedSessionIdentity = useRef(initialBranding?.sessionIdentity ?? null);
  const expectedInstitutionId = useRef(initialBranding?.institutionId ?? null);

  useEffect(() => {
    let active = true;
    if (initialBranding) cacheVerifiedInstitution(initialBranding);

    const handleSessionInvalidated = () => {
      requestGeneration.current += 1;
      expectedSessionIdentity.current = null;
      expectedInstitutionId.current = null;
      clearCachedPortalInstitution();
      setBranding(null);
    };

    const refresh = async () => {
      const generation = ++requestGeneration.current;
      const cacheGeneration = getClientSessionCacheGeneration();
      const requestedSessionIdentity = expectedSessionIdentity.current;
      try {
        const response = await fetchClientSession(
          undefined,
          requestedSessionIdentity
        );
        if (
          !active ||
          generation !== requestGeneration.current ||
          !isClientSessionCacheGenerationCurrent(cacheGeneration)
        ) return;

        const nextBranding = getPortalBrandingSnapshot(response);
        if (!nextBranding) {
          clearCachedPortalInstitution();
          setBranding(null);
          router.refresh();
          return;
        }

        if (
          !isPortalBrandingSnapshotForSession(
            nextBranding,
            expectedSessionIdentity.current,
            expectedInstitutionId.current
          )
        ) {
          clearCachedPortalInstitution();
          setBranding(null);
          router.refresh();
          return;
        }

        if (!expectedSessionIdentity.current) {
          expectedSessionIdentity.current = nextBranding.sessionIdentity;
        }
        if (!expectedInstitutionId.current) {
          expectedInstitutionId.current = nextBranding.institutionId;
        }
        cacheVerifiedInstitution(nextBranding);
        setBranding((previous) =>
          sameBranding(previous, nextBranding) ? previous : nextBranding,
        );
      } catch (error) {
        if (active && generation === requestGeneration.current) {
          console.error("Unable to refresh the authenticated portal session.", error);
        }
      }
    };

    window.addEventListener(
      CLIENT_SESSION_INVALIDATED_EVENT,
      handleSessionInvalidated
    );
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 60_000);
    const handleFocus = () => void refresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      requestGeneration.current += 1;
      window.clearInterval(intervalId);
      window.removeEventListener(
        CLIENT_SESSION_INVALIDATED_EVENT,
        handleSessionInvalidated
      );
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [initialBranding, router]);

  return (
    <PortalBrandingContext.Provider value={branding}>
      {children}
    </PortalBrandingContext.Provider>
  );
}

export function usePortalBranding(): PortalBrandingSnapshot | null {
  return useContext(PortalBrandingContext);
}
