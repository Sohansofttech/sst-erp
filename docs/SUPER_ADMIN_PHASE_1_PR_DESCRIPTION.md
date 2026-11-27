# Pull Request Description: Super Admin Phase 1 Authentication Hardening

## PR Title
`feat(security): implement Super Admin MFA and login rate limiting`

---

## 1. Summary
This Pull Request delivers **Super Admin Phase 1 Authentication Hardening** for Sohan Soft Tech ERP (`Sohansofttech/sst-erp`). It introduces Multi-Factor Authentication (MFA) via RFC 6238 TOTP, single-use emergency backup recovery codes, database-backed atomic login rate limiting, and trusted edge-network IP extraction heuristics.

All features were developed using zero third-party cryptographic dependencies (leveraging native Node.js `crypto`, `bcryptjs`, and standard `jose` JWTs) and were subjected to two independent application security audits with 100% verified remediation of all findings.

---

## 2. Problem Being Solved
Prior to this implementation:
1. Super Admin accounts authenticated with single-factor credentials (password or Supabase Auth), leaving the multi-tenant platform vulnerable to compromised credentials, phishing, or credential stuffing.
2. Ingress authentication lacked rate limiting, exposing the system to brute-force attacks and horizontal password spraying.
3. Disparate authentication paths (unified `/api/auth/login`, Super Admin Server Action `actions.ts`, and Supabase OAuth callback `auth/callback`) exhibited inconsistent security controls.

---

## 3. Security Improvements & Architecture

### A. RFC 6238 Multi-Factor Authentication (TOTP)
- Pure Node.js `crypto` RFC 6238 implementation (HMAC-SHA1, 30s step, 6-digit zero-padded, ±1 step clock drift tolerance).
- AES-256-GCM authenticated encryption at rest for stored secrets with unique 12-byte IV and 16-byte authentication tag.
- Replay prevention enforced at the database level via conditional atomic SQL:
  ```sql
  UPDATE "PlatformAdminMfa"
  SET "lastUsedCounter" = $1, "updatedAt" = NOW()
  WHERE "userId" = $2::uuid AND "lastUsedCounter" < $1;
  ```

### B. Single-Use Emergency Backup Recovery Codes
- 10 cryptographically random codes (format `XXXX-XXXX`) generated during setup.
- Plaintext codes are never persisted; stored exclusively as `bcrypt` hashes.
- Concurrency-safe consumption enclosed in a database transaction with row-level locking (`SELECT ... FOR UPDATE`), preventing simultaneous reuse.

### C. MFA Disarm & Overwrite Protection
- `setupAdminMfa` rejects re-enrollment if `isEnrolled === true`.
- `/api/super-admin/mfa/setup` rejects intermediate challenge cookies on enrolled accounts with **HTTP 403 Forbidden**.

### D. Multi-Path MFA Enforcement
- **Unified Login (`/api/auth/login`)**: Returns `{ mfaRequired: true }` and sets a 300s HTTP-only `sst_mfa_challenge` cookie. Production `sst_session` is only issued after MFA verification.
- **Server Action (`app/super-admin/login/actions.ts`)**: Invalidate local Supabase sessions upon password verification, issues challenge cookie, and redirects to `/super-admin/mfa/verify`.
- **OAuth Callback (`app/super-admin/auth/callback/route.ts`)**: Enforces challenge redirection for enrolled Super Admins.
- **Route Guard (`lib/super-admin/require-super-admin.ts`)**: Blocks raw Supabase sessions if MFA is enrolled.

### E. Database-Backed Atomic Rate Limiter & Trusted IP
- Account limit: 5 failed attempts per 15 minutes.
- IP limit: 20 failed attempts per 15 minutes (with HTTP 429 and `Retry-After: 900`).
- Atomic PostgreSQL upsert eliminates read-modify-write race conditions.
- Failed logins for non-existent/inactive accounts are recorded, blocking user enumeration and password spraying.
- Centralized IP extraction (`lib/security/client-ip.ts`) prioritizes verified edge headers (`x-vercel-forwarded-for`, `cf-connecting-ip`, `x-real-ip`) and validates IP formats via `net.isIP`.

### F. Strict Fail-Closed Architecture for MFA & Rate Limiting
- **MFA Status Determination:** The system strictly differentiates between a genuine missing record (database query successfully executes and returns `null`, indicating unenrolled account) and an infrastructure failure (database connection loss, query timeout, or unapplied table).
- **Fail-Closed Enforcement:** In production (`NODE_ENV === "production"`), any database failure during Super Admin MFA verification throws `MfaDatabaseError` and blocks session issuance:
  - Unified Login (`/api/auth/login`) fails closed with HTTP 503 (`Authentication service temporarily unavailable`).
  - Server Action (`app/super-admin/login/actions.ts`) signs out local Supabase sessions and returns an error without redirecting to `/super-admin`.
  - OAuth Callback (`app/super-admin/auth/callback/route.ts`) revokes the Supabase session and redirects to `/super-admin/login?error=security_verification_failed`.
  - Route Guard (`lib/super-admin/require-super-admin.ts`) blocks unverified sessions from platform administration.
- **Fail-Closed Rate Limiter:** Production database errors return `{ allowed: false, reason: "DATABASE_UNAVAILABLE" }` (HTTP 503), preventing distributed attacks across multi-instance serverless lambdas.

---

## 4. Files Changed

### Modified Files (5)
1. `prisma/schema.prisma`: Added `mfa` relation, `PlatformAdminMfa` model, and `LoginRateLimit` model.
2. `app/api/auth/login/route.ts`: Integrated client IP extraction, rate limiting on ingress, failed attempt tracking on non-existent accounts, and Super Admin MFA interception.
3. `app/super-admin/login/actions.ts`: Added rate limiting, Supabase session invalidation, and MFA challenge redirection.
4. `app/super-admin/auth/callback/route.ts`: Enforces MFA challenge redirection on OAuth code exchange.
5. `lib/super-admin/require-super-admin.ts`: Blocks unverified Supabase sessions when MFA is enrolled.

