import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import assert from "assert";
import { NextRequest } from "next/server";
import db from "../lib/db";
import { computePasswordSignature, signToken, verifyToken } from "../lib/auth/jwt";
import { authorizeStudentOrParentAccess } from "../lib/security/authorize";

// Import Route Handlers
import * as StudentsRoute from "../app/api/admin/students/route";
import * as StaffRoute from "../app/api/admin/staff/route";
import * as TimetableRoute from "../app/api/admin/timetable/route";
import * as ExamsRoute from "../app/api/admin/examinations/route";
import * as ResultsRoute from "../app/api/admin/results/route";
import * as AYRoute from "../app/api/admin/academics/academic-years/route";
import * as DeptsRoute from "../app/api/admin/academics/departments/route";
import * as ClassesRoute from "../app/api/admin/academics/classes/route";
import * as CoursesRoute from "../app/api/admin/academics/courses/route";
import * as SubjectsRoute from "../app/api/admin/academics/subjects/route";
import * as IARoute from "../app/api/admin/ia/route";
import * as GuardiansRoute from "../app/api/admin/guardians/route";

// Import Services
import {
  updateStudent,
  publishResultBatch,
  updateAdmissionStatus,
  updateResourceBookingStatus,
  deleteHostelAllocation,
  deleteTransportAllocation,
  getGuardians,
  createGuardian,
} from "../lib/services/institution-admin.service";
import { issueParentCredentials } from "../lib/services/credential-management.service";

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

