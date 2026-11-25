# SST-ERP — Multi-Division Sprint 4: Scope Review

**Document Version:** 1.0  
**Review Date:** 2026-11-25  
**Source Documents Consulted:**
- `MULTI_DIVISION_PHASE_2_IMPLEMENTATION_ROADMAP.md`
- `MULTI_DIVISION_PHASE_2_ACCESS_MATRIX.md`
- `MULTI_DIVISION_PHASE_2_DATABASE_DESIGN.md`
- `MULTI_DIVISION_SPRINT_1_IMPLEMENTATION_REPORT.md`
- `MULTI_DIVISION_SPRINT_2_IMPLEMENTATION_REPORT.md`
- `MULTI_DIVISION_SPRINT_3_IMPLEMENTATION_REPORT.md` (approved)
- Live inspection of `components/layout/AdminSidebar.tsx`
- Live inspection of `components/layout/AdminHeader.tsx`
- Live inspection of `app/admin/page.tsx`
- Live inspection of `lib/store.tsx`
- Live inspection of `app/api/admin/dashboard/route.ts`

**Status:** No implementation started. Scope definition only.

---

## 1. Sprint 4 Defined in Approved Roadmap

**Sprint 4: Header Switcher & Adaptive Navigation (4–5 Days)**  
**Goal:** Seamless UI switching between division dashboards.  
**Source:** `MULTI_DIVISION_PHASE_2_IMPLEMENTATION_ROADMAP.md`, lines 88–98.

The roadmap explicitly defines **three tasks** for Sprint 4:

---

## 2. Task Breakdown

### S4.1 — Division Switcher Component in Admin Header

**Task:** Build `DivisionSwitcher.tsx` component and integrate it into `components/layout/AdminHeader.tsx`.

**Roadmap specification:**
> "Build `DivisionSwitcher.tsx` component in the admin header."

**Acceptance Criteria (from roadmap):**
> "Clicking the Division Switcher instantly updates the sidebar navigation and dashboard metrics to reflect the selected division."

**Detailed requirements derived from roadmap + access matrix:**

| Requirement | Detail |
|-------------|--------|
| Fetch divisions for current institution | Call `GET /api/admin/divisions` (implemented in Sprint 3) |
| Display active division name and type | Show currently active division with type badge (COLLEGE, SCHOOL, etc.) |
| Dropdown list of available divisions | Show all ACTIVE divisions the user is permitted to access |
| Division selection mechanism | On selection: set active division in client state + persist in `sst_active_division` cookie |
| Institution-wide admin view | Option for Global Admin to select "All Divisions" (consolidated executive view) |
| Division-scoped user restriction | Division-scoped users (Principal, Teacher) only see their permitted divisions |
| No division configured state | Graceful fallback when institution has no divisions yet |
| Styling | Consistent with existing `AdminHeader` aesthetic — pill/button matching the Academic Year switcher pattern |

**Files to create/modify:**
- **NEW:** `components/layout/DivisionSwitcher.tsx` — the dropdown component
- **MODIFY:** `components/layout/AdminHeader.tsx` — integrate `DivisionSwitcher` into the right control bar (alongside Academic Year switcher and notification bell)

---

### S4.2 — Adaptive AdminSidebar Navigation

**Task:** Update `components/layout/AdminSidebar.tsx` to render different navigation items based on `activeDivision.type`.

**Roadmap specification:**
> "Update `components/layout/AdminSidebar.tsx`:
> - If `activeDivision.type === 'COLLEGE'`: Render current College navigation (*Departments, Courses, Semesters, IA, Results*).
> - If `activeDivision.type === 'SCHOOL'`: Render School navigation (*Grades & Standards, Sections, Terms, Subject Master*).
> - If `activeDivision.type === 'MONTESSORI'`: Render Montessori navigation (*Stages, Activity Milestones, Progress Observations*).
> - If `activeDivision === 'ALL'`: Render Consolidated Executive Overview."

**Acceptance Criteria:**
> "Clicking the Division Switcher instantly updates the sidebar navigation and dashboard metrics to reflect the selected division."

