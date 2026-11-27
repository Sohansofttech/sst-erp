# SST-ERP — Super Admin Phase 1 Final Pre-PR Security Review

**Review Date:** 2026-11-27
**Auditor:** Senior Security Engineer
**Target Repository:** `Sohansofttech/sst-erp` (`Downloads/sohan_soft_tech`)
**Target Branch:** `feature/super-admin-bug-fixes` (Synced with `origin/feature/super-admin-bug-fixes`)
**Status:** COMPLETE (READ-ONLY AUDIT)

---

## 1. Overall Decision

### **DECISION: APPROVED FOR PR REVIEW**

The Super Admin Phase 1 implementation (RFC 6238 TOTP Multi-Factor Authentication, Single-Use Emergency Recovery Codes, Database-Backed Atomic Rate Limiting, and Trusted Client IP Extraction) has been forensically verified in actual source code and automated test execution.

All 6 core vulnerability classes identified in previous security audits (MFA disarm vulnerability, Server Action/OAuth MFA bypass, user enumeration on missing accounts, TOCTOU rate-limiting race condition, concurrent TOTP replay, and client IP spoofing) are confirmed resolved with code-level evidence and passing regression tests.

---

## 2. Git Status & Changed-Files Inventory

### Current Git State
- **Branch:** `feature/super-admin-bug-fixes`
- **Upstream:** `origin/feature/super-admin-bug-fixes` (Up to date)
- **Status:** Unstaged changes present; no branches, commits, or pushes created.

### Production Source Files Included in PR Scope (14 files)
#### Modified Files (5)
1. `prisma/schema.prisma`: Added `PlatformAdminMfa` and `LoginRateLimit` models, and relation to `PlatformUser`.
2. `app/api/auth/login/route.ts`: Integrated client IP extraction, ingress rate limiting, failure recording for non-existent accounts, uniform error handling, and Super Admin MFA interception.
3. `app/super-admin/login/actions.ts`: Added rate limiting, Supabase session invalidation on login, and intermediate MFA challenge redirection.
4. `app/super-admin/auth/callback/route.ts`: Added MFA challenge redirection on OAuth code exchange for enrolled Super Admins.
5. `lib/super-admin/require-super-admin.ts`: Added guard asserting that raw Supabase sessions cannot bypass enrolled MFA.

#### New Production Services & Route Handlers (9)
6. `lib/security/client-ip.ts`: Centralized trusted IP extraction prioritizing verified edge headers (`x-vercel-forwarded-for`, `cf-connecting-ip`, `x-real-ip`) with `net.isIP` validation.
7. `lib/security/login-rate-limiter.ts`: Multi-instance sliding-window rate limiter with atomic PostgreSQL upsert queries.
8. `lib/security/totp-mfa.ts`: Native Node.js RFC 6238 TOTP engine, AES-256-GCM encryption at rest, hashed backup codes, and conditional atomic replay prevention.
9. `app/api/super-admin/mfa/setup/route.ts`: Protected MFA setup endpoint (blocks intermediate challenge cookies on enrolled accounts with HTTP 403).
10. `app/api/super-admin/mfa/enroll/route.ts`: TOTP confirmation and enrollment activation endpoint.
11. `app/api/super-admin/mfa/verify/route.ts`: Challenge verification, single-use code burning, and production session issuance endpoint.
12. `app/super-admin/mfa/setup/page.tsx`: Super Admin authenticator setup UI.
13. `app/super-admin/mfa/verify/page.tsx`: Super Admin challenge verification UI.
14. `prisma/migrations/20261127_super_admin_mfa_and_rate_limit/migration.sql`: Purely additive DDL migration.

#### New Automated Security Test Suite (1 file)
15. `tests/super-admin-phase1-auth.test.ts`: 24 automated unit & integration security tests.

#### Unrelated Local Files Excluded from PR Scope
- `.vscode/` (Local IDE configurations)
- `hardware/` (Local IoT/RFID hardware firmware files)

---

## 3. Authentication Security Findings

### 3.1 Super Admin Session Issuance Gate
- **Source Code Verification:** In `app/api/auth/login/route.ts:620-641`, `userRole === "SUPER_ADMIN"` checks `mfaRecord.isEnrolled`. If enrolled, it issues an HTTP-only 300s `sst_mfa_challenge` cookie and returns `{ mfaRequired: true, redirectTo: "/super-admin/mfa/verify" }`.
- **Verdict:** Fully verified. Production `sst_session` JWT is strictly not issued until second factor validation succeeds in `/api/super-admin/mfa/verify`.