function makeReq(url: string, method: string = "GET", body?: any, instId: string = "inst_alpha") {
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

async function runPhase3ATests() {
  console.log("\n========================================================");
  console.log(" PHASE 3A: SECURITY & DATA INTEGRITY REMEDIATION SUITE");
  console.log("========================================================\n");

  const INST_ALPHA = "inst_alpha_test";
  const INST_BETA = "inst_beta_test";

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Student Atomic Tenant Isolation
  // --------------------------------------------------------------------------
  console.log("[TEST GROUP 1] Student Cross-Institution Atomic Update & Delete Protection");
  {
    const originalFindFirst = db.student.findFirst;
    const originalUpdateMany = db.student.updateMany;

    let updateManyCalledWith: any = null;

    db.student.updateMany = (async (args: any) => {
      updateManyCalledWith = args;
      const { id, institutionId } = args.where;
      if (id === "stu_beta" && institutionId === INST_ALPHA) {
        return { count: 0 }; // Cross-tenant: 0 rows modified
      }
      if (id === "stu_alpha" && institutionId === INST_ALPHA) {
        return { count: 1 };
      }
      return { count: 0 };
    }) as any;

    db.student.findFirst = (async (args: any) => {
      const { id, institutionId } = args.where;
      if (id === "stu_alpha" && institutionId === INST_ALPHA) {
        return { id: "stu_alpha", institutionId: INST_ALPHA, fullName: "Alpha Student", status: "ARCHIVED" };
      }
      return null;
    }) as any;

    // Test 1: Cross-institution DELETE is blocked atomically
    await it("DELETE /api/admin/students strictly blocks deleting a student belonging to another institution (404 via atomic updateMany)", async () => {
      updateManyCalledWith = null;
      const req = makeReq("http://localhost:3000/api/admin/students?id=stu_beta", "DELETE", undefined, INST_ALPHA);
      const res = await StudentsRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, "Student not found or access denied.");
      assert.strictEqual(updateManyCalledWith?.where?.institutionId, INST_ALPHA, "UPDATE query must enforce institutionId in WHERE clause");
    });

    // Test 2: Same-institution DELETE succeeds atomically
    await it("DELETE /api/admin/students atomically archives a student belonging to the same institution", async () => {
      updateManyCalledWith = null;
      const req = makeReq("http://localhost:3000/api/admin/students?id=stu_alpha", "DELETE", undefined, INST_ALPHA);
      const res = await StudentsRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(updateManyCalledWith?.where?.id, "stu_alpha");
      assert.strictEqual(updateManyCalledWith?.where?.institutionId, INST_ALPHA);
      assert.strictEqual(updateManyCalledWith?.data?.status, "ARCHIVED");
    });

    // Test 3: updateStudent service blocks cross-institution update atomically
    await it("updateStudent service throws error when student does not belong to administrator's institution (atomic updateMany)", async () => {
      let threw = false;
      try {
        await updateStudent(INST_ALPHA, "stu_beta", { fullName: "Hacked Name" });
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes("Student not found or access denied"));
      }
      assert.strictEqual(threw, true, "Must throw tenant access denied error");
    });

    // Test 4: updateStudent service succeeds for authorized institution
    await it("updateStudent service updates student when institution matches (atomic updateMany)", async () => {
      updateManyCalledWith = null;
      db.student.findFirst = (async () => ({ id: "stu_alpha", fullName: "Updated Alpha" })) as any;
      const res = await updateStudent(INST_ALPHA, "stu_alpha", { fullName: "Updated Alpha" });
      assert.strictEqual(res?.fullName, "Updated Alpha");
      assert.strictEqual(updateManyCalledWith?.where?.id, "stu_alpha");
      assert.strictEqual(updateManyCalledWith?.where?.institutionId, INST_ALPHA);
    });

    // Restore
    db.student.findFirst = originalFindFirst;
    db.student.updateMany = originalUpdateMany;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Staff Privilege Escalation Protection
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 2] Staff Privilege Escalation Protection");
  {
    const originalFindFirst = db.user.findFirst;
    const originalUpdateMany = db.user.updateMany;

    let updateManyCalledWith: any = null;

    db.user.findFirst = (async (args: any) => {
      const { id, institutionId } = args.where;
      if (id === "staff_alpha" && institutionId === INST_ALPHA) {
        return { id: "staff_alpha", institutionId: INST_ALPHA, fullName: "Prof. Alpha", role: "TEACHER" };
      }
      if (id === "super_admin_user") {
        return { id: "super_admin_user", institutionId: INST_ALPHA, fullName: "Super Admin", role: "SUPER_ADMIN" };
      }
      return null;
    }) as any;

    db.user.updateMany = (async (args: any) => {
      updateManyCalledWith = args;
      return { count: 1 };
    }) as any;

    // Test 1: Block assigning SUPER_ADMIN in PUT
    await it("PUT /api/admin/staff blocks Institution Admin from assigning SUPER_ADMIN (403)", async () => {
      updateManyCalledWith = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/staff",
        "PUT",
        { id: "staff_alpha", role: "SUPER_ADMIN" },
        INST_ALPHA
      );
      const res = await StaffRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 403);
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes("Unauthorized role assignment"));
      assert.strictEqual(updateManyCalledWith, null, "Database update must NOT be executed for privilege escalation!");
    });

    // Test 2: Block assigning arbitrary system roles in PUT
    await it("PUT /api/admin/staff blocks arbitrary unauthorized roles like PLATFORM_ADMIN (403)", async () => {
      updateManyCalledWith = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/staff",
        "PUT",
        { id: "staff_alpha", role: "PLATFORM_ADMIN" },
        INST_ALPHA
      );
      const res = await StaffRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 403);
      assert.strictEqual(json.success, false);
      assert.strictEqual(updateManyCalledWith, null);
    });

    // Test 3: Block modifying a Super Admin account
    await it("PUT /api/admin/staff blocks Institution Admin from modifying a Super Admin account (403)", async () => {
      updateManyCalledWith = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/staff",
        "PUT",
        { id: "super_admin_user", fullName: "Compromised Name" },
        INST_ALPHA
      );
      const res = await StaffRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 403);
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, "Cannot modify a Super Admin user.");
      assert.strictEqual(updateManyCalledWith, null);
    });

    // Test 4: Block assigning SUPER_ADMIN in POST
    await it("POST /api/admin/staff blocks creating a new staff member with SUPER_ADMIN role (403)", async () => {
      const req = makeReq(
        "http://localhost:3000/api/admin/staff",
        "POST",
        { fullName: "Attacker", email: "attacker@test.edu", role: "SUPER_ADMIN" },
        INST_ALPHA
      );
      const res = await StaffRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 403);
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes("Unauthorized role assignment"));
    });

    // Test 5: Allow legitimate staff role changes within institution with atomic updateMany
    await it("PUT /api/admin/staff allows authorized role update to TEACHER or ADMIN atomically", async () => {
      updateManyCalledWith = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/staff",
        "PUT",
        { id: "staff_alpha", role: "ADMIN", fullName: "Dean Alpha" },
        INST_ALPHA
      );
      const res = await StaffRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(updateManyCalledWith?.data?.role, "ADMIN");
      assert.strictEqual(updateManyCalledWith?.data?.fullName, "Dean Alpha");
      assert.strictEqual(updateManyCalledWith?.where?.institutionId, INST_ALPHA);
      assert.deepStrictEqual(updateManyCalledWith?.where?.role, { not: "SUPER_ADMIN" });
    });

    // Restore
    db.user.findFirst = originalFindFirst;
    db.user.updateMany = originalUpdateMany;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Staff Cross-Institution Atomic Scoping
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 3] Staff Cross-Institution Atomic Scoping");
  {
    const originalFindFirst = db.user.findFirst;
    const originalUpdateMany = db.user.updateMany;

    let updateManyCalledWith: any = null;

    db.user.findFirst = (async (args: any) => {
      const { id, institutionId } = args.where;
      if (id === "staff_beta" && institutionId === INST_ALPHA) {
        return null; // Belongs to Beta!
      }
      return null;
    }) as any;

    db.user.updateMany = (async (args: any) => {
      updateManyCalledWith = args;
      return { count: 0 };
    }) as any;

    await it("PUT /api/admin/staff returns 404 when attempting to update staff from another institution", async () => {
      updateManyCalledWith = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/staff",
        "PUT",
        { id: "staff_beta", fullName: "Renamed Beta Staff" },
        INST_ALPHA
      );
      const res = await StaffRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, "Staff member not found or access denied.");
    });

    // Restore
    db.user.findFirst = originalFindFirst;
    db.user.updateMany = originalUpdateMany;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Timetable Atomic Tenant Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 4] Timetable Atomic Tenant Isolation");
  {
    const originalDeleteMany = db.timetableSlot.deleteMany;
    let deleteManyCalledWith: any = null;

    db.timetableSlot.deleteMany = (async (args: any) => {
      deleteManyCalledWith = args;
      const { id, institutionId } = args.where;
      if (id === "slot_beta" && institutionId === INST_ALPHA) {
        return { count: 0 }; // Cross-tenant blocked!
      }
      if (id === "slot_alpha" && institutionId === INST_ALPHA) {
        return { count: 1 };
      }
      return { count: 0 };
    }) as any;

    await it("DELETE /api/admin/timetable blocks cross-tenant slot deletion (404 via atomic deleteMany)", async () => {
      deleteManyCalledWith = null;
      const req = makeReq("http://localhost:3000/api/admin/timetable?id=slot_beta", "DELETE", undefined, INST_ALPHA);
      const res = await TimetableRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(deleteManyCalledWith?.where?.id, "slot_beta");
      assert.strictEqual(deleteManyCalledWith?.where?.institutionId, INST_ALPHA);
    });

    await it("DELETE /api/admin/timetable allows deleting slot within administrator's institution", async () => {
      deleteManyCalledWith = null;
      const req = makeReq("http://localhost:3000/api/admin/timetable?id=slot_alpha", "DELETE", undefined, INST_ALPHA);
      const res = await TimetableRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(deleteManyCalledWith?.where?.id, "slot_alpha");
      assert.strictEqual(deleteManyCalledWith?.where?.institutionId, INST_ALPHA);
    });

    // Restore
    db.timetableSlot.deleteMany = originalDeleteMany;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Examinations & IA Atomic Tenant Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 5] Examinations & IA Atomic Tenant Isolation");
  {
    const origExamUpdateMany = db.examination.updateMany;
    const origExamFindFirst = db.examination.findFirst;
    const origIAUpdateMany = db.iAAssessment.updateMany;
    const origIAFindFirst = db.iAAssessment.findFirst;

    let examUpdateManyCalled: any = null;
    let iaUpdateManyCalled: any = null;

    db.examination.updateMany = (async (args: any) => {
      examUpdateManyCalled = args;
      const { id, institutionId } = args.where;
      if (id === "exam_beta" && institutionId === INST_ALPHA) return { count: 0 };
      if (id === "exam_alpha" && institutionId === INST_ALPHA) return { count: 1 };
      return { count: 0 };
    }) as any;

    db.examination.findFirst = (async (args: any) => ({
      id: args.where.id,
      status: "COMPLETED",
    })) as any;

    db.iAAssessment.updateMany = (async (args: any) => {
      iaUpdateManyCalled = args;
      const { id, institutionId } = args.where;
      if (id === "ia_beta" && institutionId === INST_ALPHA) return { count: 0 };
      if (id === "ia_alpha" && institutionId === INST_ALPHA) return { count: 1 };
      return { count: 0 };
    }) as any;

    db.iAAssessment.findFirst = (async (args: any) => ({
      id: args.where.id,
      status: "EVALUATED",
    })) as any;

    // Exam cross-tenant PUT
    await it("PUT /api/admin/examinations blocks cross-tenant exam updates (404 via atomic updateMany)", async () => {
      examUpdateManyCalled = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/examinations",
        "PUT",
        { id: "exam_beta", status: "COMPLETED" },
        INST_ALPHA
      );
      const res = await ExamsRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(examUpdateManyCalled?.where?.institutionId, INST_ALPHA);
    });

    // Exam authorized PUT
    await it("PUT /api/admin/examinations succeeds for authorized institution exam", async () => {
      examUpdateManyCalled = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/examinations",
        "PUT",
        { id: "exam_alpha", status: "COMPLETED" },
        INST_ALPHA
      );
      const res = await ExamsRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(examUpdateManyCalled?.where?.id, "exam_alpha");
      assert.strictEqual(examUpdateManyCalled?.where?.institutionId, INST_ALPHA);
    });

    // IA cross-tenant PUT
    await it("PUT /api/admin/ia blocks cross-tenant internal assessment updates (404 via atomic updateMany)", async () => {
      iaUpdateManyCalled = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/ia",
        "PUT",
        { id: "ia_beta", status: "EVALUATED" },
        INST_ALPHA
      );
      const res = await IARoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(iaUpdateManyCalled?.where?.institutionId, INST_ALPHA);
    });

    // Restore
    db.examination.updateMany = origExamUpdateMany;
    db.examination.findFirst = origExamFindFirst;
    db.iAAssessment.updateMany = origIAUpdateMany;
    db.iAAssessment.findFirst = origIAFindFirst;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 6: Results & Batches Atomic Tenant Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 6] Results & Batches Atomic Tenant Isolation");
  {
    const origResultBatchUpdateMany = db.resultBatch.updateMany;
    const origResultBatchFindFirst = db.resultBatch.findFirst;

    let batchUpdateManyCalled: any = null;

    db.resultBatch.updateMany = (async (args: any) => {
      batchUpdateManyCalled = args;
      const { id, institutionId } = args.where;
      if (id === "batch_beta" && institutionId === INST_ALPHA) return { count: 0 };
      if (id === "batch_alpha" && institutionId === INST_ALPHA) return { count: 1 };
      return { count: 0 };
    }) as any;

    db.resultBatch.findFirst = (async (args: any) => ({
      id: args.where.id,
      status: "APPROVED",
    })) as any;

    await it("PUT /api/admin/results blocks cross-tenant batch updates (404 via atomic updateMany)", async () => {
      batchUpdateManyCalled = null;
      const req = makeReq(
        "http://localhost:3000/api/admin/results",
        "PUT",
        { id: "batch_beta", action: "APPROVED" },
        INST_ALPHA
      );
      const res = await ResultsRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(batchUpdateManyCalled?.where?.institutionId, INST_ALPHA);
    });

    await it("publishResultBatch throws error when batch does not belong to administrator's institution", async () => {
      batchUpdateManyCalled = null;
      let threw = false;
      try {
        await publishResultBatch(INST_ALPHA, "batch_beta");
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes("Result batch not found or access denied"));
      }
      assert.strictEqual(threw, true, "Must throw tenant access denied error");
      assert.strictEqual(batchUpdateManyCalled?.where?.institutionId, INST_ALPHA);
    });

    // Restore
    db.resultBatch.updateMany = origResultBatchUpdateMany;
    db.resultBatch.findFirst = origResultBatchFindFirst;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 7: Academic Master Routes Atomic Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 7] Academic Master Routes Atomic Isolation");
  {
    // Academic Years
    const origAYDeleteMany = db.academicYear.deleteMany;
    let ayDeleteCalled: any = null;

    db.academicYear.deleteMany = (async (args: any) => {
      ayDeleteCalled = args;
      const { id, institutionId } = args.where;
      if (id === "ay_beta" && institutionId === INST_ALPHA) return { count: 0 };
      return { count: 1 };
    }) as any;

    await it("DELETE /api/admin/academics/academic-years blocks cross-tenant deletion (404 via deleteMany)", async () => {
      ayDeleteCalled = null;
      const req = makeReq("http://localhost:3000/api/admin/academics/academic-years?id=ay_beta", "DELETE", undefined, INST_ALPHA);
      const res = await AYRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(ayDeleteCalled?.where?.institutionId, INST_ALPHA);
    });

    // Departments
    const origDeptDeleteMany = db.department.deleteMany;
    let deptDeleteCalled: any = null;

    db.department.deleteMany = (async (args: any) => {
      deptDeleteCalled = args;
      const { id, institutionId } = args.where;
      if (id === "dept_beta" && institutionId === INST_ALPHA) return { count: 0 };
      return { count: 1 };
    }) as any;

    await it("DELETE /api/admin/academics/departments blocks cross-tenant deletion (404 via deleteMany)", async () => {
      deptDeleteCalled = null;
      const req = makeReq("http://localhost:3000/api/admin/academics/departments?id=dept_beta", "DELETE", undefined, INST_ALPHA);
      const res = await DeptsRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(deptDeleteCalled?.where?.institutionId, INST_ALPHA);
    });

    // Classes
    const origClassDeleteMany = db.class.deleteMany;
    let classDeleteCalled: any = null;

    db.class.deleteMany = (async (args: any) => {
      classDeleteCalled = args;
      const { id, institutionId } = args.where;
      if (id === "class_beta" && institutionId === INST_ALPHA) return { count: 0 };
      return { count: 1 };
    }) as any;

    await it("DELETE /api/admin/academics/classes blocks cross-tenant deletion (404 via deleteMany)", async () => {
      classDeleteCalled = null;
      const req = makeReq("http://localhost:3000/api/admin/academics/classes?id=class_beta", "DELETE", undefined, INST_ALPHA);
      const res = await ClassesRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(classDeleteCalled?.where?.institutionId, INST_ALPHA);
    });

    // Courses
    const origCourseDeleteMany = db.course.deleteMany;
    let courseDeleteCalled: any = null;

    db.course.deleteMany = (async (args: any) => {
      courseDeleteCalled = args;
      const { id, institutionId } = args.where;
      if (id === "course_beta" && institutionId === INST_ALPHA) return { count: 0 };
      return { count: 1 };
    }) as any;

    await it("DELETE /api/admin/academics/courses blocks cross-tenant deletion (404 via deleteMany)", async () => {
      courseDeleteCalled = null;
      const req = makeReq("http://localhost:3000/api/admin/academics/courses?id=course_beta", "DELETE", undefined, INST_ALPHA);
      const res = await CoursesRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(courseDeleteCalled?.where?.institutionId, INST_ALPHA);
    });

    // Subjects
    const origSubjectDeleteMany = db.subject.deleteMany;
    let subjectDeleteCalled: any = null;

    db.subject.deleteMany = (async (args: any) => {
      subjectDeleteCalled = args;
      const { id, institutionId } = args.where;
      if (id === "sub_beta" && institutionId === INST_ALPHA) return { count: 0 };
      return { count: 1 };
    }) as any;

    await it("DELETE /api/admin/academics/subjects blocks cross-tenant deletion (404 via deleteMany)", async () => {
      subjectDeleteCalled = null;
      const req = makeReq("http://localhost:3000/api/admin/academics/subjects?id=sub_beta", "DELETE", undefined, INST_ALPHA);
      const res = await SubjectsRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(subjectDeleteCalled?.where?.institutionId, INST_ALPHA);
    });

    // Restore
    db.academicYear.deleteMany = origAYDeleteMany;
    db.department.deleteMany = origDeptDeleteMany;
    db.class.deleteMany = origClassDeleteMany;
    db.course.deleteMany = origCourseDeleteMany;
    db.subject.deleteMany = origSubjectDeleteMany;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 8: Canonical Guardian Model Alignment & Validation
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 8] Canonical Guardian Model Alignment & Validation");
  {
    // Test getGuardians query
    const origGuardianAccountFindMany = db.guardianAccount.findMany;
    db.guardianAccount.findMany = (async (args: any) => {
      return [
        {
          id: "ga_canonical_01",
          institutionId: INST_ALPHA,
          fullName: "Robert Doe",
          phone: "+91 98450 11111",
          relationship: "FATHER",
          occupation: "Architect",
          createdAt: new Date(),
          user: { email: "robert.doe@parent.apex.edu" },
          guardianLinks: [
            {
              studentId: "stu_01",
              isVerified: true,
              canAccessPortal: true,
              relationship: "FATHER",
              student: { fullName: "John Doe", rollNumber: "STU-001" },
            },
          ],
        },
      ];
    }) as any;

    await it("getGuardians queries canonical GuardianAccount & GuardianLink models", async () => {
      const guardians = await getGuardians(INST_ALPHA);
      assert.strictEqual(guardians.length, 1);
      assert.strictEqual(guardians[0].id, "ga_canonical_01");
      assert.strictEqual(guardians[0].fullName, "Robert Doe");
      assert.strictEqual(guardians[0].students.length, 1);
      assert.strictEqual((guardians[0].students[0] as any).isVerified, true);
    });

    // Test POST /api/admin/guardians requires email
    await it("POST /api/admin/guardians rejects registration without email (400)", async () => {
      const req = makeReq(
        "http://localhost:3000/api/admin/guardians",
        "POST",
        { fullName: "Missing Email Parent", relationship: "FATHER", phone: "+91 98765 00000" },
        INST_ALPHA
      );
      const res = await GuardiansRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 400);
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes("email are required"));
    });

    // Test createGuardian creates canonical GuardianAccount with unverified GuardianLink
    const orig$transaction = db.$transaction;
    let txCreatedUser: any = null;
    let txCreatedGuardianAccount: any = null;
    let txCreatedGuardianLink: any = null;

    db.$transaction = (async (fn: any) => {
      const mockTx = {
        student: {
          findFirst: async (args: any) => {
            if (args.where.id === "stu_valid" && args.where.institutionId === INST_ALPHA) {
              return { id: "stu_valid", institutionId: INST_ALPHA, fullName: "Valid Student" };
            }
            return null;
          },
        },
        user: {
          findFirst: async () => null, // No existing user
          create: async (args: any) => {
            txCreatedUser = args.data;
            return { id: "user_created_01", ...args.data, guardianAccount: null };
          },
        },
        guardianAccount: {
          create: async (args: any) => {
            txCreatedGuardianAccount = args.data;
            return { id: "ga_new_01", createdAt: new Date(), ...args.data };
          },
          update: async () => { throw new Error("Should not update when creating fresh"); },
        },
        guardianLink: {
          upsert: async (args: any) => {
            txCreatedGuardianLink = args.create;
            return { id: "link_new_01", ...args.create };
          },
        },
      };
      return await fn(mockTx);
    }) as any;

    await it("createGuardian creates canonical GuardianAccount and unverified GuardianLink (no auto-verification)", async () => {
      txCreatedUser = null;
      txCreatedGuardianAccount = null;
      txCreatedGuardianLink = null;

      const result = await createGuardian(INST_ALPHA, {
        fullName: "Jane Smith",
        relationship: "MOTHER",
        phone: "+91 98450 22222",
        email: "jane.smith@apex.edu",
        occupation: "Physician",
        studentId: "stu_valid",
      });

      assert.strictEqual(result.fullName, "Jane Smith");
      assert.strictEqual(result.email, "jane.smith@apex.edu");

      // Verify User record invariants
      assert.strictEqual(txCreatedUser.role, "PARENT");
      assert.strictEqual(txCreatedUser.isActive, false);
      assert.strictEqual(txCreatedUser.passwordHash, null, "User must NOT have passwordHash until credential issuance!");

      // Verify GuardianAccount record
      assert.strictEqual(txCreatedGuardianAccount.fullName, "Jane Smith");
      assert.strictEqual(txCreatedGuardianAccount.phone, "+91 98450 22222");
      assert.strictEqual(txCreatedGuardianAccount.userId, "user_created_01");

      // Verify GuardianLink invariants (Safeguard #3 & Invariant #9)
      assert.strictEqual(txCreatedGuardianLink.isVerified, false, "Must default to UNVERIFIED");
      assert.strictEqual(txCreatedGuardianLink.canAccessPortal, false, "Must NOT grant portal access to unverified relationship");
      assert.strictEqual(txCreatedGuardianLink.studentId, "stu_valid");
    });

    // Test createGuardian blocks linking student from another institution
    await it("createGuardian rejects linking student belonging to another institution", async () => {
      let threw = false;
      try {
        await createGuardian(INST_ALPHA, {
          fullName: "Attacker Parent",
          relationship: "FATHER",
          phone: "+91 98450 33333",
          email: "attacker.parent@other.edu",
          studentId: "stu_other_institution",
        });
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes("Student not found or access denied"));
      }
      assert.strictEqual(threw, true, "Must reject cross-tenant student link attempt");
    });

    // Test createGuardian deduplication: reuses existing User and GuardianAccount
    let txUpdatedGuardianAccount: any = null;
    db.$transaction = (async (fn: any) => {
      const mockTx = {
        student: { findFirst: async () => null },
        user: {
          findFirst: async () => ({
            id: "user_existing_01",
            email: "existing.parent@apex.edu",
            role: "PARENT",
            institutionId: INST_ALPHA,
            guardianAccount: {
              id: "ga_existing_01",
              fullName: "Existing Parent",
              relationship: "GUARDIAN",
            },
          }),
        },
        guardianAccount: {
          create: async () => { throw new Error("Should NOT create duplicate GuardianAccount"); },
          update: async (args: any) => {
            txUpdatedGuardianAccount = args;
            return { id: "ga_existing_01", ...args.data, createdAt: new Date() };
          },
        },
      };
      return await fn(mockTx);
    }) as any;

    await it("createGuardian reuses existing User and GuardianAccount without duplicates", async () => {
      txUpdatedGuardianAccount = null;
      const res = await createGuardian(INST_ALPHA, {
        fullName: "Existing Parent Renamed",
        phone: "+91 99999 88888",
        email: "existing.parent@apex.edu",
      });

      assert.strictEqual(res.id, "ga_existing_01");
      assert.strictEqual(txUpdatedGuardianAccount?.where?.id, "ga_existing_01");
      assert.strictEqual(txUpdatedGuardianAccount?.data?.fullName, "Existing Parent Renamed");
    });

    db.guardianAccount.findMany = origGuardianAccountFindMany;
    db.$transaction = orig$transaction;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 9: Parent Multi-Child Access & Switching Invariants
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 9] Parent Multi-Child Access & Switching Invariants");
  {
    const origStudentFindUnique = db.student.findUnique;
    const origGuardianLinkFindFirst = db.guardianLink.findFirst;

    db.student.findUnique = (async (args: any) => {
      const { id } = args.where;
      if (id === "child_verified" || id === "child_unverified" || id === "child_sibling") {
        return { id, institutionId: INST_ALPHA };
      }
      return null;
    }) as any;

    // GuardianLink mock representing 1 parent with 2 children: 1 verified, 1 unverified
    db.guardianLink.findFirst = (async (args: any) => {
      const { guardianAccountId, studentId, isVerified, canAccessPortal } = args.where;
      if (
        guardianAccountId === "ga_multi" &&
        studentId === "child_verified" &&
        isVerified === true &&
        canAccessPortal === true
      ) {
        return {
          id: "link_verified",
          guardianAccountId: "ga_multi",
          studentId: "child_verified",
          isVerified: true,
          canAccessPortal: true,
        };
      }
      return null; // Unverified or non-existent
    }) as any;

    // Test: Verified child is authorized
    await it("authorizeStudentOrParentAccess grants parent access to verified linked child", async () => {
      const parentUser = {
        userId: "user_parent_multi",
        email: "parent@apex.edu",
        fullName: "Multi Parent",
        role: "PARENT" as const,
        institutionId: INST_ALPHA,
        institutionName: "Apex University",
        guardianId: "ga_multi",
      };

      const result = await authorizeStudentOrParentAccess(parentUser, "child_verified");
      assert.strictEqual(result.studentId, "child_verified");
      assert.strictEqual(result.isParent, true, "Parent MUST be authorized for verified child");
    });

    // Test: Unverified child is strictly blocked (IDOR prevention)
    await it("authorizeStudentOrParentAccess strictly blocks parent from accessing unverified child", async () => {
      const parentUser = {
        userId: "user_parent_multi",
        email: "parent@apex.edu",
        fullName: "Multi Parent",
        role: "PARENT" as const,
        institutionId: INST_ALPHA,
        institutionName: "Apex University",
        guardianId: "ga_multi",
      };

      let threw = false;
      try {
        await authorizeStudentOrParentAccess(parentUser, "child_unverified");
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes("not authorized") || err.message.includes("Security violation"));
      }
      assert.strictEqual(threw, true, "Parent MUST NOT access unverified child");
    });

    // Test: Student cannot access sibling's record
    await it("authorizeStudentOrParentAccess blocks student from accessing sibling's record", async () => {
      const studentUser = {
        userId: "user_student_1",
        email: "john@student.apex.edu",
        fullName: "John Doe",
        role: "STUDENT" as const,
        institutionId: INST_ALPHA,
        institutionName: "Apex University",
        studentId: "child_verified",
      };

      let threw = false;
      try {
        await authorizeStudentOrParentAccess(studentUser, "child_sibling");
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes("IDOR protection"));
      }
      assert.strictEqual(threw, true, "Student MUST NOT access sibling record");
    });

    db.student.findUnique = origStudentFindUnique;
    db.guardianLink.findFirst = origGuardianLinkFindFirst;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 10: Parent Credential Issuance & Authentication Flow
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 10] Parent Credential Issuance & Authentication Flow");
  {
    const origGuardianAccountFindFirst = db.guardianAccount.findFirst;
    const origStudentFindMany = db.student.findMany;
    const origUserFindFirst = db.user.findFirst;
    const orig$transaction = db.$transaction;

    db.guardianAccount.findFirst = (async (args: any) => {
      if (args.where.id === "ga_ready_01" && args.where.institutionId === INST_ALPHA) {
        return {
          id: "ga_ready_01",
          institutionId: INST_ALPHA,
          userId: "user_parent_ready_01",
          fullName: "Ready Parent",
          phone: "+91 98450 77777",
          relationship: "FATHER",
          user: {
            id: "user_parent_ready_01",
            email: "ready.parent@apex.edu",
            isActive: false,
            status: "INACTIVE",
            passwordHash: null,
          },
          guardianLinks: [
            {
              studentId: "stu_verified_child",
              isVerified: true,
              canAccessPortal: true,
              relationship: "FATHER",
            },
          ],
        };
      }
      return null;
    }) as any;

    db.student.findMany = (async (args: any) => {
      return [{ id: "stu_verified_child", institutionId: INST_ALPHA, fullName: "Verified Child", rollNumber: "STU-007" }];
    }) as any;

    db.user.findFirst = (async (args: any) => {
      if (args.where.email === "ready.parent@apex.edu") {
        return {
          id: "user_parent_ready_01",
          email: "ready.parent@apex.edu",
          institutionId: INST_ALPHA,
          role: "PARENT",
          isActive: false,
        };
      }
      return null;
    }) as any;

    let issuedUserUpdate: any = null;
    db.$transaction = (async (fn: any) => {
      const mockTx = {
        user: {
          update: async (args: any) => {
            issuedUserUpdate = args;
            return { id: args.where.id, ...args.data };
          },
        },
        guardianAccount: {
          upsert: async () => ({ id: "ga_ready_01" }),
        },
        guardianLink: {
          findFirst: async () => ({ id: "gl_01", isVerified: true }),
          update: async () => ({}),
        },
        $executeRawUnsafe: async () => 1,
      };
      return await fn(mockTx);
    }) as any;

    await it("issueParentCredentials successfully provisions active portal credentials for canonical GuardianAccount", async () => {
      issuedUserUpdate = null;
      const result = await issueParentCredentials({
        institutionId: INST_ALPHA,
        guardianAccountId: "ga_ready_01",
        email: "ready.parent@apex.edu",
        studentIds: ["stu_verified_child"],
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.role, "PARENT");
      assert.ok(result.temporaryPassword, "Must generate secure temporary password");
      assert.strictEqual(issuedUserUpdate?.where?.id, "user_parent_ready_01");
      assert.strictEqual(issuedUserUpdate?.data?.isActive, true);
      assert.strictEqual(issuedUserUpdate?.data?.status, "ACTIVE");
      assert.ok(issuedUserUpdate?.data?.passwordHash, "Must record bcrypt password hash");
    });

    // Parent login token generation & verification
    await it("Parent JWT token carries parent role and guardianId, authorizing parent portal session", async () => {
      const token = await signToken({
        userId: "user_parent_ready_01",
        email: "ready.parent@apex.edu",
        fullName: "Ready Parent",
        role: "PARENT",
        institutionId: INST_ALPHA,
        institutionName: "Apex University",
        guardianId: "ga_ready_01",
        passwordSig: computePasswordSignature(issuedUserUpdate.data.passwordHash),
      });

      const payload = await verifyToken(token);
      assert.ok(payload);
      assert.strictEqual(payload.role, "PARENT");
      assert.strictEqual(payload.guardianId, "ga_ready_01");
      assert.strictEqual(payload.institutionId, INST_ALPHA);
    });

    db.guardianAccount.findFirst = origGuardianAccountFindFirst;
    db.student.findMany = origStudentFindMany;
    db.user.findFirst = origUserFindFirst;
    db.$transaction = orig$transaction;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 11: Service-Level Atomic Mutations
  // --------------------------------------------------------------------------
  console.log("\n[TEST GROUP 11] Service-Level Atomic Mutations");
  {
    // updateResourceBookingStatus
    const origRBUpdateMany = db.resourceBooking.updateMany;
    const origRBFindFirst = db.resourceBooking.findFirst;

    let rbUpdateManyCalled: any = null;
    db.resourceBooking.updateMany = (async (args: any) => {
      rbUpdateManyCalled = args;
      const { id, institutionId } = args.where;
      if (id === "rb_beta" && institutionId === INST_ALPHA) return { count: 0 };
      if (id === "rb_alpha" && institutionId === INST_ALPHA) return { count: 1 };
      return { count: 0 };
    }) as any;

    db.resourceBooking.findFirst = (async (args: any) => ({
      id: args.where.id,
      status: "APPROVED",
    })) as any;

    await it("updateResourceBookingStatus throws error when booking belongs to another institution (atomic updateMany)", async () => {
      rbUpdateManyCalled = null;
      let threw = false;
      try {
        await updateResourceBookingStatus(INST_ALPHA, "rb_beta", "APPROVED");
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes("Resource booking not found or access denied"));
      }
      assert.strictEqual(threw, true, "Must block cross-tenant resource booking update");
      assert.strictEqual(rbUpdateManyCalled?.where?.institutionId, INST_ALPHA);
    });

    await it("updateResourceBookingStatus succeeds for authorized institution", async () => {
      rbUpdateManyCalled = null;
      const res = await updateResourceBookingStatus(INST_ALPHA, "rb_alpha", "APPROVED");
      assert.strictEqual(res?.status, "APPROVED");
      assert.strictEqual(rbUpdateManyCalled?.where?.id, "rb_alpha");
      assert.strictEqual(rbUpdateManyCalled?.where?.institutionId, INST_ALPHA);
    });

    // deleteHostelAllocation
    const origHostelDeleteMany = db.hostelAllocation.deleteMany;
    let hostelDeleteCalled: any = null;
    db.hostelAllocation.deleteMany = (async (args: any) => {
      hostelDeleteCalled = args;
      const { id, institutionId } = args.where;
      if (id === "hostel_beta" && institutionId === INST_ALPHA) return { count: 0 };
      if (id === "hostel_alpha" && institutionId === INST_ALPHA) return { count: 1 };
      return { count: 0 };
    }) as any;

    await it("deleteHostelAllocation uses atomic deleteMany scoped to institutionId", async () => {
      hostelDeleteCalled = null;
      const res = await deleteHostelAllocation(INST_ALPHA, "hostel_alpha");
      assert.strictEqual(res.success, true);
      assert.strictEqual(hostelDeleteCalled?.where?.id, "hostel_alpha");
      assert.strictEqual(hostelDeleteCalled?.where?.institutionId, INST_ALPHA);
    });

    // deleteTransportAllocation
    const origTransportDeleteMany = db.transportAllocation.deleteMany;
    let transportDeleteCalled: any = null;
    db.transportAllocation.deleteMany = (async (args: any) => {
      transportDeleteCalled = args;
      const { id, institutionId } = args.where;
      if (id === "trans_beta" && institutionId === INST_ALPHA) return { count: 0 };
      if (id === "trans_alpha" && institutionId === INST_ALPHA) return { count: 1 };
      return { count: 0 };
    }) as any;

    await it("deleteTransportAllocation uses atomic deleteMany scoped to institutionId", async () => {
      transportDeleteCalled = null;
      const res = await deleteTransportAllocation(INST_ALPHA, "trans_alpha");
      assert.strictEqual(res.success, true);
      assert.strictEqual(transportDeleteCalled?.where?.id, "trans_alpha");
      assert.strictEqual(transportDeleteCalled?.where?.institutionId, INST_ALPHA);
    });

    // Restore
    db.resourceBooking.updateMany = origRBUpdateMany;
    db.resourceBooking.findFirst = origRBFindFirst;
    db.hostelAllocation.deleteMany = origHostelDeleteMany;
    db.transportAllocation.deleteMany = origTransportDeleteMany;
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n========================================================");
  console.log(` PHASE 3A TEST SUMMARY: ${passedCount} Passed, ${failedCount} Failed`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPhase3ATests().catch((err) => {
  console.error("Test runner exception:", err);
  process.exit(1);
});
