# TU Properties — Master Architecture & Agent Instructions

> **This is the entry point.** Read this file fully before touching any module doc. It applies to every module doc (`02-...md` through `20-...md`) and to `01-DATABASE-SCHEMA.md`. Every module doc is self-contained and re-states the critical rules below so a fresh session (after context loss / timeout) can resume from that single file — but this master doc is still where architectural decisions and current project state live.

---

## 0. MANDATORY FIRST STEPS FOR ANY AGENT (Kilo Code / OpenCode / Claude Code / other)

Before writing **any** code, in every session:

1. **Inspect the actual repository first.** This is an existing, partially-built project called **TU Properties**, not a greenfield build. Read:
   - `backend/src/prisma/schema.prisma` (source of truth for what's actually in the DB today — may have drifted from `01-DATABASE-SCHEMA.md`, which is the *target* schema)
   - `backend/src/` module folder structure (NestJS modules already present)
   - `frontend/app/(dashboard)/` route structure (Next.js pages already present)
   - `frontend/lib/api.ts` (existing API client — check for dead/legacy endpoints like `billingApi`)
   - `package.json` in both `backend/` and `frontend/`
   - Any `.md` docs already in the repo (e.g. `Testing.md`) — treat these as **possibly stale**, not authoritative. Verify against actual code before trusting them.
2. **Diff reality against the module doc's "Existing Coverage" section.** Every module doc contains a section describing what was known to exist as of the writing of these docs (see "Known Current State" below). Treat that section as a starting hint, not ground truth — the codebase may have moved on. Confirm by reading code.
3. **Never blindly recreate what exists.** If a table, endpoint, or page already exists and mostly works, your job is to **complete/fix/extend** it, not rewrite it from scratch, unless it's fundamentally broken.
4. **Never invent a different stack.** No Flask, no Express, no MongoDB, no switching ORMs. See Section 1.
5. Work module-by-module, in the sequence given in Section 4 (Build Roadmap), unless the user explicitly directs otherwise.

---

## 1. Fixed Technology Stack (non-negotiable)

| Layer | Technology |
|---|---|
| Backend framework | NestJS 11, TypeScript |
| ORM | Prisma 7 |
| Database | PostgreSQL (shared database, shared schema, `tenant_id`/`organizationId` column on every tenant-scoped table — see Section 2) |
| Auth | Passport JWT strategy, bcrypt for password hashing |
| Backend port | 3003 |
| Frontend framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS 4 |
| Frontend data | Axios (bearer-token client), TanStack Table, Recharts, React Hook Form, Zod |
| Frontend port | 3002 |
| Repo layout | Monorepo: `backend/` and `frontend/` as top-level apps (Nx/Turborepo tooling may be introduced for task orchestration, but do NOT restructure into `apps/`/`libs/` unless explicitly asked — the current split is `backend/` + `frontend/` at repo root) |
| Market specifics | Global market: multi-currency support, Stripe as primary payment gateway (extensible to regional methods), multi-tax-jurisdiction support |

Do not substitute any of the above. If a module doc's task list seems to imply a different tool, treat that as an error in the doc and default to this table.

---

## 2. Multi-Tenancy Strategy

**Shared database, shared schema.** Every tenant-scoped table carries an `organizationId` (uuid, FK to `Organization.id`, indexed, `NOT NULL` for tenant data).

Rules for every module doc / every new table:

- All Prisma models representing tenant data MUST include `organizationId String` with a relation to `Organization`, and an `@@index([organizationId])`.
- All NestJS services MUST filter every query by the authenticated user's `organizationId` (from the JWT payload) — never trust a client-supplied `organizationId`.
- Global tables that are NOT tenant-scoped (e.g. system-level lookup tables, the `Organization` table itself, platform-admin tables) must be explicitly marked as such in `01-DATABASE-SCHEMA.md`.
- Add a NestJS guard/interceptor pattern (if not already present) that injects `organizationId` from the authenticated request into repository/service calls, so it's structurally hard to forget the filter. Check `backend/src/` for whether this already exists before building a new one.
- Platform Super Admin (see Module 19, SaaS Administration) is the one role allowed to query across organizations, and only through explicitly separate admin endpoints — never by relaxing the tenant filter on normal endpoints.

---

## 3. Known Current State of TU Properties

**This section is now based on a full codebase audit performed by an AI coding agent (KiloCode) against the actual repo and cross-referenced with industry PMS benchmarks (AppFolio, Buildium, Propertyware, MRI, Yardi, Rent Manager), not just the owner's description. It is more reliable than the previous version of this doc, but agents must still re-verify against the live repo every session — code moves faster than docs.**

### 3.1 Honest maturity assessment

TU Properties today is a **CRUD-heavy internal admin MVP / prototype**, not yet a SaaS ERP. Specifically:

| Dimension | Estimated completeness |
|---|---|
| Data model completeness | ~60–70% of a basic PMS |
| Core CRUD UI | ~30–40% |
| End-to-end operational workflows | ~15–25% |
| SaaS ERP breadth/depth (vs. AppFolio/Buildium/etc.) | <15–20% |

Do not treat the module roadmap in Section 4 as "mostly built, just polish it." Most modules are **CRUD scaffolding with no workflow, no portal, and no integration behind them**, even where a Prisma model and a list/create page exist. Read each module doc's "Existing Coverage" carefully — it now distinguishes "model exists" from "workflow exists" from "actually works end-to-end."

### 3.2 What is real vs. what looks real

**Backend (NestJS 11 + Prisma 7 + PostgreSQL, port 3003) — 11 modules, CRUD-only:**
- Organizations, users, roles, properties, units, landlords, tenants, rental agreements, move-outs, invoices, payments, receipts, audit (model only) — all exist as Prisma models + basic CRUD controllers.
- Schema has **20 Prisma models** (`backend/src/prisma/schema.prisma` lines 17–905), including a number of fields that look like accounting/legacy carryover and are **not wired to any logic yet**: `acReceivable`, `incomeAccount`, `spotRate` on relevant models; `Property.mpesaPropertyPayNumber`; `Invoice.signOnEfims`; `Receipt.bankingDate`; `exemptAllSms`. **Do not delete these — they signal intended future functionality (GL account mapping, payment gateway config, local tax compliance, SMS opt-out) — but do not assume they mean the feature is built. Wire logic to them or extend them; don't duplicate them with new fields.**
- `AuditLog` model and `logAction()` service (`backend/src/modules/audit/audit.service.ts:9`) exist but **`logAction` is never called anywhere in the codebase**. Audit logging is effectively non-functional despite the model existing.
- Multi-tenant filtering via `getTenantId()` is used in queries, but tenant isolation is **not enforced consistently at the DTO/controller level** — treat this as a real security gap, not just a "verify" item.

**Frontend (Next.js 16 App Router, port 3002) — 24 routes (21 dashboard, 2 auth, 1 landing):**
- Only **list + create** pages exist for most entities. **No detail/edit pages, no row-action workflows, no status-transition UI, no bulk operations beyond delete, no exports, no saved views, no inline editing** anywhere in the app.
- Forms are large static field dumps, not guided workflows: `properties/new` (831 lines), `units/new` (609), `invoices/new` (615), `payments/new` (444), `receipts/new` (409), `rent-receipts/new` (362), `tenants/new` (430), `rental-agreements/new` (339). No conditional logic, autosave/draft, import templates, or bulk upload on any of them.
- `DataTable` / `ExpandableTable` components provide server-side pagination/filtering in places but lack row-action menus, drilldown, bulk actions, column config, inline edit, or export. Empty/error/loading states are inconsistent across pages.

### 3.3 Known Issues / Active Bugs (verified, with file references)

Treat these as **Module 0 — Stabilization** work. Fix before/alongside new module work where they'd otherwise block it (e.g. don't build new Finance features on top of the `/billing/` vs `/finance/` confusion without resolving it first).

