import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  getPortalBrandingProviderKey,
  getPortalBrandingSnapshot,
  isPortalBrandingSnapshotForSession,
  PortalBrandingProvider,
  usePortalBranding,
  type PortalBrandingSnapshot,
} from "../components/layout/PortalBrandingProvider";
import type { ClientSessionResponse } from "../lib/auth/client-session";
import { InstitutionProvider, useInstitution } from "../lib/store";
import { DEFAULT_INSTITUTION_THEME } from "../lib/theme-utils";

function sessionResponse(
  tenantId: string,
  displayName: string,
  logoUrl: string,
  sidebarBackground: string,
): ClientSessionResponse {
  return {
    success: true,
    data: {
      session: {
        userId: "student-1",
        email: "student@example.test",
        role: "STUDENT",
        fullName: "Test Student",
        institutionName: displayName,
        institutionId: tenantId,
      },
      branding: {
        institutionId: tenantId,
        displayName,
        logoUrl,
        primaryColor: sidebarBackground,
        themeConfig: {
          ...DEFAULT_INSTITUTION_THEME,
          sidebarBackground,
        },
      },
    },
  };
}

function PortalBrandingView() {
  const branding = usePortalBranding();
  return (
    <div>
      <span>{branding?.institutionName}</span>
      <img src={branding?.institutionLogo ?? ""} alt="Institution logo" />
      <i>{branding?.themeConfig.sidebarBackground}</i>
    </div>
  );
}

function AdminBrandingView() {
  const { profile, theme } = useInstitution();
  return (
    <div>
      <span>{profile.name}</span>
      <img src={profile.logoUrl} alt="Institution logo" />
      <i>{theme.sidebarBackground}</i>
    </div>
  );
}

const testRouter: AppRouterInstance = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  bfcacheId: "branding-test",
};

test("server-seeded portal branding is rendered on the first frame", () => {
  const initialBranding: PortalBrandingSnapshot = {
    institutionId: "tenant-b",
    fullName: "Test Student",
    email: "student@example.test",
    role: "STUDENT",
    institutionName: "Beta Institute",
    institutionCode: "BETA",
    institutionLogo: "https://cdn.example.test/beta-logo.png",
    themeConfig: {
      ...DEFAULT_INSTITUTION_THEME,
      sidebarBackground: "#1E3A8A",
    },
    sessionIdentity: null,
  };

  const markup = renderToStaticMarkup(
    <AppRouterContext.Provider value={testRouter}>
      <PortalBrandingProvider initialBranding={initialBranding}>
        <PortalBrandingView />
      </PortalBrandingProvider>
    </AppRouterContext.Provider>,
  );

  assert.match(markup, /Beta Institute/);
  assert.match(markup, /beta-logo\.png/);
  assert.match(markup, /#1E3A8A/);
  assert.doesNotMatch(markup, /Campus Portal/);
});

test("server-seeded admin profile and theme avoid default branding on the first frame", () => {
  const theme = { ...DEFAULT_INSTITUTION_THEME, sidebarBackground: "#1E3A8A" };
  const markup = renderToStaticMarkup(
    <InstitutionProvider
      initialTheme={theme}
      initialProfile={{
        id: "tenant-b",
        name: "Beta Institute",
        logoUrl: "https://cdn.example.test/beta-logo.png",
        themeConfig: theme,
      }}
    >
      <AdminBrandingView />
    </InstitutionProvider>,
  );

  assert.match(markup, /Beta Institute/);
  assert.match(markup, /beta-logo\.png/);
  assert.match(markup, /#1E3A8A/);
  assert.doesNotMatch(markup, /Campus Portal/);
});

test("session refresh maps branding atomically and rejects tenant mismatches", () => {
  const response = sessionResponse(
    "tenant-b",
    "Beta Institute",
    "https://cdn.example.test/beta-logo.png",
    "#1E3A8A",
  );
  const branding = getPortalBrandingSnapshot(response);
  assert.equal(branding?.institutionId, "tenant-b");
  assert.equal(branding?.institutionName, "Beta Institute");
  assert.equal(branding?.themeConfig.sidebarBackground, "#1E3A8A");

  const mismatchedResponse = sessionResponse(
    "tenant-a",
    "Alpha Institute",
    "alpha.png",
    "#581C87",
  );
  if (!mismatchedResponse.success) {
    throw new Error("Expected successful test session response.");
  }
  mismatchedResponse.data.branding = {
    institutionId: "tenant-b",
    displayName: "Beta Institute",
    logoUrl: "beta.png",
  };
  assert.equal(getPortalBrandingSnapshot(mismatchedResponse), null);
});

test("rejects a delayed branding response from a previous session", () => {
  const oldBranding = getPortalBrandingSnapshot(
    sessionResponse(
      "tenant-a",
      "Alpha Institute",
      "https://cdn.example.test/alpha-logo.png",
      "#581C87",
    ),
  );
  const newSession = sessionResponse(
    "tenant-a",
    "Alpha Institute",
    "https://cdn.example.test/alpha-logo.png",
    "#581C87",
  );
  if (!newSession.success) throw new Error("Expected successful test session.");
  newSession.data.session!.userId = "student-2";
  newSession.data.session!.email = "student-2@example.test";
  const newBranding = getPortalBrandingSnapshot(newSession);

  assert.ok(oldBranding);
  assert.ok(newBranding);
  assert.equal(
    isPortalBrandingSnapshotForSession(
      oldBranding,
      newBranding.sessionIdentity,
      newBranding.institutionId,
    ),
    false,
  );
});

test("tenant changes use a new provider key and reject the previous tenant snapshot", () => {
  const oldBranding = getPortalBrandingSnapshot(
    sessionResponse(
      "tenant-a",
      "Alpha Institute",
      "https://cdn.example.test/alpha-logo.png",
      "#581C87",
    ),
  );
  const newBranding = getPortalBrandingSnapshot(
    sessionResponse(
      "tenant-b",
      "Beta Institute",
      "https://cdn.example.test/beta-logo.png",
      "#1E3A8A",
    ),
  );

  assert.ok(oldBranding);
  assert.ok(newBranding);
  assert.notEqual(
    getPortalBrandingProviderKey(oldBranding),
    getPortalBrandingProviderKey(newBranding),
  );
  assert.equal(
    isPortalBrandingSnapshotForSession(
      oldBranding,
      newBranding.sessionIdentity,
      newBranding.institutionId,
    ),
    false,
  );
});

test("same-session branding changes are accepted and remount the seeded provider", () => {
  const current = getPortalBrandingSnapshot(
    sessionResponse(
      "tenant-b",
      "Beta Institute",
      "https://cdn.example.test/beta-logo.png",
      "#1E3A8A",
    ),
  );
  const updated = getPortalBrandingSnapshot(
    sessionResponse(
      "tenant-b",
      "Beta Institute Updated",
      "https://cdn.example.test/beta-logo-new.png",
      "#581C87",
    ),
  );

  assert.ok(current);
  assert.ok(updated);
  assert.equal(updated.sessionIdentity, current.sessionIdentity);
  assert.equal(
    isPortalBrandingSnapshotForSession(
      updated,
      current.sessionIdentity,
      current.institutionId,
    ),
    true,
  );
  assert.notEqual(
    getPortalBrandingProviderKey(current),
    getPortalBrandingProviderKey(updated),
  );
});

test("unauthenticated session responses clear the portal branding snapshot", () => {
  assert.equal(
    getPortalBrandingSnapshot({ success: false, error: "Not authenticated" }),
    null,
  );
});
