import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "test-only-jwt-secret-value-with-more-than-32-characters";
}

import assert from "assert";
import { NextRequest } from "next/server";
import db from "../lib/db";
import { signToken, AUTH_COOKIE_NAME, computePasswordSignature } from "../lib/auth/jwt";

// Route Handlers
import * as AYRoute from "../app/api/admin/academics/academic-years/route";
import * as CoursesRoute from "../app/api/admin/academics/courses/route";
import * as SubjectsRoute from "../app/api/admin/academics/subjects/route";

// Services
import {
  getAcademicYears,
  createAcademicYear,
  getCourses,
  createCourse,
  updateCourse,
  getSubjects,
  createSubject,
  updateSubject,
} from "../lib/services/institution-admin.service";

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

let tokenAlpha = "";
let tokenBeta = "";

function makeReq(url: string, method: string = "GET", body?: any, instId: string = "inst_alpha_test") {
  const token = instId === "inst_beta_test" ? tokenBeta : tokenAlpha;
  const init: any = {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-institution-id": instId,
      Authorization: `Bearer ${token}`,
      cookie: `${AUTH_COOKIE_NAME}=${token};`,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

async function runPhase3B1Tests() {
  console.log("\n========================================================");
  console.log(" PHASE 3B.1: ACADEMIC FOUNDATION TEST SUITE");
  console.log(" (Academic Years, Courses & Subjects)");
  console.log("========================================================\n");

  const INST_ALPHA = "inst_alpha_test";
  const INST_BETA = "inst_beta_test";

  const dummyPwHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  const dummySig = computePasswordSignature(dummyPwHash);

  tokenAlpha = await signToken({
    userId: "user_alpha",
    email: "admin@alpha.edu",
    fullName: "Admin Alpha",
    role: "SUPER_ADMIN",
    institutionId: INST_ALPHA,
    institutionName: "Alpha Institution",
    passwordSig: dummySig,
  });

  tokenBeta = await signToken({
    userId: "user_beta",
    email: "admin@beta.edu",
    fullName: "Admin Beta",
    role: "SUPER_ADMIN",
    institutionId: INST_BETA,
    institutionName: "Beta Institution",
    passwordSig: dummySig,
  });

  const origUserFindUnique = db.user.findUnique;
  db.user.findUnique = (async (args: any) => {
    if (args.where?.id === "user_alpha") {
      return {
        id: "user_alpha",
        email: "admin@alpha.edu",
        fullName: "Admin Alpha",
        isActive: true,
        status: "ACTIVE",
        passwordHash: dummyPwHash,
        institutionId: INST_ALPHA,
        role: "SUPER_ADMIN",
        platformRole: "SUPER_ADMIN",
      };
    }
    if (args.where?.id === "user_beta") {
      return {
        id: "user_beta",
        email: "admin@beta.edu",
        fullName: "Admin Beta",
        isActive: true,
        status: "ACTIVE",
        passwordHash: dummyPwHash,
        institutionId: INST_BETA,
        role: "SUPER_ADMIN",
        platformRole: "SUPER_ADMIN",
      };
    }
    return origUserFindUnique ? await origUserFindUnique(args) : null;
  }) as any;

  // ==========================================================================
  // MODULE 1: ACADEMIC YEARS
  // ==========================================================================
  console.log("[MODULE 1] Academic Years API & Tenant Scoping");
  {
    // Set up transaction mock delegating to db.academicYear methods
    const origTx = db.$transaction;
    const createTxMock = () => ({
      ...db,
      $executeRawUnsafe: async () => 0,
      $queryRaw: async () => [],
      academicYear: {
        findFirst: async (args: any) => (db.academicYear.findFirst ? (db.academicYear.findFirst as any)(args) : null),
        findMany: async (args: any) => (db.academicYear.findMany ? (db.academicYear.findMany as any)(args) : []),
        create: async (args: any) => (db.academicYear.create ? (db.academicYear.create as any)(args) : {}),
        updateMany: async (args: any) => (db.academicYear.updateMany ? (db.academicYear.updateMany as any)(args) : { count: 0 }),
        deleteMany: async (args: any) => (db.academicYear.deleteMany ? (db.academicYear.deleteMany as any)(args) : { count: 0 }),
      },
    });
    db.$transaction = (async (fn: any) => {
      if (typeof fn === "function") {
        return await fn(createTxMock());
      }
      return [];
    }) as any;

    // 1. GET /api/admin/academics/academic-years
    await it("GET /api/admin/academics/academic-years queries scoped to authenticated institution", async () => {
      const origFindMany = db.academicYear.findMany;
      let queriedWhere: any = null;

      db.academicYear.findMany = (async (args: any) => {
        queriedWhere = args.where;
        return [
          {
            id: "ay_1",
            institutionId: INST_ALPHA,
            name: "2026-2027",
            startDate: new Date("2026-08-01"),
            endDate: new Date("2027-05-31"),
            isCurrent: true,
            terms: [],
          },
        ];
      }) as any;

      const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "GET", undefined, INST_ALPHA);
      const res = await AYRoute.GET(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
      assert.strictEqual(queriedWhere?.institutionId, INST_ALPHA);

      db.academicYear.findMany = origFindMany;
    });

    // 2. POST /api/admin/academics/academic-years (validation)
    await it("POST /api/admin/academics/academic-years validates required name and dates", async () => {
      const req = makeReq("http://localhost:3000/api/admin/academics/academic-years", "POST", { name: "" }, INST_ALPHA);
      const res = await AYRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 400);
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes("required"));
    });

    // 3. POST /api/admin/academics/academic-years (creation with tenant scoping)
    await it("POST /api/admin/academics/academic-years creates record with institutionId", async () => {
      let createdPayload: any = null;
      const origCreate = db.academicYear.create;
      const origFindFirst = db.academicYear.findFirst;
      const origUpdateMany = db.academicYear.updateMany;

      db.academicYear.findFirst = (async () => null) as any;
      db.academicYear.updateMany = (async () => ({ count: 0 })) as any;
      db.academicYear.create = (async (args: any) => {
        createdPayload = args.data;
        return { id: "ay_new", ...args.data };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "POST",
        {
          name: "2027-2028",
          startDate: "2027-08-01",
          endDate: "2028-05-31",
          isCurrent: true,
          terms: [{ name: "Term 1", termNumber: 1, startDate: "2027-08-01", endDate: "2027-12-20", isCurrent: true }],
        },
        INST_ALPHA
      );
      const res = await AYRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(createdPayload?.institutionId, INST_ALPHA);
      assert.strictEqual(createdPayload?.name, "2027-2028");

      db.academicYear.create = origCreate;
      db.academicYear.findFirst = origFindFirst;
      db.academicYear.updateMany = origUpdateMany;
    });

    // 4. PUT /api/admin/academics/academic-years (atomic update with tenant isolation)
    await it("PUT /api/admin/academics/academic-years atomically updates record scoped to institutionId", async () => {
      const origUpdateMany = db.academicYear.updateMany;
      const origFindFirst = db.academicYear.findFirst;
      const updateWheres: any[] = [];

      db.academicYear.updateMany = (async (args: any) => {
        updateWheres.push(args.where);
        if (args.where.id === "ay_alpha" && args.where.institutionId === INST_ALPHA) {
          return { count: 1 };
        }
        return { count: 0 };
      }) as any;

      db.academicYear.findFirst = (async (args: any) => {
        return {
          id: "ay_alpha",
          institutionId: INST_ALPHA,
          name: "2026-2027 Updated",
          isCurrent: true,
          terms: [],
        };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        { id: "ay_alpha", name: "2026-2027 Updated", isCurrent: true },
        INST_ALPHA
      );
      const res = await AYRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(updateWheres[0]?.institutionId, INST_ALPHA);
      assert.strictEqual(updateWheres[0]?.id, "ay_alpha");

      db.academicYear.updateMany = origUpdateMany;
      db.academicYear.findFirst = origFindFirst;
    });

    // 5. PUT /api/admin/academics/academic-years blocks cross-tenant update
    await it("PUT /api/admin/academics/academic-years strictly blocks updating academic year of another institution (404)", async () => {
      const origUpdateMany = db.academicYear.updateMany;
      const origFindFirst = db.academicYear.findFirst;

      db.academicYear.findFirst = (async () => null) as any;
      db.academicYear.updateMany = (async (args: any) => {
        const { id, institutionId } = args.where;
        if (id === "ay_beta" && institutionId === INST_ALPHA) {
          return { count: 0 };
        }
        return { count: 1 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years",
        "PUT",
        { id: "ay_beta", name: "Hacked Year" },
        INST_ALPHA
      );
      const res = await AYRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, "Academic year not found or access denied.");

      db.academicYear.updateMany = origUpdateMany;
      db.academicYear.findFirst = origFindFirst;
    });

    // 6. DELETE /api/admin/academics/academic-years blocks cross-tenant deletion
    await it("DELETE /api/admin/academics/academic-years strictly blocks deleting another institution's academic year (404)", async () => {
      const origDeleteMany = db.academicYear.deleteMany;
      let deleteWhere: any = null;

      db.academicYear.deleteMany = (async (args: any) => {
        deleteWhere = args.where;
        if (args.where.id === "ay_beta" && args.where.institutionId === INST_ALPHA) {
          return { count: 0 };
        }
        return { count: 1 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years?id=ay_beta",
        "DELETE",
        undefined,
        INST_ALPHA
      );
      const res = await AYRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(deleteWhere?.institutionId, INST_ALPHA);

      db.academicYear.deleteMany = origDeleteMany;
    });

    // 6b. DELETE /api/admin/academics/academic-years succeeds on own institution's record
    await it("DELETE /api/admin/academics/academic-years atomically deletes own academic year (200)", async () => {
      const origDeleteMany = db.academicYear.deleteMany;
      let deleteWhere: any = null;

      db.academicYear.deleteMany = (async (args: any) => {
        deleteWhere = args.where;
        if (args.where.id === "ay_alpha" && args.where.institutionId === INST_ALPHA) {
          return { count: 1 };
        }
        return { count: 0 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/academic-years?id=ay_alpha",
        "DELETE",
        undefined,
        INST_ALPHA
      );
      const res = await AYRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(deleteWhere?.institutionId, INST_ALPHA);
      assert.strictEqual(deleteWhere?.id, "ay_alpha");

      db.academicYear.deleteMany = origDeleteMany;
    });

    db.$transaction = origTx;
  }

  // ==========================================================================
  // MODULE 2: COURSES
  // ==========================================================================
  console.log("\n[MODULE 2] Courses API & Single-Statement Atomic Operations");
  {
    // 7. GET /api/admin/academics/courses (tenant scoping)
    await it("GET /api/admin/academics/courses returns courses scoped to institutionId with departmentName", async () => {
      const origFindMany = db.course.findMany;
      let findWhere: any = null;

      db.course.findMany = (async (args: any) => {
        findWhere = args.where;
        return [
          {
            id: "crs_1",
            institutionId: INST_ALPHA,
            name: "B.Tech CSE",
            code: "BTECH-CSE",
            department: "Computer Science",
            durationYears: 4,
            totalSemesters: 8,
            totalCredits: 160,
            degreeType: "UNDERGRADUATE",
            status: "ACTIVE",
            subjects: [],
            classes: [],
          },
        ];
      }) as any;

      const req = makeReq("http://localhost:3000/api/admin/academics/courses", "GET", undefined, INST_ALPHA);
      const res = await CoursesRoute.GET(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(findWhere?.institutionId, INST_ALPHA);
      assert.strictEqual(json.data[0].departmentName, "Computer Science");

      db.course.findMany = origFindMany;
    });

    // 8. POST /api/admin/academics/courses validation
    await it("POST /api/admin/academics/courses validates course name and code presence", async () => {
      const req = makeReq("http://localhost:3000/api/admin/academics/courses", "POST", { name: "" }, INST_ALPHA);
      const res = await CoursesRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 400);
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes("required"));
    });

    // 9. POST /api/admin/academics/courses prevents duplicate course code
    await it("POST /api/admin/academics/courses rejects duplicate course code within institution (409)", async () => {
      const origFindFirst = db.course.findFirst;

      db.course.findFirst = (async (args: any) => {
        if (args.where.code === "BTECH-CSE" && args.where.institutionId === INST_ALPHA) {
          return { id: "crs_existing", code: "BTECH-CSE" };
        }
        return null;
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/courses",
        "POST",
        { name: "Computer Science", code: "BTECH-CSE" },
        INST_ALPHA
      );
      const res = await CoursesRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 409);
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes("already exists"));

      db.course.findFirst = origFindFirst;
    });

    // 10. POST /api/admin/academics/courses creates course with proper normalization
    await it("POST /api/admin/academics/courses successfully creates course with degreeType and credit defaults", async () => {
      const origFindFirst = db.course.findFirst;
      const origCreate = db.course.create;
      let createData: any = null;

      db.course.findFirst = (async () => null) as any;
      db.course.create = (async (args: any) => {
        createData = args.data;
        return { id: "crs_new", ...args.data };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/courses",
        "POST",
        {
          name: "M.Tech Artificial Intelligence",
          code: "mtech-ai",
          degreeType: "Postgraduate",
          durationYears: 2,
          totalSemesters: 4,
          totalCredits: 80,
          departmentName: "Computer Science & Engineering (CSE)",
        },
        INST_ALPHA
      );
      const res = await CoursesRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(createData?.institutionId, INST_ALPHA);
      assert.strictEqual(createData?.code, "MTECH-AI");
      assert.strictEqual(createData?.degreeType, "POSTGRADUATE");
      assert.strictEqual(createData?.durationYears, 2);
      assert.strictEqual(createData?.totalCredits, 80);

      db.course.findFirst = origFindFirst;
      db.course.create = origCreate;
    });

    // 11. PUT /api/admin/academics/courses (atomic update with tenant isolation)
    await it("PUT /api/admin/academics/courses atomically updates course scoped to institutionId", async () => {
      const origFindFirst = db.course.findFirst;
      const origUpdateMany = db.course.updateMany;
      let updateWhere: any = null;

      db.course.findFirst = (async (args: any) => {
        if (args.where?.id === "crs_alpha") {
          return { id: "crs_alpha", institutionId: INST_ALPHA, name: "B.Tech CSE Honours" };
        }
        return null; // No duplicate code found
      }) as any;

      db.course.updateMany = (async (args: any) => {
        updateWhere = args.where;
        if (args.where.id === "crs_alpha" && args.where.institutionId === INST_ALPHA) {
          return { count: 1 };
        }
        return { count: 0 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/courses",
        "PUT",
        {
          id: "crs_alpha",
          name: "B.Tech CSE Honours",
          code: "BTECH-CSE-H",
          durationYears: 4,
        },
        INST_ALPHA
      );
      const res = await CoursesRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(updateWhere?.institutionId, INST_ALPHA);
      assert.strictEqual(updateWhere?.id, "crs_alpha");

      db.course.findFirst = origFindFirst;
      db.course.updateMany = origUpdateMany;
    });

    // 12. PUT /api/admin/academics/courses blocks cross-tenant update
    await it("PUT /api/admin/academics/courses strictly blocks updating course of another institution (404)", async () => {
      const origFindFirst = db.course.findFirst;
      const origUpdateMany = db.course.updateMany;

      db.course.findFirst = (async () => null) as any;
      db.course.updateMany = (async (args: any) => {
        const { id, institutionId } = args.where;
        if (id === "crs_beta" && institutionId === INST_ALPHA) {
          return { count: 0 };
        }
        return { count: 1 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/courses",
        "PUT",
        { id: "crs_beta", name: "Infiltrated Course" },
        INST_ALPHA
      );
      const res = await CoursesRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, "Course not found or access denied.");

      db.course.findFirst = origFindFirst;
      db.course.updateMany = origUpdateMany;
    });

    // 13. DELETE /api/admin/academics/courses blocks cross-tenant deletion
    await it("DELETE /api/admin/academics/courses strictly blocks deleting another institution's course (404)", async () => {
      const origDeleteMany = db.course.deleteMany;
      let deleteWhere: any = null;

      db.course.deleteMany = (async (args: any) => {
        deleteWhere = args.where;
        if (args.where.id === "crs_beta" && args.where.institutionId === INST_ALPHA) {
          return { count: 0 };
        }
        return { count: 1 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/courses?id=crs_beta",
        "DELETE",
        undefined,
        INST_ALPHA
      );
      const res = await CoursesRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(deleteWhere?.institutionId, INST_ALPHA);

      db.course.deleteMany = origDeleteMany;
    });

    // 13b. DELETE /api/admin/academics/courses succeeds on own institution's course
    await it("DELETE /api/admin/academics/courses atomically deletes own course (200)", async () => {
      const origDeleteMany = db.course.deleteMany;
      let deleteWhere: any = null;

      db.course.deleteMany = (async (args: any) => {
        deleteWhere = args.where;
        if (args.where.id === "crs_alpha" && args.where.institutionId === INST_ALPHA) {
          return { count: 1 };
        }
        return { count: 0 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/courses?id=crs_alpha",
        "DELETE",
        undefined,
        INST_ALPHA
      );
      const res = await CoursesRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(deleteWhere?.institutionId, INST_ALPHA);
      assert.strictEqual(deleteWhere?.id, "crs_alpha");

      db.course.deleteMany = origDeleteMany;
    });
  }

  // ==========================================================================
  // MODULE 3: SUBJECTS
  // ==========================================================================
  console.log("\n[MODULE 3] Subjects API, Course Validation & Atomic Updates");
  {
    // 14. GET /api/admin/academics/subjects queries scoped to institutionId
    await it("GET /api/admin/academics/subjects returns subjects with parsed instructor", async () => {
      const origFindMany = db.subject.findMany;
      let findWhere: any = null;

      db.subject.findMany = (async (args: any) => {
        findWhere = args.where;
        return [
          {
            id: "sub_1",
            institutionId: INST_ALPHA,
            name: "Database Systems",
            code: "CS501",
            type: "CORE_THEORY",
            credits: 4,
            hoursPerWeek: 4,
            semester: 5,
            courseId: "crs_alpha",
            description: "Teacher: Prof. Sudha Murthy | Lab Included",
            course: { id: "crs_alpha", name: "B.Tech CSE", code: "BTECH-CSE" },
          },
        ];
      }) as any;

      const req = makeReq("http://localhost:3000/api/admin/academics/subjects", "GET", undefined, INST_ALPHA);
      const res = await SubjectsRoute.GET(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(findWhere?.institutionId, INST_ALPHA);
      assert.strictEqual(json.data[0].allocatedTeacherName, "Prof. Sudha Murthy");
      assert.strictEqual(json.data[0].courseName, "B.Tech CSE");

      db.subject.findMany = origFindMany;
    });

    // 15. POST /api/admin/academics/subjects validation
    await it("POST /api/admin/academics/subjects validates subject name, code and courseId", async () => {
      const req = makeReq("http://localhost:3000/api/admin/academics/subjects", "POST", { name: "Maths" }, INST_ALPHA);
      const res = await SubjectsRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 400);
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes("required"));
    });

    // 16. POST /api/admin/academics/subjects enforces course tenant ownership
    await it("POST /api/admin/academics/subjects blocks associating a subject with a foreign institution course (404)", async () => {
      const origCourseFind = db.course.findFirst;

      db.course.findFirst = (async (args: any) => {
        // Course does NOT belong to INST_ALPHA
        if (args.where.id === "crs_beta" && args.where.institutionId === INST_ALPHA) {
          return null;
        }
        return { id: "crs_beta", institutionId: INST_BETA };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects",
        "POST",
        {
          name: "Compilers",
          code: "CS601",
          courseId: "crs_beta",
          semester: 6,
          credits: 4,
        },
        INST_ALPHA
      );
      const res = await SubjectsRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, "Referenced course not found or access denied.");

      db.course.findFirst = origCourseFind;
    });

    // 17. POST /api/admin/academics/subjects prevents duplicate subject code within institution
    await it("POST /api/admin/academics/subjects rejects duplicate subject code within institution (409)", async () => {
      const origCourseFind = db.course.findFirst;
      const origSubjectFind = db.subject.findFirst;

      db.course.findFirst = (async (args: any) => {
        if (args.where.id === "crs_alpha" && args.where.institutionId === INST_ALPHA) {
          return { id: "crs_alpha", institutionId: INST_ALPHA };
        }
        return null;
      }) as any;

      db.subject.findFirst = (async (args: any) => {
        if (args.where.code === "CS501" && args.where.institutionId === INST_ALPHA) {
          return { id: "sub_existing", code: "CS501" };
        }
        return null;
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects",
        "POST",
        {
          name: "Database Systems",
          code: "CS501",
          courseId: "crs_alpha",
          semester: 5,
          credits: 4,
        },
        INST_ALPHA
      );
      const res = await SubjectsRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 409);
      assert.strictEqual(json.success, false);
      assert.ok(json.error.includes("already exists"));

      db.course.findFirst = origCourseFind;
      db.subject.findFirst = origSubjectFind;
    });

    // 18. POST /api/admin/academics/subjects creates subject with proper teacher & type mapping
    await it("POST /api/admin/academics/subjects creates subject with normalized type and teacher name", async () => {
      const origCourseFind = db.course.findFirst;
      const origSubjectFind = db.subject.findFirst;
      const origCreate = db.subject.create;
      let createData: any = null;

      db.course.findFirst = (async () => ({ id: "crs_alpha", institutionId: INST_ALPHA })) as any;
      db.subject.findFirst = (async () => null) as any;
      db.subject.create = (async (args: any) => {
        createData = args.data;
        return { id: "sub_new", ...args.data, course: { id: "crs_alpha", name: "B.Tech CSE" } };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects",
        "POST",
        {
          name: "Web Technologies Lab",
          code: "cs502",
          courseId: "crs_alpha",
          semester: 5,
          credits: 2,
          hoursPerWeek: 3,
          type: "Practical / Lab",
          allocatedTeacherName: "Prof. Alan Kay",
        },
        INST_ALPHA
      );
      const res = await SubjectsRoute.POST(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(createData?.institutionId, INST_ALPHA);
      assert.strictEqual(createData?.code, "CS502");
      assert.strictEqual(createData?.type, "PRACTICAL_LAB");
      assert.ok(createData?.description.includes("Prof. Alan Kay"));

      db.course.findFirst = origCourseFind;
      db.subject.findFirst = origSubjectFind;
      db.subject.create = origCreate;
    });

    // 19. PUT /api/admin/academics/subjects atomically updates subject
    await it("PUT /api/admin/academics/subjects updates subject atomically with { id, institutionId }", async () => {
      const origSubjectFind = db.subject.findFirst;
      const origUpdateMany = db.subject.updateMany;
      let updateWhere: any = null;

      db.subject.findFirst = (async (args: any) => {
        if (args.where?.id === "sub_alpha") {
          return { id: "sub_alpha", institutionId: INST_ALPHA, name: "Advanced Database Systems", course: {} };
        }
        return null;
      }) as any;

      db.subject.updateMany = (async (args: any) => {
        updateWhere = args.where;
        if (args.where.id === "sub_alpha" && args.where.institutionId === INST_ALPHA) {
          return { count: 1 };
        }
        return { count: 0 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects",
        "PUT",
        {
          id: "sub_alpha",
          name: "Advanced Database Systems",
          credits: 4,
          hoursPerWeek: 4,
        },
        INST_ALPHA
      );
      const res = await SubjectsRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(updateWhere?.institutionId, INST_ALPHA);
      assert.strictEqual(updateWhere?.id, "sub_alpha");

      db.subject.findFirst = origSubjectFind;
      db.subject.updateMany = origUpdateMany;
    });

    // 20. PUT /api/admin/academics/subjects blocks cross-tenant update
    await it("PUT /api/admin/academics/subjects strictly blocks updating subject of another institution (404)", async () => {
      const origSubjectFind = db.subject.findFirst;
      const origUpdateMany = db.subject.updateMany;

      db.subject.findFirst = (async () => null) as any;
      db.subject.updateMany = (async (args: any) => {
        const { id, institutionId } = args.where;
        if (id === "sub_beta" && institutionId === INST_ALPHA) {
          return { count: 0 };
        }
        return { count: 1 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects",
        "PUT",
        { id: "sub_beta", name: "Tampered Subject" },
        INST_ALPHA
      );
      const res = await SubjectsRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, "Subject not found or access denied.");

      db.subject.findFirst = origSubjectFind;
      db.subject.updateMany = origUpdateMany;
    });

    // 21. PUT /api/admin/academics/subjects blocks changing courseId to another institution's course
    await it("PUT /api/admin/academics/subjects rejects changing courseId to foreign institution course (404)", async () => {
      const origCourseFind = db.course.findFirst;

      db.course.findFirst = (async (args: any) => {
        if (args.where.id === "crs_foreign" && args.where.institutionId === INST_ALPHA) {
          return null;
        }
        return { id: "crs_foreign", institutionId: INST_BETA };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects",
        "PUT",
        { id: "sub_alpha", courseId: "crs_foreign" },
        INST_ALPHA
      );
      const res = await SubjectsRoute.PUT(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, "Referenced course not found or access denied.");

      db.course.findFirst = origCourseFind;
    });

    // 22. DELETE /api/admin/academics/subjects blocks cross-tenant delete
    await it("DELETE /api/admin/academics/subjects strictly blocks deleting another institution's subject (404)", async () => {
      const origDeleteMany = db.subject.deleteMany;
      let deleteWhere: any = null;

      db.subject.deleteMany = (async (args: any) => {
        deleteWhere = args.where;
        if (args.where.id === "sub_beta" && args.where.institutionId === INST_ALPHA) {
          return { count: 0 };
        }
        return { count: 1 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects?id=sub_beta",
        "DELETE",
        undefined,
        INST_ALPHA
      );
      const res = await SubjectsRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(json.success, false);
      assert.strictEqual(deleteWhere?.institutionId, INST_ALPHA);

      db.subject.deleteMany = origDeleteMany;
    });

    // 22b. DELETE /api/admin/academics/subjects succeeds on own institution's subject
    await it("DELETE /api/admin/academics/subjects atomically deletes own subject (200)", async () => {
      const origDeleteMany = db.subject.deleteMany;
      let deleteWhere: any = null;

      db.subject.deleteMany = (async (args: any) => {
        deleteWhere = args.where;
        if (args.where.id === "sub_alpha" && args.where.institutionId === INST_ALPHA) {
          return { count: 1 };
        }
        return { count: 0 };
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects?id=sub_alpha",
        "DELETE",
        undefined,
        INST_ALPHA
      );
      const res = await SubjectsRoute.DELETE(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(deleteWhere?.institutionId, INST_ALPHA);
      assert.strictEqual(deleteWhere?.id, "sub_alpha");

      db.subject.deleteMany = origDeleteMany;
    });

    // 22c. GET /api/admin/academics/subjects?courseId=crs_alpha scopes by courseId and institutionId
    await it("GET /api/admin/academics/subjects filters by courseId and scopes to institutionId", async () => {
      const origFindMany = db.subject.findMany;
      let findWhere: any = null;

      db.subject.findMany = (async (args: any) => {
        findWhere = args.where;
        return [];
      }) as any;

      const req = makeReq(
        "http://localhost:3000/api/admin/academics/subjects?courseId=crs_alpha",
        "GET",
        undefined,
        INST_ALPHA
      );
      const res = await SubjectsRoute.GET(req);
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(findWhere?.institutionId, INST_ALPHA);
      assert.strictEqual(findWhere?.courseId, "crs_alpha");

      db.subject.findMany = origFindMany;
    });
  }

  // ==========================================================================
  // MODULE 4: DIRECT SERVICE FUNCTION INTEGRITY
  // ==========================================================================
  console.log("\n[MODULE 4] Service Function Unit Invariants");
  {
    // 23. updateCourse throws on non-existent or cross-tenant record
    await it("updateCourse service throws 'Course not found or access denied.' on count === 0", async () => {
      const origUpdateMany = db.course.updateMany;
      const origFindFirst = db.course.findFirst;

      db.course.findFirst = (async () => null) as any;
      db.course.updateMany = (async () => ({ count: 0 })) as any;

      await assert.rejects(
        async () => {
          await updateCourse(INST_ALPHA, "crs_fake", { name: "Non-existent" });
        },
        /Course not found or access denied/
      );

      db.course.updateMany = origUpdateMany;
      db.course.findFirst = origFindFirst;
    });

    // 24. updateSubject throws on non-existent or cross-tenant record
    await it("updateSubject service throws 'Subject not found or access denied.' on count === 0", async () => {
      const origUpdateMany = db.subject.updateMany;
      const origFindFirst = db.subject.findFirst;

      db.subject.findFirst = (async () => null) as any;
      db.subject.updateMany = (async () => ({ count: 0 })) as any;

      await assert.rejects(
        async () => {
          await updateSubject(INST_ALPHA, "sub_fake", { name: "Non-existent" });
        },
        /Subject not found or access denied/
      );

      db.subject.updateMany = origUpdateMany;
      db.subject.findFirst = origFindFirst;
    });
  }

  db.user.findUnique = origUserFindUnique;

  console.log("\n========================================================");
  console.log(` PHASE 3B.1 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("========================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPhase3B1Tests().catch((err) => {
  console.error("Unhandled error in Phase 3B.1 tests:", err);
  process.exit(1);
});