**Navigation / broken links:**
1. Sidebar links (`frontend/components/layout/sidebar.tsx:33-73`) omit the `/dashboard` prefix for several routes; the Settings link has no page.
2. Invoice row links to a non-existent detail page: `frontend/app/(dashboard)/finance/invoices/page.tsx:21` (`Link href="/dashboard/invoices/${row.original.id}"`).
3. Receipts-new page links to `/dashboard/receipts` instead of the correct `/dashboard/finance/receipts`: `frontend/app/(dashboard)/finance/receipts/new/page.tsx:133,397`.
4. Leases-new link is broken: `frontend/app/(dashboard)/leases/page.tsx:268`.
5. Accountant role is hidden from the Properties parent nav item while its child route is still reachable/visible: `frontend/components/layout/sidebar.tsx:33-73` — inconsistent role-based nav.

**Dead / incomplete code:**
6. Dashboard stats/charts are hardcoded: `frontend/app/(dashboard)/dashboard/page.tsx:19-52,69-105` — not API-driven.
7. Rent-receipt creation form only logs the payload to console, never persists: `frontend/app/(dashboard)/finance/rent-receipts/new/page.tsx:96-107`.
8. Receipt invoice selection is an unfinished TODO stub: `frontend/app/(dashboard)/finance/receipts/new/page.tsx:342`.
9. Legacy `billingApi` targets nonexistent `/billing/*` endpoints; working API is under `/finance/*`: `frontend/lib/api.ts:232-310`.

