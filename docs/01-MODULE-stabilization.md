# Module 0 (01): Stabilization & Security Hardening (P0 — fix before/alongside new work)

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
18 verified issues from a full codebase audit — highest priority, several are security-critical, do first.
**Session 2026-10-03 (backend/DB pass):** auth cookie flow fully wired and smoke-tested; dead `src/auth` duplicate removed; backend build broken-state fixed (see Change Log below); catch-up migration `add_password_reset_fields` created + applied; seed now produces the full demo dataset; `Testing.md` reconciled; tenant-isolation hardening in progress (see checklist marks).
**Session 2026-10-03 (backend API pass — frontend unblock):** `GET /dashboard/stats` endpoint built (DashboardModule) and live-verified for both tenants; `PATCH /finance/invoices/:id` added; `GET /finance/receipts?category=` filter added; cross-tenant `GET /:id` now 404s instead of returning 200 + empty body (was leaking existence + would break detail pages) — fixed across all 10 tenant services via `requireRecord()` in `common/utils.ts`. tsc clean, jest green, live smoke-tested (see Change Log).

## Module Goal
Resolve the verified inconsistencies, dead code, broken navigation, and security gaps between the current implementation and a safe, coherent baseline, before layering new modules on top.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- **Navigation:** sidebar links (`frontend/components/layout/sidebar.tsx:33-73`) omit `/dashboard` prefix on several routes; Settings link has no page; Accountant role hidden from Properties parent nav while its child route stays reachable (inconsistent role-based nav).
- **Broken detail links:** Invoices list links to a nonexistent detail page (`frontend/app/(dashboard)/finance/invoices/page.tsx:21`); Receipts-new links to `/dashboard/receipts` instead of `/dashboard/finance/receipts` (`frontend/app/(dashboard)/finance/receipts/new/page.tsx:133,397`); Leases-new link is broken (`frontend/app/(dashboard)/leases/page.tsx:268`).
- **Dead/incomplete code:** legacy `billingApi` in `frontend/lib/api.ts:232-310` targets nonexistent `/billing/*` endpoints (working API is `/finance/*`); dashboard stats/charts are hardcoded (`frontend/app/(dashboard)/dashboard/page.tsx:19-52,69-105`); rent-receipt form only logs to console, never persists (`frontend/app/(dashboard)/finance/rent-receipts/new/page.tsx:96-107`); receipt invoice selection is an unfinished TODO stub (`frontend/app/(dashboard)/finance/receipts/new/page.tsx:342`).
- **Security gaps (verified, treat as P0):** CORS is wildcard/unrestricted (`backend/src/main.ts:27-33`); JWT stored in `localStorage` (XSS token-theft risk); no password reset, no MFA, no session revocation, no auth rate limiting; RBAC not enforced granularly at controller/DTO level; `AuditLog` model + `logAction()` service exist (`backend/src/modules/audit/audit.service.ts:9`) but `logAction` is never actually called anywhere — no real audit trail exists today despite the model.
- **Process/hygiene:** `Testing.md:9-18` documents `npx prisma db seed`, but the real path is `db:seed:demo` against `backend/src/prisma/demo-data.ts:738-818`; ~188 modified paths in the working tree are almost entirely CRLF noise (only `backend/package-lock.json` has real drift) — no `.gitattributes` exists; only 3 test specs exist in the whole project, no frontend tests, no CI/CD, no Docker, no OpenAPI docs; a prior roadmap doc was deleted in commit `6e4892b` (this doc set replaces it).

## Scope / Sub-modules
- Documentation reconciliation (fix Testing.md against real seed commands)
- Frontend routing fixes (sidebar prefixes, missing Settings page, broken detail links, role-based nav consistency)
- Dead code removal (legacy billingApi, TODO stubs)
- Wire dashboard to real backend data (minimal version; full Reports module is separate)
- Fix rent-receipt persistence and receipt invoice-selection stub
- Security hardening: CORS allowlist, move off localStorage JWT, password reset, MFA, session revocation, rate limiting, granular RBAC enforcement
- Wire `AuditLog`/`logAction()` into real create/update/delete operations
- Repo hygiene: `.gitattributes`, real tests, CI pipeline, Docker, basic API docs

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Core Platform, Finance & Accounting

