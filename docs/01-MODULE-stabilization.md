# Module 0 (01): Stabilization & Security Hardening (P0 — fix before/alongside new work)

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
18 verified issues from a full codebase audit — highest priority, several are security-critical, do first.

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
- [ ] Fix Testing.md to document the real `db:seed:demo` command and actual demo data behavior
- [ ] Fix all sidebar route prefixes and the three specific broken links (invoices detail, receipts-new, leases-new); add a real Settings page or remove the link until Core Platform's settings UI exists
- [ ] Fix Accountant role nav visibility so parent/child items are consistent
- [ ] Remove `billingApi` from `frontend/lib/api.ts`; confirm no remaining references; confirm `/finance/*` covers the same functionality
- [ ] Replace hardcoded dashboard stats with real API calls (reuse existing invoice/payment/unit endpoints even before the full Reports module exists)
- [ ] Fix rent-receipt form to call a real create-receipt mutation with loading/error states and visible success confirmation
- [ ] Finish the receipt invoice-selection TODO stub
- [ ] Restrict CORS in `backend/src/main.ts` to an explicit, environment-driven allowlist
- [ ] Move JWT off `localStorage` to httpOnly cookies (or another XSS-resistant pattern); update the Axios client accordingly
- [ ] Add password reset flow, basic MFA (TOTP recommended), session revocation, and rate limiting on auth endpoints
- [ ] Audit every controller for missing `@UseGuards` / role checks / DTO validation; fix systematically, not just the ones already flagged
- [ ] Wire `logAction()` into every create/update/delete on tenant data, starting with money-related actions (invoices, payments, receipts) and auth events (login, role change)
- [ ] Add `.gitattributes` to normalize line endings and stop the CRLF diff noise
- [ ] Stand up a minimal CI pipeline (lint + existing tests) and add test coverage for at least the auth flow and one full CRUD module as a pattern for future modules to follow

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
