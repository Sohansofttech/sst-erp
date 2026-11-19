import { NextRequest } from "next/server";
import * as ThemeRoute from "../app/api/admin/settings/theme/route";
import * as SettingsRoute from "../app/api/admin/settings/route";
import {
  DEFAULT_INSTITUTION_THEME,
  PRESET_THEMES,
  getContrastRatio,
  checkThemeAccessibility,
} from "../lib/theme-utils";

function makeReq(url: string, method: string = "GET", body?: any, instId: string = "inst_apex") {
  const init: any = {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-institution-id": instId,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail: string = "") {
  if (condition) {
    console.log(`  ✔ PASS: ${testName} ${detail ? "(" + detail + ")" : ""}`);
    passed++;
  } else {
    console.error(`  ✖ FAIL: ${testName} ${detail ? "- " + detail : ""}`);
    failed++;
  }
}

async function runThemeTests() {
  console.log("========================================================================");
  console.log("   SST-ERP OBJECTIVE 2: THEME CUSTOMIZATION & MULTI-TENANCY AUDIT       ");
  console.log("========================================================================\n");

  // TEST 1: Default theme retrieval
  console.log("TEST 1: Default Theme API Retrieval");
  const getReq = makeReq("http://localhost:3000/api/admin/settings/theme", "GET", undefined, "inst_apex");
  const getRes = await ThemeRoute.GET(getReq);
  const getJson = await getRes.json();
  assert(getRes.status === 200, "Theme GET status 200", `status=${getRes.status}`);
  assert(getJson.success === true, "Theme GET success flag", `success=${getJson.success}`);
  assert(getJson.theme?.sidebarBackground === DEFAULT_INSTITUTION_THEME.sidebarBackground, "Default sidebar color #123B5A", getJson.theme?.sidebarBackground);
  assert(getJson.theme?.primaryButtonColor === DEFAULT_INSTITUTION_THEME.primaryButtonColor, "Default button color #F5A000", getJson.theme?.primaryButtonColor);
  assert(getJson.theme?.workspaceBackground === DEFAULT_INSTITUTION_THEME.workspaceBackground, "Default workspace #EEF1F5", getJson.theme?.workspaceBackground);

  // TEST 2: Multi-Tenant Theme Isolation
  console.log("\nTEST 2: Multi-Tenant Theme Isolation (Inst A vs Inst B vs Inst C)");
  const reqA = makeReq("http://localhost:3000/api/admin/settings/theme", "GET", undefined, "inst_apex");
  const reqB = makeReq("http://localhost:3000/api/admin/settings/theme", "GET", undefined, "inst_horizon");
  const reqC = makeReq("http://localhost:3000/api/admin/settings/theme", "GET", undefined, "inst_crimson");

  const [resA, resB, resC] = await Promise.all([
    ThemeRoute.GET(reqA),
    ThemeRoute.GET(reqB),
    ThemeRoute.GET(reqC),
  ]);
  const [jsonA, jsonB, jsonC] = await Promise.all([
    resA.json(),
    resB.json(),
    resC.json(),
  ]);

  assert(jsonA.theme.sidebarBackground === "#123B5A", "Institution A (Apex) has Navy #123B5A", jsonA.theme.sidebarBackground);
  assert(jsonB.theme.sidebarBackground === "#1E3A8A", "Institution B (Horizon) has Royal Blue #1E3A8A", jsonB.theme.sidebarBackground);
  assert(jsonC.theme.sidebarBackground === "#581C87", "Institution C (Imperial) has Purple #581C87", jsonC.theme.sidebarBackground);
  assert(jsonA.theme.sidebarBackground !== jsonB.theme.sidebarBackground, "Institution A and B themes are distinct and isolated", "Isolated");

  // TEST 3: Validation - Reject Invalid Hex Codes (Status 400)
  console.log("\nTEST 3: Hex Validation & Error Handling (Status 400)");
  const invalidHexReq = makeReq("http://localhost:3000/api/admin/settings/theme", "POST", {
    sidebarBackground: "NOT_A_HEX",
  }, "inst_test");
  const invalidHexRes = await ThemeRoute.POST(invalidHexReq);
  const invalidHexJson = await invalidHexRes.json();
  assert(invalidHexRes.status === 400, "Rejection of invalid hex format with status 400", `status=${invalidHexRes.status}`);
  assert(invalidHexJson.error.includes("Invalid hex code"), "Descriptive validation error returned", invalidHexJson.error);

  // TEST 4: Validation - Reject Invalid Chart Palette
  console.log("\nTEST 4: Chart Palette Validation (Status 400)");
  const invalidChartReq = makeReq("http://localhost:3000/api/admin/settings/theme", "POST", {
    chartPalette: ["#123B5A", "INVALID_COLOR", "#14B8A6"],
  }, "inst_test");
  const invalidChartRes = await ThemeRoute.POST(invalidChartReq);
  const invalidChartJson = await invalidChartRes.json();
  assert(invalidChartRes.status === 400, "Rejection of invalid chart color with status 400", `status=${invalidChartRes.status}`);

  // TEST 5: WCAG 2.1 AA Contrast Warning Engine
  console.log("\nTEST 5: WCAG AA Accessibility Contrast Warning Engine");
  // Test inaccessible combination: black text on very dark background
  const inaccessibleTheme = {
    ...DEFAULT_INSTITUTION_THEME,
    cardBackground: "#1A1A1A",
    primaryTextColor: "#222222", // Very low contrast!
  };
  const accessibilityResult = checkThemeAccessibility(inaccessibleTheme);
  assert(accessibilityResult.isAccessible === false, "Inaccessible theme correctly flagged isAccessible: false", "Flagged");
  assert(accessibilityResult.warnings.length > 0, "Warning details generated with contrast ratio", `${accessibilityResult.warnings.length} warnings`);

  // Test accessible combination: white text on navy
  const navyContrast = getContrastRatio("#FFFFFF", "#123B5A");
  assert(navyContrast >= 4.5, "White on #123B5A satisfies WCAG AA (>= 4.5:1)", `Ratio: ${navyContrast}:1`);

  // TEST 6: Custom Theme Update & Persistence Across Calls
  console.log("\nTEST 6: Custom Theme Mutation & Multi-Tenant Persistence");
  const customInstId = "inst_polytech_custom";
  const customThemePayload = {
    sidebarBackground: "#064E3B", // Emerald 900
    primaryButtonColor: "#059669", // Emerald 600
    activeSidebarNav: "#059669",
    workspaceBackground: "#F0FDF4",
    cardBackground: "#FFFFFF",
    primaryTextColor: "#064E3B",
    secondaryTextColor: "#047857",
    chartPalette: ["#064E3B", "#059669", "#10B981", "#34D399", "#6EE7B7"],
    accentColor: "#10B981",
  };

  const updateReq = makeReq("http://localhost:3000/api/admin/settings/theme", "POST", customThemePayload, customInstId);
  const updateRes = await ThemeRoute.POST(updateReq);
  const updateJson = await updateRes.json();
  assert(updateRes.status === 200, "Theme POST status 200", `status=${updateRes.status}`);
  assert(updateJson.success === true, "Theme POST success flag", "success=true");
  assert(updateJson.theme.sidebarBackground === "#064E3B", "Custom sidebar #064E3B applied", updateJson.theme.sidebarBackground);

  // Retrieve again to verify persistence
  const reGetReq = makeReq("http://localhost:3000/api/admin/settings/theme", "GET", undefined, customInstId);
  const reGetRes = await ThemeRoute.GET(reGetReq);
  const reGetJson = await reGetRes.json();
  assert(reGetJson.theme.sidebarBackground === "#064E3B", "Theme persisted across requests for inst_polytech_custom", reGetJson.theme.sidebarBackground);

  // Verify other institutions were NOT modified (isolated)
  const verifyApexReq = makeReq("http://localhost:3000/api/admin/settings/theme", "GET", undefined, "inst_apex");
  const verifyApexRes = await ThemeRoute.GET(verifyApexReq);
  const verifyApexJson = await verifyApexRes.json();
  assert(verifyApexJson.theme.sidebarBackground === "#123B5A", "inst_apex remained untouched at #123B5A", verifyApexJson.theme.sidebarBackground);

  // TEST 7: Reset to Defaults
  console.log("\nTEST 7: Reset Theme to Defaults");
  const resetReq = makeReq("http://localhost:3000/api/admin/settings/theme", "POST", { action: "RESET" }, customInstId);
  const resetRes = await ThemeRoute.POST(resetReq);
  const resetJson = await resetRes.json();
  assert(resetRes.status === 200, "Reset POST status 200", `status=${resetRes.status}`);
  assert(resetJson.theme.sidebarBackground === DEFAULT_INSTITUTION_THEME.sidebarBackground, "Reset restored #123B5A", resetJson.theme.sidebarBackground);

  // TEST 8: General Settings API
  console.log("\nTEST 8: General Institution Settings API");
  const settingsReq = makeReq("http://localhost:3000/api/admin/settings", "GET", undefined, "inst_apex");
  const settingsRes = await SettingsRoute.GET(settingsReq);
  const settingsJson = await settingsRes.json();
  assert(settingsRes.status === 200, "Settings GET status 200", `status=${settingsRes.status}`);
  assert(settingsJson.success === true && !!settingsJson.data.name, "Settings returns institution metadata", settingsJson.data.name);

  console.log("\n========================================================================");
  console.log(` OBJECTIVE 2 THEME CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("========================================================================\n");

  if (failed > 0) process.exit(1);
}

runThemeTests().catch(e => {
  console.error("FATAL THEME AUDIT ERROR:", e);
  process.exit(1);
});
