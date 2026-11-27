# SST-ERP – Super Admin Portal UI/UX Audit Report

- **Document**: `SUPER_ADMIN_PORTAL_UI_UX_AUDIT_REPORT.md`
- **Project**: SST-ERP – Multi-Institution ERP & LMS
- **Module**: Super Admin Portal
- **Audit Type**: UI/UX Source-Code Audit
- **Branch**: `main`
- **Report Status**: Audit completed – corrections required

---

## 1. Executive Summary

A source-code-level UI/UX audit was conducted on the SST-ERP Super Admin Portal to identify usability issues, inconsistencies, missing interface behaviours, and areas requiring improvement.

The audit covered:
- **21 Super Admin pages** across platform administration and dynamic sections.
- **Authentication callback** and session redirection workflows.
- **8 shared subscription-related destinations**.
- **47 relevant files inventoried**.
- **27 files examined in detail**.

### Summary of Findings:
- **High Severity**: 3 issues
- **Medium Severity**: 4 issues
- **Total Source-Confirmed Findings**: **7 findings** (`SUI-001` through `SUI-007`)

The purpose of this report is to provide the development team with clear implementation requirements so that the Super Admin Portal can be corrected without affecting other portals or existing ERP functionality.

---

## 2. Audit Scope

The audit focused on the following key operational areas:

| Area | Audit Coverage |
| :--- | :--- |
| **Navigation** | Sidebar layout, collapsible behavior, menu structure, and sub-navigation links. |
| **Dashboard** | Analytics presentation, chart scaling, SVG viewport responsiveness, and metric cards. |
| **Institutions** | Institution listing, registration disclosure forms, and input validation. |
| **Institution Details** | Institutional status actions, division creation, and destructive action safeguards. |
| **Subscription** | Navigation alignment between Super Admin billing and shared `/subscriptions` routes. |
| **Authentication** | Login callback redirection, query parameter retention, and error feedback. |
| **UI Consistency** | Layout styling, typography, component reuse, and stylesheet boundaries. |
| **User Experience** | Loading states, empty state messages, form submission feedback, and error visibility. |
| **Responsive Design** | Desktop, tablet, and mobile breakpoints across complex analytical grids. |

> **Important**: This was a static source-code audit. Browser testing, runtime testing, live API calls, and database operations were not performed.

---

## 3. Findings and Required Corrections

### SUI-001: Broken Subscription Sub-Navigation in Super Admin Shell
- **Severity**: **High**
- **Affected File**: `components/super-admin/super-admin-shell.tsx` (Lines 25–34, 62–71)
- **Problem Description**:
  When a Super Admin navigates to `/subscriptions`, the sidebar displays a secondary `Subscription management` navigation menu (`subscriptionNavigation`). However, every item in this menu points to dead in-page hash anchors (e.g. `/subscriptions#billing-overview`, `/subscriptions#plan-management`, `/subscriptions#institution-subscriptions`, `/subscriptions#payments-transactions`, `/subscriptions#invoices-receipts`, `/subscriptions#renewals-upgrades`, `/subscriptions#revenue-reports`).
  
  In the actual application router (`app/subscriptions/`), these destinations are implemented as dedicated sub-routes:
  - `/subscriptions` (Overview)
  - `/subscriptions/plans`
  - `/subscriptions/institutions`
  - `/subscriptions/payments`
  - `/subscriptions/invoices`
  - `/subscriptions/renewals`
  - `/subscriptions/reports`
  - `/subscriptions/settings`
  
  Because `/subscriptions/page.tsx` does not render all sections into a single scrollable page with those anchor IDs, clicking any of these sidebar links leaves the user stuck on the overview page without navigating.
- **Root Cause**:
  `subscriptionNavigation` was coded with placeholder anchor hashes instead of mapping directly to the actual Next.js App Router sub-paths in `app/subscriptions/*`.
- **Required Correction**:
  1. Update `subscriptionNavigation` in `components/super-admin/super-admin-shell.tsx` to link directly to the verified routes:
     - "Overview" $\rightarrow$ `/subscriptions`
     - "Subscription Plans" $\rightarrow$ `/subscriptions/plans`
     - "Institutions" $\rightarrow$ `/subscriptions/institutions`
     - "Payments & Transactions" $\rightarrow$ `/subscriptions/payments`
     - "Invoices & Receipts" $\rightarrow$ `/subscriptions/invoices`
     - "Renewals & Upgrades" $\rightarrow$ `/subscriptions/renewals`
     - "Revenue & Reports" $\rightarrow$ `/subscriptions/reports`
     - "Settings" $\rightarrow$ `/subscriptions/settings`
  2. Ensure the active item highlighting (`sa-nav-item-active`) marks the correct sub-route when on these pages.

---

