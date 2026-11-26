import "dotenv/config";
import { authorizeStudentOrParentAccess } from "../lib/security/authorize";
import { ForbiddenError } from "../lib/auth/session";
import { SessionUser } from "../types";
import db from "../lib/db";
import { GET as getFeedbackHandler } from "../app/api/student/feedback/route";
import { GET as getParentChildrenHandler } from "../app/api/parent/children/route";
import { GET as getLibraryHandler } from "../app/api/student/library/route";
import { NextRequest } from "next/server";
import { signToken, computePasswordSignature } from "../lib/auth/jwt";
import bcrypt from "bcryptjs";

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

async function runPortalSecurityAuditTests() {
  console.log("\n==================================================================");
  console.log(" SST-ERP: STUDENT & PARENT SHARED PORTAL SECURITY AUDIT TEST SUITE");
  console.log("==================================================================\n");

  try {
    // Look up real test fixtures
    const institutionA = await db.institution.findFirst({
      select: { id: true, name: true },
    });

    if (!institutionA) {
      console.warn("No active institution found in database to run live fixture test.");
      return;
    }

    const instAId = institutionA.id;

    // Institution B for cross-tenant testing
    const institutionB = await db.institution.findFirst({
      where: { id: { not: instAId } },
      select: { id: true, name: true },
    });

    // Find two distinct students in Institution A
    const studentsInA = await db.student.findMany({
      where: { institutionId: instAId, status: "ACTIVE" },
      take: 2,
      select: { id: true, firstName: true, lastName: true, userId: true },
    });

    if (studentsInA.length < 2) {
      console.warn("Need at least 2 active students in Institution A for IDOR tests.");
      return;
    }

    const studentA = studentsInA[0];
    const studentB = studentsInA[1];

    // Ensure studentA has a valid active User account with passwordHash for JWT session tests
    let studentAUser = studentA.userId
      ? await db.user.findUnique({ where: { id: studentA.userId } })
      : null;

    if (!studentAUser) {
      const defaultHash = await bcrypt.hash("StudentPass123!", 10);
      studentAUser = await db.user.create({
        data: {
          institutionId: instAId,
          email: `audit_student_${Date.now()}@test.com`,
          fullName: `${studentA.firstName} ${studentA.lastName}`,
          role: "STUDENT",
          status: "ACTIVE",
          isActive: true,
          passwordHash: defaultHash,
        },
      });
      await db.student.update({
        where: { id: studentA.id },
        data: { userId: studentAUser.id },
      });
    } else if (!studentAUser.passwordHash || !studentAUser.isActive) {
      const defaultHash = await bcrypt.hash("StudentPass123!", 10);
      studentAUser = await db.user.update({
        where: { id: studentAUser.id },
        data: {
          passwordHash: studentAUser.passwordHash || defaultHash,
          status: "ACTIVE",
          isActive: true,
        },
      });
    }

    const studentASig = computePasswordSignature(studentAUser.passwordHash || "");

    // Find or establish Guardian Account and verified Guardian Link for Parent tests
    let guardianLink = await db.guardianLink.findFirst({
      where: {
        institutionId: instAId,
        studentId: studentA.id,
        isVerified: true,
        canAccessPortal: true,
      },
      include: { guardianAccount: { include: { user: true } } },
    });

    if (!guardianLink) {
      guardianLink = await db.guardianLink.findFirst({
        where: {
          institutionId: instAId,
          isVerified: true,
          canAccessPortal: true,
        },
        include: { guardianAccount: { include: { user: true } } },
      });
    }

    let parentUser = guardianLink?.guardianAccount?.user;
    let guardianAccountId = guardianLink?.guardianAccountId;
    const linkedStudentId = guardianLink ? guardianLink.studentId : studentA.id;
    const unrelatedStudentId = linkedStudentId === studentA.id ? studentB.id : studentA.id;

    if (!parentUser) {
      const parentPwHash = await bcrypt.hash("ParentPass123!", 10);
      parentUser = await db.user.create({
        data: {
          institutionId: instAId,
          email: `audit_parent_${Date.now()}@test.com`,
          fullName: "Audit Parent Tester",
          role: "PARENT",
          status: "ACTIVE",
          isActive: true,
          passwordHash: parentPwHash,
        },
      });

      const guardianAccount = await db.guardianAccount.create({
        data: {
          institutionId: instAId,
          userId: parentUser.id,
          fullName: "Audit Parent Tester",
          phone: "9876543210",
          relationship: "MOTHER",
        },
      });
      guardianAccountId = guardianAccount.id;

      guardianLink = await db.guardianLink.create({
        data: {
          institutionId: instAId,
          guardianAccountId: guardianAccount.id,
          studentId: studentA.id,
          relationship: "MOTHER",
          isPrimary: true,
          isVerified: true,
          canAccessPortal: true,
        },
        include: { guardianAccount: { include: { user: true } } },
      });
    } else if (!parentUser.passwordHash || !parentUser.isActive) {
      const parentPwHash = await bcrypt.hash("ParentPass123!", 10);
      parentUser = await db.user.update({
        where: { id: parentUser.id },
        data: {
          passwordHash: parentUser.passwordHash || parentPwHash,
          status: "ACTIVE",
          isActive: true,
        },
      });
    }

    const parentSig = computePasswordSignature(parentUser.passwordHash || "");

    // -----------------------------------------------------------------------
    // TEST GROUP 1: SEC-01 Feedback Authorization Helper Matrix
    // -----------------------------------------------------------------------
    console.log("[TEST GROUP 1] SEC-01: Feedback Authorization Matrix");
    {
      const sessionStudentA: SessionUser = {
        userId: studentAUser.id,
        email: studentAUser.email,
        fullName: studentAUser.fullName || `${studentA.firstName} ${studentA.lastName}`,
        role: "STUDENT",
        institutionId: instAId,
        institutionName: institutionA.name,
        studentId: studentA.id,
        passwordSig: studentASig,
      };

      // Scenario 1: Student A -> Student A's own feedback => ALLOW
      try {
        const result = await authorizeStudentOrParentAccess(sessionStudentA, studentA.id);
        assert(result.studentId === studentA.id && !result.isParent, "Scenario 1: Student A allowed to access own feedback");
      } catch (e: any) {
        assert(false, "Scenario 1: Student A allowed to access own feedback", e.message);
      }

      // Scenario 2: Student A -> Student B's feedback => DENY (403 Forbidden)
      try {
        await authorizeStudentOrParentAccess(sessionStudentA, studentB.id);
        assert(false, "Scenario 2: Student A denied from accessing Student B's feedback (IDOR)");
      } catch (e: any) {
        assert(e instanceof ForbiddenError || e.message.includes("IDOR"), "Scenario 2: Student A denied from accessing Student B's feedback (IDOR)");
      }

      // Parent A Session
      const sessionParentA: SessionUser = {
        userId: parentUser.id,
        email: parentUser.email,
        fullName: parentUser.fullName || "Audit Parent Tester",
        role: "PARENT",
        institutionId: instAId,
        institutionName: institutionA.name,
        guardianId: guardianAccountId,
        passwordSig: parentSig,
      };

      // Scenario 3: Parent A -> Linked Child's feedback => ALLOW
      try {
        const result = await authorizeStudentOrParentAccess(sessionParentA, linkedStudentId);
        assert(result.studentId === linkedStudentId && result.isParent, "Scenario 3: Parent A allowed to access linked child's feedback");
      } catch (e: any) {
        assert(false, "Scenario 3: Parent A allowed to access linked child's feedback", e.message);
      }

      // Scenario 4: Parent A -> Unrelated Student's feedback => DENY (403 Forbidden)
      try {
        await authorizeStudentOrParentAccess(sessionParentA, unrelatedStudentId);
        assert(false, "Scenario 4: Parent A denied from accessing unrelated student's feedback");
      } catch (e: any) {
        assert(e instanceof ForbiddenError || e.message.includes("Security violation"), "Scenario 4: Parent A denied from accessing unrelated student's feedback");
      }

      // Scenario 5: Cross-Institution Access => DENY (403 Forbidden)
      if (institutionB) {
        const sessionCrossInst: SessionUser = {
          userId: "cross_user_1",
          email: "cross@instb.com",
          fullName: "Inst B User",
          role: "STUDENT",
          institutionId: institutionB.id,
          institutionName: institutionB.name,
          studentId: "cross_st_1",
          passwordSig: "cross_sig",
        };
        try {
          await authorizeStudentOrParentAccess(sessionCrossInst, studentA.id);
          assert(false, "Scenario 5: User from Institution B denied from accessing Student in Institution A");
        } catch (e: any) {
          assert(e instanceof ForbiddenError || e.message.includes("Tenant"), "Scenario 5: Cross-institution access rejected by assertTenant");
        }
      }
    }

    // -----------------------------------------------------------------------
    // TEST GROUP 2: SEC-02 Parent Children Endpoint Security (GET /api/parent/children)
    // -----------------------------------------------------------------------
    console.log("\n[TEST GROUP 2] SEC-02: Parent Children Endpoint (GET /api/parent/children)");
    {
      // Scenario 6 & 7: Student calls /api/parent/children => MUST BE REJECTED (403 Forbidden)
      const tokenStudent = await signToken({
        userId: studentAUser.id,
        email: studentAUser.email,
        fullName: studentAUser.fullName || `${studentA.firstName} ${studentA.lastName}`,
        role: "STUDENT",
        institutionId: instAId,
        institutionName: institutionA.name,
        studentId: studentA.id,
        passwordSig: studentASig,
      });

      const reqStudent = new NextRequest("http://localhost:3000/api/parent/children", {
        headers: { Authorization: `Bearer ${tokenStudent}` },
      });

      const resStudent = await getParentChildrenHandler(reqStudent);
      const jsonStudent = await resStudent.json();

      assert(resStudent.status === 403, "Scenario 6: Student role is rejected with 403 on /api/parent/children", `Status ${resStudent.status}`);
      assert(jsonStudent.success === false && jsonStudent.error.includes("Access denied"), "Scenario 7: Sibling access prevented; returns explicit access denied message");

      // Scenario 8 & 9: Parent calls /api/parent/children => MUST BE ALLOWED (200 OK)
      const tokenParent = await signToken({
        userId: parentUser.id,
        email: parentUser.email,
        fullName: parentUser.fullName || "Audit Parent Tester",
        role: "PARENT",
        institutionId: instAId,
        institutionName: institutionA.name,
        guardianId: guardianAccountId,
        passwordSig: parentSig,
      });

      const reqParent = new NextRequest("http://localhost:3000/api/parent/children", {
        headers: { Authorization: `Bearer ${tokenParent}` },
      });

      const resParent = await getParentChildrenHandler(reqParent);
      const jsonParent = await resParent.json();

      assert(resParent.status === 200 && jsonParent.success === true, "Scenario 8: Parent role allowed to retrieve verified linked children");
      assert(
        Array.isArray(jsonParent.data) &&
        jsonParent.data.some((c: any) => c.student?.id === linkedStudentId),
        "Scenario 9: Returns list of verified children scoped strictly to authenticated parent"
      );
    }

    // -----------------------------------------------------------------------
    // TEST GROUP 3: FIND-04 Library Issued Books Role Scoping (GET /api/student/library?view=my-books)
    // -----------------------------------------------------------------------
    console.log("\n[TEST GROUP 3] FIND-04: Library Issued Books Endpoint (GET /api/student/library?view=my-books)");
    {
      const tokenParent = await signToken({
        userId: parentUser.id,
        email: parentUser.email,
        fullName: parentUser.fullName || "Audit Parent Tester",
        role: "PARENT",
        institutionId: instAId,
        institutionName: institutionA.name,
        guardianId: guardianAccountId,
        passwordSig: parentSig,
      });

      // Scenario 10: Parent query without childId/studentId parameter => 400 Bad Request
      const reqMissingChild = new NextRequest("http://localhost:3000/api/student/library?view=my-books", {
        headers: { Authorization: `Bearer ${tokenParent}` },
      });
      const resMissing = await getLibraryHandler(reqMissingChild);
      assert(resMissing.status === 400, "Scenario 10: Parent without childId parameter is rejected with 400");

      // Scenario 11: Parent query with unrelated studentId => 403 Forbidden
      const reqUnrelated = new NextRequest(
        `http://localhost:3000/api/student/library?view=my-books&studentId=${unrelatedStudentId}`,
        {
          headers: { Authorization: `Bearer ${tokenParent}` },
        }
      );
      const resUnrelated = await getLibraryHandler(reqUnrelated);
      assert(resUnrelated.status === 403, "Scenario 11: Parent attempting to access unrelated student's library is rejected with 403");

      // Scenario 12: Parent query with linked studentId => 200 OK
      const reqLinked = new NextRequest(
        `http://localhost:3000/api/student/library?view=my-books&studentId=${linkedStudentId}`,
        {
          headers: { Authorization: `Bearer ${tokenParent}` },
        }
      );
      const resLinked = await getLibraryHandler(reqLinked);
      const jsonLinked = await resLinked.json();
      assert(resLinked.status === 200 && jsonLinked.success === true, "Scenario 12: Parent querying linked child library records is allowed with 200");
    }

    // -----------------------------------------------------------------------
    // TEST GROUP 4: SEC-01 Feedback Route Integration Test (GET /api/student/feedback)
    // -----------------------------------------------------------------------
    console.log("\n[TEST GROUP 4] SEC-01: Feedback Route Handler Integration");
    {
      const tokenStudentA = await signToken({
        userId: studentAUser.id,
        email: studentAUser.email,
        fullName: studentAUser.fullName || `${studentA.firstName} ${studentA.lastName}`,
        role: "STUDENT",
        institutionId: instAId,
        institutionName: institutionA.name,
        studentId: studentA.id,
        passwordSig: studentASig,
      });

      // Scenario 13: Student A requests own feedback => 200 OK
      const reqOwn = new NextRequest(`http://localhost:3000/api/student/feedback?studentId=${studentA.id}`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      const resOwn = await getFeedbackHandler(reqOwn);
      const jsonOwn = await resOwn.json();
      assert(resOwn.status === 200 && jsonOwn.success === true, "Scenario 13: Student A successfully retrieves own feedback");

      // Scenario 14: Student A requests Student B's feedback => 403 Forbidden
      const reqOther = new NextRequest(`http://localhost:3000/api/student/feedback?studentId=${studentB.id}`, {
        headers: { Authorization: `Bearer ${tokenStudentA}` },
      });
      const resOther = await getFeedbackHandler(reqOther);
      assert(resOther.status === 403, "Scenario 14: Student A accessing Student B's feedback returns 403 Forbidden");
    }

    console.log("\n========================================================");
    console.log(` AUDIT SECURITY TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log("========================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Test execution error:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

runPortalSecurityAuditTests();
