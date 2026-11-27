/**
 * ============================================================================
 * Service: lib/super-admin/feature-catalog.ts
 * Description: Central, typed catalogue of billable platform features and an
 *              idempotent initializer for the `PlatformFeature` table.
 *
 * Sources: feature codes are derived from verified ERP modules under
 *          app/api/admin/** and the existing division entitlement codes in
 *          lib/billing/division-entitlements.ts. No codes are invented.
 *
 * Initialization guarantees:
 * - Idempotent: re-running never creates duplicates (upsert by unique `code`).
 * - Non-destructive: an existing row's `isAvailable` is NEVER overwritten, so an
 *   administrator's manual disable/enable is preserved. Only name/description/
 *   category are refreshed for catalogue consistency.
 * - No plan/subscription/institution records are touched.
 * - No automatic enablement on any plan.
 * - Safe for both development and production: call initializeFeatureCatalog()
 *   explicitly from a seed or one-off script; it inserts only catalogue rows.
 * ============================================================================
 */

import db from "@/lib/db";

export type FeatureCategory =
  | "DIVISIONS"
  | "ACADEMICS"
  | "ADMISSIONS"
  | "ATTENDANCE"
  | "FEES"
  | "EXAMINATIONS"
  | "RESULTS"
  | "TIMETABLE"
  | "LIBRARY"
  | "HOSTEL"
  | "TRANSPORT"
  | "GATE_MANAGEMENT"
  | "COMMUNICATION"
  | "REPORTS"
  | "CREDENTIALS"
  | "CAMPUS_SERVICES";

export interface FeatureDefinition {
  code: string;
  name: string;
  description: string;
  category: FeatureCategory;
}

/**
 * The division feature codes are authoritative and MUST be preserved verbatim;
 * they are consumed by lib/billing/division-entitlements.ts.
 */
export const DIVISION_FEATURE_CODES = {
  MULTI_DIVISION_ACCESS: "MULTI_DIVISION_ACCESS",
  DIVISION_TYPE_MONTESSORI: "DIVISION_TYPE_MONTESSORI",
  DIVISION_TYPE_SCHOOL: "DIVISION_TYPE_SCHOOL",
  DIVISION_TYPE_HIGHER_SECONDARY: "DIVISION_TYPE_HIGHER_SECONDARY",
  DIVISION_TYPE_COLLEGE: "DIVISION_TYPE_COLLEGE",
  DIVISION_TYPE_ACADEMY: "DIVISION_TYPE_ACADEMY",
} as const;

/**
 * Verified billable feature catalogue. Each entry maps to a real ERP module
 * directory under app/api/admin/** (or the division entitlement system).
 */