## Tasks Checklist
- [x] Fix Testing.md to document the real `db:seed:demo` command and actual demo data behavior — done 2026-10-03: `seed.ts` now calls `seedDemoData()` (exported from `demo-data.ts`), so `npx prisma db seed` produces super admin + Westhill/Rohi orgs + full Rohi demo dataset; Testing.md rewritten to match (Rohi holds the data, Westhill is the empty sandbox org)
- [~] Fix all sidebar route prefixes and the three specific broken links (invoices detail, receipts-new, leases-new); add a real Settings page or remove the link until Core Platform's settings UI exists — invoices detail link now points to `/dashboard/finance/invoices/[id]` (the `[id]` detail page itself is still missing — frontend task); receipts-new + leases-new links fixed; Settings page now exists; **remaining:** sidebar `/organizations` and `/landlords` links still lack the `/dashboard` prefix
- [x] Fix Accountant role nav visibility so parent/child items are consistent — Properties parent and its children now consistently exclude ACCOUNTANT (verified in `sidebar.tsx`)
- [x] Remove `billingApi` from `frontend/lib/api.ts`; confirm no remaining references; confirm `/finance/*` covers the same functionality — verified gone, no `/billing` references remain
- [~] Replace hardcoded dashboard stats with real API calls — **backend done 2026-10-03:** `GET /dashboard/stats` (new `modules/dashboard/`) returns tenant-scoped `totals` (properties/landlords/units/activeTenants), `unitsByStatus`, `monthlyCharges` (last 6 months charged vs collected), `unitsByProperty` (top 7); live-verified for Rohi (100 properties / 2462 units / 1846 active tenants) and Westhill (empty → zeros). **Remaining (frontend):** wire `frontend/app/(dashboard)/dashboard/page.tsx` to this endpoint with loading/error states.
- [ ] Fix rent-receipt form to call a real create-receipt mutation with loading/error states and visible success confirmation — blocked on backend endpoint work (Receipt with `receiptCategory: Rent` + `ReceiptLine[]` already exists in schema; rent-receipts list derives from receipts client-side)
- [ ] Finish the receipt invoice-selection TODO stub — "Add Invoice" button in `receipts/new` still does nothing; invoice list is already loaded via `useFinance`
- [x] Restrict CORS in `backend/src/main.ts` to an explicit, environment-driven allowlist — `CorsAllowlistService` + `resolveAllowlist()` in place
- [x] Move JWT off `localStorage` to httpOnly cookies (or another XSS-resistant pattern); update the Axios client accordingly — done 2026-10-03: cookie set server-side on login (`auth_token`, httpOnly, SameSite=strict), `cookie-parser` enabled in `main.ts`, axios `withCredentials: true`, no `access_token` in responses, `frontend/types` `AuthResponse` updated, dead `src/auth` duplicate deleted
- [~] Add password reset flow, basic MFA (TOTP recommended), session revocation, and rate limiting on auth endpoints — **password reset done** (`/auth/forgot-password` + `/auth/reset-password`, hashed 30-min tokens, `users.resetPasswordToken/Expires` columns added via migration `20261003082158_add_password_reset_fields`); MFA, session revocation, and rate limiting still missing
- [x] Audit every controller for missing `@UseGuards` / role checks / DTO validation; fix systematically, not just the ones already flagged — all controllers have `JwtAuthGuard`, and granular `@Roles`/`RolesGuard` is now enforced on every controller (see Change Log 2026-10-03). Also `users.service.update/remove` and several others had invalid Prisma compound-where clauses (fixed)
- [x] Wire `logAction()` into every create/update/delete on tenant data, starting with money-related actions (invoices, payments, receipts) and auth events (login, role change) — global `AuditInterceptor` (`security/audit.interceptor.ts`) records all POST/PUT/PATCH/DELETE + LOGIN events; interceptor import/type bugs fixed and `SecurityModule` now imports `AuditModule` (was crashing boot). **Remaining:** `AuditLog` has no `organizationId` column, so audit queries can't be tenant-scoped
- [ ] Add `.gitattributes` to normalize line endings and stop the CRLF diff noise
- [ ] Stand up a minimal CI pipeline (lint + existing tests) and add test coverage for at least the auth flow and one full CRUD module as a pattern for future modules to follow