**Security (treat as P0, not polish):**
10. CORS is wildcard/unrestricted: `backend/src/main.ts:27-33`.
11. JWT is stored in `localStorage` on the frontend — vulnerable to XSS token theft; move to httpOnly cookies or an equivalent safer pattern.
12. No password reset flow, no MFA, no session revocation, no rate limiting on auth endpoints.
13. RBAC is not enforced granularly at controller/DTO level — role checks are inconsistent (see Accountant nav bug above as a symptom of the same underlying gap).
14. `AuditLog` exists but is never actually written to — there is currently no real audit trail despite the model.

**Process / hygiene:**
15. `Testing.md:9-18` documents `npx prisma db seed`, but the actual seed path is `db:seed:demo` against `backend/src/prisma/demo-data.ts:738-818` — docs and reality don't match.
16. The working tree shows ~188 modified paths, but only `backend/package-lock.json` has substantive drift — the rest is CRLF normalization noise. **Add a `.gitattributes` file to fix line-ending handling** so future diffs are meaningful.
17. Only 3 test specs exist in the entire project (`backend/src/app.controller.spec.ts`, `backend/src/prisma/prisma.service.spec.ts`, `backend/test/app.e2e-spec.ts:19-23`). No frontend tests, no workflow/integration tests, no CI/CD pipeline, no Docker setup, no OpenAPI/API docs.
18. A prior implementation plan/roadmap doc was deleted in commit `6e4892b`, leaving no other product roadmap in the repo before this doc set — treat this doc set as the current roadmap of record.

### 3.4 Benchmark gaps (what a real PMS/ERP has that TU Properties doesn't yet)

Verified absent or partial against AppFolio/Buildium/Propertyware/MRI/Yardi/Rent Manager:

| Capability | TU Properties state |
|---|---|
| CRM / leads / listing syndication | ❌ Absent |
| Tenant portal | ❌ Absent |
| Owner/landlord portal | ❌ Absent |
| Accounting / general ledger | ❌ Absent (config fields exist, no engine) |
| Maintenance / work orders / inspections | ❌ Absent |
| Documents / e-signature | ❌ Absent |
| Communications (email/SMS/WhatsApp) | ❌ Absent |
| Automation / workflow / scheduler / webhooks | ❌ Absent |
| Mobile money (M-Pesa, etc.) + reconciliation | ❌ Absent (only a paybill config field exists, no live integration) |
| Local tax compliance integration (eTIMS/KRA and equivalents per jurisdiction) | ❌ Absent (only a boolean field exists) |
| Payment allocation to invoices, reversal logic | ❌ Absent |
| Owner statements / draws | ❌ Absent |
| Recurring/batch invoicing | ❌ Absent |
| Arrears automation, dunning, payment plans | ❌ Absent |
| Reporting / custom report builder / exports | ⚠️ Partial (dashboard hardcoded, no real reports) |
| Granular permissions + immutable audit trail | ⚠️ Partial (roles exist, enforcement and audit are weak) |
| Leasing lifecycle (templates, e-sign, renewals, inspections) | ⚠️ Partial (basic lease CRUD only) |
| Mobile / responsive / PWA | ⚠️ Partial (sidebar hidden on mobile, forms not optimized) |

### 3.5 Recommended phased roadmap (supersedes the simple module-order table alone — read both)

