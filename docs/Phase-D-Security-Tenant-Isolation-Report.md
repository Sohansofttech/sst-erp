# Remediation Phase D — Security & Tenant Isolation Report

**Execution Date:** 2026-11-24  
**Project:** SST-ERP (Sohan Soft Tech Enterprise Resource Planning)  
**Status:** **PHASE D STATUS: PASS**

---

## 1. Original Security Issues Identified

1. **PostgreSQL Row-Level Security (RLS) Disabled:**  
   PostgreSQL RLS was previously disabled on all public database tables, leaving database security reliant exclusively on application-level `WHERE institutionId = ...` queries.
2. **Missing/Hardcoded HoD & Class Teacher Authorization:**  
   Teacher service methods contained hardcoded flags (`isClassTeacher: true`), arbitrary section assignments (`sec-10a`), and hardcoded identity checks (`teacher_demo_042`, `ananya`) instead of resolving assignments from the database.
3. **Unsafe Tenant Fallbacks:**  
   Runtime and authentication paths contained hardcoded fallbacks to `"inst_demo_school"`, `"vidyaniketan"`, `"inst_apex"`, and `"sec-10a"` if tenant context was absent.
4. **Role & Permission Escalation Risks:**  
   Custom roles lacked strict tenant-scoped integrity guards, and potential IDOR vulnerabilities existed across cross-tenant endpoints.
5. **Connection Pooling Tenant Context Leakage Risks:**  
   Under connection poolers (PgBouncer/Supavisor/PrismaPg), setting session-level state could leak across pooled database connections unless scoped strictly to database transactions.

---

## 2. PostgreSQL Tables Inspected

An audit of the public PostgreSQL schema identified **89 tables**:
- **67 Tables with direct tenant identifiers (`institutionId` / `institution_id`):**  
  `AuditLog`, `CertificateTemplate`, `Class`, `Department`, `InstitutionAdminInvitation`, `InstitutionBranding`, `InstitutionDeletionRequest`, `InstitutionDomain`, `InstitutionFeatureOverride`, `InstitutionMembership`, `InstitutionSubscription`, `InstitutionUsageMetric`, `Invoice`, `IssuedCertificate`, `MembershipRole`, `PlatformNotificationTarget`, `PromotionBatch`, `PromotionPolicy`, `PromotionStudentRecord`, `Role`, `Section`, `SupportAccessSession`, `SupportTicket`, `academic_terms`, `academic_years`, `admission_applications`, `approval_requests`, `assessment_records`, `assignment_submissions`, `assignments`, `attendance_records`, `audit_logs`, `biometric_devices`, `biometric_event_receipts`, `biometric_unknown_scans`, `campus_in_out_logs`, `courses`, `elective_courses`, `elective_selections`, `enrollments`, `events`, `exam_admit_cards`, `exam_results`, `exam_schedules`, `fee_invoices`, `fee_payments`, `fee_receipts`, `feedback`, `guardian_accounts`, `guardian_links`, `hostel_allocations`, `lms_course_materials`, `log_book_entries`, `mentoring_records`, `notifications`, `quiz_attempts`, `quizzes`, `resource_bookings`, `student_biometric_credentials`, `students`, `subjects`, `teacher_portal_sessions`, `teacher_sessions`, `teachers`, `timetable_slots`, `transport_allocations`, `users`.
- **22 Tables without direct tenant identifiers:**  
  `Institution`, `institutions`, `SubscriptionPlan`, `SubscriptionEvent`, `Payment`, `PlanFeature`, `PlatformFeature`, `PlatformNotification`, `PlatformSetting`, `Permission`, `RolePermission`, `SupportTicketNote`, `User`, `_prisma_migrations`, `exam_slots`, `fee_invoice_items`, `notification_recipients`, `otp_rate_limits`, `OtpRateLimit`, `OtpToken`, `quiz_questions`, `student_documents`.

---

## 3. RLS Policies Implemented

Row-Level Security was enabled and configured across **73 tables** in PostgreSQL:

1. **Application Role Architecture (`erp_app_user`):**  
   Created PostgreSQL role `erp_app_user NOINHERIT NOBYPASSRLS`. Granted usage and table privileges to this role and granted the role to `postgres`.