## Change Log (maintained per session — add an entry after every code/schema change)

### 2026-10-03 — backend API pass (frontend unblock)
- **Dashboard endpoint (new):** `GET /dashboard/stats` via new `modules/dashboard/` (controller + service + module, registered in `app.module.ts`). Tenant-scoped; returns `totals` (properties/landlords/units/activeTenants, soft-delete-aware), `unitsByStatus` (all 4 `UnitStatus` values, zero-filled), `monthlyCharges` (last 6 months, charged = non-DRAFT invoice `totalAmount` by `issueDate`, collected = payment `amount` by `paymentDate`), `unitsByProperty` (top 7 by unit count). No `@Roles` → all 5 roles (dashboard nav is shown to everyone). Live-verified: Rohi = 100/120/2462/1846; Westhill = zeros.
- **Invoice PATCH (new):** `PATCH /finance/invoices/:id` — all scalar invoice fields + status, landlord/rentalAgreement connect-or-disconnect, tenant-asserted via `assertTenantRecord`, returns full include. Invoice line items are not editable via PATCH yet (create-only) — flag if the invoice edit page needs them.
- **Receipts category filter:** `GET /finance/receipts?category=Rent|General|Refund` for the rent-receipts list (validated against the enum, ignored otherwise).
- **404 on missing/cross-tenant read-by-id (all 10 tenant services):** `findFirst` previously resolved to `null` → Nest answered **200 with an empty body**, leaking record existence across tenants and breaking detail pages. New `requireRecord()` helper in `common/utils.ts` wraps every tenant `findOne` (properties, units, landlords, tenants, rental-agreements, invoices, payments, receipts, moveouts) → throws 404. Verified live: Rohi admin GETs a Westhill invoice → 404; Westhill admin GETs own invoice → 200.
- **Schema debt documented (issue #25 in master doc):** `Unit` and all child/line models have no `organizationId` column; tenant scoping flows through the parent relation. Unit queries must filter `{ property: { organizationId } }` — filtering `Unit` by `organizationId` throws a Prisma validation error (this caused a 500 on the first dashboard implementation and was fixed).
- **Verified:** `tsc --noEmit` clean; jest 2/2 suites green; live smoke test: login (cookie), both-tenant stats, invoice create → PATCH PENDING→PAID, cross-tenant 404, receipts category filter.

### 2026-10-03 — backend/DB stabilization pass
- **Auth (P0):** merged the half-finished cookie-auth work (previously stranded in a dead `src/auth/` tree that didn't compile) into the live `modules/auth`: `login` now sets the `auth_token` httpOnly cookie and returns only `{ user }`; added `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/profile` now returns the full user + organization (frontend `User` contract) instead of the raw JWT payload; deleted `src/auth/`.
- **Backend build:** fixed broken imports in `security/audit.interceptor.ts` (wrong audit path, `CallHandler` typing) and `security/guards/public.guard.ts` (decorator path); `SecurityModule` now imports `AuditModule` (boot crash); installed `cookie-parser`; backend `tsc --noEmit` clean.
- **Schema/DB:** created + applied migration `20261003082158_add_password_reset_fields` (users: `resetPasswordToken`, `resetPasswordExpires` + index) — schema had drifted ahead of migrations.
- **Seed:** `seed.ts` now calls `seedDemoData()` so `npx prisma db seed` = super admin + demo orgs/users + full Rohi dataset (previously super admin only, with a dead `generateDemoData` import); `demo-data.ts` `main` exported as `seedDemoData`.
- **Tenant isolation:** `getTenantId` now throws 403 for non-super-admins without an organization (fail-closed, was silent no-filter); fixed invalid Prisma compound-where usage (`findUnique`/`update`/`delete` with `{ id, organizationId }`) in **all 10 module services** (properties, units, landlords, tenants, rental-agreements, invoices, payments, receipts, moveouts, users) via new shared helper `assertTenantRecord()` in `common/utils.ts`. Verified live: Rohi admin sees 100 properties, Westhill admin sees 0; Westhill property create lands in the Westhill org. Follow-up still open: `organizationId` columns are nullable on all tenant models (NOT NULL migration deferred — it changes the super-admin create contract, which currently relies on the client omitting the org).
- **RBAC:** new `@Roles` decorator (`common/decorators/roles.decorator.ts`) + global `RolesGuard` (`security/guards/roles.guard.ts`), registered after `PublicGuard` in `app.module.ts` (auth before roles). Matrix mirrors the sidebar's role visibility: properties/units/landlords/tenants/leases/moveouts writes = SUPER_ADMIN/ADMIN/PROPERTY_MANAGER; finance (invoices/payments/receipts) = SUPER_ADMIN/ADMIN/ACCOUNTANT (class-level, reads included); users = ADMIN/SUPER_ADMIN (+ user create now tenant-scoped); organizations + audit = platform/admin only. Live-verified: Property Manager → 403 on finance + users, Accountant → 403 on property writes but 200/201 on finance. This is name-based on the 5-role `UserRole` enum — the structured `Role.permissions` model is Module 1 (Core Platform) work.
- **Auth hygiene:** removed debug logging that printed JWT halves and reset tokens to the console.
- **CORS hang (critical latent bug):** `main.ts` passed the sync allowlist function directly to `enableCors({ origin })`; the cors package treats a function `origin` as async and waits for a callback that never fires — **every HTTP request to the API hung forever** (booted fine, but no route ever responded). Fixed with the callback form: `origin: (origin, cb) => cb(null, cors.isAllowed(origin))`.
- **Smoke-tested end-to-end (2026-10-03):** login sets httpOnly `auth_token` cookie, no token in body; `/auth/profile` returns full user + organization; tenant-scoped list/create verified for two tenants; `/auth/logout` clears the cookie; audit trail shows `LOGIN` + `CREATE | Propertie | <id>` entries.
- **Docs:** `Testing.md` rewritten to match actual seed behavior; master-doc Known Issues + schema doc updated below.

## Backend: NestJS Notes
- CORS config in `backend/src/main.ts` — use an env var for allowed origins, default to strict list, never `*` in non-local envs.
- JWT-in-localStorage fix requires coordinated frontend + backend change (cookie flags, CSRF consideration if moving to cookies) — plan both sides together, don't just change one.
- `logAction()` wiring: consider a NestJS interceptor to reduce per-service boilerplate, rather than manually adding a call to every service method.

## Frontend: Next.js Notes
- `frontend/lib/api.ts` — remove dead client code rather than leaving it alongside working code.
- `frontend/components/layout/sidebar.tsx` — all links must resolve under the actual `(dashboard)` route group prefix; see `00-UX-CROSS-CUTTING-STANDARDS.md` for the broader navigation/detail-page standard this module should bring the app up to.

## Acceptance Criteria
- Fresh clone + documented seed command produces the state Testing.md describes
- Every sidebar link and every table row link resolves to a real page (200, not 404)
- No references to `/billing/*` remain anywhere in the frontend
- Dashboard shows live numbers that change when underlying data changes
- Submitting the rent-receipt form creates a real, retrievable receipt; receipt invoice selection works
- CORS rejects requests from arbitrary origins in a non-local environment; JWT is not readable via `localStorage`/client-side JS
- A sensitive action (e.g. creating a payment, changing a user's role) produces a real, queryable AuditLog entry
- CI runs lint + tests on every push; `.gitattributes` eliminates CRLF-only diffs going forward

## Dependencies on Other Modules
- Blocks/should precede meaningful new work on every other module — this is Phase 0 in the Master doc's roadmap