export const FEATURE_CATALOG: readonly FeatureDefinition[] = [
  // --- Divisions (codes preserved from division-entitlements.ts) ---
  {
    code: DIVISION_FEATURE_CODES.MULTI_DIVISION_ACCESS,
    name: "Multi-Division Access",
    description: "Allows an institution to operate more than one educational division.",
    category: "DIVISIONS",
  },
  {
    code: DIVISION_FEATURE_CODES.DIVISION_TYPE_MONTESSORI,
    name: "Montessori Division",
    description: "Permits creating Montessori-type divisions.",
    category: "DIVISIONS",
  },
  {
    code: DIVISION_FEATURE_CODES.DIVISION_TYPE_SCHOOL,
    name: "School Division",
    description: "Permits creating School-type divisions.",
    category: "DIVISIONS",
  },
  {
    code: DIVISION_FEATURE_CODES.DIVISION_TYPE_HIGHER_SECONDARY,
    name: "Higher Secondary Division",
    description: "Permits creating Higher Secondary-type divisions.",
    category: "DIVISIONS",
  },
  {
    code: DIVISION_FEATURE_CODES.DIVISION_TYPE_COLLEGE,
    name: "College Division",
    description: "Permits creating College-type divisions.",
    category: "DIVISIONS",
  },
  {
    code: DIVISION_FEATURE_CODES.DIVISION_TYPE_ACADEMY,
    name: "Academy Division",
    description: "Permits creating Academy-type divisions.",
    category: "DIVISIONS",
  },

  // --- Academics (app/api/admin/academics) ---
  {
    code: "ACADEMICS",
    name: "Academics Management",
    description: "Academic configuration: classes, sections, and academic settings.",
    category: "ACADEMICS",
  },
  // --- Admissions (app/api/admin/admissions) ---
  {
    code: "ADMISSIONS",
    name: "Admissions",
    description: "Admission applications and enrollment pipeline.",
    category: "ADMISSIONS",
  },
  // --- Attendance (app/api/admin/attendance) ---
  {
    code: "ATTENDANCE",
    name: "Attendance",
    description: "Student and staff attendance tracking.",
    category: "ATTENDANCE",
  },
  // --- Fees (app/api/admin/fees) ---
  {
    code: "FEES",
    name: "Fees & Payments",
    description: "Fee structures, invoices, and payment collection.",
    category: "FEES",
  },
  // --- Examinations (app/api/admin/examinations) ---
  {
    code: "EXAMINATIONS",
    name: "Examinations",
    description: "Exam scheduling and management.",
    category: "EXAMINATIONS",
  },
  // --- Results (app/api/admin/results) ---
  {
    code: "RESULTS",
    name: "Results",
    description: "Result entry and publication.",
    category: "RESULTS",
  },
  // --- Timetable (app/api/admin/timetable) ---
  {
    code: "TIMETABLE",
    name: "Timetable",
    description: "Class timetable scheduling.",
    category: "TIMETABLE",
  },
  // --- Library (app/api/admin/library) ---
  {
    code: "LIBRARY",
    name: "Library",
    description: "Library catalog and issue/return management.",
    category: "LIBRARY",
  },
  // --- Hostel (app/api/admin/hostel) ---
  {
    code: "HOSTEL",
    name: "Hostel",
    description: "Hostel room and resident management.",
    category: "HOSTEL",
  },
  // --- Transport (app/api/admin/transport) ---
  {
    code: "TRANSPORT",
    name: "Transport",
    description: "Transport routes, allocations, and maintenance.",
    category: "TRANSPORT",
  },
  // --- Gate Management (app/api/admin/gate-management) ---
  {
    code: "GATE_MANAGEMENT",
    name: "Gate Management",
    description: "Campus gate in/out and biometric device management.",
    category: "GATE_MANAGEMENT",
  },
  // --- Communication (app/api/admin/communication) ---
  {
    code: "COMMUNICATION",
    name: "Communication",
    description: "Announcements and notifications to stakeholders.",
    category: "COMMUNICATION",
  },
  // --- Reports (app/api/admin/reports) ---
  {
    code: "REPORTS",
    name: "Reports & Export",
    description: "Reporting and data export across modules.",
    category: "REPORTS",
  },
  // --- Credentials (app/api/admin/credentials) ---
  {
    code: "CREDENTIALS",
    name: "Credentials",
    description: "Student and staff credential generation.",
    category: "CREDENTIALS",
  },
  // --- Campus Services (app/api/admin/campus-services) ---
  {
    code: "CAMPUS_SERVICES",
    name: "Campus Services",
    description: "Auxiliary campus services management.",
    category: "CAMPUS_SERVICES",
  },
];

export interface FeatureCatalogInitResult {
  created: number;
  updated: number;
  total: number;
}

/**
 * Idempotently initialize the PlatformFeature catalogue.
 *
 * - Inserts missing features and refreshes descriptive fields of existing ones.
 * - Never modifies `isAvailable` on an existing row (administrator control is
 *   preserved). New rows default to isAvailable = true via the schema default.
 * - Does not touch plans, subscriptions, or institutions.
 */
export async function initializeFeatureCatalog(
  client: Pick<typeof db, "platformFeature"> = db
): Promise<FeatureCatalogInitResult> {
  let created = 0;
  let updated = 0;

  for (const def of FEATURE_CATALOG) {
    const existing = await client.platformFeature.findUnique({
      where: { code: def.code },
      select: { id: true, name: true, description: true, category: true },
    });

    if (!existing) {
      await client.platformFeature.create({
        data: {
          code: def.code,
          name: def.name,
          description: def.description,
          category: def.category,
        },
      });
      created++;
    } else if (
      existing.name !== def.name ||
      existing.description !== def.description ||
      existing.category !== def.category
    ) {
      // Refresh descriptive metadata only; never touch isAvailable.
      await client.platformFeature.update({
        where: { code: def.code },
        data: { name: def.name, description: def.description, category: def.category },
      });
      updated++;
    }
  }

  return { created, updated, total: FEATURE_CATALOG.length };
}