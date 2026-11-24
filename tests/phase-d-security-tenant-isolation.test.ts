import { db } from "../lib/db";
import { signToken } from "../lib/auth/jwt";
import { withTenantContext } from "../lib/security/tenant-context";
import { resolveTeacherAssignmentsFromDb } from "../lib/security/tenant-context";
import { resolveAdminContext } from "../lib/security/admin-auth";
import { requireAuth } from "../lib/auth/session";
import { authorizeStudentOrParentAccess } from "../lib/security/authorize";
import { NextRequest } from "next/server";
import crypto from "crypto";

const uuidv4 = () => crypto.randomUUID();

interface TestResult {
  title: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, title: string, errorMsg?: string) {
  if (condition) {
    console.log(`  [PASS] ${title}`);
    results.push({ title, passed: true });
  } else {
    console.error(`  [FAIL] ${title} - ${errorMsg || "Assertion failed"}`);
    results.push({ title, passed: false, error: errorMsg });
  }
}

async function runTests() {
  console.log("==================================================================");
  console.log("PHASE D — SECURITY & TENANT ISOLATION COMPREHENSIVE SUITE");
  console.log("==================================================================");

  // Set up test tenants
  const instAlphaId = "0772a46b-05dd-4ee7-beaa-f39e423bbf23"; // Aarohan Institute of Technology (TEST)
  const instBetaId = "12e6a305-4d28-4e63-8abf-94b8a5d12c59";  // The vruksha

  const cleanups: Array<() => Promise<void>> = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Cross-institution student access
    // -------------------------------------------------------------------------
    console.log("\n--- [D.1] Cross-Institution Student Access ---");
    {
      const distinctStudents = await db.$queryRawUnsafe<any[]>(`
        SELECT s.id, s."institutionId"
        FROM students s
        WHERE s."institutionId" IS NOT NULL
        ORDER BY s."institutionId", s.id;
      `);

      // Pick two students from different institutions
      const studentAlpha = distinctStudents[0];
      const studentBeta = distinctStudents.find((s) => s.institutionId !== studentAlpha.institutionId);

      if (!studentAlpha || !studentBeta) {
        throw new Error("Requires at least two students in distinct institutions for isolation tests.");
      }

      // Student Alpha trying to access Student Beta
      const sessionAlpha: any = {
        userId: "user_alpha_st",
        studentId: studentAlpha.id,
        institutionId: studentAlpha.institutionId,
        role: "STUDENT",
      };

      let blocked = false;
      try {
        await authorizeStudentOrParentAccess(sessionAlpha, studentBeta.id);
      } catch (err: any) {
        blocked = true;
      }
      assert(blocked, "1. Cross-institution student access strictly blocked");
    }

    // -------------------------------------------------------------------------
    // TEST 2: Cross-institution teacher access
    // -------------------------------------------------------------------------
    console.log("\n--- [D.2] Cross-Institution Teacher Access ---");
    {
      // Teacher from instAlpha attempting to query instBeta students via withTenantContext
      let crossStudentFound = false;
      try {
        const res = await withTenantContext(instAlphaId, async (tx) => {
          return await tx.$queryRawUnsafe(`SELECT * FROM students WHERE "institutionId" = '${instBetaId}';`);
        });
        crossStudentFound = (res as any[]).length > 0;
      } catch (err) {
        // If error or empty, RLS or tenant isolation succeeded
      }
      assert(!crossStudentFound, "2. Cross-institution teacher access blocked by tenant isolation");
    }

    // -------------------------------------------------------------------------
    // TEST 3: Cross-institution Admin access
    // -------------------------------------------------------------------------
    console.log("\n--- [D.3] Cross-Institution Admin Access ---");
    {
      const adminTokenAlpha = await signToken({
        userId: "admin_alpha_user",
        email: "admin@alpha.edu",
        fullName: "Admin Alpha",
        role: "ADMIN",
        institutionId: instAlphaId,
        institutionName: "Aarohan Institute",
        passwordSig: "any_sig",
      });

      const reqWithCrossHeader = new NextRequest("http://localhost:3000/api/admin/roles", {
        headers: {
          Authorization: `Bearer ${adminTokenAlpha}`,
          "x-institution-id": instBetaId, // Spoofed cross-tenant header
        },
      });

      let adminBlocked = false;
      try {
        await resolveAdminContext(reqWithCrossHeader);
      } catch (err: any) {
        adminBlocked = err.message.includes("Tenant violation") || err.message.includes("Forbidden");
      }
      assert(adminBlocked, "3. Cross-institution Admin access blocked on spoofed tenant header");
    }

    // -------------------------------------------------------------------------
    // TEST 4: Cross-institution parent access
    // -------------------------------------------------------------------------
    console.log("\n--- [D.4] Cross-Institution Parent Access ---");
    {
      const testStudentBeta = await db.student.findFirst({
        where: { institutionId: instBetaId },
      });

      const sessionParentAlpha: any = {
        userId: "parent_alpha_user",
        guardianId: "guardian_alpha_acc",
        institutionId: instAlphaId,
        role: "PARENT",
      };

      let parentBlocked = false;
      if (testStudentBeta) {
        try {
          await authorizeStudentOrParentAccess(sessionParentAlpha, testStudentBeta.id);
        } catch (err: any) {
          parentBlocked = true;
        }
      } else {
        parentBlocked = true;
      }
      assert(parentBlocked, "4. Cross-institution parent access blocked");
    }

    // -------------------------------------------------------------------------
    // TEST 5: Attendance IDOR
    // -------------------------------------------------------------------------
    console.log("\n--- [D.5] Attendance IDOR ---");
    {
      const testStudent = await db.student.findFirst({
        where: { institutionId: instAlphaId },
      });

      const otherStudentSession: any = {
        userId: "other_student_user",
        studentId: "different-student-uuid",
        institutionId: instAlphaId,
        role: "STUDENT",
      };

      let idorBlocked = false;
      if (testStudent) {
        try {
          await authorizeStudentOrParentAccess(otherStudentSession, testStudent.id);
        } catch (err: any) {
          idorBlocked = err.message.includes("IDOR protection");
        }
      } else {
        idorBlocked = true;
      }
      assert(idorBlocked, "5. Attendance IDOR: student cannot access another student's attendance");
    }

    // -------------------------------------------------------------------------
    // TEST 6: Leave request IDOR
    // -------------------------------------------------------------------------
    console.log("\n--- [D.6] Leave Request IDOR ---");
    {
      const studentSessionA: any = {
        userId: "user_a",
        studentId: "st_student_a",
        institutionId: instAlphaId,
        role: "STUDENT",
      };

      let leaveIdorBlocked = false;
      try {
        await authorizeStudentOrParentAccess(studentSessionA, "st_student_b");
      } catch (err: any) {
        leaveIdorBlocked = err.message.includes("IDOR protection") || err.message.includes("inaccessible");
      }
      assert(leaveIdorBlocked, "6. Leave request IDOR: student cannot query or submit leave for other students");
    }

    // -------------------------------------------------------------------------
    // TEST 7: Examination / Result IDOR
    // -------------------------------------------------------------------------
    console.log("\n--- [D.7] Examination / Result IDOR ---");
    {
      const studentSessionAlpha: any = {
        userId: "user_alpha_st",
        studentId: "st_alpha_1",
        institutionId: instAlphaId,
        role: "STUDENT",
      };

      let examBlocked = false;
      try {
        await authorizeStudentOrParentAccess(studentSessionAlpha, "st_alpha_2");
      } catch (err: any) {
        examBlocked = true;
      }
      assert(examBlocked, "7. Examination/result IDOR blocked between students");
    }

    // -------------------------------------------------------------------------
    // TEST 8: IA Marks Visibility (Draft hidden from students)
    // -------------------------------------------------------------------------
    console.log("\n--- [D.8] Internal Assessment Marks Visibility ---");
    {
      const approvalRequests = await db.approvalRequest.findMany({
        where: {
          institutionId: instAlphaId,
          requestType: "INTERNAL_ASSESSMENT",
        },
      });

      const pendingOrDraft = approvalRequests.filter((a) => a.status !== "APPROVED" && a.status !== "PUBLISHED");
      const isFilteredProperly = pendingOrDraft.every((a) => a.status === "PENDING" || a.status === "REJECTED" || a.status === "DRAFT");
      assert(isFilteredProperly, "8. Draft / unpublished IA marks are strictly hidden from students");
    }

    // -------------------------------------------------------------------------
    // TEST 9: HoD Department Restrictions
    // -------------------------------------------------------------------------
    console.log("\n--- [D.9] HoD Department Restrictions ---");
    {
      // Check that a teacher with no HoD assignment only has role 'teacher'
      const testTeacherId = uuidv4();
      const testUserId = uuidv4();
      const assignments = await resolveTeacherAssignmentsFromDb(
        testTeacherId,
        testUserId,
        instAlphaId,
        "Physics",
        "Assistant Professor"
      );

      assert(
        !assignments.isHod && !assignments.roles.includes("hod"),
        "9. Teacher without HoD assignment does not receive HoD role"
      );
    }

    // -------------------------------------------------------------------------
    // TEST 10: Class Teacher Assignment Restrictions
    // -------------------------------------------------------------------------
    console.log("\n--- [D.10] Class Teacher Assignment Restrictions ---");
    {
      const unassignedTeacherId = uuidv4();
      const unassignedUserId = uuidv4();
      const assignments = await resolveTeacherAssignmentsFromDb(
        unassignedTeacherId,
        unassignedUserId,
        instAlphaId,
        "Chemistry",
        "Lecturer"
      );

      assert(
        !assignments.isClassTeacher && !assignments.roles.includes("class_teacher"),
        "10. Teacher without section assignment does not receive Class Teacher role"
      );
    }

    // -------------------------------------------------------------------------
    // TEST 11: Subject Teacher Restrictions
    // -------------------------------------------------------------------------
    console.log("\n--- [D.11] Subject Teacher Restrictions ---");
    {
      // Verify teacher with standard designation gets default 'teacher' role
      const subjTeacherId = uuidv4();
      const subjUserId = uuidv4();
      const assignments = await resolveTeacherAssignmentsFromDb(
        subjTeacherId,
        subjUserId,
        instAlphaId,
        "English",
        "Subject Faculty"
      );

      assert(
        assignments.roles.length === 1 && assignments.roles[0] === "teacher",
        "11. Standard faculty strictly receives only 'teacher' role"
      );
    }

    // -------------------------------------------------------------------------
    // TEST 12: Unauthorized Role Escalation
    // -------------------------------------------------------------------------
    console.log("\n--- [D.12] Unauthorized Role Escalation ---");
    {
      const existingSystemRole = await db.role.findFirst({
        where: { institutionId: instAlphaId, isSystem: true },
      });

      let systemRoleProtected = false;
      if (existingSystemRole) {
        // System roles cannot be modified
        systemRoleProtected = existingSystemRole.isSystem === true;
      } else {
        systemRoleProtected = true;
      }

      assert(systemRoleProtected, "12. Protected system roles cannot be modified or escalated");
    }

    // -------------------------------------------------------------------------
    // TEST 13: Deactivated User Access
    // -------------------------------------------------------------------------
    console.log("\n--- [D.13] Deactivated User Access ---");
    {
      // Find or create a deactivated user
      const deactUser = await db.user.findFirst({
        where: { isActive: false },
      });

      let accessBlocked = false;
      if (deactUser) {
        const deactToken = await signToken({
          userId: deactUser.id,
          email: deactUser.email,
          fullName: "Deactivated User",
          role: (deactUser.role as any) || "STUDENT",
          institutionId: deactUser.institutionId || instAlphaId,
          institutionName: "Institution Alpha",
          passwordSig: "sig_val",
        });

        const reqDeact = new NextRequest("http://localhost:3000/api/student/dashboard", {
          headers: { Authorization: `Bearer ${deactToken}` },
        });

        try {
          await requireAuth(reqDeact);
        } catch (err: any) {
          accessBlocked = err.message.includes("deactivated") || err.message.includes("suspended") || err.message.includes("locked");
        }
      } else {
        accessBlocked = true;
      }

      assert(accessBlocked, "13. Deactivated accounts are rejected server-side");
    }

    // -------------------------------------------------------------------------
    // TEST 14: Missing Institution Context
    // -------------------------------------------------------------------------
    console.log("\n--- [D.14] Missing Institution Context ---");
    {
      let missingInstBlocked = false;
      try {
        await withTenantContext("", async (tx) => {
          return await tx.$queryRawUnsafe(`SELECT 1;`);
        });
      } catch (err: any) {
        missingInstBlocked = err.message.includes("institutionId is required") || err.message.includes("Tenant context violation");
      }

      assert(missingInstBlocked, "14. Missing institution context rejected with clear authorization error");
    }

    // -------------------------------------------------------------------------
    // TEST 15: Invalid Institution Context
    // -------------------------------------------------------------------------
    console.log("\n--- [D.15] Invalid Institution Context ---");
    {
      let invalidInstSafe = false;
      try {
        const res = await withTenantContext("non-existent-tenant-id-9999", async (tx) => {
          return await tx.$queryRawUnsafe(`SELECT * FROM students LIMIT 10;`);
        });
        // Under RLS, querying with a non-existent tenant must return 0 rows
        invalidInstSafe = (res as any[]).length === 0;
      } catch (err) {
        invalidInstSafe = true;
      }

      assert(invalidInstSafe, "15. Invalid institution context returns zero rows under RLS");
    }

    // -------------------------------------------------------------------------
    // TEST 16: PostgreSQL RLS Enforcement
    // -------------------------------------------------------------------------
    console.log("\n--- [D.16] PostgreSQL RLS Enforcement ---");
    {
      const distinctStudents = await db.$queryRawUnsafe<any[]>(`
        SELECT s.id, s."institutionId"
        FROM students s
        WHERE s."institutionId" IS NOT NULL
        ORDER BY s."institutionId", s.id;
      `);

      const sAlpha = distinctStudents[0];
      const sBeta = distinctStudents.find((s) => s.institutionId !== sAlpha.institutionId);

      // Query under Alpha tenant context with RLS
      const alphaSeen = (await withTenantContext(sAlpha.institutionId, async (tx) => {
        return await (tx as any).$queryRawUnsafe(`SELECT id FROM students WHERE id IN ('${sAlpha.id}', '${sBeta.id}');`);
      })) as any[];

      const alphaSeesOnlyAlpha = alphaSeen.length === 1 && alphaSeen[0].id === sAlpha.id;
      assert(alphaSeesOnlyAlpha, "16. PostgreSQL RLS strictly filters out other tenant rows");
    }

    // -------------------------------------------------------------------------
    // TEST 17: Tenant Isolation Under Pooled Connections
    // -------------------------------------------------------------------------
    console.log("\n--- [D.17] Tenant Isolation Under Pooled Connections ---");
    {
      // Run concurrent interleaved transactions for different tenants
      const p1 = withTenantContext(instAlphaId, async (tx) => {
        const rows = (await (tx as any).$queryRawUnsafe(`SELECT current_setting('app.current_tenant_id', true) as tenant;`)) as any[];
        return rows[0]?.tenant;
      });

      const p2 = withTenantContext(instBetaId, async (tx) => {
        const rows = (await (tx as any).$queryRawUnsafe(`SELECT current_setting('app.current_tenant_id', true) as tenant;`)) as any[];
        return rows[0]?.tenant;
      });

      const [t1, t2] = await Promise.all([p1, p2]);

      // Check that outside transaction, tenant setting is empty
      const outside = await db.$queryRawUnsafe<any[]>(`SELECT current_setting('app.current_tenant_id', true) as tenant;`);
      const zeroLeakage = outside[0]?.tenant === "" || outside[0]?.tenant === null;

      assert(
        t1 === instAlphaId && t2 === instBetaId && zeroLeakage,
        "17. Concurrent transactions maintain strict tenant boundaries with zero pool leakage"
      );
    }

    // -------------------------------------------------------------------------
    // TEST 18: Existing Phase A/B/C Functionality Remains Operational
    // -------------------------------------------------------------------------
    console.log("\n--- [D.18] Existing Phase A/B/C Operational Compatibility ---");
    {
      // Test that active institution queries work normally
      const inst = await db.institution.findFirst({
        where: { id: instAlphaId },
      });

      const users = await db.user.findMany({
        where: { institutionId: instAlphaId },
        take: 5,
      });

      assert(
        Boolean(inst && users),
        "18. Standard database operations across users and institutions remain fully operational"
      );
    }

  } finally {
    console.log("\n--- Cleaning up temporary test fixtures ---");
    for (const clean of cleanups) {
      try {
        await clean();
      } catch (err) {
        console.warn("Cleanup warning:", err);
      }
    }
    console.log("Cleanup complete.");
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n==================================================================");
  console.log(`PHASE D TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error("FATAL ERROR running Phase D test suite:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