### SUI-002: Authentication Callback Drops Error Context and Restricts Valid Sub-Paths
- **Severity**: **High**
- **Affected Files**:
  - `app/super-admin/auth/callback/route.ts` (Lines 7–14)
  - `app/super-admin/login/page.tsx` (Lines 1–5)
- **Problem Description**:
  1. **Lost Error Context**: When authentication code exchange fails, `auth/callback/route.ts` redirects to `/super-admin/login?error=auth_callback`. However, `app/super-admin/login/page.tsx` consists solely of an unconditional redirect `redirect("/login?role=super-admin")`. This drops the `error` query parameter entirely, so the user lands on the generic login page with no indication that their authentication callback failed.
  2. **Restrictive Destination Whitelist**: In line 8 of `auth/callback/route.ts`, the destination validation logic checks:
     ```ts
     const destination = next?.startsWith("/super-admin/") && !next.startsWith("//") ? next : "/super-admin";
     ```
     If the parameter `next` is `/super-admin` (without a trailing slash) or points to `/subscriptions` (which Super Admins manage), `next.startsWith("/super-admin/")` evaluates to `false` and forces a fallback to `/super-admin`, stripping the user's intended target page.
- **Root Cause**:
  Hardcoded redirect path checks in `route.ts` and missing query parameter forwarding in `login/page.tsx`.
- **Required Correction**:
  1. Update destination validation to allow valid platform destinations:
     ```ts
     const destination = next && (next === "/super-admin" || next.startsWith("/super-admin/") || next.startsWith("/subscriptions")) && !next.startsWith("//") ? next : "/super-admin";
     ```
  2. Forward incoming query search parameters (including `error`) in `app/super-admin/login/page.tsx` to `/login`:
     ```tsx
     export default async function SuperAdminLoginPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
       const params = await searchParams;
       const query = new URLSearchParams({ role: "super-admin" });
       if (params.error) query.set("error", String(params.error));
       redirect(`/login?${query.toString()}`);
     }
     ```

---

### SUI-003: Institution Creation Form Discards Validation Feedback on Collapse & Hardcodes Default Password
- **Severity**: **High**
- **Affected File**: `components/super-admin/create-institution-form.tsx` (Lines 26–28, 64–67)
- **Problem Description**:
  1. **Concealed Error / Success Messages**: The institution creation form is wrapped in a native `<details className="sa-card sa-form-disclosure">` element. When the form is submitted and server-side validation returns an error (`state.error`) or success message (`state.success`), page re-renders or summary clicks can leave the disclosure closed, hiding critical feedback from the administrator.
  2. **Hardcoded Insecure Default Password**: Line 64 contains a static default password in the input attribute:
     ```tsx
     <input name="adminPassword" type="password" required minLength={6} placeholder="Min 6 characters" defaultValue="Password@123" />
     ```
     Pre-filling `"Password@123"` creates security vulnerabilities where administrators bypass setting unique credentials. Additionally, there is no password visibility toggle, password generation helper, or client-side strength indicator.
- **Root Cause**:
  Uncontrolled `<details>` disclosure state and hardcoded default credential string in client JSX.
- **Required Correction**:
  1. Control the `<details>` component open state with React state (`open={isOpen}`) and automatically force it open when `state.error` or `state.success` is present.
  2. Remove the static `defaultValue="Password@123"`. Provide an optional "Generate Strong Password" action button and an eye toggle to show/hide the entered password.
  3. Reset the form fields cleanly when `state.success` is received.

---

### SUI-004: Dashboard Analytics Line Chart Scaling and Viewport Responsiveness Issues
- **Severity**: **Medium**
- **Affected File**: `components/super-admin/dashboard-analytics.tsx` (Lines 15–22, 42–50)
- **Problem Description**:
  1. **Double Scaling Distortion**: In `LineChart`, the data passed into `chartPoints` is pre-divided by `max`:
     ```tsx
     const points = chartPoints(data.map((point) => point[item.key] / max), 760, 220, 28);
     ```
     However, inside `chartPoints`:
     ```tsx
     const max = Math.max(1, ...values);
     y: height - padding - (value / max) * (height - padding * 2)
     ```
     Because `values` are already between 0 and 1, the inner `max` calculation is redundant and susceptible to rounding errors when series are toggled.
  2. **Fixed SVG Coordinates & Mobile Tooltip Clipping**: The SVG element uses a fixed `viewBox="0 0 760 250"`. On viewports under 768px, horizontal label spacing (`sa-chart-x-labels`) becomes cramped or overlaps. Furthermore, the tooltip percentage positioning calculation (`Math.min(82, Math.max(12, ...))`) causes clipping on narrow screens when hovering over end data points.
- **Root Cause**:
  Hardcoded coordinate math and lack of responsive SVG scaling / CSS container queries for chart legends and tooltips.