### New Security Services & Routes (9)
6. `lib/security/client-ip.ts`: Centralized trusted IP extraction with proxy verification.
7. `lib/security/login-rate-limiter.ts`: Multi-instance database-backed sliding-window rate limiter.
8. `lib/security/totp-mfa.ts`: RFC 6238 TOTP engine, AES-256-GCM encryption, backup codes, and challenge tokens.
9. `app/api/super-admin/mfa/setup/route.ts`: MFA initialization API (disarm-protected).
10. `app/api/super-admin/mfa/enroll/route.ts`: Initial TOTP confirmation and enrollment API.
11. `app/api/super-admin/mfa/verify/route.ts`: Login MFA challenge verification and production session issuance API.
12. `app/super-admin/mfa/setup/page.tsx`: UI for authenticator setup, key display, and backup codes copy.
13. `app/super-admin/mfa/verify/page.tsx`: UI for TOTP verification and backup code fallback.
14. `prisma/migrations/20261127_super_admin_mfa_and_rate_limit/migration.sql`: Additive PostgreSQL migration.

### New Test Suite (1)
15. `tests/super-admin-phase1-auth.test.ts`: Automated test suite covering all 24 security test cases.

### Documentation Files (14)
16. Architecture & Security Review documents in `docs/`.

---

## 5. Database Migration Details
- **Migration Path:** `prisma/migrations/20261127_super_admin_mfa_and_rate_limit/migration.sql`
- **Tables Created:**
  - `PlatformAdminMfa` (UUID PK, unique index on `userId`, foreign key to `PlatformUser` with `ON DELETE CASCADE`).
  - `LoginRateLimit` (UUID PK, unique index on `key`, index on `(key, lockedUntil)`).
- **Safety Guarantee:** 100% additive DDL (`CREATE TABLE`, `CREATE INDEX`, `ADD CONSTRAINT`). Zero destructive operations (`DROP`, `ALTER DROP COLUMN`).

---

## 6. Testing Evidence

### A. Phase 1 Security Test Suite
`npx tsx --test tests/super-admin-phase1-auth.test.ts`
- **Result:** **33 PASSED | 0 FAILED | 0 SKIPPED** (Exit Code: `0`, Duration: ~4.3s)
- **Coverage:** Rate limiting thresholds, lockout windows, Base32 encoding, AES-256-GCM encryption/decryption, tamper rejection, TOTP replay prevention, clock drift (±30s), backup code burning and exhaustion, MFA disarm prevention, concurrent TOTP replay rejection, concurrent backup-code lock, IP spoofing validation, and **fail-closed database resilience (FC-01 to FC-09)**.

### B. Multi-Tenant Portal Security Suite
`npx tsx tests/test-portal-security-audit.ts`
- **Result:** **14 PASSED | 0 FAILED** (Exit Code: `0`, Duration: 30.8s)
- **Coverage:** Student feedback authorization, parent children scoping, library multi-tenant access, and cross-institution tenant assertions.

### C. Static Analysis & Build Verification
- `npx tsc --noEmit`: Exit Code `0` (0 TypeScript errors).
- `npx eslint <changed_files>`: Exit Code `0` (0 errors).
- `npm run build`: Exit Code `0` (All 260 routes compiled and prerendered cleanly).
- `git diff --check`: Exit Code `0` (Clean).

---

## 7. Existing Portal Compatibility
- **Institution Admin (`ADMIN`):** Unchanged. Bypasses Super Admin MFA; asserts tenant membership; lands on `/admin`.
- **Teacher (`TEACHER`):** Unchanged. Signs `sst_teacher_session`; lands on `/campus/[slug]/teacher`.
- **Student (`STUDENT`):** Unchanged. Resolves student ID; lands on `/student/dashboard`.
- **Parent (`PARENT`):** Unchanged. Resolves guardian links; blocks cross-student IDOR.

---

## 8. Deployment Prerequisites
1. **Apply Additive Database Migration:**
   Execute `prisma/migrations/20261127_super_admin_mfa_and_rate_limit/migration.sql` against the Supabase PostgreSQL database before routing production traffic.
   *Operational Note:* In production, Super Admin login and rate limiting operate strictly in **fail-closed** mode. If application code is deployed before applying the migration, Super Admin logins will return HTTP 503 Service Unavailable until the tables exist.
2. **Environment Variables:**
   Ensure `JWT_SECRET` (at least 32 characters) is configured in the production environment. Optionally set `MFA_ENCRYPTION_KEY` if a dedicated key is preferred for TOTP secret encryption at rest.

---

## 9. Rollback Considerations
Because the migration is purely additive, rolling back application code will not break existing tables or data. `PlatformAdminMfa` and `LoginRateLimit` tables can remain in the database schema without impacting legacy ERP operations.

---

## 10. References
- `docs/SUPER_ADMIN_SYSTEM_DESIGN.md`
- `docs/SUPER_ADMIN_PHASE_1_DEEP_SECURITY_AUDIT.md`
- `docs/SUPER_ADMIN_PHASE_1_SECURITY_FINDINGS.md`
- `docs/SUPER_ADMIN_PHASE_1_REMEDIATION_REPORT.md`
- `docs/SUPER_ADMIN_PHASE_1_FINAL_INDEPENDENT_REVIEW.md`
- `docs/SUPER_ADMIN_PHASE_1_FINAL_REVIEW_FINDINGS.md`
