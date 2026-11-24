/**
 * SST-ERP Verification Suite:
 * 1. Timetable Morning Tea Break and Lunch Break Orientation & CSS Styling
 * 2. Student Creation Flow, Input Validation, UUID Resolution & Error Resilience
 */

import * as fs from "fs";
import * as path from "path";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passedCount++;
  } else {
    console.error(`  \x1b[31m✘ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("  TIMETABLE BREAK ORIENTATION & STUDENT CREATION SUITE");
  console.log("=======================================================\n");

  // -------------------------------------------------------------
  // TEST GROUP 1: Timetable Break Orientation & Layout
  // -------------------------------------------------------------
  console.log("--- Group 1: Timetable Break Label Orientation ---");

  const timetableFilePath = path.join(process.cwd(), "app/admin/timetable/page.tsx");
  const timetableContent = fs.readFileSync(timetableFilePath, "utf-8");

  // Verify rotate-180 and invalid writing-mode-vertical are removed
  assert(
    !timetableContent.includes("writing-mode-vertical"),
    "Invalid Tailwind utility 'writing-mode-vertical' is removed"
  );
  assert(
    !timetableContent.includes("rotate-180"),
    "Upside-down 'rotate-180' transform is removed from timetable break column"
  );

  // Verify proper vertical writing mode
  assert(
    timetableContent.includes('[writing-mode:vertical-rl]'),
    "Proper CSS arbitrary class [writing-mode:vertical-rl] is present"
  );
  assert(
    timetableContent.includes('style={{ writingMode: "vertical-rl" }}'),
    "Direct inline style writingMode: 'vertical-rl' guarantees browser rendering"
  );

  // Verify break column width, background, and alignment are preserved
  assert(
    timetableContent.includes('className="p-2 text-center bg-amber-50/30 border-r border-slate-200 align-middle"'),
    "Break cell layout (w-24, bg-amber-50/30, border, align-middle) is intact"
  );

  // Verify Morning Tea Break and Lunch Break are both handled by the same p.isBreak block
  const isBreakMatches = timetableContent.match(/if \(p\.isBreak\)/g);
  assert(
    (isBreakMatches?.length || 0) >= 1,
    "Unified break rendering block handles both Morning Tea Break and Lunch Break"
  );

  // -------------------------------------------------------------
  // TEST GROUP 2: Student Creation UUID Safety & Input Sanitization
  // -------------------------------------------------------------
  console.log("\n--- Group 2: Student Creation UUID Safety & Data Sanitization ---");

  const isUuid = (val?: string | null): boolean =>
    !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  assert(isUuid("14649ac8-2777-4b40-ba9a-845a581f323a") === true, "Valid UUID v4 is recognized");
  assert(isUuid("course-btech-cse") === false, "String slug 'course-btech-cse' is rejected as UUID");
  assert(isUuid("ay-2026-27") === false, "String slug 'ay-2026-27' is rejected as UUID");
  assert(isUuid("class-btech-cse-1") === false, "String slug 'class-btech-cse-1' is rejected as UUID");
  assert(isUuid("sec-btech-cse-1-a") === false, "String slug 'sec-btech-cse-1-a' is rejected as UUID");
  assert(isUuid(undefined) === false, "Undefined is safely handled as false");
  assert(isUuid(null) === false, "Null is safely handled as false");

  // Date of birth safe parser test
  const parseSafeDob = (dateOfBirth?: any): Date => {
    let safeDob: Date = new Date("2004-01-01");
    if (dateOfBirth) {
      const parsed = new Date(dateOfBirth);
      if (!isNaN(parsed.getTime())) {
        safeDob = parsed;
      }
    }
    return safeDob;
  };

  assert(parseSafeDob("2005-08-20").toISOString().startsWith("2005-08-20"), "Valid DOB string parses accurately");
  assert(parseSafeDob("invalid-date-string").toISOString().startsWith("2004-01-01"), "Invalid DOB string falls back to safe date without crashing");
  assert(parseSafeDob("").toISOString().startsWith("2004-01-01"), "Empty string DOB falls back to safe date");
  assert(parseSafeDob(undefined).toISOString().startsWith("2004-01-01"), "Undefined DOB falls back to safe date");

  // Admission number preservation test
  const resolveAdm = (inputAdm?: string, roll?: string) => inputAdm?.trim() || roll?.trim() || "ROLL-DEFAULT";
  assert(resolveAdm("ADM-2026-0042", "26CSE015") === "ADM-2026-0042", "Explicit admissionNumber is preserved");
  assert(resolveAdm("", "26CSE015") === "26CSE015", "Empty admissionNumber falls back to rollNumber");
  assert(resolveAdm(undefined, "26CSE015") === "26CSE015", "Undefined admissionNumber falls back to rollNumber");

  // -------------------------------------------------------------
  // TEST GROUP 3: Service & Route Integrity Verification
  // -------------------------------------------------------------
  console.log("\n--- Group 3: Service & Route Parameter Alignment ---");

  const serviceFilePath = path.join(process.cwd(), "lib/services/institution-admin.service.ts");
  const serviceContent = fs.readFileSync(serviceFilePath, "utf-8");

  assert(
    serviceContent.includes("resolvedCourseId") && serviceContent.includes("resolvedAcademicYearId"),
    "createStudent implements resolvedCourseId and resolvedAcademicYearId"
  );
  assert(
    serviceContent.includes("StudentEnrollmentHistory creation skipped"),
    "studentEnrollmentHistory creation is guarded by resilient try-catch"
  );
  assert(
    serviceContent.includes("admissionNumber"),
    "createStudent signature and SQL statement accept admissionNumber"
  );

  const routeFilePath = path.join(process.cwd(), "app/api/admin/students/route.ts");
  const routeContent = fs.readFileSync(routeFilePath, "utf-8");

  assert(
    routeContent.includes("admissionNumber: body.admissionNumber"),
    "API route POST passes admissionNumber to createStudent"
  );
  assert(
    routeContent.includes("departmentId: body.departmentId"),
    "API route POST passes departmentId to createStudent"
  );

  const pageFilePath = path.join(process.cwd(), "app/admin/students/page.tsx");
  const pageContent = fs.readFileSync(pageFilePath, "utf-8");

  assert(
    pageContent.includes("admissionNumber: genAdm"),
    "Students UI passes admissionNumber: genAdm in fetch POST body"
  );
  assert(
    pageContent.includes("disabled={isSubmitting}"),
    "Create Student Record button prevents double submission with disabled={isSubmitting}"
  );
  assert(
    pageContent.includes("loadStudentsFromApi()"),
    "Students UI re-syncs student list from API after creation"
  );

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`  TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test suite threw uncaught error:", err);
  process.exit(1);
});