**Phase 0 — Foundation (P0, do this first, largely = Module 0 Stabilization + hardening in Module 1 Core Platform):**
1. Narrow the MVP persona and domain boundaries explicitly — stop schema sprawl (don't add more speculative fields like the accounting ones already sitting unused).
2. Fix navigation/route contracts; add detail/edit pages, row actions, and consistent empty/error/loading states as a cross-cutting pass (see `00-UX-CROSS-CUTTING-STANDARDS.md`).
3. Enforce tenant isolation + RBAC at controller/DTO level; fix wildcard CORS; move off JWT-in-localStorage.
4. Add transactional boundaries, idempotency where money moves, and make `AuditLog`/`logAction` actually get called on sensitive actions.
5. Fix docs/seed mismatch, add `.gitattributes`, clean the lockfile/CRLF noise, add real tests and CI.

**Phase 1 — Core revenue workflow (P0/P1):**
1. Onboarding/import flows for properties, units, tenants.
2. Real lease lifecycle: templates, e-signature, renewals, move-in/out inspections.
3. Recurring invoices, mobile money and payment gateway integrations (M-Pesa, Stripe, etc.) with reconciliation, payment allocation to invoices, receipts, local tax compliance transmission.
4. Arrears tracking, reminders, landlord/owner statements.
5. Live, API-driven dashboards and exportable reports.

**Phase 2 — Operational differentiation (P1/P2):**
1. Tenant, owner, and caretaker portals.
2. Maintenance/work orders, inspections, document management.
3. Communications (SMS/email/WhatsApp), notifications, two-way messaging.
4. Mobile PWA / responsive optimization pass.

**Phase 3 — ERP maturity (P2/P3):**
1. Chart of accounts, full GL, bank reconciliation, accounts payable, budgets, fixed assets.
2. Automation/scheduler, webhooks, third-party integrations, open API.
3. Advanced analytics/forecasting, compliance (GDPR, ODPC, data retention policy).

Use this phase ordering to sequence work *within and across* the per-module docs in Section 4 — a module doc's own task checklist is still the operational detail, but Phase 0 items across multiple modules should be done before deep Phase 2/3 work on any single module.

---

## 4. Module Docs Index & Build Roadmap

Each module has its own self-contained `.md` file. Suggested build order (adjust based on what inspection of the repo reveals is already further along):

| # | File | Module | Status hint (audit-verified) |
|---|---|---|---|
| 0 | `01-MODULE-stabilization.md` | Stabilization / bug fixes / security hardening | P0 — do first, 18 verified issues, several are security-critical |
| 1 | `02-MODULE-core-platform.md` | Core Platform (org, users, roles, auth, settings, documents) | CRUD exists; RBAC enforcement, audit logging, MFA, password reset, session revocation, document center all missing/weak |
| 2 | `03-MODULE-property-management.md` | Property Management | List+create only; no detail/edit pages, no photos/floor plans/meters, no import, no availability calendars |
| 3 | `04-MODULE-crm.md` | CRM (leads, contacts, pipeline) | Absent — confirmed by audit |
| 4 | `05-MODULE-sales.md` | Sales Management | Absent — confirmed by audit |
| 5 | `06-MODULE-lease-tenancy.md` | Lease & Tenancy | Basic CRUD only; no templates, e-sign, guided renewal flow, or inspections; tenant portal absent |
| 6 | `07-MODULE-landlord-management.md` | Landlord Management | Landlord CRUD exists; owner portal, statements, payouts all absent |
| 7 | `08-MODULE-finance-accounting.md` | Finance & Accounting | Invoice/payment/receipt CRUD only; no GL, no chart of accounts, no payment allocation, no reversal logic, no local tax compliance |
| 8 | `09-MODULE-payments.md` | Payments (global, incl. Stripe, M-Pesa) | Config fields only (`mpesaPropertyPayNumber`); no real STK/C2B/B2B or gateway integration exists |
| 9 | `10-MODULE-maintenance.md` | Maintenance Management | Absent — confirmed by audit |
| 10 | `11-MODULE-procurement.md` | Procurement | Absent — confirmed by audit |
| 11 | `12-MODULE-inventory.md` | Inventory | Absent — confirmed by audit |
| 12 | `13-MODULE-hr-payroll.md` | HR & Payroll | Absent — confirmed by audit |
| 13 | `14-MODULE-facilities.md` | Facilities Management | Absent — confirmed by audit |
| 14 | `15-MODULE-utilities.md` | Utilities (meters/billing) | Absent — confirmed by audit |
| 15 | `16-MODULE-documents-legal.md` | Documents & Legal | Absent — no document management or e-signature found |
| 16 | `17-MODULE-reports-analytics.md` | Reports & Analytics | Dashboard hardcoded, confirmed; no report builder, no exports |
| 17 | `18-MODULE-notifications.md` | Notifications | Absent — confirmed by audit |
| 18 | `19-MODULE-workflow-engine.md` | Workflow Engine | Absent — confirmed by audit |
| 19 | `20-MODULE-saas-administration.md` | SaaS Administration (platform-level) | Absent — confirmed by audit |

These statuses come from an actual codebase audit (KiloCode, cross-referenced against the live repo), not just the owner's description — more reliable than before, but **agents must still verify against the live repo every session**, since code moves faster than docs.

---

## 5. How to Resume After a Session Timeout / Context Limit

1. Open this file (`00-MASTER-ARCHITECTURE.md`) and the specific module doc you were working on.
2. Do the "Mandatory First Steps" in Section 0 again — re-inspect the repo, don't assume your prior session's mental model is still accurate (the user or another agent may have changed things).
3. Check the module doc's Tasks Checklist — completed items should have been checked off in the doc itself by the prior session. If they weren't, verify against the actual code whether they're done before assuming they aren't.
4. Continue from the first unchecked task.

**Every module doc must have its checklist updated (checked off) by the agent as work completes**, so this resume flow works. This is a requirement of the docs, not optional housekeeping.

---

## 6. General Engineering Conventions

- **Validation:** All NestJS DTOs use `class-validator` decorators; reject invalid input at the controller boundary.
- **Auth:** All non-public endpoints require the JWT guard; role-based access via a roles guard/decorator (check what exists in `backend/src/` already before adding a new pattern).
- **Errors:** Consistent NestJS exception filters; don't leak stack traces in production responses.
- **Migrations:** All schema changes go through `prisma migrate dev` (or equivalent) — never hand-edit the DB, never use `prisma db push` for anything beyond local prototyping.
- **CORS:** Must be restricted to known frontend origin(s) in every environment except local dev — this is flagged as a Known Issue above; fix it, don't leave it open.
- **Frontend data fetching:** Use the existing Axios client pattern in `frontend/lib/api.ts`; remove dead/legacy API clients rather than leaving them alongside working ones (see `billingApi` issue).
- **Forms:** React Hook Form + Zod validation on every create/edit form; a form must not "log to console and pretend to succeed" (see rent-receipt bug) — always wire to a real mutation with loading/error states.
- **Currency:** All monetary fields support multi-currency (default to a configurable org-level currency); store amounts as integers (cents/lowest unit) or `Decimal` in Postgres — never `float`. Confirm which convention the existing schema already uses and stay consistent.
- **Naming:** Match existing Prisma model naming conventions already in `schema.prisma` (PascalCase models, camelCase fields) rather than introducing a new convention.
- **UI/UX standards:** Read `00-UX-CROSS-CUTTING-STANDARDS.md` before building or touching any frontend page — the audit found the same set of gaps (no detail/edit pages, no row actions, no bulk ops, no exports, inconsistent empty/error/loading states, weak accessibility/mobile support) repeated across nearly every existing page, and every new module should not repeat that pattern.
- **Audit logging:** `AuditLog` model and `logAction()` service already exist (`backend/src/modules/audit/audit.service.ts`) but are currently called nowhere. Every module that creates/updates/deletes tenant data, and especially every module touching money or auth, MUST call `logAction()` on those operations going forward — this is a standing requirement for all new work, not a one-time backlog item.
- **Don't duplicate existing "bloat" fields:** the schema already has some accounting/integration-oriented fields sitting unused (e.g. `acReceivable`, `incomeAccount`, `spotRate`, `Property.mpesaPropertyPayNumber`, `Invoice.signOnEfims`, `Receipt.bankingDate`, `exemptAllSms`). Before adding a new field for something that sounds similar, check whether one of these already covers it and wire logic to the existing field instead.

---

## 7. Files in This Doc Set

- `00-MASTER-ARCHITECTURE.md` — this file
- `00-UX-CROSS-CUTTING-STANDARDS.md` — frontend standards (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, accessibility, mobile) that apply to every module's UI, written once here to avoid repeating it 20 times
- `01-DATABASE-SCHEMA.md` — full target Postgres/Prisma schema across all domains, with notes on what's verified to already exist vs. net-new, including notes on unused "bloat" fields to wire up rather than duplicate
- `01-MODULE-stabilization.md` through `20-MODULE-saas-administration.md` — one self-contained doc per module/sub-system, statuses now audit-verified rather than guessed

Give the agent this entire folder, or at minimum this file + `01-DATABASE-SCHEMA.md` + the specific module doc it's working on.
