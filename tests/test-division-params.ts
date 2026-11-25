import { generateDeterministicDivisionParams } from "../scripts/backfill-multi-division";
import { DivisionType, DivisionStatus } from "@prisma/client";

function runTests() {
  console.log("====================================================================");
  console.log("   UNIT TEST: generateDeterministicDivisionParams (PURE HELPER)     ");
  console.log("====================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✖ FAIL: ${testName} ${detail ? "- " + detail : ""}`);
      failed++;
    }
  }

  // Test Case 1: SCHOOL Institution
  const schoolInst = {
    id: "12345678-abcd-1111-2222-333344445555",
    name: "Greenwood High School",
    code: "GWH",
    slug: "greenwood-high",
    type: "SCHOOL",
  };
  const schoolParams = generateDeterministicDivisionParams(schoolInst);
  assert(schoolParams.type === DivisionType.SCHOOL, "School type mapped correctly to DivisionType.SCHOOL");
  assert(schoolParams.name === "Greenwood High School School Division", "School name generated correctly");
  assert(schoolParams.code === "SCH-GWH-1234", "School code formatted correctly (SCH-GWH-1234)");
  assert(schoolParams.slug === "greenwood-high-school-1234", "School slug formatted correctly");
  assert(schoolParams.isDefault === true, "School isDefault is true");
  assert(schoolParams.status === DivisionStatus.ACTIVE, "School status is ACTIVE");

  // Test Case 2: COLLEGE Institution
  const collegeInst = {
    id: "abcdef01-2345-6789-aaaa-bbbbccccdddd",
    name: "National Institute of Technology",
    code: "NITK",
    slug: "nitk-surathkal",
    type: "COLLEGE",
  };
  const collegeParams = generateDeterministicDivisionParams(collegeInst);
  assert(collegeParams.type === DivisionType.COLLEGE, "College type mapped correctly to DivisionType.COLLEGE");
  assert(collegeParams.name === "National Institute of Technology College Division", "College name generated correctly");
  assert(collegeParams.code === "COL-NITK-abcd", "College code formatted correctly (COL-NITK-abcd)");
  assert(collegeParams.slug === "nitk-surathkal-college-abcd", "College slug formatted correctly");
  assert(collegeParams.isDefault === true, "College isDefault is true");
  assert(collegeParams.status === DivisionStatus.ACTIVE, "College status is ACTIVE");

  // Test Case 3: OTHER / Null Institution (fallback handling)
  const otherInst = {
    id: "98765432-fedc-ba98-7654-3210fedcba98",
    name: "Universal Vocational Academy",
    code: null,
    slug: null,
    type: "OTHER",
  };
  const otherParams = generateDeterministicDivisionParams(otherInst);
  assert(otherParams.type === DivisionType.COLLEGE, "OTHER type gracefully defaults to COLLEGE");
  assert(otherParams.code === "COL-INST-9876", "Null code falls back to 'INST' cleanly");
  assert(otherParams.slug === "inst-college-9876", "Null slug falls back to 'inst' cleanly");
  assert(otherParams.isDefault === true, "OTHER isDefault is true");

  console.log("\n====================================================================");
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log("====================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
