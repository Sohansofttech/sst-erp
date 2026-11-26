/**
 * ============================================================================
 * Script: scripts/backfill-multi-division.ts
 * Description: Production-grade, idempotent backfill utility for Multi-Division architecture.
 *
 * Scope:
 * 1. Pre-flight verification that migration 10_multi_division_core has been applied.
 * 2. Creates deterministic, collision-free default divisions for all institutions.
 *    - Handles SCHOOL, COLLEGE, OTHER institution types explicitly.
 *    - Reuses existing default divisions (idempotent).
 * 3. Backfills divisionId on Class, Department, Course, Student, FeeInvoice,
 *    and StudentEnrollmentHistory.
 * 4. Resolves legacy enrollments:
 *    - Single-match: links directly to matching Class.
 *    - Zero-match: synthesizes canonical Class from Course & AcademicYear, then links.
 *    - Multi-match: disambiguates via Section table; if ambiguous, rolls back without guessing.
 * 5. Ensures Student.currentDivisionId is synchronized with the primary division.
 * 6. Operates in per-institution transactions with comprehensive diagnostic reporting.
 *
 * Usage:
 *   npx tsx scripts/backfill-multi-division.ts [--dry-run]
 * ============================================================================
 */

import { db } from "../lib/db";
import { DivisionType, DivisionStatus } from "@prisma/client";

interface BackfillStats {
  institutionsProcessed: number;
  divisionsCreated: number;
  divisionsReused: number;
  classesUpdated: number;
  classesSynthesized: number;
  enrollmentsResolvedSingle: number;
  enrollmentsResolvedZeroMatch: number;
  enrollmentsResolvedSection: number;
  enrollmentsAlreadyMapped: number;
  studentsUpdated: number;
  departmentsUpdated: number;
  coursesUpdated: number;
  historiesUpdated: number;
  invoicesUpdated: number;
  errors: Array<{ institutionId: string; institutionName: string; error: string }>;
}

export function generateDeterministicDivisionParams(inst: {
  id: string;
  name: string;
  code: string | null;
  slug: string | null;
  type?: string | null;
}) {
  let divType: DivisionType = DivisionType.COLLEGE;
  if (inst.type === "SCHOOL") {
    divType = DivisionType.SCHOOL;
  } else if (inst.type === "COLLEGE") {
    divType = DivisionType.COLLEGE;
  } else {
    console.warn(`[WARN] Institution ${inst.name} has type '${inst.type || "NULL"}'. Defaulting division to COLLEGE.`);
    divType = DivisionType.COLLEGE;
  }

  const rawCode = inst.code || "INST";
  const cleanCode = rawCode.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "INST";
  const uuidShort = inst.id.replace(/-/g, "").slice(0, 4);

  const prefix = divType === DivisionType.SCHOOL ? "SCH" : "COL";
  const code = `${prefix}-${cleanCode}-${uuidShort}`;
  const baseSlug = (inst.slug || "inst").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const slug = `${baseSlug}-${divType.toLowerCase()}-${uuidShort}`;
  const name = divType === DivisionType.SCHOOL
    ? `${inst.name} School Division`
    : `${inst.name} College Division`;

  return {
    name,
    code,
    slug,
    type: divType,
    status: DivisionStatus.ACTIVE,
    isDefault: true,
    description: `Canonical default ${divType.toLowerCase()} division created during Multi-Division migration.`,
  };
}

