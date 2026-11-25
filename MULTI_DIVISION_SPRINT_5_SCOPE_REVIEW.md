# SST-ERP — Multi-Division Sprint 5 Scope Review
**Document ID:** MULTI_DIVISION_SPRINT_5_SCOPE_REVIEW.md  
**Date:** November 25, 2026  
**Status:** SPRINT 5 SCOPE DEFINED — READY FOR IMPLEMENTATION APPROVAL  
**Branch:** `feature/multi-division-sprint-1-schema`  

---

## 1. Executive Summary & Objective

Sprint 5 (**School & Montessori Module Adaptation**) is the final implementation sprint of the approved **Multi-Division Phase 2 Architecture**.

### Sprint 5 Goal:
> Complete specialized academic workflows for School and Montessori divisions so that non-higher-education wings operate seamlessly using primary/secondary standards, term report cards, and early childhood developmental milestones, while strictly preserving existing College academic workflows without regressions.

---

## 2. Exact Sprint 5 Tasks from Approved Roadmap

From `MULTI_DIVISION_PHASE_2_IMPLEMENTATION_ROADMAP.md` (Section 2, Sprint 5):

| Task ID | Task Name | Description from Roadmap |
|---|---|---|
| **S5.1** | **Course-less Class Adaptation** | Adapt `/admin/academics/classes` and its backend route handlers to support School Grades and Montessori Stages without requiring degree courses (`courseId`) or semesters. |
| **S5.2** | **School Term Report Card Generator** | Implement a School Term Report Card generator supporting term-based grading (Term 1, Term 2, Annual), subject marks, percentage, letter grades (A1, A2, etc.), and remarks. |
| **S5.3** | **Montessori Milestone Progress Tracker** | Implement a qualitative developmental observation and milestone tracker covering early childhood domains (Practical Life, Sensorial, Language, Math/Cognitive, Social). |
| **S5.4** | **Cross-Portal Verification Test Suite** | Execute automated and end-to-end regression validation across all portals (Super Admin, Institution Admin, Teacher, Student, Parent) and verify zero regressions for existing College divisions. |

---

## 3. Acceptance Criteria by Task

### S5.1 — Course-less Class Adaptation
- A School Administrator can create a class (e.g. "Grade 10 - Section A", "Grade 5 - Blue") without selecting or referencing any College Course or Semester.
- A Montessori Administrator can create a class/group (e.g. "Primary 3-6 Years", "Toddler Playgroup") with zero college concepts.
- The backend API (`/api/admin/academics/classes`) accepts `courseId: null` and `semester: null` when the active division is `SCHOOL` or `MONTESSORI`.
- Existing College institutions can continue creating classes bound to degree courses and semesters without any behavior change or data breakage.
- All classes created are strictly tenant-isolated and scoped to `divisionId`.

### S5.2 — School Term Report Card Generator
- A School Administrator or Teacher can generate a consolidated Term Report Card for a student in a School division.
- Supports term-based evaluation (Term 1, Term 2, Final/Annual) rather than semester credits and SGPA/CGPA.
- Calculates subject marks, total marks, percentage, grade letter, attendance summary for the term, and general teacher remarks.
- Clean printable/exportable layout suitable for parents.

### S5.3 — Montessori Milestone Progress Tracker
- Montessori educators can track developmental milestones across standard Montessori domains:
  1. Practical Life (coordination, motor skills, self-care)
  2. Sensorial (discrimination, observation)
  3. Language (phonetics, vocabulary, pre-writing)
  4. Mathematics / Cognitive (quantities, symbols, sequence)
  5. Social & Emotional (independence, grace & courtesy)
- Supports qualitative statuses: `INTRODUCED`, `WORKING_ON`, `MASTERED`.
- Free-form observational notes per child without numerical marks or letter grades.

### S5.4 — Cross-Portal Regression Verification
- All 11 verification scenarios from the roadmap are validated.
- Existing Phase A–D test suites pass with zero regressions.
- All existing College navigation items, degree course setups, and semester exam results remain 100% operational.

---

## 4. Required Files and Components

### Backend APIs & Services:
1. `app/api/admin/academics/classes/route.ts` *(Modify)*:
   - Integrate `resolveDivisionContext()`.
   - Make `courseId` and `semester` conditional: required for `COLLEGE`, optional/null for `SCHOOL` and `MONTESSORI`.
   - Accept `gradeLevel` and bind `divisionId`.
   - Filter `GET` queries by active `divisionId`.
2. `lib/services/institution-admin.service.ts` *(Modify)*:
   - Update `getClasses` and `createClass` to support division-scoped, course-less class records in Prisma.
3. `app/api/admin/academics/report-cards/route.ts` *(Create)*:
   - Generates/retrieves term-based report cards for school students.
4. `app/api/admin/academics/montessori/milestones/route.ts` *(Create)*:
   - Endpoint for managing qualitative Montessori milestones and developmental progress observations.

