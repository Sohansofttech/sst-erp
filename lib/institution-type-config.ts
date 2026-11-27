/**
 * Single source of truth for institution-type behaviour.
 * The type itself is stored on the Institution record (set by Super Admin) and is only ever
 * read from the database on the server; the browser never decides which template applies.
 */
export type InstitutionTypeKey = "COLLEGE" | "SCHOOL" | "ACADEMY";

export const institutionTypeKeys: readonly InstitutionTypeKey[] = ["COLLEGE", "SCHOOL", "ACADEMY"];

export const institutionTypeLabels: Record<InstitutionTypeKey, string> = {
  COLLEGE: "College",
  SCHOOL: "School / Montessori",
  ACADEMY: "Academy",
};

export const schoolCategories = ["School", "Montessori", "School / Montessori"] as const;

/** Maps any stored value (DB enum or legacy profile label) to a supported template. OTHER and legacy college labels use the College template. */
export function normalizeInstitutionType(value?: string | null): InstitutionTypeKey {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "SCHOOL" || normalized === "K-12 SCHOOL" || normalized === "K12" || normalized === "MONTESSORI") return "SCHOOL";
  if (normalized === "ACADEMY") return "ACADEMY";
  return "COLLEGE";
}

/** Human label for lists and details; keeps legacy OTHER records visible as such. */
export function describeInstitutionType(value?: string | null): string {
  if ((value ?? "").trim().toUpperCase() === "OTHER") return "Other (College template)";
  return institutionTypeLabels[normalizeInstitutionType(value)];
}

export type PortalFeature = "departments" | "internalAssessment" | "promotions" | "hostel";

/**
 * Existing modules that are not relevant for a type. Everything else stays available.
 * "Programs & Courses" is intentionally kept for every type because Class.courseId is required.
 */
const disabledFeatures: Record<InstitutionTypeKey, readonly PortalFeature[]> = {
  COLLEGE: [],
  SCHOOL: ["departments", "internalAssessment"],
  ACADEMY: ["departments", "internalAssessment", "promotions", "hostel"],
};

const featurePaths: Record<PortalFeature, readonly string[]> = {
  departments: ["/admin/academics/departments"],
  internalAssessment: ["/admin/ia"],
  promotions: ["/admin/promotions"],
  hostel: ["/admin/hostel"],
};

/** An unresolved type (still loading or failed to load) enables none of the gated modules. */
export function isFeatureEnabled(kind: InstitutionTypeKey | null, feature: PortalFeature): boolean {
  return kind !== null && !disabledFeatures[kind].includes(feature);
}

function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isGatedAdminPath(pathname: string): boolean {
  return Object.values(featurePaths).some((prefixes) => prefixes.some((prefix) => pathMatches(pathname, prefix)));
}

export function isAdminPathAllowed(kind: InstitutionTypeKey | null, pathname: string): boolean {
  return (Object.keys(featurePaths) as PortalFeature[]).every(
    (feature) => !featurePaths[feature].some((prefix) => pathMatches(pathname, prefix)) || isFeatureEnabled(kind, feature),
  );
}

export interface InstitutionTerminology {
  learner: string;
  learners: string;
  staff: string;
  staffNav: string;
  programsNav: string;
  classesNav: string;
  group: string;
  groupPlural: string;
  dashboardTitle: string;
}

const terminology: Record<InstitutionTypeKey, InstitutionTerminology> = {
  COLLEGE: { learner: "Student", learners: "Students", staff: "Faculty", staffNav: "Faculty & Staff", programsNav: "Programs & Courses", classesNav: "Classes & Sections", group: "class", groupPlural: "classes", dashboardTitle: "College Dashboard" },
  SCHOOL: { learner: "Student", learners: "Students", staff: "Teachers", staffNav: "Teachers & Staff", programsNav: "Grades & Programs", classesNav: "Classes & Sections", group: "class", groupPlural: "classes", dashboardTitle: "School / Montessori Dashboard" },
  ACADEMY: { learner: "Learner", learners: "Learners", staff: "Trainers", staffNav: "Trainers & Staff", programsNav: "Courses & Programs", classesNav: "Batches & Sections", group: "batch", groupPlural: "batches", dashboardTitle: "Academy Dashboard" },
};

const neutralTerminology: InstitutionTerminology = {
  learner: "Student", learners: "Students", staff: "Staff", staffNav: "Staff", programsNav: "Programs & Courses", classesNav: "Classes & Sections", group: "class", groupPlural: "classes", dashboardTitle: "Institutional Dashboard",
};

export function getTerminology(kind: InstitutionTypeKey | null): InstitutionTerminology {
  return kind ? terminology[kind] : neutralTerminology;
}

/** A plan with no institution types applies to every type. */
export function isPlanCompatible(planTypes: readonly string[] | null | undefined, institutionType: string | null | undefined): boolean {
  if (!planTypes || planTypes.length === 0) return true;
  return planTypes.includes(normalizeInstitutionType(institutionType));
}

/** Prisma-compatible filter for plans an institution of this type may use. */
export function planCompatibilityWhere(institutionType: string | null | undefined) {
  const kind = normalizeInstitutionType(institutionType);
  return { OR: [{ institutionTypes: { isEmpty: true } }, { institutionTypes: { has: kind } }] };
}

/**
 * Merges a cached/browser-supplied profile over the database profile, then re-applies the
 * database values for the listed keys so a stale cache can never override the stored type.
 */
export function applyDatabaseAuthority<T extends object>(
  databaseProfile: T,
  cached: Partial<T> | undefined,
  authoritativeKeys: ReadonlyArray<keyof T>,
): T {
  const merged: T = { ...databaseProfile, ...(cached ?? {}) };
  for (const key of authoritativeKeys) merged[key] = databaseProfile[key];
  return merged;
}
