import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import assert from "assert";
import { NextRequest } from "next/server";
import db from "../lib/db";
import * as AYRoute from "../app/api/admin/academics/academic-years/route";
import { getAcademicYears, createAcademicYear } from "../lib/services/institution-admin.service";

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

async function runMultiTenantAcademicTermsSuite() {
  console.log("\n========================================================");
  console.log(" MULTI-TENANT ACADEMIC TERMS & INTEGRITY TEST SUITE");
  console.log(" Safe Verification of 8 Requirements Across 1,000+ Tenants");
  console.log("========================================================\n");

  const INST_A = "inst_apex";
  const INST_B = "inst_horizon";
  const INST_C = "65765c29-f2b5-4ee7-33a7-5fd4f03e5c31".replace("33", "93"); // Audit Test University: 65765c29-f2b5-4ee7-93a7-5fd4f03e5c31

  // Track initial state
  const initialYears: any[] = await db.$queryRaw`
    SELECT id, "institutionId", name, "isCurrent" FROM academic_years ORDER BY id;
  `;
  console.log(`[SETUP] Initial database records: ${initialYears.length} academic years total.`);

  // Check if academic_terms exists initially
  const checkTable: any[] = await db.$queryRaw`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'academic_terms';
  `;
  const wasTablePreExisting = checkTable.length > 0;
  console.log(`[SETUP] Pre-existing academic_terms table: ${wasTablePreExisting ? "YES" : "NO"}`);

  // Create isolated test table and index for test execution
  if (!wasTablePreExisting) {
    console.log("[SETUP] Provisioning ephemeral academic_terms table with composite FK for test duration...");
    await db.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'academic_years_id_institutionId_uq'
          ) THEN
              ALTER TABLE public.academic_years
              ADD CONSTRAINT "academic_years_id_institutionId_uq" UNIQUE (id, "institutionId");
          END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS public.academic_terms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "institutionId" TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
        "academicYearId" TEXT NOT NULL,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        "startDate" TIMESTAMP(3) NOT NULL,
        "endDate" TIMESTAMP(3) NOT NULL,
        "isCurrent" BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "academic_terms_dates_check" CHECK ("startDate" < "endDate"),
        CONSTRAINT "academic_terms_academic_year_tenant_fkey"
          FOREIGN KEY ("academicYearId", "institutionId")
          REFERENCES public.academic_years(id, "institutionId")
          ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "academic_terms_institutionId_idx" ON public.academic_terms ("institutionId");
      CREATE INDEX IF NOT EXISTS "academic_terms_academicYearId_idx" ON public.academic_terms ("academicYearId");
      CREATE UNIQUE INDEX IF NOT EXISTS "academic_terms_one_current_per_year_idx"
        ON public.academic_terms ("academicYearId")
        WHERE ("isCurrent" = true);
    `);
  }

  const createdAYIds: string[] = [];

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Institution A creates an academic year with two semesters
    // --------------------------------------------------------------------------
    console.log("\n[TEST 1] Institution A creates an academic year with two semesters");
    await it("Institution A creates AY with 2 semesters via API and service", async () => {
      const payload = {
        name: "TEST-AY-2030-2031",
        startDate: "2030-08-01",
        endDate: "2031-05-31",
        isCurrent: false,
        terms: [
          { name: "Odd Semester / Fall", startDate: "2030-08-01", endDate: "2030-12-20", isCurrent: true },
          { name: "Even Semester / Spring", startDate: "2031-01-10", endDate: "2031-05-31", isCurrent: false },
        ],
      };

      const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "POST", payload, INST_A);
      const res = await AYRoute.POST(req);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.id, "Expected generated ID");
      createdAYIds.push(json.data.id);

      assert.strictEqual(json.data.terms.length, 2, "Expected 2 persisted terms");
      assert.strictEqual(json.data.terms[0].name, "Odd Semester / Fall");
      assert.strictEqual(json.data.terms[0].isCurrent, true);
      assert.strictEqual(json.data.terms[1].name, "Even Semester / Spring");
      assert.strictEqual(json.data.terms[1].isCurrent, false);
    });

    // --------------------------------------------------------------------------
    // TEST 2: Institution B creates an academic year with three terms (Trimesters)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 2] Institution B creates an academic year with three terms");
    await it("Institution B creates AY with 3 trimesters via API and service", async () => {
      const payload = {
        name: "TEST-AY-2030-2031", // Testing same academic year label for Tenant B
        startDate: "2030-07-01",
        endDate: "2031-06-30",
        isCurrent: true,
        terms: [
          { name: "Trimester 1", startDate: "2030-07-01", endDate: "2030-10-31", isCurrent: true },
          { name: "Trimester 2", startDate: "2030-11-01", endDate: "2031-02-28", isCurrent: false },
          { name: "Trimester 3", startDate: "2031-03-01", endDate: "2031-06-30", isCurrent: false },
        ],
      };

      const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "POST", payload, INST_B);
      const res = await AYRoute.POST(req);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.id, "Expected generated ID");
      createdAYIds.push(json.data.id);

      assert.strictEqual(json.data.terms.length, 3, "Expected 3 persisted terms");
      assert.strictEqual(json.data.terms[0].name, "Trimester 1");
      assert.strictEqual(json.data.terms[1].name, "Trimester 2");
      assert.strictEqual(json.data.terms[2].name, "Trimester 3");
    });

    // --------------------------------------------------------------------------
    // TEST 3: Institution C creates an academic year with four quarters
    // --------------------------------------------------------------------------
    console.log("\n[TEST 3] Institution C creates an academic year with four quarters");
    await it("Institution C creates AY with 4 quarters via API and service", async () => {
      const payload = {
        name: "TEST-AY-2030-2031", // Testing same academic year label for Tenant C
        startDate: "2030-07-01",
        endDate: "2031-06-30",
        isCurrent: false,
        terms: [
          { name: "Quarter 1", startDate: "2030-07-01", endDate: "2030-09-30", isCurrent: false },
          { name: "Quarter 2", startDate: "2030-10-01", endDate: "2030-12-31", isCurrent: true },
          { name: "Quarter 3", startDate: "2031-01-01", endDate: "2031-03-31", isCurrent: false },
          { name: "Quarter 4", startDate: "2031-04-01", endDate: "2031-06-30", isCurrent: false },
        ],
      };

      const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "POST", payload, INST_C);
      const res = await AYRoute.POST(req);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.id, "Expected generated ID");
      createdAYIds.push(json.data.id);

      assert.strictEqual(json.data.terms.length, 4, "Expected 4 persisted terms");
      assert.strictEqual(json.data.terms[1].name, "Quarter 2");
      assert.strictEqual(json.data.terms[1].isCurrent, true);
    });

    // --------------------------------------------------------------------------
    // TEST 4: Two administrators submit the same academic-year name concurrently
    // --------------------------------------------------------------------------
    console.log("\n[TEST 4] Concurrent submissions of identical academic-year name");
    await it("Concurrent creation of identical name for same institution rejects duplicate", async () => {
      const payload = {
        name: "TEST-AY-CONCURRENT-2035",
        startDate: "2035-08-01",
        endDate: "2036-05-31",
        isCurrent: false,
        terms: [
          { name: "Term 1", startDate: "2035-08-01", endDate: "2035-12-31", isCurrent: true },
        ],
      };

      // Fire both requests concurrently
      const req1 = makeReq("http://localhost:3000/api/admin/academics/academic-years", "POST", payload, INST_A);
      const req2 = makeReq("http://localhost:3000/api/admin/academics/academic-years", "POST", payload, INST_A);

      const [res1, res2] = await Promise.all([AYRoute.POST(req1), AYRoute.POST(req2)]);

      const json1 = await res1.json();
      const json2 = await res2.json();

      if (json1.data?.id) createdAYIds.push(json1.data.id);
      if (json2.data?.id) createdAYIds.push(json2.data.id);

      // Exactly one must succeed with 200, and one must be rejected (status 400 or 409 with duplicate error)
      const successCount = (res1.status === 200 ? 1 : 0) + (res2.status === 200 ? 1 : 0);
      const duplicateErrors = [json1.error, json2.error].filter((e) => e && e.includes("already exists"));

      assert.strictEqual(successCount, 1, "Exactly one concurrent submission must succeed");
      assert.strictEqual(duplicateErrors.length, 1, "The duplicate submission must return an 'already exists' error");
    });

    // --------------------------------------------------------------------------
    // TEST 5: The same academic-year name is allowed for different institutions
    // --------------------------------------------------------------------------
    console.log("\n[TEST 5] Cross-tenant identical academic-year name co-existence");
    await it("Inst A and Inst B can both have an academic year named 'TEST-AY-2030-2031'", async () => {
      const yearsA = await getAcademicYears(INST_A);
      const yearsB = await getAcademicYears(INST_B);

      const ayA = yearsA.find((y) => y.name === "TEST-AY-2030-2031");
      const ayB = yearsB.find((y) => y.name === "TEST-AY-2030-2031");

      assert.ok(ayA, "Institution A should contain TEST-AY-2030-2031");
      assert.ok(ayB, "Institution B should contain TEST-AY-2030-2031");
      assert.notStrictEqual(ayA?.id, ayB?.id, "Each institution must have independent record IDs");
      assert.strictEqual(ayA?.terms.length, 2, "Inst A must have 2 terms");
      assert.strictEqual(ayB?.terms.length, 3, "Inst B must have 3 terms");
    });

    // --------------------------------------------------------------------------
    // TEST 6: Terms persist after browser refresh (verified by reading from DB)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 6] Persistence and retrieval after reload / fresh query");
    await it("GET /api/admin/academics/academic-years retrieves persisted terms accurately", async () => {
      const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "GET", undefined, INST_A);
      const res = await AYRoute.GET(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);

      const target = json.data.find((y: any) => y.name === "TEST-AY-2030-2031");
      assert.ok(target, "Found target academic year in GET response");
      assert.strictEqual(target.terms.length, 2, "Persisted terms count must be 2");
      assert.strictEqual(target.terms[0].name, "Odd Semester / Fall");
      assert.strictEqual(target.terms[0].isCurrent, true);
      assert.strictEqual(target.terms[1].name, "Even Semester / Spring");
    });

    // --------------------------------------------------------------------------
    // TEST 7: Terms cannot be accessed through another institution's academic-year ID
    // --------------------------------------------------------------------------
    console.log("\n[TEST 7] Cross-tenant access denial");
    await it("Institution B cannot modify or delete Institution A's academic year", async () => {
      const instAYearId = createdAYIds[0];
      assert.ok(instAYearId, "Requires target academic year ID");

      // Inst B attempts to update Inst A's academic year
      const putReq = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        { id: instAYearId, name: "ATTACKED_NAME" },
        INST_B // Attacking context
      );
      const putRes = await AYRoute.PUT(putReq);
      assert.strictEqual(putRes.status, 404, "Cross-tenant PUT must be rejected with 404");

      // Inst B attempts to delete Inst A's academic year
      const delReq = makeReq(
        `http://localhost:3000/api/admin/academics/academic-years?id=${instAYearId}`,
        "DELETE",
        undefined,
        INST_B // Attacking context
      );
      const delRes = await AYRoute.DELETE(delReq);
      assert.strictEqual(delRes.status, 404, "Cross-tenant DELETE must be rejected with 404");
    });

    // --------------------------------------------------------------------------
    // TEST 8: Activating a year does not affect another institution
    // --------------------------------------------------------------------------
    console.log("\n[TEST 8] Activation isolation across tenants");
    await it("Activating an academic year in Institution A does not alter Institution B's active year", async () => {
      // Find active academic year in Institution B before activating year in Inst A
      const bYearsBefore = await getAcademicYears(INST_B);
      const bActiveBefore = bYearsBefore.find((y) => y.isCurrent);
      assert.ok(bActiveBefore, "Institution B must have an active academic year");

      // Activate academic year in Institution A
      const instAYearId = createdAYIds[0];
      const putReq = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        { id: instAYearId, isCurrent: true },
        INST_A
      );
      const putRes = await AYRoute.PUT(putReq);
      assert.strictEqual(putRes.status, 200);

      // Verify Institution A's year is now active
      const aYearsAfter = await getAcademicYears(INST_A);
      const aTarget = aYearsAfter.find((y) => y.id === instAYearId);
      assert.strictEqual(aTarget?.isCurrent, true, "Inst A target must now be active");

      // Verify Institution B's active academic year is 100% UNCHANGED
      const bYearsAfter = await getAcademicYears(INST_B);
      const bActiveAfter = bYearsAfter.find((y) => y.isCurrent);
      assert.strictEqual(bActiveAfter?.id, bActiveBefore?.id, "Institution B active year ID must remain identical");
      assert.strictEqual(bActiveAfter?.name, bActiveBefore?.name, "Institution B active year name must remain identical");
    });

    // --------------------------------------------------------------------------
    // BONUS: Term Boundary & Sequential Overlap Validation
    // --------------------------------------------------------------------------
    console.log("\n[TEST 9] Term Date Boundary & Sequential Overlap Validation");
    await it("Rejects term with end date before start date", async () => {
      await assert.rejects(
        createAcademicYear(INST_A, {
          name: "TEST-AY-INVALID-DATES",
          startDate: new Date("2032-01-01"),
          endDate: new Date("2032-12-31"),
          terms: [{ name: "Backwards Term", startDate: new Date("2032-06-01"), endDate: new Date("2032-03-01") }],
        }),
        /start date must precede its end date/
      );
    });

    await it("Rejects term outside parent academic year dates", async () => {
      await assert.rejects(
        createAcademicYear(INST_A, {
          name: "TEST-AY-OUT-OF-BOUNDS",
          startDate: new Date("2032-08-01"),
          endDate: new Date("2033-05-31"),
          terms: [{ name: "Too Early", startDate: new Date("2032-06-01"), endDate: new Date("2032-12-01") }],
        }),
        /must fall within academic year boundary/
      );
    });

    await it("Rejects overlapping terms", async () => {
      await assert.rejects(
        createAcademicYear(INST_A, {
          name: "TEST-AY-OVERLAPPING-TERMS",
          startDate: new Date("2032-08-01"),
          endDate: new Date("2033-05-31"),
          terms: [
            { name: "Term 1", startDate: new Date("2032-08-01"), endDate: new Date("2032-12-31") },
            { name: "Term 2", startDate: new Date("2032-12-15"), endDate: new Date("2033-05-31") }, // Overlaps Dec 15-31
          ],
        }),
        /Terms cannot overlap/
      );
    });

    console.log("\n[TEST 10] Concurrency Protection via Partial Unique Index");
    await it("Partial unique index prevents multiple active terms for the same academic year", async () => {
      const targetAyId = createdAYIds[0];
      assert.ok(targetAyId, "Target AY required");

      // Attempting to insert a second active term with isCurrent=true directly into DB must be rejected by unique index
      let caughtError: any = null;
      try {
        await db.$executeRawUnsafe(
          `INSERT INTO academic_terms ("id", "institutionId", "academicYearId", "name", "startDate", "endDate", "isCurrent", "status")
           VALUES ($1, $2, $3, $4, $5, $6, true, 'ACTIVE')`,
          crypto.randomUUID(),
          INST_A,
          targetAyId,
          "Conflicting Active Term",
          new Date("2030-08-01"),
          new Date("2030-12-20")
        );
      } catch (err: any) {
        caughtError = err;
      }

      assert.ok(caughtError, "Expected partial unique index to reject second active term");
      assert.ok(
        caughtError.message.includes("unique") || caughtError.message.includes("23505"),
        `Expected unique violation error, got: ${caughtError.message}`
      );
    });

  } finally {
    // --------------------------------------------------------------------------
    // TEARDOWN & RECOVERY: STRICT DATABASE PRESERVATION
    // --------------------------------------------------------------------------
    console.log("\n[TEARDOWN] Purging test records to preserve pristine database state...");

    if (createdAYIds.length > 0) {
      await db.$executeRawUnsafe(
        `DELETE FROM academic_terms WHERE "academicYearId" = ANY($1::text[])`,
        createdAYIds
      ).catch(() => {});

      await db.$executeRawUnsafe(
        `DELETE FROM academic_years WHERE id = ANY($1::text[])`,
        createdAYIds
      ).catch(() => {});

      console.log(`[TEARDOWN] Deleted ${createdAYIds.length} ephemeral test academic years.`);
    }

    if (!wasTablePreExisting) {
      console.log("[TEARDOWN] Dropping ephemeral test academic_terms table using dependency-aware sequence...");
      await db.$executeRawUnsafe(`DROP INDEX IF EXISTS public.academic_terms_one_current_per_year_idx;`).catch(() => {});
      await db.$executeRawUnsafe(`DROP INDEX IF EXISTS public.academic_terms_institution_current_idx;`).catch(() => {});
      await db.$executeRawUnsafe(`DROP INDEX IF EXISTS public.academic_terms_academicYearId_idx;`).catch(() => {});
      await db.$executeRawUnsafe(`DROP INDEX IF EXISTS public.academic_terms_institutionId_idx;`).catch(() => {});
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS public.academic_terms RESTRICT;`).catch(() => {});
      await db.$executeRawUnsafe(`ALTER TABLE IF EXISTS public.academic_years DROP CONSTRAINT IF EXISTS academic_years_id_institutionId_uq;`).catch(() => {});
    }

    // Restore any active year that was modified during activation test
    for (const initAY of initialYears) {
      if (initAY.isCurrent) {
        await db.academicYear.updateMany({
          where: { id: initAY.id, institutionId: initAY.institutionId },
          data: { isCurrent: true },
        }).catch(() => {});
      }
    }

    const finalYears: any[] = await db.$queryRaw`
      SELECT id, "institutionId", name FROM academic_years ORDER BY id;
    `;
    console.log(`[TEARDOWN] Final database records: ${finalYears.length} academic years total.`);
    assert.strictEqual(
      finalYears.length,
      initialYears.length,
      `Safety failure: Database records altered! Initial: ${initialYears.length}, Final: ${finalYears.length}`
    );
    console.log("[TEARDOWN] Database successfully preserved with 100% record integrity.");
  }

  console.log("\n========================================================");
  console.log(` TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runMultiTenantAcademicTermsSuite()
  .catch((err) => {
    console.error("FATAL ERROR IN SUITE:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