**Navigation maps required by division type:**

| Division Type | Navigation Items | Notes |
|---------------|-----------------|-------|
| `COLLEGE` (default) | Academic Years, Departments, Programs & Courses, Classes & Sections, Subject Master, Attendance, IA, Results, Promotions, Certificates | **Current behaviour — must remain 100% identical for COLLEGE divisions** |
| `SCHOOL` | Academic Years, Grades & Standards, Sections, Terms, Subject Master, Attendance, Examinations, Results, Promotions, Report Cards | Replaces "Departments/Courses/Semesters" with "Grades/Terms" |
| `HIGHER_SECONDARY` | Academic Years, Streams (+1/+2 Science, Commerce, Arts), Sections, Subjects, Attendance, Examinations, Results | +1/+2 academic structure |
| `MONTESSORI` | Developmental Stages, Age Groups, Activity Milestones, Progress Observations, Daily Logs | No numerical marks/semesters |
| `ACADEMY` | Cohorts & Batches, Short Courses, Skill Assessments, Certificates | Professional cert structure |
| `ALL` (Executive View) | Cross-Division Overview only — links to each division's summary | No academic sub-menu |

**Current sidebar facts discovered during inspection:**
- `AdminSidebar.tsx` is 500 lines, all College-specific, completely hardcoded
- Uses `useInstitution()` store hook — no division context is currently read
- Has no `activeDivisionId`, `activeDivisionType`, or `permittedDivisionIds` in `lib/store.tsx`
- Academic items are COLLEGE-specific: Departments, Programs & Courses, Classes & Sections, Subject Master

**Files to modify:**
- **MODIFY:** `components/layout/AdminSidebar.tsx` — add division-type branching logic
- **MODIFY:** `lib/store.tsx` — add division context state (`activeDivisionId`, `activeDivisionType`, `permittedDivisionIds`, `setActiveDivision`) so both Sidebar and Header can share it reactively

---

### S4.3 — Consolidated Executive Overview (Multi-Division Dashboard)

**Task:** Build cross-division totals dashboard on `/admin` when `activeDivision === 'ALL'`.

**Roadmap specification:**
> "Build Consolidated Executive Overview on `/admin` showing cross-division totals (Total Students, Total Fee Collection, Division Breakdown)."

**Acceptance Criteria:**
> "Clicking the Division Switcher instantly updates the sidebar navigation and dashboard metrics to reflect the selected division."

**Required metrics per roadmap:**
- Total Students (across all divisions)
- Total Fee Collection (across all divisions)
- Division Breakdown (per-division card: name, student count, fee collected, active classes)

**Existing dashboard facts:**
- `app/admin/page.tsx` calls `GET /api/admin/dashboard` → `getDashboardMetrics(institutionId)`
- Dashboard currently shows institution-wide College metrics (not division-aware)
- A new API endpoint or additional parameter is needed to aggregate across divisions

**Files to create/modify:**
- **NEW:** `app/api/admin/dashboard/multi-division/route.ts` — cross-division aggregate metrics API (or extend existing dashboard route with `?scope=all`)
- **MODIFY:** `app/admin/page.tsx` — conditionally render Executive Overview when `activeDivisionType === 'ALL'` vs single-division dashboard

---

## 3. Sprint 4 Acceptance Criteria (from Roadmap)

> "Clicking the Division Switcher instantly updates the sidebar navigation and dashboard metrics to reflect the selected division."

This implies:
1. The switcher persists the selection (cookie: `sst_active_division`).
2. The sidebar re-renders immediately on selection without a full page reload.
3. The dashboard metrics shown correspond to the selected division.
4. College navigation is completely preserved and unchanged for COLLEGE division type.

---

## 4. Required Files

### New Files

| File | Purpose |
|------|---------|
| `components/layout/DivisionSwitcher.tsx` | Division selection dropdown component |
| `app/api/admin/dashboard/multi-division/route.ts` | Cross-division aggregate dashboard API (or extend existing route) |
| `tests/test-division-navigation.ts` | Sprint 4 automated test suite |