export async function checkSchemaPrerequisites(): Promise<{ ready: boolean; reason?: string }> {
  try {
    const tableCheck = await db.$queryRawUnsafe<Array<{ count: string | number }>>(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'institution_divisions';
    `);

    if (Number(tableCheck[0]?.count || 0) === 0) {
      return {
        ready: false,
        reason: "Table 'institution_divisions' does not exist in the connected database.",
      };
    }

    const colCheck = await db.$queryRawUnsafe<Array<{ count: string | number }>>(`
      SELECT COUNT(*) as count 
      FROM information_schema.columns 
      WHERE table_name = 'enrollments' AND column_name = 'divisionId';
    `);

    if (Number(colCheck[0]?.count || 0) === 0) {
      return {
        ready: false,
        reason: "Column 'enrollments.divisionId' does not exist in the connected database.",
      };
    }

    return { ready: true };
  } catch (err: any) {
    return {
      ready: false,
      reason: `Could not verify schema prerequisites: ${err.message}`,
    };
  }
}

export async function runBackfill(dryRun: boolean = false): Promise<BackfillStats> {
  console.log("====================================================================");
  console.log(`  SST-ERP: MULTI-DIVISION BACKFILL RUNNER ${dryRun ? "(DRY-RUN MODE)" : ""}`);
  console.log("====================================================================\n");

  // Pre-flight check
  const prereq = await checkSchemaPrerequisites();
  if (!prereq.ready) {
    console.warn("--------------------------------------------------------------------");
    console.warn("  ℹ PRE-MIGRATION NOTICE");
    console.warn("--------------------------------------------------------------------");
    console.warn(`  ${prereq.reason}`);
    console.warn("  The backfill script requires the schema migration to be applied first.");
    console.warn("  (Sprint 1 strictly forbids automated migration execution against live DB).");
    console.warn("  Target SQL: prisma/migrations/10_multi_division_core/migration.sql");
    console.warn("--------------------------------------------------------------------\n");
    return {
      institutionsProcessed: 0,
      divisionsCreated: 0,
      divisionsReused: 0,
      classesUpdated: 0,
      classesSynthesized: 0,
      enrollmentsResolvedSingle: 0,
      enrollmentsResolvedZeroMatch: 0,
      enrollmentsResolvedSection: 0,
      enrollmentsAlreadyMapped: 0,
      studentsUpdated: 0,
      departmentsUpdated: 0,
      coursesUpdated: 0,
      historiesUpdated: 0,
      invoicesUpdated: 0,
      errors: [{ institutionId: "N/A", institutionName: "Preflight", error: prereq.reason || "Schema not ready" }],
    };
  }

  const stats: BackfillStats = {
    institutionsProcessed: 0,
    divisionsCreated: 0,
    divisionsReused: 0,
    classesUpdated: 0,
    classesSynthesized: 0,
    enrollmentsResolvedSingle: 0,
    enrollmentsResolvedZeroMatch: 0,
    enrollmentsResolvedSection: 0,
    enrollmentsAlreadyMapped: 0,
    studentsUpdated: 0,
    departmentsUpdated: 0,
    coursesUpdated: 0,
    historiesUpdated: 0,
    invoicesUpdated: 0,
    errors: [],
  };

  const institutions = await db.institution.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      slug: true,
      type: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${institutions.length} institutions to process.\n`);

  for (const inst of institutions) {
    console.log(`--------------------------------------------------------------------`);
    console.log(`Processing Institution: [${inst.name}] (ID: ${inst.id})`);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inst.id);
    if (!isUuid) {
      console.log(`  ℹ Skipping legacy non-UUID institution: [${inst.name}] (${inst.id})`);
      continue;
    }

    try {
      await db.$transaction(
        async (tx) => {
          // 1. Identify or create default division
          let defaultDivision = await tx.institutionDivision.findFirst({
            where: { institutionId: inst.id, isDefault: true },
          });

          if (defaultDivision) {
            console.log(`  ✔ Existing default division found: ${defaultDivision.name} (${defaultDivision.code})`);
            stats.divisionsReused++;
          } else {
            const divParams = generateDeterministicDivisionParams(inst);
            if (!dryRun) {
              defaultDivision = await tx.institutionDivision.create({
                data: {
                  institutionId: inst.id,
                  ...divParams,
                },
              });
            } else {
              defaultDivision = {
                id: "dry-run-div-uuid",
                institutionId: inst.id,
                ...divParams,
                academicSettings: null,
                description: null,
                logoUrl: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            }
            console.log(`  ✔ Created default division: ${divParams.name} (Code: ${divParams.code})`);
            stats.divisionsCreated++;
          }

          const divId = defaultDivision.id;

          // 2. Backfill Department
          const deptCountResult = await tx.department.count({
            where: { institutionId: inst.id, divisionId: null },
          });
          if (deptCountResult > 0 && !dryRun) {
            await tx.department.updateMany({
              where: { institutionId: inst.id, divisionId: null },
              data: { divisionId: divId },
            });
          }
          stats.departmentsUpdated += deptCountResult;
          console.log(`  ✔ Departments backfilled: ${deptCountResult}`);

          // 3. Backfill Course
          const courseCountResult = await tx.course.count({
            where: { institutionId: inst.id, divisionId: null },
          });
          if (courseCountResult > 0 && !dryRun) {
            await tx.course.updateMany({
              where: { institutionId: inst.id, divisionId: null },
              data: { divisionId: divId },
            });
          }
          stats.coursesUpdated += courseCountResult;
          console.log(`  ✔ Courses backfilled: ${courseCountResult}`);

          // 4. Backfill Class table (existing rows missing divisionId)
          const classCountResult = await tx.class.count({
            where: { institutionId: inst.id, divisionId: null },
          });
          if (classCountResult > 0 && !dryRun) {
            await tx.class.updateMany({
              where: { institutionId: inst.id, divisionId: null },
              data: { divisionId: divId },
            });
          }
          stats.classesUpdated += classCountResult;
          console.log(`  ✔ Classes division linked: ${classCountResult}`);

          // 5. Backfill Student (currentDivisionId)
          const studentCountResult = await tx.student.count({
            where: { institutionId: inst.id, currentDivisionId: null },
          });
          if (studentCountResult > 0 && !dryRun) {
            await tx.student.updateMany({
              where: { institutionId: inst.id, currentDivisionId: null },
              data: { currentDivisionId: divId },
            });
          }
          stats.studentsUpdated += studentCountResult;
          console.log(`  ✔ Students primary division linked: ${studentCountResult}`);

          // 6. Backfill StudentEnrollmentHistory
          const historyCountResult = await tx.studentEnrollmentHistory.count({
            where: { institutionId: inst.id, divisionId: null },
          });
          if (historyCountResult > 0 && !dryRun) {
            await tx.studentEnrollmentHistory.updateMany({
              where: { institutionId: inst.id, divisionId: null },
              data: { divisionId: divId },
            });
          }
          stats.historiesUpdated += historyCountResult;
          console.log(`  ✔ Enrollment history records linked: ${historyCountResult}`);

          // 7. Backfill FeeInvoice
          const invoiceCountResult = await tx.feeInvoice.count({
            where: { institutionId: inst.id, divisionId: null },
          });
          if (invoiceCountResult > 0 && !dryRun) {
            await tx.feeInvoice.updateMany({
              where: { institutionId: inst.id, divisionId: null },
              data: { divisionId: divId },
            });
          }
          stats.invoicesUpdated += invoiceCountResult;
          console.log(`  ✔ Fee invoices linked: ${invoiceCountResult}`);

          // 8. Deterministic Legacy Enrollment Backfill & Class Resolution
          const unmappedEnrollments = await tx.enrollment.findMany({
            where: {
              institutionId: inst.id,
              OR: [{ divisionId: null }, { classId: null }],
            },
            select: {
              id: true,
              institutionId: true,
              studentId: true,
              academicYearId: true,
              courseId: true,
              semester: true,
              section: true,
              status: true,
              divisionId: true,
              classId: true,
            },
          });

          console.log(`  ➜ Unmapped enrollments to resolve: ${unmappedEnrollments.length}`);

          for (const e of unmappedEnrollments) {
            let targetClassId = e.classId;

            if (!targetClassId) {
              if (!e.courseId || e.semester === null || e.semester === undefined) {
                // If courseId or semester is missing on legacy row, check if student.currentClassId can resolve it
                const studentProfile = await tx.student.findUnique({
                  where: { id: e.studentId },
                  select: { currentClassId: true },
                });
                if (studentProfile?.currentClassId) {
                  targetClassId = studentProfile.currentClassId;
                  stats.enrollmentsResolvedSingle++;
                } else {
                  throw new Error(
                    `Cannot resolve Enrollment ${e.id}: missing courseId/semester and student has no currentClassId.`
                  );
                }
              } else {
                // Query matching classes
                const candidateClasses = await tx.class.findMany({
                  where: {
                    institutionId: inst.id,
                    academicYearId: e.academicYearId,
                    courseId: e.courseId,
                    semester: e.semester,
                  },
                  include: {
                    sections: true,
                  },
                });

                if (candidateClasses.length === 1) {
                  // Scenario 1: Exactly 1 matching class
                  targetClassId = candidateClasses[0].id;
                  stats.enrollmentsResolvedSingle++;
                } else if (candidateClasses.length === 0) {
                  // Scenario 2: Zero matching classes -> Synthesize canonical Class
                  const course = await tx.course.findUnique({
                    where: { id: e.courseId },
                    select: { name: true, code: true },
                  });

                  if (!course) {
                    throw new Error(`Referenced course ${e.courseId} for enrollment ${e.id} does not exist.`);
                  }

                  const ayShort = e.academicYearId.replace(/-/g, "").slice(0, 4);
                  const className = `${course.name} - Sem ${e.semester}`;
                  const classCode = `${course.code}-S${e.semester}-${ayShort}`;

                  if (!dryRun) {
                    let canonicalClass = await tx.class.findFirst({
                      where: {
                        institutionId: inst.id,
                        courseId: e.courseId,
                        academicYearId: e.academicYearId,
                        code: classCode,
                      },
                    });

                    if (!canonicalClass) {
                      canonicalClass = await tx.class.create({
                        data: {
                          institutionId: inst.id,
                          divisionId: divId,
                          courseId: e.courseId,
                          academicYearId: e.academicYearId,
                          semester: e.semester,
                          name: className,
                          code: classCode,
                          isActive: true,
                        },
                      });
                    } else if (!canonicalClass.divisionId) {
                      await tx.class.update({
                        where: { id: canonicalClass.id },
                        data: { divisionId: divId },
                      });
                    }
                    targetClassId = canonicalClass.id;
                  } else {
                    targetClassId = "dry-run-synthesized-class";
                  }

                  stats.classesSynthesized++;
                  stats.enrollmentsResolvedZeroMatch++;
                } else {
                  // Scenario 3: Multiple matching classes -> Disambiguate using Section
                  const matchingClassesBySection = candidateClasses.filter((cls) =>
                    cls.sections.some((s) => s.name === e.section)
                  );

                  if (matchingClassesBySection.length === 1) {
                    targetClassId = matchingClassesBySection[0].id;
                    stats.enrollmentsResolvedSection++;
                  } else {
                    throw new Error(
                      `Ambiguous Enrollment ${e.id}: matches ${candidateClasses.length} candidate classes and ${matchingClassesBySection.length} match section '${e.section}'. Manual resolution required.`
                    );
                  }
                }
              }
            } else {
              stats.enrollmentsAlreadyMapped++;
            }

            // Update enrollment with resolved class and division
            if (!dryRun) {
              await tx.enrollment.update({
                where: { id: e.id },
                data: {
                  divisionId: divId,
                  classId: targetClassId,
                  isPrimary: e.status === "ACTIVE",
                },
              });
            }
          }

          console.log(`  ✔ Enrollments resolution complete for institution [${inst.name}]`);

          if (dryRun) {
            console.log(`  ℹ [DRY-RUN] Rolling back simulated changes for [${inst.name}].`);
            throw new Error("__DRY_RUN_ROLLBACK__");
          }
        },
        { timeout: 60000 }
      );

      stats.institutionsProcessed++;
      console.log(`✔ Finished institution [${inst.name}] successfully.\n`);
    } catch (err: any) {
      if (err.message === "__DRY_RUN_ROLLBACK__") {
        stats.institutionsProcessed++;
        console.log(`[DRY-RUN] Institution [${inst.name}] verified successfully.\n`);
      } else {
        console.error(`✖ ERROR processing institution [${inst.name}]:`, err.message);
        stats.errors.push({
          institutionId: inst.id,
          institutionName: inst.name,
          error: err.message,
        });
      }
    }
  }

  // Print final summary report
  console.log("====================================================================");
  console.log("                  BACKFILL EXECUTION SUMMARY                        ");
  console.log("====================================================================");
  console.log(`Institutions Processed:        ${stats.institutionsProcessed}/${institutions.length}`);
  console.log(`Default Divisions Created:     ${stats.divisionsCreated}`);
  console.log(`Default Divisions Reused:      ${stats.divisionsReused}`);
  console.log(`Classes Division Linked:       ${stats.classesUpdated}`);
  console.log(`Classes Synthesized:           ${stats.classesSynthesized}`);
  console.log(`Enrollments Resolved (Single): ${stats.enrollmentsResolvedSingle}`);
  console.log(`Enrollments Resolved (Zero):   ${stats.enrollmentsResolvedZeroMatch}`);
  console.log(`Enrollments Resolved (Section):${stats.enrollmentsResolvedSection}`);
  console.log(`Enrollments Already Mapped:    ${stats.enrollmentsAlreadyMapped}`);
  console.log(`Students Updated:              ${stats.studentsUpdated}`);
  console.log(`Departments Updated:           ${stats.departmentsUpdated}`);
  console.log(`Courses Updated:               ${stats.coursesUpdated}`);
  console.log(`Enrollment Histories Updated:  ${stats.historiesUpdated}`);
  console.log(`Fee Invoices Updated:          ${stats.invoicesUpdated}`);
  console.log(`Total Errors:                  ${stats.errors.length}`);
  console.log("====================================================================");

  if (stats.errors.length > 0) {
    console.error("\nDetailed Failure Manifest:");
    stats.errors.forEach((e) => {
      console.error(`- [${e.institutionName}] (${e.institutionId}): ${e.error}`);
    });
  }

  return stats;
}

// Allow CLI execution directly
if (require.main === module || process.argv[1]?.includes("backfill-multi-division")) {
  const isDryRun = process.argv.includes("--dry-run");
  runBackfill(isDryRun)
    .then((stats) => {
      if (stats.errors.length > 0 && stats.errors[0]?.institutionId !== "N/A") {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal uncaught error during backfill execution:", err);
      process.exit(1);
    });
}