2. **Direct Tenant Tables (67 tables):**  
   Enabled RLS (`ALTER TABLE "<table_name>" ENABLE ROW LEVEL SECURITY;`). Created `tenant_isolation_erp_user` policy:
   ```sql
   CREATE POLICY tenant_isolation_erp_user ON "<table_name>"
     FOR ALL TO erp_app_user
     USING ("<institutionId_col>"::text = current_setting('app.current_tenant_id', true))
     WITH CHECK ("<institutionId_col>"::text = current_setting('app.current_tenant_id', true));
   ```
3. **Indirect / Child Tables (6 tables):**  
   - `notification_recipients`: Filtered via parent `notifications.institutionId`
   - `quiz_questions`: Filtered via parent `quizzes.institutionId`
   - `student_documents`: Filtered via parent `students.institutionId`
   - `fee_invoice_items`: Filtered via parent `fee_invoices.institutionId`
   - `exam_slots`: Filtered via parent `exam_schedules.institutionId`
   - `RolePermission`: Filtered via parent `Role.institutionId`

---

## 4. Tables Where RLS Was Not Directly Applicable and Justification

The remaining 16 tables were intentionally kept without tenant-filtering RLS:
- **`Institution`, `institutions`:** Tenant root discovery registry. Must be queried by slug or college code *before* tenant context can be established.
- **`SubscriptionPlan`, `SubscriptionEvent`, `Payment`, `PlanFeature`, `PlatformFeature`, `PlatformNotification`, `PlatformSetting`:** Global SaaS billing and platform-wide configurations.
- **`Permission`:** Global system-wide permission catalog.
- **`OtpToken`, `OtpRateLimit`, `otp_rate_limits`:** Global pre-authentication rate limiting and credential challenge verification.
- **`User`:** Legacy global user table (tenant users operate on `users` table).
- **`_prisma_migrations`:** Internal Prisma database migration metadata.

---

## 5. Tenant Context & Connection Pooling Implementation

Implemented `lib/security/tenant-context.ts`:
- **`withTenantContext<T>(institutionId, fn)`:**
  Runs within an atomic database transaction:
  ```sql
  SET LOCAL ROLE erp_app_user;
  SELECT set_config('app.current_tenant_id', $1, true);
  ```
  Using `SET LOCAL` guarantees that the role switch and the session configuration variable are strictly transaction-scoped. Once the transaction commits or aborts, PostgreSQL immediately resets the connection state, eliminating any tenant leakage across connection pools.
- **`enforceTenantBoundary(userInstitutionId, targetInstitutionId)`:** Server-side anti-spoofing and IDOR check.

---

## 6. HoD Authorization

- Replaced hardcoded checks in `app/campus/[slug]/teacher/hod/*` pages.
- Dynamic role resolution in `lib/security/tenant-context.ts` queries the `Department` table to verify whether `hodStaffId` matches the authenticated teacher's ID or user ID.
- Access to HoD pages and routes (`/campus/[slug]/teacher/hod/*`) requires the active role `"hod"`.
- HoD can view and manage faculty load, approvals, and metrics strictly for their assigned department and institution.

---

## 7. Class Teacher Authorization

- Replaced `isClassTeacher: true` and `classTeacherOf: "Class 10 - A"` in `lib/services/teacher.service.ts` and `lib/auth/teacher-session.ts`.
- Dynamic section resolution checks `Section.classTeacherStaffId` in PostgreSQL.
- Faculty members without section assignments only receive the `"teacher"` role.
- Homeroom section roster (`getSectionStudents()`) resolves the teacher's assigned section dynamically without requiring or hardcoding `"sec-10a"`.

---

## 8. Subject Teacher Authorization

- Subject teachers access course allocations and marks entry strictly according to timetable allocations and assigned subjects.
- Faculty role defaults to `"teacher"` unless verified assignments exist in `Department` or `Section`.

---

## 9. Hardcoded Fallback Removal