### Modified Files

| File | Change |
|------|--------|
| `components/layout/AdminHeader.tsx` | Integrate `DivisionSwitcher` into right control bar |
| `components/layout/AdminSidebar.tsx` | Add division-type-aware navigation branching |
| `lib/store.tsx` | Add division state: `activeDivisionId`, `activeDivisionType`, `permittedDivisionIds`, `setActiveDivision` |
| `app/admin/page.tsx` | Conditional executive vs single-division dashboard rendering |

---

## 5. Database Impact

### Schema Changes: NONE REQUIRED

Sprint 4 is a **pure UI/frontend sprint**. No new Prisma models, fields, enums, or migrations are needed.

- Division data is already persisted in `institution_divisions` (Sprint 1 schema)
- Division context resolution is already implemented (`lib/security/division-context.ts`, Sprint 2)
- Division listing API already exists (`GET /api/admin/divisions`, Sprint 3)
- The active division selection is stored in a **browser cookie** (`sst_active_division`) — no DB write needed
- The dashboard aggregate query uses existing Prisma models (Student, Enrollment, FeeInvoice) scoped by `divisionId` — no schema change required

> [!IMPORTANT]
> The database migration (`prisma/migrations/10_multi_division_core/migration.sql`) must be executed **before Sprint 4 can be tested in a live environment**, because the `institution_divisions` table does not yet exist in the live database. However, **Sprint 4 code can be fully written and TypeScript/lint-verified without running the migration** — just as Sprints 1–3 were.

---

## 6. Security Considerations

| Concern | Implementation Required |
|---------|------------------------|
| Division switcher must only show permitted divisions | `DivisionSwitcher` must call `GET /api/admin/divisions` and use the server-verified list — never trust a client-side division list |
| Active division cookie must be re-validated on each API request | Already handled by `resolveDivisionContext()` in Sprint 2 — cookie is never trusted without DB verification |
| Division-scoped users cannot select divisions they are not members of | The switcher dropdown must only render divisions from `permittedDivisionIds` returned by the API |
| "ALL" executive view must be restricted to Global Admins only | `isInstitutionWideAdmin === true` check required before rendering the "All Divisions" option |
| Sidebar navigation links for SCHOOL/MONTESSORI cannot expose COLLEGE-only routes | Navigation link filtering must happen client-side based on `activeDivisionType` from server-verified context |

---

## 7. Testing Requirements

Sprint 4 requires a new test suite `tests/test-division-navigation.ts` covering:

| Test | Description |
|------|-------------|
| Division switcher renders correct divisions | Lists only ACTIVE divisions for the institution |
| Division-scoped user sees only permitted divisions | Non-admin users cannot see divisions outside their memberships |
| Global admin sees all divisions + "All" option | `isInstitutionWideAdmin: true` users see the executive option |
| Cookie is set on division selection | `sst_active_division` cookie is written with selected ID |
| Sidebar renders COLLEGE nav for COLLEGE division | Existing nav items appear unchanged |
| Sidebar renders SCHOOL nav for SCHOOL division | Grades/Terms appear; Courses/Departments do not |
| Dashboard metrics update on division change | Fetches division-scoped dashboard data after selection |
| Executive Overview renders for "ALL" selection | Cross-division totals appear; individual department menus hidden |

Additionally, the full Sprint 1–3 regression suite must continue to pass:
- `tests/test-division-params.ts` (16/16)
- `tests/test-division-security.ts` (18/18)
- `tests/test-division-crud.ts` (33/33)

---

## 8. Sprint 1–3 Dependencies & Prerequisite Status