- **Required Correction**:
  1. Refactor `chartPoints` to take absolute series values and compute coordinate normalization once.
  2. Add responsive CSS for `.sa-line-chart-wrap` and `.sa-chart-x-labels` to skip intermediate labels on mobile viewports.
  3. Implement boundary-safe tooltip positioning using CSS translate or floating-ui coordinates.

---

### SUI-005: Institution Details Management Actions Lack Confirmation Dialogs and Destructive Safeguards
- **Severity**: **Medium**
- **Affected File**: `app/super-admin/(protected)/institutions/[id]/page.tsx` (Lines 70–84, 136–163)
- **Problem Description**:
  High-impact administrative actions on the institution details page are rendered as bare submit buttons:
  - "Suspend institution" / "Activate institution" (`updateInstitutionStatus`)
  - "Archive institution" (`archiveInstitution`)
  - "Deactivate division" (`updateInstitutionDivisionStatus`)
  - "Archive division" (`archiveInstitutionDivision`)
  
  None of these actions feature a confirmation modal, confirmation prompt, or double-check guard. An accidental click on "Archive institution" immediately archives the tenant and cuts off portal access for all associated users. Furthermore, form submit buttons lack inline loading spinners during action execution.
- **Root Cause**:
  Direct HTML `<form action={...}>` bindings without client-side confirmation dialogs or pending-state indicators.
- **Required Correction**:
  1. Create a client-side confirmation wrapper or modal component for destructive actions (`archiveInstitution`, `updateInstitutionStatus`, `archiveInstitutionDivision`).
  2. Require typing the institution or division name to confirm archival of active production tenants.
  3. Provide `useFormStatus` pending states on all action buttons.

---

### SUI-006: Dynamic Module Generic Table Lacks Cell Truncation and Encounters Character Encoding Glitches
- **Severity**: **Medium**
- **Affected File**: `app/super-admin/(protected)/[section]/page.tsx` (Lines 140–155, 179–181)
- **Problem Description**:
  1. **Horizontal Table Overflow**: In `SuperAdminModulePage`, all data rows are rendered in a generic HTML table (`sa-table`). In modules such as `audit-logs` (Request IDs, User-Agent strings), `settings` (JSON configuration payloads), and `domains` (DNS TXT challenge tokens), long unstructured strings push adjacent columns off-screen, breaking layout consistency.
  2. **Character Encoding Artifacts (Mojibake)**: Lines 144 and 150 contain corrupted character sequences in source code:
     ```tsx
     Request: entry.requestId ?? "â€”"
     Description: item.description ?? "â€”"
     ```
     These render as visible visual artifacts (`â€”`) in the UI instead of a clean em-dash (`—`).
- **Root Cause**:
  Missing CSS `max-width` and `text-truncate` rules on generic table cells, and UTF-8 encoding corruption during previous file edits.
- **Required Correction**:
  1. Replace corrupted `â€”` sequences with clean UTF-8 em-dashes `—` or standard hyphens `-`.
  2. Add utility classes `.sa-cell-truncate` with `max-width: 200px; text-overflow: ellipsis; white-space: nowrap;` and a tooltip or copy-to-clipboard action for long identifiers (such as DNS verification tokens and UUIDs).

---

### SUI-007: Inconsistent Styling & Disjointed Design Paradigms Across Portal Boundaries
- **Severity**: **Medium**
- **Affected Files**:
  - `app/super-admin/super-admin.css`
  - `app/subscriptions/subscriptions.css`
- **Problem Description**:
  The Super Admin Portal relies on a custom, isolated stylesheet (`super-admin.css`) defining bespoke CSS custom properties (`--sa-teal`, `--sa-navy`, `--sa-gold`, `--sa-background`). Conversely, the shared subscription workspace (`app/subscriptions/`) utilizes `subscriptions.css` and Tailwind CSS utility classes.
  
  When an administrator navigates between `/super-admin` and `/subscriptions`, noticeable UI jarring occurs:
  - Button corner radiuses change from `6px` (`super-admin.css`) to `8px`/`12px` (Tailwind standard).
  - Typography weights, table border colors, and card shadow elevations differ abruptly.
  - Form input heights and focus ring colors diverge between the two portals.
- **Root Cause**:
  Split CSS architectures without a centralized design token mapping between Super Admin and Subscriptions.
- **Required Correction**:
  1. Harmonize color tokens and spacing variables between `super-admin.css` and `subscriptions.css`.
  2. Align base UI tokens (font stack, border radiuses, button heights, table header styles) with the SST-ERP corporate design language (`#123B5A`, `#F5A000`, neutral slate borders).

---

## 4. Implementation and Verification Requirements