The entire codebase was audited and purged of unsafe fallbacks:
1. `app/api/auth/login/route.ts`:
   - Removed fallback `if (!instSlug) instSlug = "vidyaniketan";`
   - Removed fallback `institutionId: ... || "inst_demo_school"`
   - If institution context cannot be resolved, returns HTTP 400 Bad Request with an explicit error.
2. `lib/supabase/storage.ts`:
   - Removed default `institutionId = "inst_demo_school"`. Requires explicit `institutionId` for tenant storage isolation.
3. `app/api/student/feedback/route.ts`:
   - Removed fallback `"inst_apex"`. Returns HTTP 400 if institution context is missing.
4. `app/dashboard/page.tsx`:
   - Removed `"vidyaniketan"` redirect fallback. Redirects to `/login?error=no_institution` if slug cannot be resolved.
5. `lib/services/teacher.service.ts`:
   - Purged all occurrences of `"sec-10a"`.
6. `app/campus/[slug]/teacher/hod/page.tsx` & `leave-approvals/page.tsx`:
   - Purged hardcoded `"teacher_demo_042"` and `"ananya"`.

---

## 10. Role and Permission Security

- Verified in `app/api/admin/roles/route.ts`:
  - System roles (`isSystem: true`) cannot be edited or deleted (returns HTTP 403 Forbidden).
  - Role queries, mutations, and deletions enforce `{ id, institutionId }` ownership.
  - Deactivated accounts are rejected at session validation (`requireAuth` & `resolveAdminContext`).

---

## 11. API and Service-Level Security Audit

- All `/api/admin/*` routes enforce `resolveAdminContext(req)` with header anti-spoofing (`x-institution-id` cannot differ from authenticated session).
- All `/api/student/*` routes enforce `requireAuth(req)` and `authorizeStudentOrParentAccess(session, studentId)`.
- Teacher routes enforce `requireTeacherSession` with active role matching.

---

## 12. Files Modified

| File | Changes Made |
|---|---|
| `lib/security/tenant-context.ts` | **New**: Transaction-scoped RLS wrapper, tenant boundary enforcement, dynamic teacher assignments |
| `scripts/apply-postgresql-rls.ts` | **New**: Automated safe additive migration for PostgreSQL RLS policies |
| `lib/auth/teacher-session.ts` | Integrated dynamic teacher assignment resolution; removed hardcoded `isClassTeacher: true` and `"Class 10 - A"` defaults |
| `app/api/auth/login/route.ts` | Removed `"vidyaniketan"` and `"inst_demo_school"` fallbacks; added strict tenant verification |
| `app/api/student/feedback/route.ts` | Removed `"inst_apex"` fallbacks; enforced tenant requirement |
| `lib/supabase/storage.ts` | Required `institutionId` parameter; removed default `"inst_demo_school"` |
| `app/dashboard/page.tsx` | Removed `"vidyaniketan"` redirects; safe handling for missing tenant slugs |
| `lib/services/teacher.service.ts` | Removed all `"sec-10a"` hardcoded values; dynamic homeroom section resolution; removed hardcoded `isClassTeacher` |
| `app/campus/[slug]/teacher/hod/page.tsx` | Removed hardcoded `teacher_demo_042` and `ananya` filtering; bound to active user |
| `app/campus/[slug]/teacher/hod/leave-approvals/page.tsx` | Removed hardcoded `teacher_demo_042` and `ananya` filtering |
| `app/campus/[slug]/teacher/class-teacher/*.tsx` (4 pages) | Replaced hardcoded `getSectionStudents("sec-10a")` with dynamic `getSectionStudents()` |
| `tests/phase-d-security-tenant-isolation.test.ts` | **New**: Comprehensive 18-check security and tenant isolation test suite |

---

## 13. Database Changes & Migration Details

- Created PostgreSQL role `erp_app_user` with `NOINHERIT NOBYPASSRLS`.
- Enabled PostgreSQL Row-Level Security on 73 tables (67 direct tenant tables + 6 indirect parent-linked tables).
- Defined restrictive RLS policies binding queries to `current_setting('app.current_tenant_id', true)`.
- Zero tables dropped, zero columns altered destructively, zero existing production records deleted.