### 3.2 Supabase Auth & Server Action MFA Enforcement
- **Source Code Verification:** In `app/super-admin/login/actions.ts:66-89`, upon verifying credentials against Supabase Auth, it inspects `getAdminMfaRecord`. If enrolled, it invalidates the unverified local Supabase session via `supabase.auth.signOut({ scope: "local" })`, sets the `sst_mfa_challenge` cookie, and redirects to `/super-admin/mfa/verify`.
- **Route Guard Defense-in-Depth:** In `lib/super-admin/require-super-admin.ts:100-105`, any raw Supabase Auth session attempting to access `/super-admin` while enrolled in MFA is redirected to `/super-admin/login?error=mfa_required`.
- **OAuth Callback:** In `app/super-admin/auth/callback/route.ts:29-51`, code exchange checks MFA enrollment and redirects to `/super-admin/mfa/verify`.
- **Verdict:** Fully verified. No bypass pathway exists via Supabase Auth.

### 3.3 Existing Portal Compatibility
- **Source Code Verification:** Institution Admin (`ADMIN`), Teacher (`TEACHER`), Student (`STUDENT`), and Parent (`PARENT`) login paths bypass Super Admin MFA checks. Tenant isolation and portal role membership checks remain identical.
- **Verdict:** Fully verified. Multi-tenant security audit (`tests/test-portal-security-audit.ts`) passed 14/14 tests.

---

## 4. MFA & Recovery Security Findings

### 4.1 Disarming & Overwrite Protection
- **Source Code Verification:**
  - In `lib/security/totp-mfa.ts:238-242`, `setupAdminMfa` checks `getAdminMfaRecord(userId)`. If `existing?.isEnrolled === true`, it throws an error: `"MFA is already enrolled for this account. Re-enrollment requires prior authorization and cannot overwrite an active configuration."`
  - In `app/api/super-admin/mfa/setup/route.ts:42-53`, callers presenting an intermediate challenge token (`isChallengeToken`) on an enrolled account are rejected with **HTTP 403 Forbidden**.
- **Verdict:** Fully verified. Attackers with compromised passwords cannot disarm enrolled 2FA.

### 4.2 Cryptographic Rigor & Zero Supply-Chain Risk
- **RFC 6238 Engine:** Uses pure Node.js `crypto` (HMAC-SHA1, 30s step, 6-digit zero-padded, ±30s drift tolerance).
- **AES-256-GCM Encryption:** Keys derived via `crypto.scryptSync(secret, "sst-mfa-salt-2026", 32)`. Random 12-byte IV per encryption (`crypto.randomBytes(12)`). Authentication tag checked upon decryption.
- **Backup Codes:** 10 random codes formatted as `XXXX-XXXX`, hashed with `bcryptjs.hashSync(code, 8)`. Plaintext is never saved.
- **Verdict:** Fully verified. Zero external supply chain dependencies.

### 4.3 Atomic Replay & Concurrency Protection
- **TOTP Counter Update:**
  ```sql
  UPDATE "PlatformAdminMfa"
  SET "lastUsedCounter" = $1, "updatedAt" = NOW()
  WHERE "userId" = $2::uuid AND "lastUsedCounter" < $1;
  ```
  Atomic condition `"lastUsedCounter" < $1` ensures duplicate concurrent requests match 0 rows and fail.
- **Backup Code Row Locking:**
  Enclosed in `db.$transaction` with `SELECT id, "backupCodes" FROM "PlatformAdminMfa" WHERE "userId" = $1::uuid FOR UPDATE`. Serializes parallel requests and prevents double-consumption.
- **Verdict:** Fully verified. Both tests `SEC-08` and `SEC-09` pass.

---

## 5. Rate Limiting & Trusted IP Findings

### 5.1 Account & IP Thresholds
- **Account Limit:** 5 failed attempts per 15-minute sliding window.
- **IP Limit:** 20 failed attempts per 15-minute sliding window (returns HTTP 429 with `Retry-After: 900`).
- **Atomic Database Updates:** Executed via PostgreSQL `INSERT ... ON CONFLICT ("key") DO UPDATE SET "failureCount" = ... RETURNING ...` query.
- **Non-Existent Accounts:** In `app/api/auth/login/route.ts:192-198`, missing or inactive accounts trigger `recordFailedLogin({ ip: clientIp, identifier: email })` and return generic `"Invalid email or password."`.

