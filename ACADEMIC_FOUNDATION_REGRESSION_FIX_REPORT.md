# SST-ERP — Academic Foundation Regression Test Investigation & Fix Report

**Date:** November 25, 2026  
**Auditor / Engineer:** Automated Verification Harness & Architecture Lead  
**Target Test Suite:** `tests/test-phase3b-academic-foundation.ts`  
**Branch:** `feature/multi-division-sprint-1-schema`  
**Execution Context:** Local Development Only  
**Status:** RESOLVED — 28 / 28 TESTS PASSING (100%)

---

## 1. Original Error & Failing Test Cases

During the Stage 5 final verification audit, `tests/test-phase3b-academic-foundation.ts` failed with exit code 1:
```
========================================================
 PHASE 3B.1 TEST RESULTS: 2 PASSED, 26 FAILED
========================================================
```

### Symptoms Observed
All 26 route handler tests across Modules 1, 2, and 3 failed with HTTP 401 Unauthorized errors:
```
Admin API error: Authentication required. Please log in to access Institution Admin.
  ✘ FAIL: GET /api/admin/academics/academic-years queries scoped to authenticated institution
    Expected values to be strictly equal: 401 !== 200
  ...
  ✘ FAIL: POST /api/admin/academics/courses validates course name and code presence
    Expected values to be strictly equal: 401 !== 400
  ...
  ✘ FAIL: POST /api/admin/academics/subjects blocks associating a subject with a foreign institution course
    Expected values to be strictly equal: 401 !== 404
```
Only Module 4 (`updateCourse` and `updateSubject` service function unit invariants) passed, as they invoked service layer functions directly without calling API route handlers.

---

## 2. Root Cause Analysis

Tracing the request lifecycle revealed two interrelated test harness defects resulting from legacy test code:

### 2.1 Missing Session Authentication in `makeReq`
- `tests/test-phase3b-academic-foundation.ts` was authored in early Phase 3b. At that time, route handlers accepted client-supplied `"x-institution-id": instId` headers without requiring verified user sessions.
- In subsequent security hardening sprints (including commit `3ec453b`), `resolveAdminContext(req)` was implemented across all administrative endpoints (`/api/admin/*`) to prevent tenant header spoofing.
- Under modern security architecture, `resolveAdminContext` requires:
  1. A valid signed JWT session cookie (`erp_session` / `AUTH_COOKIE_NAME`) or `Authorization: Bearer <token>`.
  2. A valid SHA-256 password fingerprint signature (`passwordSig`).
  3. Live account identity verification against `db.user.findUnique`.
- Because `makeReq` in the test suite only passed `"x-institution-id"`, every request was immediately rejected by `getSession(req)` with `UnauthorizedError("Authentication required. Please log in to access Institution Admin.")` (HTTP 401).

### 2.2 Incomplete Prisma `$transaction` Mocking for Atomic Operations
- When `AYRoute.PUT`, `AYRoute.DELETE`, and `createAcademicYear` were upgraded in later sprints to use atomic transactions with advisory locks (`tx.$executeRawUnsafe`), existence checks (`tx.academicYear.findFirst`), and cascade deletions (`tx.$queryRaw`), the local test overrides in `test-phase3b-academic-foundation.ts` were incomplete:
  - Test 3 mocked `txMock` with only `updateMany` and `create`, throwing `tx.$executeRawUnsafe is not a function`.
  - Tests 4 and 5 mocked `db.academicYear.updateMany` and `db.academicYear.findFirst` on the outer `db` client instead of the transaction client `tx`.
  - Tests 6 and 6b mocked `db.academicYear.deleteMany` on the outer `db` client instead of `tx`.

---

## 3. Files Modified & Exact Fix Applied

### File Modified
- `tests/test-phase3b-academic-foundation.ts` (Zero application source code modified; production security boundaries preserved).

### Exact Fix Details

1. **Environment Setup & JWT Secret:**
   - Ensured `process.env.JWT_SECRET` is defined with valid length ($\ge 32$ characters) if absent in the test execution environment.

2. **Session Token Generation & Anti-Spoofing Alignment:**
   - Imported `signToken`, `AUTH_COOKIE_NAME`, and `computePasswordSignature` from `@/lib/auth/jwt`.
   - Pre-generated cryptographically signed tokens for `INST_ALPHA` and `INST_BETA` containing valid `passwordSig` and administrative claims.
   - Updated `makeReq` to supply `Authorization: Bearer ${token}` and `cookie: ${AUTH_COOKIE_NAME}=${token};`.

3. **Live User Verification Interception:**
   - Intercepted `db.user.findUnique` within the test lifecycle to return valid active administrator profiles corresponding to `user_alpha` and `user_beta` with matching password hashes.
   - Restored `db.user.findUnique` to its original implementation upon test completion.

4. **Transparent Transaction Delegation Mock (`db.$transaction`):**
   - Configured `db.$transaction` in Module 1 to pass a `tx` proxy that safely stubs advisory locks (`$executeRawUnsafe: async () => 0`), term existence queries (`$queryRaw: async () => []`), and forwards `academicYear` operations to `db.academicYear.*`.
   - Provided accurate tenant isolation behavior for `findFirst`, `updateMany`, and `deleteMany` so that cross-tenant queries properly yield 404 Not Found as expected by the test assertions.

---

## 4. Test Results Comparison

### Before Fix
```
========================================================
 PHASE 3B.1 TEST RESULTS: 2 PASSED, 26 FAILED
========================================================
```