---

## 14. Phase D Security Test Results

Executed `tests/phase-d-security-tenant-isolation.test.ts`:
- **[PASS] 1. Cross-institution student access strictly blocked**
- **[PASS] 2. Cross-institution teacher access blocked by tenant isolation**
- **[PASS] 3. Cross-institution Admin access blocked on spoofed tenant header**
- **[PASS] 4. Cross-institution parent access blocked**
- **[PASS] 5. Attendance IDOR: student cannot access another student's attendance**
- **[PASS] 6. Leave request IDOR: student cannot query or submit leave for other students**
- **[PASS] 7. Examination/result IDOR blocked between students**
- **[PASS] 8. Draft / unpublished IA marks are strictly hidden from students**
- **[PASS] 9. Teacher without HoD assignment does not receive HoD role**
- **[PASS] 10. Teacher without section assignment does not receive Class Teacher role**
- **[PASS] 11. Standard faculty strictly receives only 'teacher' role**
- **[PASS] 12. Protected system roles cannot be modified or escalated**
- **[PASS] 13. Deactivated accounts are rejected server-side**
- **[PASS] 14. Missing institution context rejected with clear authorization error**
- **[PASS] 15. Invalid institution context returns zero rows under RLS**
- **[PASS] 16. PostgreSQL RLS strictly filters out other tenant rows**
- **[PASS] 17. Concurrent transactions maintain strict tenant boundaries with zero pool leakage**
- **[PASS] 18. Standard database operations across users and institutions remain fully operational**

**Summary: 18 PASSED, 0 FAILED (100%)**

---

## 15. Complete Regression Test Suite Results

| Test Suite | Test File | Results |
|---|---|---|
| **Phase A Regression** | `tests/phase-a-regression.test.ts` | **15 PASSED, 0 FAILED (100%)** |
| **Phase B Connectivity** | `tests/phase-b-portal-connectivity.test.ts` | **16 PASSED, 0 FAILED (100%)** |
| **Phase C Decoupling** | `tests/phase-c-admin-ui-decoupling.test.ts` | **25 PASSED, 0 FAILED (100%)** |
| **Phase D Security** | `tests/phase-d-security-tenant-isolation.test.ts` | **18 PASSED, 0 FAILED (100%)** |
| **Multi-Institution** | `tests/multi-institution-integration.test.ts` | **ALL PASSED (100%)** |
| **Teacher Session** | `tests/teacher-session-security.test.ts` | **5 PASSED, 0 FAILED (100%)** |
| **Phase 2 Academic** | `tests/phase-2-academic-integration.test.ts` | **39 PASSED, 0 FAILED (100%)** |
| **Phase 3 ERP** | `tests/phase-3-erp-integration.test.ts` | **59 PASSED, 0 FAILED (100%)** |
| **Phase 4 Governance** | `tests/phase-4-erp-integration.test.ts` | **30 PASSED, 0 FAILED (100%)** |

---

## 16. TypeScript Verification

- Command: `npx tsc --noEmit`
- Result: **0 errors (Exit Code: 0)**

---

## 17. ESLint Verification

- ESLint executed cleanly across all modified TypeScript and TSX files with zero critical errors.

---

## 18. Production Build Result

- Command: `npm run build`
- Result: **Completed successfully (Exit Code: 0)**
- Generated optimized production build across all static and dynamic server routes.

---

## 19. Database Integrity Verification

- Database row counts preserved across `teachers`, `students`, `attendance_records`, `assessment_records`, `approval_requests`, `users`, and academic tables.
- Zero table drops or schema truncations occurred.
- Foreign keys and tenant relations intact.

---

## 20. Remaining Security Risks & Recommended Next Steps

1. **Storage Bucket RLS:** While file paths now enforce tenant namespacing (`${institutionId}/${folder}/...`), Supabase Storage bucket policies should also enforce storage RLS matching JWT claims in production.
2. **Periodic RLS Policy Auditing:** When new tables are added via future migrations, ensure additive scripts run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and attach the `tenant_isolation_erp_user` policy.

---

## Final Status

**PHASE D STATUS: PASS**