### Frontend UI Components:
1. `app/admin/academics/classes/page.tsx` *(Modify)*:
   - Connect to `useDivision()`.
   - Adapt modal form dynamically:
     - For `SCHOOL`: prompt for "Grade Level" (Grade 1–10) and Section; hide Course and Semester.
     - For `MONTESSORI`: prompt for "Stage / Group" (Toddler, Primary); hide Course and Semester.
     - For `COLLEGE`: retain existing Course, Semester, and Section selectors.
2. `components/admin/SchoolReportCardModal.tsx` *(Create)*:
   - Printable term report card view.
3. `components/admin/MontessoriMilestoneTracker.tsx` *(Create)*:
   - Qualitative observation tracker for early childhood stages.

### Test Suites:
1. `tests/test-school-montessori-workflows.ts` *(Create)*:
   - Dedicated Sprint 5 test suite validating course-less classes, grade levels, school term report cards, and Montessori milestone qualitative logic.

---

## 5. Database & Schema Requirements

### Schema Impact: **ZERO SCHEMA CHANGES REQUIRED**
- The database schema in `prisma/schema.prisma` **already supports Sprint 5** from the additive foundation laid in Sprint 1:
  - `Class.divisionId` (`String? @db.Uuid`) — Already present.
  - `Class.courseId` (`String? @db.Uuid`) — Already nullable.
  - `Class.semester` (`Int?`) — Already nullable.
  - `Class.gradeLevel` (`String?`) — Already present.
  - `Student.currentDivisionId` (`String? @db.Uuid`) — Already present.
  - `academicSettings` JSON field in `InstitutionDivision` — Already present for custom term rules and qualitative milestone categories.
- **Rule:** DO NOT run `prisma migrate dev`, `prisma migrate deploy`, or `prisma db push`. Database schema remains completely unchanged.

---

## 6. Security and Authorization Requirements

1. **Two-Tier RBAC Enforcement:**
   - Division Admins (e.g. School Principal) can only access classes, report cards, and milestones within their assigned division.
   - Attempting to query or create classes in a foreign division results in `403 Forbidden`.
2. **Tenant Isolation:**
   - All class and report card queries must be bound to `session.institutionId`.
3. **No Metric Contamination:**
   - School classes and term marks must never appear under College degree course reports.
4. **Child Switcher Compatibility (Parent Portal):**
   - Parents with wards in different divisions (e.g. Child 1 in Montessori, Child 2 in Grade 8) can view the appropriate specialized dashboard (Milestones vs Report Card) without session conflict.

---

## 7. Dependencies and Implementation Readiness

| Dependency | Source Sprint | Readiness Status |
|---|---|---|
| Nullable `courseId`, `semester`, and `gradeLevel` in `Class` model | Sprint 1 | **READY** (in `prisma/schema.prisma`) |
| `resolveDivisionContext()`, `assertDivisionTenant()` | Sprint 2 | **READY** (in `lib/security/division-context.ts`) |
| Division CRUD, types (`SCHOOL`, `MONTESSORI`, `COLLEGE`, etc.) | Sprint 3 | **READY** (in `lib/services/division.service.ts`) |
| `DivisionSwitcher`, `useDivision()`, adaptive `AdminSidebar` | Sprint 4 | **READY** (in `components/layout/` & `lib/`) |

---

## 8. Testing Plan

1. **Unit & Logic Tests (`tests/test-school-montessori-workflows.ts`):**
   - School class validation without `courseId`.
   - Montessori class validation with `gradeLevel` / stage.
   - Term report card mark aggregation, percentage, and grade letter assignment.
   - Montessori developmental domain milestone tracking.
2. **Regression Tests:**
   - Sprint 1 pure tests (`tests/test-division-params.ts`)
   - Sprint 2 security tests (`tests/test-division-security.ts`)
   - Sprint 3 CRUD tests (`tests/test-division-crud.ts`)
   - Sprint 4 navigation tests (`tests/test-division-navigation.ts`)
   - All 91 pre-existing tests must continue passing (100%).
3. **Static Checks:**
   - `npx prisma validate`
   - `npx tsc --noEmit` (0 errors)
   - `npm run lint` (0 errors)

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **College Class Regression** | Existing College classes fail if course requirement logic is accidentally altered. | Strict branching: if `division.type === 'COLLEGE'` or `courseId` provided, execute exact legacy validation. |
| **Monolithic Store Modification** | Breaking global state when modifying class forms. | Use lightweight React hooks and local state; do not alter `lib/store.tsx`. |
| **Database Migration Leakage** | Accidentally altering DB schema or running migration tools. | Prohibit all database modification commands; zero schema edits. |

---

## 10. Estimated Effort

- **Documented Roadmap Effort:** 4–5 Days
  - S5.1 (Course-less Classes): ~1.5 Days
  - S5.2 (School Report Card): ~1.5 Days
  - S5.3 (Montessori Tracker): ~1 Day
  - S5.4 (Cross-Portal Verification): ~1 Day

---

## 11. Final Verdict

```
SPRINT 5 SCOPE DEFINED — READY FOR IMPLEMENTATION APPROVAL
```

*(Sprint 5 implementation has NOT been started. Awaiting explicit user approval before writing any code).*