### After Fix
```
========================================================
 PHASE 3B.1: ACADEMIC FOUNDATION TEST SUITE
 (Academic Years, Courses & Subjects)
========================================================

[MODULE 1] Academic Years API & Tenant Scoping
  ✔ PASS: GET /api/admin/academics/academic-years queries scoped to authenticated institution
  ✔ PASS: POST /api/admin/academics/academic-years validates required name and dates
  ✔ PASS: POST /api/admin/academics/academic-years creates record with institutionId
  ✔ PASS: PUT /api/admin/academics/academic-years atomically updates record scoped to institutionId
  ✔ PASS: PUT /api/admin/academics/academic-years strictly blocks updating academic year of another institution (404)
  ✔ PASS: DELETE /api/admin/academics/academic-years strictly blocks deleting another institution's academic year (404)
  ✔ PASS: DELETE /api/admin/academics/academic-years atomically deletes own academic year (200)

[MODULE 2] Courses API & Single-Statement Atomic Operations
  ✔ PASS: GET /api/admin/academics/courses returns courses scoped to institutionId with departmentName
  ✔ PASS: POST /api/admin/academics/courses validates course name and code presence
  ✔ PASS: POST /api/admin/academics/courses rejects duplicate course code within institution (409)
  ✔ PASS: POST /api/admin/academics/courses successfully creates course with degreeType and credit defaults
  ✔ PASS: PUT /api/admin/academics/courses atomically updates course scoped to institutionId
  ✔ PASS: PUT /api/admin/academics/courses strictly blocks updating course of another institution (404)
  ✔ PASS: DELETE /api/admin/academics/courses strictly blocks deleting another institution's course (404)
  ✔ PASS: DELETE /api/admin/academics/courses atomically deletes own course (200)

[MODULE 3] Subjects API, Course Validation & Atomic Updates
  ✔ PASS: GET /api/admin/academics/subjects returns subjects with parsed instructor
  ✔ PASS: POST /api/admin/academics/subjects validates subject name, code and courseId
  ✔ PASS: POST /api/admin/academics/subjects blocks associating a subject with a foreign institution course (404)
  ✔ PASS: POST /api/admin/academics/subjects rejects duplicate subject code within institution (409)
  ✔ PASS: POST /api/admin/academics/subjects creates subject with normalized type and teacher name
  ✔ PASS: PUT /api/admin/academics/subjects updates subject atomically with { id, institutionId }
  ✔ PASS: PUT /api/admin/academics/subjects strictly blocks updating subject of another institution (404)
  ✔ PASS: PUT /api/admin/academics/subjects rejects changing courseId to foreign institution course (404)
  ✔ PASS: DELETE /api/admin/academics/subjects rejects changing courseId to foreign institution course (404)
  ✔ PASS: DELETE /api/admin/academics/subjects atomically deletes own subject (200)
  ✔ PASS: GET /api/admin/academics/subjects filters by courseId and scopes to institutionId

[MODULE 4] Service Function Unit Invariants
  ✔ PASS: updateCourse service throws 'Course not found or access denied.' on count === 0
  ✔ PASS: updateSubject service throws 'Subject not found or access denied.' on count === 0

========================================================
 PHASE 3B.1 TEST RESULTS: 28 PASSED, 0 FAILED
========================================================
```

---

## 5. Multi-Division Regression Test Verification

All **9 multi-division test suites** were executed to verify zero regression across all multi-division features implemented in Stages 1–4:

| Test Suite | Purpose | Tests Passed | Tests Failed |
|---|---|:---:|:---:|
| `tests/test-division-crud.ts` | Division CRUD, code/slug generation, soft deletion rules | 33 | 0 |
| `tests/test-division-params.ts` | Deterministic division parameter generators | 16 | 0 |
| `tests/test-division-security.ts` | Server-side division resolution & context precedence | 18 | 0 |
| `tests/test-division-navigation.ts` | Adaptive sidebar navigation & switcher synchronization | 18 | 0 |
| `tests/test-school-montessori-workflows.ts` | Course-less classes, Montessori milestones, report cards | 31 | 0 |
| `tests/test-division-entitlements.ts` | Stage 1: Subscription limits, division entitlements | 35 | 0 |
| `tests/test-student-staff-cross-division.ts` | Stage 2: Student progression, concurrent enrollments, staff assignments | 24 | 0 |
| `tests/test-portal-division-switching.ts` | Stage 3: Teacher, Student, Parent division switchers & IDOR security | 18 | 0 |
| `tests/test-division-reporting.ts` | Stage 4: Consolidated & division-specific operational reporting | 58 | 0 |
| **`tests/test-phase3b-academic-foundation.ts`** | **Academic Foundation (Years, Courses, Subjects, Scoping)** | **28** | **0** |
| **TOTAL** | | **279** | **0** |

---

## 6. Static Analysis Verification

1. **Prisma Schema:** `npx prisma validate` exited code 0 (schema valid).
2. **TypeScript:** `npx tsc --noEmit` exited code 0 (0 compilation errors).
3. **ESLint:** `npx eslint tests/test-phase3b-academic-foundation.ts` exited code 0 (0 errors).

---

## 7. Safety Compliance Confirmation

- **Execution Environment:** Branch `feature/multi-division-sprint-1-schema` exclusively.
- **Database Status:** Zero migrations run, zero `prisma db push` executed, zero database records modified.
- **Git Status:** Zero commits pushed, zero pull requests opened, zero merges or deployments executed.
- **Local Work:** All uncommitted files, reports, and untracked artifacts preserved intact.
