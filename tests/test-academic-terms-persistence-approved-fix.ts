import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import assert from "assert";
import { NextRequest } from "next/server";
import db from "../lib/db";
import * as AYRoute from "../app/api/admin/academics/academic-years/route";
import { parseDateSafely, DateValidationError } from "../lib/utils/date-parser";

let passedCount = 0;
let failedCount = 0;

async function it(desc: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${desc}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✘ FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

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

async function runPersistenceFixSuite() {
  console.log("\n========================================================");
  console.log(" ACADEMIC TERMS PERSISTENCE FIX VERIFICATION SUITE");
  console.log(" Atomic Transactions, DD-MM-YYYY Parsing & Safety Checks");
  console.log("========================================================\n");

  const TEST_TENANT = "inst_apex";
  const ATTACKER_TENANT = "inst_demo_school";

  // Record initial database counts
  const initialAYs: any[] = await db.$queryRaw`SELECT id, "institutionId", name, "isCurrent" FROM academic_years ORDER BY id;`;
  const initialTerms: any[] = await db.$queryRaw`SELECT id FROM academic_terms;`;
  console.log(`[SETUP] Initial state: ${initialAYs.length} academic years, ${initialTerms.length} terms in DB.`);

  let ephemeralAYId: string | null = null;

  try {
    // --------------------------------------------------------------------------
    // 1. DATE PARSING & CALENDAR VALIDATION
    // --------------------------------------------------------------------------
    console.log("[SECTION 1] Date Parser & Calendar Validation");

    await it("Parses standard YYYY-MM-DD correctly", () => {
      const d = parseDateSafely("2026-08-01");
      assert.strictEqual(d.toISOString().split("T")[0], "2026-08-01");
    });

    await it("Parses Odd Semester DD-MM-YYYY format (01-08-2026 to 20-12-2026)", () => {
      const dStart = parseDateSafely("01-08-2026");
      const dEnd = parseDateSafely("20-12-2026");
      assert.strictEqual(dStart.toISOString().split("T")[0], "2026-08-01");
      assert.strictEqual(dEnd.toISOString().split("T")[0], "2026-12-20");
    });

    await it("Parses Even Semester DD-MM-YYYY format (10-01-2027 to 31-05-2027)", () => {
      const dStart = parseDateSafely("10-01-2027");
      const dEnd = parseDateSafely("31-05-2027");
      assert.strictEqual(dStart.toISOString().split("T")[0], "2027-01-10");
      assert.strictEqual(dEnd.toISOString().split("T")[0], "2027-05-31");
    });

    await it("Validates leap year February 29 (accepts 2028, rejects 2026)", () => {
      const dLeap = parseDateSafely("29-02-2028");
      assert.strictEqual(dLeap.toISOString().split("T")[0], "2028-02-29");
      assert.throws(() => parseDateSafely("29-02-2026"), /not a leap year/);
    });

    await it("Rejects invalid calendar dates (e.g. 31-02-2026, 31-04-2026)", () => {
      assert.throws(() => parseDateSafely("31-02-2026"), /max 28 days/);
      assert.throws(() => parseDateSafely("31-04-2026"), /max 30 days/);
      assert.throws(() => parseDateSafely("invalid"), /not in a recognized format/);
    });

    // --------------------------------------------------------------------------
    // 2. ATOMIC PERSISTENCE OF ODD & EVEN SEMESTERS WITH DD-MM-YYYY
    // --------------------------------------------------------------------------
    console.log("\n[SECTION 2] Atomic Persistence of Terms with DD-MM-YYYY via API");

    // Create an ephemeral academic year for testing
    const createReq = makeReq(
      "http://localhost:3000/api/admin/academics/academic-years",
      "POST",
      {
        name: "TEST-PERSIST-2026-2027",
        startDate: "2026-08-01",
        endDate: "2027-05-31",
        isCurrent: false,
      },
      TEST_TENANT
    );
    const createRes = await AYRoute.POST(createReq);
    assert.strictEqual(createRes.status, 200, "POST must succeed");
    const createJson = await createRes.json();
    ephemeralAYId = createJson.data.id;
    assert.ok(ephemeralAYId, "Must return created academic year ID");

    await it("Persists Odd Semester and Even Semester passed as DD-MM-YYYY", async () => {
      const putReq = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        {
          id: ephemeralAYId,
          name: "TEST-PERSIST-2026-2027",
          startDate: "01-08-2026",
          endDate: "31-05-2027",
          terms: [
            { name: "Odd Semester", startDate: "01-08-2026", endDate: "20-12-2026", isCurrent: true },
            { name: "Even Semester", startDate: "10-01-2027", endDate: "31-05-2027", isCurrent: false },
          ],
        },
        TEST_TENANT
      );
      const putRes = await AYRoute.PUT(putReq);
      assert.strictEqual(putRes.status, 200, "PUT must succeed with 200");
      const putJson = await putRes.json();
      assert.strictEqual(putJson.success, true);
      assert.strictEqual(putJson.data.terms.length, 2, "Response must include 2 persisted terms");

      // Verify physical rows in academic_terms
      const dbTerms: any[] = await db.$queryRaw`
        SELECT "id", "name", "startDate", "endDate", "isCurrent"
        FROM academic_terms
        WHERE "academicYearId" = ${ephemeralAYId} AND "institutionId" = ${TEST_TENANT}
        ORDER BY "startDate" ASC;
      `;
      assert.strictEqual(dbTerms.length, 2, "Database table academic_terms must contain 2 rows");
      assert.strictEqual(dbTerms[0].name, "Odd Semester");
      assert.strictEqual(dbTerms[0].isCurrent, true);
      assert.strictEqual(dbTerms[1].name, "Even Semester");
      assert.strictEqual(dbTerms[1].isCurrent, false);
    });

    await it("GET API returns persisted terms accurately on fresh query (page reload simulation)", async () => {
      const getReq = makeReq("http://localhost:3000/api/admin/academics/academic-years", "GET", undefined, TEST_TENANT);
      const getRes = await AYRoute.GET(getReq);
      assert.strictEqual(getRes.status, 200);
      const getJson = await getRes.json();
      const targetAY = (getJson.data || []).find((y: any) => y.id === ephemeralAYId);
      assert.ok(targetAY, "Target academic year must be found");
      assert.strictEqual(targetAY.terms.length, 2, "Target academic year must have 2 terms");
      assert.strictEqual(targetAY.terms[0].name, "Odd Semester");
      assert.strictEqual(targetAY.terms[1].name, "Even Semester");
    });

    // --------------------------------------------------------------------------
    // 3. DUPLICATE TERM NAMES REJECTION
    // --------------------------------------------------------------------------
    console.log("\n[SECTION 3] Duplicate Term Names Rejection");

    await it("Rejects duplicate term names within the same academic year (HTTP 400)", async () => {
      const putReq = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        {
          id: ephemeralAYId,
          terms: [
            { name: "Odd Semester", startDate: "01-08-2026", endDate: "20-12-2026", isCurrent: true },
            { name: "odd semester", startDate: "10-01-2027", endDate: "31-05-2027", isCurrent: false },
          ],
        },
        TEST_TENANT
      );
      const putRes = await AYRoute.PUT(putReq);
      assert.strictEqual(putRes.status, 400, "Must return HTTP 400 on duplicate term names");
      const putJson = await putRes.json();
      assert.strictEqual(putJson.success, false);
      assert.ok(putJson.error.includes("Duplicate term title"), `Error message should mention duplicate title: ${putJson.error}`);
    });

    // --------------------------------------------------------------------------
    // 4. CROSS-TENANT TERM ACCESS REJECTION
    // --------------------------------------------------------------------------
    console.log("\n[SECTION 4] Cross-Tenant Access Protection");

    await it("Rejects cross-tenant modification attempts with HTTP 404", async () => {
      const putReq = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        {
          id: ephemeralAYId, // Belongs to TEST_TENANT
          name: "ATTACKER-RENAMED",
          terms: [
            { name: "Hacked Term", startDate: "01-08-2026", endDate: "20-12-2026" },
          ],
        },
        ATTACKER_TENANT // Attacking tenant context
      );
      const putRes = await AYRoute.PUT(putReq);
      assert.strictEqual(putRes.status, 404, "Must reject cross-tenant update with 404");
    });

    // --------------------------------------------------------------------------
    // 5. ATOMIC ROLLBACK ON TERM INSERTION FAILURE
    // --------------------------------------------------------------------------
    console.log("\n[SECTION 5] Atomic Rollback on Failure");

    await it("Failed term insertion rolls back the academic-year update completely", async () => {
      const currentAY = await db.academicYear.findUnique({ where: { id: ephemeralAYId! } });
      const originalName = currentAY?.name;

      // Attempt to rename AY to 'SHOULD_ROLLBACK_NAME' with an invalid term (invalid date)
      const putReq = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        {
          id: ephemeralAYId,
          name: "SHOULD_ROLLBACK_NAME",
          terms: [
            { name: "Invalid Term", startDate: "31-02-2026", endDate: "20-12-2026" },
          ],
        },
        TEST_TENANT
      );
      const putRes = await AYRoute.PUT(putReq);
      assert.strictEqual(putRes.status, 400, "Must reject invalid date with 400");

      // Verify that AY name was NOT modified in the database (rolled back!)
      const ayAfter = await db.academicYear.findUnique({ where: { id: ephemeralAYId! } });
      assert.strictEqual(ayAfter?.name, originalName, "Academic year name must NOT be updated when terms fail!");
    });

    // --------------------------------------------------------------------------
    // 6. EXISTING TERMS PRESERVED WHEN OMITTED OR EMPTY
    // --------------------------------------------------------------------------
    console.log("\n[SECTION 6] Existing Terms Preservation");

    await it("Preserves existing terms when terms property is omitted (e.g. status toggle)", async () => {
      const putReq = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        {
          id: ephemeralAYId,
          isCurrent: true,
          // terms omitted!
        },
        TEST_TENANT
      );
      const putRes = await AYRoute.PUT(putReq);
      assert.strictEqual(putRes.status, 200);

      // Verify terms are still intact in DB
      const dbTerms: any[] = await db.$queryRaw`
        SELECT "id", "name" FROM academic_terms WHERE "academicYearId" = ${ephemeralAYId};
      `;
      assert.strictEqual(dbTerms.length, 2, "Existing terms must NOT be deleted when terms property is omitted!");
    });

    await it("Preserves existing terms when terms array is empty", async () => {
      const putReq = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        {
          id: ephemeralAYId,
          terms: [], // empty array!
        },
        TEST_TENANT
      );
      const putRes = await AYRoute.PUT(putReq);
      assert.strictEqual(putRes.status, 200);

      const dbTerms: any[] = await db.$queryRaw`
        SELECT "id", "name" FROM academic_terms WHERE "academicYearId" = ${ephemeralAYId};
      `;
      assert.strictEqual(dbTerms.length, 2, "Existing terms must NOT be deleted when terms array is empty!");
    });

  } finally {
    // --------------------------------------------------------------------------
    // TEARDOWN: CLEAN UP EPHEMERAL TEST DATA & RESTORE ORIGINAL STATE
    // --------------------------------------------------------------------------
    console.log("\n[TEARDOWN] Purging ephemeral test data...");
    if (ephemeralAYId) {
      await db.$executeRawUnsafe(`DELETE FROM academic_terms WHERE "academicYearId" = $1;`, ephemeralAYId).catch(() => {});
      await db.academicYear.deleteMany({ where: { id: ephemeralAYId } }).catch(() => {});
    }

    // Restore any active year that was modified
    for (const initAY of initialAYs) {
      if (initAY.isCurrent) {
        await db.academicYear.updateMany({
          where: { id: initAY.id, institutionId: initAY.institutionId },
          data: { isCurrent: true },
        }).catch(() => {});
      }
    }

    const finalAYs: any[] = await db.$queryRaw`SELECT id FROM academic_years;`;
    const finalTerms: any[] = await db.$queryRaw`SELECT id FROM academic_terms;`;
    console.log(`[TEARDOWN] Final state: ${finalAYs.length} academic years, ${finalTerms.length} terms in DB.`);
    assert.strictEqual(finalAYs.length, initialAYs.length, "Database academic year count altered!");
    assert.strictEqual(finalTerms.length, initialTerms.length, "Database academic terms count altered!");
    console.log("[TEARDOWN] Database 100% restored to pristine state with zero leftover test records.");
  }

  console.log("\n========================================================");
  console.log(` TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPersistenceFixSuite()
  .catch((err) => {
    console.error("FATAL ERROR IN SUITE:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
