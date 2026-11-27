import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyDatabaseAuthority,
  describeInstitutionType,
  getTerminology,
  isAdminPathAllowed,
  isFeatureEnabled,
  isGatedAdminPath,
  isPlanCompatible,
  normalizeInstitutionType,
  planCompatibilityWhere,
} from "../lib/institution-type-config";

test("stored institution types normalize to a supported template", () => {
  assert.equal(normalizeInstitutionType("COLLEGE"), "COLLEGE");
  assert.equal(normalizeInstitutionType("SCHOOL"), "SCHOOL");
  assert.equal(normalizeInstitutionType("K-12 School"), "SCHOOL");
  assert.equal(normalizeInstitutionType("ACADEMY"), "ACADEMY");
  assert.equal(normalizeInstitutionType("Academy"), "ACADEMY");
  // Legacy values and records without a type keep the existing College behaviour.
  assert.equal(normalizeInstitutionType("OTHER"), "COLLEGE");
  assert.equal(normalizeInstitutionType("Engineering & Technology"), "COLLEGE");
  assert.equal(normalizeInstitutionType(null), "COLLEGE");
  assert.equal(describeInstitutionType("OTHER"), "Other (College template)");
  assert.equal(describeInstitutionType("SCHOOL"), "School / Montessori");
});

test("college keeps every module; school and academy hide college-only modules", () => {
  for (const feature of ["departments", "internalAssessment", "promotions", "hostel"] as const) {
    assert.equal(isFeatureEnabled("COLLEGE", feature), true, `college ${feature}`);
  }
  assert.equal(isFeatureEnabled("SCHOOL", "departments"), false);
  assert.equal(isFeatureEnabled("SCHOOL", "internalAssessment"), false);
  assert.equal(isFeatureEnabled("SCHOOL", "promotions"), true);
  assert.equal(isFeatureEnabled("SCHOOL", "hostel"), true);
  assert.equal(isFeatureEnabled("ACADEMY", "departments"), false);
  assert.equal(isFeatureEnabled("ACADEMY", "internalAssessment"), false);
  assert.equal(isFeatureEnabled("ACADEMY", "promotions"), false);
  assert.equal(isFeatureEnabled("ACADEMY", "hostel"), false);
});

test("an unresolved type enables no gated module, so nothing college-only flashes", () => {
  assert.equal(isFeatureEnabled(null, "departments"), false);
  assert.equal(isAdminPathAllowed(null, "/admin/ia"), false);
  assert.equal(isAdminPathAllowed(null, "/admin/students"), true);
});

test("direct URLs to modules that do not apply to a type are blocked", () => {
  assert.equal(isAdminPathAllowed("COLLEGE", "/admin/ia/marks-entry"), true);
  assert.equal(isAdminPathAllowed("SCHOOL", "/admin/ia"), false);
  assert.equal(isAdminPathAllowed("SCHOOL", "/admin/ia/marks-entry"), false);
  assert.equal(isAdminPathAllowed("SCHOOL", "/admin/academics/departments"), false);
  assert.equal(isAdminPathAllowed("SCHOOL", "/admin/academics/classes"), true);
  assert.equal(isAdminPathAllowed("SCHOOL", "/admin/academics/courses"), true);
  assert.equal(isAdminPathAllowed("ACADEMY", "/admin/promotions"), false);
  assert.equal(isAdminPathAllowed("ACADEMY", "/admin/hostel"), false);
  assert.equal(isAdminPathAllowed("ACADEMY", "/admin/attendance"), true);
  // Prefix matching respects path boundaries.
  assert.equal(isGatedAdminPath("/admin/iaxyz"), false);
  assert.equal(isGatedAdminPath("/admin/ia"), true);
});

test("terminology follows the institution type and stays neutral while unresolved", () => {
  assert.equal(getTerminology("COLLEGE").staff, "Faculty");
  assert.equal(getTerminology("SCHOOL").staff, "Teachers");
  assert.equal(getTerminology("SCHOOL").dashboardTitle, "School / Montessori Dashboard");
  assert.equal(getTerminology("ACADEMY").learners, "Learners");
  assert.equal(getTerminology("ACADEMY").staff, "Trainers");
  assert.equal(getTerminology("ACADEMY").classesNav, "Batches & Sections");
  assert.equal(getTerminology(null).dashboardTitle, "Institutional Dashboard");
});

test("plans without institution types stay available to every type; restricted plans only to listed types", () => {
  for (const type of ["COLLEGE", "SCHOOL", "ACADEMY", "OTHER", null]) {
    assert.equal(isPlanCompatible([], type), true, `unrestricted plan for ${String(type)}`);
  }
  assert.equal(isPlanCompatible(["SCHOOL"], "SCHOOL"), true);
  assert.equal(isPlanCompatible(["SCHOOL"], "COLLEGE"), false);
  assert.equal(isPlanCompatible(["SCHOOL"], "ACADEMY"), false);
  assert.equal(isPlanCompatible(["COLLEGE", "ACADEMY"], "ACADEMY"), true);
  // Legacy OTHER institutions use the College template, so College plans apply.
  assert.equal(isPlanCompatible(["COLLEGE"], "OTHER"), true);
  assert.deepEqual(planCompatibilityWhere("SCHOOL"), {
    OR: [{ institutionTypes: { isEmpty: true } }, { institutionTypes: { has: "SCHOOL" } }],
  });
});

test("a stale cached or browser-supplied profile can never override the database type", () => {
  type Profile = { id: string; name: string; type: string; institutionType: "COLLEGE" | "SCHOOL" | "ACADEMY"; institutionCategory: string; affiliation: string };
  const databaseProfile: Profile = { id: "inst-1", name: "Real Name", type: "K-12 School", institutionType: "SCHOOL", institutionCategory: "Montessori", affiliation: "" };
  const staleCache: Profile = { id: "other-tenant", name: "Old Name", type: "Engineering & Technology", institutionType: "COLLEGE", institutionCategory: "Old", affiliation: "VTU" };
  const merged = applyDatabaseAuthority(databaseProfile, staleCache, ["id", "name", "type", "institutionType", "institutionCategory"]);
  assert.equal(merged.id, "inst-1");
  assert.equal(merged.name, "Real Name");
  assert.equal(merged.type, "K-12 School");
  assert.equal(merged.institutionType, "SCHOOL");
  assert.equal(merged.institutionCategory, "Montessori");
  // Display-only fields that the database does not own can still come from the cache.
  assert.equal(merged.affiliation, "VTU");
  // Without a cache the database profile is returned unchanged.
  assert.deepEqual(applyDatabaseAuthority(databaseProfile, undefined, ["type"]), databaseProfile);
});