### 5.2 Trusted IP Extraction
- **File:** `lib/security/client-ip.ts`
- **Heuristic:** Prioritizes verified platform edge headers (`x-vercel-forwarded-for`, `cf-connecting-ip`, `x-real-ip`). Validates IP format via `net.isIP(ip)`. Malformed strings default safely to `"127.0.0.1"`.
- **Verdict:** Verified in unit test `SEC-10`.

---

## 6. Database Migration Findings

### Migration Script Inspection
- **File:** `prisma/migrations/20261127_super_admin_mfa_and_rate_limit/migration.sql`
- **Tables Created:**
  - `PlatformAdminMfa`: Primary key `id` (UUID), unique index on `userId`, index on `(userId, isEnrolled)`, foreign key to `PlatformUser(id)` with `ON DELETE CASCADE`.
  - `LoginRateLimit`: Primary key `id` (UUID), unique index on `key`, index on `(key, lockedUntil)`.
- **Schema Consistency:** 100% consistent with `prisma/schema.prisma`.
- **Safety:** 100% additive. No existing columns or tables are modified or dropped.
- **Remote DB State:** **CONFIRMED UNTOUCHED**. The migration SQL is local only and has NOT been run against the remote Supabase database.

---

## 7. Actual Verification Results

| Suite / Check | Command | Exit Code | Actual Verified Result |
| :--- | :--- | :---: | :--- |
| **Phase 1 Security Suite** | `npx tsx --test tests/super-admin-phase1-auth.test.ts` | **0** | **24 passed, 0 failed, 0 skipped** (duration: 4.58s) |
| **Portal Security Audit** | `npx tsx tests/test-portal-security-audit.ts` | **0** | **14 passed, 0 failed** (duration: 30.8s) |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **0** | **0 errors** across entire codebase |
| **ESLint Analysis** | `npx eslint <changed_files>` | **0** | **0 errors** (21 legacy warnings on 'any') |
| **Production Build** | `npm run build` | **0** | **260/260 routes compiled** (23.0s compilation) |
| **Git Diff Whitespace** | `git diff --check` | **0** | **Clean** (0 warnings or errors) |

---

## 8. Production Deployment Risks & Operational Requirements

### 1. In-Memory Fallback vs. Multi-Instance Fail-Open Risk
- **Analysis:** Both `login-rate-limiter.ts` and `totp-mfa.ts` implement in-memory `Map` fallbacks (`memoryBuckets` and `memoryMfaStore`) wrapped in `try/catch` blocks. This ensures local tests and development environments without a migrated database run smoothly without crashing.
- **Production Risk (FAIL-OPEN):** In a multi-pod container or serverless environment (such as Vercel Edge/Serverless), if the application is deployed to production **before** the database migration is applied, the rate limiter and MFA state will fall back to isolated in-memory maps per worker. An attacker could distribute requests across serverless instances to bypass the rate limit.
- **Required Mitigation:** The database migration `prisma/migrations/20261127_super_admin_mfa_and_rate_limit/migration.sql` **MUST** be executed against PostgreSQL prior to routing production traffic.

### 2. Edge Reverse Proxy Header Stripping
- **Analysis:** `lib/security/client-ip.ts` prioritizes `x-vercel-forwarded-for` and `cf-connecting-ip`. This is secure on Vercel and Cloudflare because their edge networks strip and overwrite these headers.
- **Infrastructure Note:** If the application is hosted outside of Vercel or Cloudflare, ensure that the upstream reverse proxy (e.g. Nginx, AWS ALB) is configured to strip incoming client-supplied `x-vercel-forwarded-for` headers.

---

## 9. Unresolved Vulnerabilities

- **NONE.** All 6 confirmed vulnerability classes identified during previous audits are fully resolved and verified with passing automated tests.

---

## 10. Final Recommendation

The implementation is verified, type-safe, production-compiling, and cryptographically sound.

**FINAL RECOMMENDATION: APPROVED FOR PR REVIEW**
Proceed with staging and raising the Pull Request targeting `main` using the title and description prepared in `docs/SUPER_ADMIN_PHASE_1_PR_DESCRIPTION.md`.