| Prerequisite | Status | Notes |
|-------------|--------|-------|
| `InstitutionDivision` schema | ✅ Done (Sprint 1) | In `prisma/schema.prisma` — migration not yet executed |
| `lib/security/division-context.ts` (`resolveDivisionContext`) | ✅ Done (Sprint 2) | Full RBAC context resolution |
| `lib/security/tenant.ts` (`assertDivisionTenant`) | ✅ Done (Sprint 2) | Mutation guard |
| `GET /api/admin/divisions` | ✅ Done (Sprint 3) | Division list API |
| `lib/services/division.service.ts` | ✅ Done (Sprint 3) | Business logic layer |
| `app/admin/divisions/page.tsx` | ✅ Done (Sprint 3) | Division management UI |
| Super Admin division provisioning | ✅ Done (Sprint 3) | Division tab in institution page |
| Division data seeded | ⚠️ **Migration NOT executed** | Divisions exist only in schema — no live data yet |

**Blockers:** None for code authoring. Live end-to-end testing requires the database migration to be executed first.

---

## 9. Missing or Ambiguous Requirements

The following areas are **not explicitly specified** in the roadmap and will need a decision before or during implementation:

| Item | Ambiguity | Recommended Approach |
|------|-----------|---------------------|
| **Store integration** | The roadmap says "build DivisionSwitcher" but does not specify whether division state goes into `lib/store.tsx` (Zustand/Context) or into URL params/cookies only | Add lightweight division state to `lib/store.tsx` alongside `academicYears` pattern — `activeDivisionId`, `activeDivisionType`, `setActiveDivision`, `divisions[]` |
| **HIGHER_SECONDARY sidebar nav** | The roadmap specifies COLLEGE, SCHOOL, MONTESSORI, and ALL nav maps but does not list HIGHER_SECONDARY or ACADEMY navigation items explicitly | Define sensible navigation for HIGHER_SECONDARY (Streams, Subjects, Exams, Results) and ACADEMY (Cohorts, Certifications) — or treat both as "COLLEGE-like" until Sprint 5 |
| **Multi-division dashboard API** | The roadmap says "cross-division totals" but doesn't specify whether this is a new route or an extension of existing `/api/admin/dashboard` | Extend existing route with `?scope=all` query param to avoid route proliferation |
| **State persistence across full-page navigations** | Cookie-based persistence is implied but how the client reads the cookie on initial load is unspecified | On mount, `DivisionSwitcher` reads `sst_active_division` cookie and sets local state |
| **Division logo and branding in Sidebar** | The roadmap mentions "Division Logo & Sub-Branding" in Sprint 3 (s3_3) but this was not in the original Sprint 3 deliverables list | If division `logoUrl` and `brandColor` are stored (they are, per Sprint 3 service), the sidebar brand area can render division logo/name instead of institution logo when a specific division is active — scope TBD |
| **What happens when activeDivision has no matching navigation** | If a division type is unrecognized at runtime | Fall back to COLLEGE navigation to prevent a blank sidebar |

---

## 10. Git & Branch Status at Review Time

| Property | Value |
|----------|-------|
| Branch | `feature/multi-division-sprint-1-schema` |
| Sprint 1–3 files | All present (untracked or tracked modifications) |
| Database migration | NOT executed |
| Remote push | NOT done |
| Any Sprint 4 files | NONE — no implementation started |

---

## 11. Sprint 4 Estimated Scope Summary

| Item | Count |
|------|-------|
| New components | 1 (`DivisionSwitcher.tsx`) |
| Modified layout files | 2 (`AdminHeader.tsx`, `AdminSidebar.tsx`) |
| Modified store | 1 (`lib/store.tsx`) |
| New/modified API routes | 1 (extend `/api/admin/dashboard` or add `multi-division` sub-route) |
| Modified dashboard page | 1 (`app/admin/page.tsx`) |
| New test suite | 1 (`tests/test-division-navigation.ts`) |
| Schema/migration changes | **0** |
| Estimated time | 4–5 days (per roadmap) |

---

## Final Verdict

```
SPRINT 4 SCOPE DEFINED — READY FOR IMPLEMENTATION APPROVAL
```

Sprint 4 is **fully specified** in the approved roadmap (`MULTI_DIVISION_PHASE_2_IMPLEMENTATION_ROADMAP.md`). No new architecture design is needed. The scope is a UI-only sprint — no database schema changes required.

**Awaiting explicit user approval before starting Sprint 4 implementation.**