The development team must ensure that:
1. All identified **High-severity issues (`SUI-001`, `SUI-002`, `SUI-003`)** are resolved first.
2. **Medium-severity issues (`SUI-004`, `SUI-005`, `SUI-006`, `SUI-007`)** are addressed subsequently.
3. Existing Super Admin authentication, role validation (`requireSuperAdmin`), and tenant security remain intact.
4. Changes do not break shared subscription pages or APIs (`/api/subscriptions/*`).
5. Existing institution onboarding and provisioning functionality continues to operate seamlessly.
6. Navigation links and page layouts remain completely responsive.

---

## 5. Files and Areas Requiring Attention

| Component / File Path | Architectural Area | Findings Addressed |
| :--- | :--- | :---: |
| `components/super-admin/super-admin-shell.tsx` | Super Admin navigation and sidebar layout | `SUI-001` |
| `app/super-admin/auth/callback/route.ts` | Login callback & URL whitelist | `SUI-002` |
| `app/super-admin/login/page.tsx` | Super Admin login redirection & error forwarding | `SUI-002` |
| `components/super-admin/create-institution-form.tsx` | Institution creation disclosure form & password safety | `SUI-003` |
| `components/super-admin/dashboard-analytics.tsx` | SVG chart scaling & responsive tooltips | `SUI-004` |
| `app/super-admin/(protected)/institutions/[id]/page.tsx` | Institution details & destructive action safeguards | `SUI-005` |
| `app/super-admin/(protected)/[section]/page.tsx` | Dynamic module data tables & UTF-8 character encoding | `SUI-006` |
| `app/super-admin/super-admin.css` & `app/subscriptions/subscriptions.css` | Global styling, typography & design token harmonization | `SUI-007` |

---

## 6. Team Implementation Instructions

The engineering team must adhere to the following rules:
- **Do not rewrite existing modules unnecessarily**: Make surgical, backward-compatible repairs to components.
- **Do not remove working functionality**: Preserve existing server actions (`app/super-admin/[section]/actions.ts` and `institutions/actions.ts`).
- **Do not introduce duplicate components**: Reuse existing shared components (`BrandLoadingScreen`, `Button`, `Modal`) where appropriate.
- **Follow existing authentication patterns**: Never bypass `requireSuperAdmin()`.
- **Maintain tenant isolation**: Ensure Super Admin operations never corrupt multi-tenant partition boundaries.
- **Avoid modifying Student, Parent, or Teacher portals**: Keep all changes confined to `app/super-admin/`, `components/super-admin/`, and shared `app/subscriptions/` views.

---

## 7. Testing Requirements

After implementation, verify the following test matrix:

| Test Area | Expected Result | Verification Status |
| :--- | :--- | :---: |
| **Subscription Sidebar Links** | Clicking any item in `subscriptionNavigation` opens the exact `/subscriptions/*` route with active indicator. | To be verified in browser |
| **Auth Callback Error Handling** | OAuth callback failures redirect to `/login?role=super-admin&error=auth_callback` with visible error banner. | To be verified in browser |
| **Auth Callback Destination** | Logging in with `next=/subscriptions` redirects properly to the subscriptions workspace. | To be verified in browser |
| **Institution Creation Form** | Form remains open on error; displays validation feedback; does not pre-fill static passwords. | To be verified in browser |
| **Dashboard Analytics Charts** | Line chart points render accurately; SVG scales cleanly on mobile/tablet screens without clipping. | To be verified in browser |
| **Destructive Actions Safety** | Archiving or suspending an institution/division prompts a confirmation dialog before submission. | To be verified in browser |
| **Module Data Tables** | Table cells truncate long tokens gracefully; em-dashes render cleanly without Mojibake artifacts. | To be verified in browser |
| **Design Consistency** | Visual styling between Super Admin and Subscriptions appears unified and cohesive. | To be verified in browser |

---

## 8. Audit Limitations

- This report is based on static source-code inspection.
- The following were not performed:
  - Browser-based UI automation testing.
  - Live third-party API verification (Razorpay, DNS resolution).
  - End-to-end database load testing.
- The development team must perform runtime verification in their local development environment before production release.

---

## 9. Expected Outcome

After resolving all seven findings, the Super Admin Portal will deliver:
1. **Predictable & Functional Navigation**: Direct, accurate routing across all subscription and platform administration pages.
2. **Robust Error Visibility**: Proper retention and display of authentication and form validation feedback.
3. **Safe Platform Operations**: Modal confirmation safeguards on destructive institution actions.
4. **Responsive Analytics**: Responsive, visually accurate growth and revenue visualization charts.
5. **Clean Data Presentation**: Truncated table columns without layout breakage or character corruption.
6. **Harmonious Visual Styling**: Consistent design token alignment across the entire platform console.

---

*Report filed locally in `docs/SUPER_ADMIN_PORTAL_UI_UX_AUDIT_REPORT.md`.*
