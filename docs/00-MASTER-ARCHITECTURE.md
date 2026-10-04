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

**Backend (NestJS 11 + Prisma 7 + PostgreSQL, port 3003):**
- **Count check as of 2026-10-04 (after Module 6):** 25 `*.module.ts` under `backend/src/modules`, 40 Prisma models, 32 enums, 62 frontend pages. The prose below describes the **2026-10-03 audit snapshot**, kept as the record of what the starting point looked like — read it as history, not as the current state.
- Organizations, users, roles, properties, units, landlords, tenants, rental agreements, move-outs, invoices, payments, receipts, audit (model only) — all exist as Prisma models + basic CRUD controllers.
- Schema has **20 Prisma models** (`backend/src/prisma/schema.prisma` lines 17–905), including a number of fields that look like accounting/legacy carryover and are **not wired to any logic yet**: `acReceivable`, `incomeAccount`, `spotRate` on relevant models; `Property.mpesaPropertyPayNumber`; `Invoice.signOnEfims`; `Receipt.bankingDate`; `exemptAllSms`. **Do not delete these — they signal intended future functionality (GL account mapping, payment gateway config, local tax compliance, SMS opt-out) — but do not assume they mean the feature is built. Wire logic to them or extend them; don't duplicate them with new fields.**
- `AuditLog` model and `logAction()` service (`backend/src/modules/audit/audit.service.ts:9`) exist but **`logAction` is never called anywhere in the codebase**. Audit logging is effectively non-functional despite the model existing.
- Multi-tenant filtering via `getTenantId()` is used in queries, but tenant isolation is **not enforced consistently at the DTO/controller level** — treat this as a real security gap, not just a "verify" item.

**Frontend (Next.js 16 App Router, port 3002) — 62 pages as of 2026-10-04 (the route count below is the 2026-10-03 audit snapshot):**
- Only **list + create** pages exist for most entities. **No detail/edit pages, no row-action workflows, no status-transition UI, no bulk operations beyond delete, no exports, no saved views, no inline editing** anywhere in the app.
- Forms are large static field dumps, not guided workflows: `properties/new` (831 lines), `units/new` (609), `invoices/new` (615), `payments/new` (444), `receipts/new` (409), `rent-receipts/new` (362), `tenants/new` (430), `rental-agreements/new` (339). No conditional logic, autosave/draft, import templates, or bulk upload on any of them.
- `DataTable` / `ExpandableTable` components provide server-side pagination/filtering in places but lack row-action menus, drilldown, bulk actions, column config, inline edit, or export. Empty/error/loading states are inconsistent across pages.

### 3.3 Known Issues / Active Bugs (verified, with file references)

Treat these as **Module 0 — Stabilization** work. Fix before/alongside new module work where they'd otherwise block it (e.g. don't build new Finance features on top of the `/billing/` vs `/finance/` confusion without resolving it first).

Status markers: ✅ = resolved (date), ⚠️ = partially resolved, ❌ = still open. Items 1–9 were re-verified against the live repo on 2026-10-03.

**URL contract (critical — learned the hard way 2026-10-03):** the frontend uses a Next.js **route group** named `(dashboard)`, which does NOT contribute to URLs. `app/(dashboard)/finance/invoices/page.tsx` is served at **`/finance/invoices`**, not `/dashboard/finance/invoices`. The only routes that actually start with `/dashboard` are `/dashboard` itself (the real `app/(dashboard)/dashboard/` folder) — everything else lives at the bare path. An earlier session "fixed" sidebar links by adding the `/dashboard` prefix, which turned every link into a 404 (verified on a production build: `/dashboard/finance/invoices` → 404, `/finance/invoices` → 200). All nav was corrected on 2026-10-03 and verified 200 on `next start`. If you ever see a "broken link" complaint on an internal page, check the `(dashboard)` group first.

**Navigation / broken links:**
1. ✅ (2026-10-03, verified) All sidebar links resolve on the production build — after the URL-contract correction (no `/dashboard` prefix except for the Dashboard item itself).
2. ✅ (2026-10-03) Invoice row links to the new `finance/invoices/[id]` detail page (view, status transitions Mark-as-Paid/Cancel/Reopen, delete, line items + payment history); `invoices/new` + list link paths corrected to `/finance/invoices/new` / `/finance/invoices`.
3. ✅ (2026-10-03, verified) Receipts-new links fixed to `/finance/receipts`.
4. ✅ (2026-10-03, verified) Leases-new link points to `/rental-agreements/new` (`leases/page.tsx:268`).
5. ✅ (2026-10-03, verified) Properties parent + children now consistently exclude ACCOUNTANT.

**Dead / incomplete code:**
6. ✅ (2026-10-03) Dashboard stats/charts now driven by `GET /dashboard/stats` (`dashboard/page.tsx`): live totals cards, units-by-status pie, monthly charged-vs-collected, top-7 units-by-property; loading/error/retry + empty-chart states.
7. ✅ (2026-10-03) Rent-receipt form now calls the real `POST /finance/receipts` (receipt + lines + per-invoice `Payment` + invoice balance/status update in one transaction; sum-of-payments vs amount-received validated with 400). Live-verified end-to-end; "Apply to Invoices" is populated via `rental-agreements.findAll` now including `invoices`.
8. ✅ (2026-10-03) Receipt "Add Invoice" is a searchable picker over open invoices with outstanding balance; per-line payment amount is editable; general receipts save as `receiptCategory: General`.
9. ✅ (2026-10-03, verified) `billingApi` removed from `frontend/lib/api.ts`; no `/billing` references remain.

**Security (treat as P0, not polish):**
10. ✅ (2026-10-03) CORS restricted to env-driven allowlist (`security/cors.service.ts` + `resolveAllowlist`), wired in `main.ts`.
11. ✅ (2026-10-03) JWT now in httpOnly `auth_token` cookie (SameSite=strict, 1h); `cookie-parser` enabled; axios uses `withCredentials`; no token in response bodies or localStorage. Note: the migration was previously stranded in a dead `src/auth/` tree (never compiled, never booted) — it was merged into `modules/auth` this session.
13. ✅ (2026-10-03) All controllers sit behind `JwtAuthGuard`, tenant filtering fails closed (`getTenantId` throws 403 for org-less non-super-admins; invalid compound-where Prisma queries fixed in **all 10 services**, verified live: Rohi sees its 100 properties, Westhill sees 0, cross-org create lands in the correct org), and granular RBAC is enforced via `@Roles` decorator + global `RolesGuard` on **all 12 controllers** (matrix mirrors the sidebar's role visibility: properties/units/landlords/tenants/leases/moveouts writes = SUPER_ADMIN/ADMIN/PROPERTY_MANAGER; finance = SUPER_ADMIN/ADMIN/ACCOUNTANT; users = ADMIN/SUPER_ADMIN; orgs = SUPER_ADMIN; audit = ADMIN/SUPER_ADMIN). Verified live: Property Manager gets 403 on finance + user endpoints, Accountant gets 403 on property writes. Note: this enforces name-based on the 5-role `UserRole` enum; the structured `Role.permissions` model was added as **Module 1 — Core Platform** work (completed 2026-10-03, see `02-MODULE-core-platform.md`).
 14. ✅ (2026-10-03) `AuditLog` is now written: global `AuditInterceptor` records all mutating requests + LOGIN events (plus MFA_ENABLED/MFA_DISABLED/SESSIONS_REVOKED/PASSWORD_RESET). Was previously unwired — broken import, wrong `CallHandler` typing, and `SecurityModule` missing its `AuditModule` import (boot crash); all fixed. Tenant scoping now real: `AuditLog.organizationId` (migration `20261003103521_add_sessions_mfa_audit_org`) is written by the interceptor + auth service; `GET /audit` (paginated), entity, and user lookups are scoped to the caller's organization for ADMIN (cross-tenant reads 404) while SUPER_ADMIN sees the platform-wide trail. Verified live.

**Process / hygiene:**
15. ✅ (2026-10-03) `seed.ts` now runs the full demo seed (`seedDemoData()` from `demo-data.ts`), so `npx prisma db seed` produces the state described in the rewritten `Testing.md`; `npm run db:seed:demo` still works standalone.
16. ✅ (2026-10-03) `.gitattributes` added (`* text=auto eol=lf` + binary markers); commit `git add --renormalize .` to clean already-tracked CRLF files.
 17. ✅ Backend auth + CRUD test coverage now exists as the pattern (2026-10-03): `auth.service.spec.ts` (sessions, MFA, revocation, reset-kills-sessions), `properties.service.spec.ts` (tenant-scoped CRUD), `common/utils.spec.ts` (isolation primitives) — 36 tests green, no DB needed. CI pipeline live at `.github/workflows/ci.yml` (backend tsc+jest, frontend tsc+build on push/PR). Still open: no frontend tests, no Docker, no OpenAPI docs.
18. ✅ N/A — this doc set remains the roadmap of record.

**New issues found 2026-10-03 (backend/DB pass):**
19. Prisma schema had drifted ahead of migrations — `users` table was missing `resetPasswordToken`/`resetPasswordExpires`; fixed by migration `20261003082158_add_password_reset_fields`. Run `npx prisma migrate dev` before seeding a fresh DB.
20. ✅ (2026-10-03) Tenant-scoped `findUnique`/`update`/`delete` used invalid compound where-clauses (`{ id, organizationId }`) in every module service — every tenant-user read-by-id/update/delete 500'd. Fixed in **all 10 services** (properties, units, landlords, tenants, rental-agreements, invoices, payments, receipts, moveouts, users) via the `assertTenantRecord()` helper in `common/utils.ts`.
21. ✅ (2026-10-03) `PATCH /finance/invoices/:id` now exists (scalar fields + status; relation connect/disconnect for landlord/rentalAgreement; line items not editable via PATCH yet). `GET /finance/receipts?category=Rent|General|Refund` filter added for the rent-receipts list. Still open: CSV export endpoints.
22. `AuditInterceptor` derives the entity name from the URL path with a trailing `s` stripped, so `/properties` logs entity `"Propertie"` — cosmetic, but audit queries must account for it until the interceptor maps route → model name.
23. `main.ts` previously passed a **sync** allowlist function to `enableCors({ origin })` — the cors package treats a function `origin` as async and waits for a callback, so **every request to the API hung** (app booted normally, no route responded). Fixed 2026-10-03 with the callback form. Lesson: any function passed to `origin` must call its callback.
24. ✅ (2026-10-03) Tenant-scoped `GET /:id` reads returned **200 with an empty body** for missing or cross-tenant records (Nest returns null → 200), which would have broken every detail page and leaked record existence across tenants. All 10 tenant services now wrap `findFirst` read-by-id in the `requireRecord()` helper (`common/utils.ts`) which throws 404. Verified live: cross-tenant invoice read → 404, same-tenant read → 200 with data.
25. **Schema debt (verified 2026-10-03):** `Unit` (and all child/line models — `UnitServiceCharge`, `UnitMeterNumber`, `UnitFeature`, `PropertyStandingCharge`, `PropertySecurityDeposit`, `TenantEmergencyContact`, `InvoiceItem`, `ReceiptLine`) have **no `organizationId` column**; tenant scoping flows through the parent relation (`Unit` → `Property`). Any query against these models MUST filter by relation (`{ property: { organizationId: tenantId } }`) — filtering by `organizationId` throws a Prisma validation error. `AuditLog` now **does** carry `organizationId` (added 2026-10-03, migration `20261003103521_add_sessions_mfa_audit_org`; see item 14).

**New issues found 2026-10-03 (Module 2 — Property Management pass):**

26. ✅ **Cross-tenant write via unit creation.** `UnitsService.create` did `property: { connect: { id: data.property?.connect?.id } }` with no tenant check, so any authenticated tenant could attach units to another tenant's property. Now pre-verified with `assertTenantRecord`. Verified live: Westhill creating a unit under a Rohi property → 404.
27. ✅ **Unvalidated, mass-assignable bodies.** `POST /properties` and `POST /units` took `Prisma.*CreateInput`, so any column (including `organizationId`) and any nested relation write was settable from the browser with no validation. Both now have `class-validator` DTOs, and the global `ValidationPipe` runs `whitelist: true, transform: true` (undeclared properties are stripped). Endpoints that still take raw Prisma input: `POST /rental-agreements`, `POST /tenants`, `POST /landlords`, and the finance endpoints — each is its own module's job, and Module 5 already hit this with lease creation.
28. ✅ **Forms silently lost data.** `properties/new` sent `categoryId`/`propertyTypeId` and `units/new` sent `unitNumber`, `specifiedFloor`, `unitTypeId`, `carSpaceParking`, `marketRent`, `chargeFreq` — none of which are columns, so category/type/rent/floor were dropped on save. The replacement shared forms use the real API field names.
29. ✅ **Occupancy status was an unchecked free-form column.** Any `PATCH /units/:id` could set `status` to anything, so a tenanted unit could claim to be VACANT. Occupancy is now a validated state machine (`modules/units/occupancy.ts`) exposed only through `PATCH /units/:id/status`, and `RentalAgreementsService` re-derives it on every agreement create/update/delete. **Rule for later modules: never write `Unit.status` directly — call `UnitsService.syncOccupancyStatus(unitId, tenantId)`.**
30. ✅ **Lease create was a 500 for every caller.** The leases controller passes a raw Prisma payload, so `startDate` arrived as the string `"2026-01-01"` (rejected for `DateTime`), and the service injected a nested `organization: { connect }` into what is an *unchecked* payload (rejected as an unknown argument). Both fixed in `rental-agreements.service.ts`; the service still needs a proper DTO in Module 5.
31. Open: **CSV export/import exists only for properties and units.** Finance, tenants and landlords still have no export (previously flagged in item 21).
32. Open: **No document *kind*.** Property photos and floor plans are both plain `Document` rows; the detail page groups by mime type. A `kind`/`category` column (photo / floor plan / contract / invoice) belongs to Module 16 (Documents & Legal) and should be added there, not per module.
33. Open: **`Property.type`/`category` are free-form strings**, so the API cannot answer "show me all apartments". A `PropertyType`/`PropertyCategory` lookup table is the fix; it is deliberately deferred because the seed uses free-form values and Module 4 (Sales) will add property states.

**New issues found 2026-10-03 (Module 3 — CRM pass):**

34. ✅ **Public lead capture is now authenticated, not open.** `POST /crm/public/leads` is `@Public()` by necessity (a website form cannot hold a JWT), so it is guarded by `CrmWebhookGuard`: constant-time comparison of an `x-webhook-secret` header, **fails closed** when `CRM_WEBHOOK_SECRET` is unset, and takes the organization from `CRM_WEBHOOK_ORGANIZATION_ID` so the payload cannot target another tenant. Per-tenant secrets (an `Organization.crmWebhookSecret` column) are the follow-up if a multi-tenant deployment needs public capture.
35. ✅ **`Tenant` and `Contact` are linked, not merged.** `Tenant.contactId` is unique + nullable + `SetNull`. Merging would put lease identity fields (`accountNumber`, `taxPin`) on every buyer/investor/lawyer row and would force a migration of the invoice/receipt/move-out FKs that reference `Tenant` with `onDelete: Restrict`. Reasoning is written up in `04-MODULE-crm.md`.
36. New RBAC modules `crm_leads` / `crm_contacts` were added to `roles-seed.ts`. **Anything you add later that needs a module-level permission must also be added to `PERMISSION_MODULES` and to the role matrix, then re-seeded**, or the `PermissionsGuard` denies it with "Insufficient permissions" even for admins. Re-seed roles with `seedRoles(prisma)` rather than the full `npm run seed`, which wipes the database.
37. Open: **no lead deduplication.** The same person can arrive from the website and from Facebook as two separate leads. A unique constraint on `(organizationId, email)` plus a merge flow is the fix.
38. Open: **`CommunicationLog` is a record, not delivery.** Nothing is actually sent to a lead or contact — that is Module 18 (Notifications) plus the WhatsApp/e-mail integrations. The timeline is the log those will write to, so do not build a second message history when they land.
39. Open: **no bulk import for leads/contacts.** `common/csv.ts` already parses and reports per row (used by properties and units); a lead spreadsheet paste is the same shape.
40. Open: **WON/LOST leads cannot be reopened from the UI.** `lead-pipeline.ts` treats both as terminal by design. Reopening should be an explicit, audited action rather than a normal stage move.

**New issues found 2026-10-03 (Module 4 — Sales pass):**

41. ✅ **Payments never reconciled their invoice.** `PaymentsService.create` writes a `Payment` row and never updates `invoice.paidAmount` / `balanceAmount` / `status`, so every invoice reads as fully outstanding forever. The sales module works around it by summing the payments itself (documented in `outstandingFromInstallments`), but **rent reporting is wrong for the same reason** — this needs a Finance fix, not a Sales one: reconcile the invoice columns on payment create/delete, and derive `Invoice.status` from the balance.
42. ✅ **`POST /finance/payments` could not pay an invoice at all.** The controller sends the flat shape (`invoiceId`), and injecting `organization.connect` next to a scalar FK made Prisma reject the payload ("Unknown argument `invoiceId`"). The service now converts the parent ids to nested connects. Same class of bug as the lease-create issue in item 30 — check any other endpoint that mixes scalar ids with a relation connect.
43. ✅ **`POST /users` was a 500 for every caller.** The controller passes the registration shape (which includes `password`) straight to Prisma, which has no such column. `UsersService.create` now strips it. There is still no DTO on that endpoint.
44. ✅ **A property could hold two live sales.** `SaleTransaction.propertyId` is `Restrict` and the API refuses a second sale that is not HANDOVER/CANCELLED, so the asset cannot be double-sold by accident. Two live negotiations on one property are now a 409 naming the existing sale.
45. Open: **`Invoice.balanceAmount` and `SaleInstallment.status` are derived on read in Sales, but nothing reconciles them for rent.** Item 41 covers the fix; until it lands, treat `Invoice.balanceAmount` as advisory everywhere, not just in Sales.
46. Open: **sale documents are not wired.** Title deeds, agreements and receipts should attach through the Document Center exactly as property photos do (`components/properties/property-documents.tsx` is the pattern to copy).
47. Open: **commission payouts are not posted to the ledger.** A paid commission records a reference and a timestamp only; making it a payable (and a GL credit) belongs to Finance / Procurement.

**New issues found 2026-10-03 (Module 5 — Lease & Tenancy pass):**

48. ✅ **Two lists for one entity, one of them broken.** `/leases` and `/rental-agreements` both listed rental agreements; nothing linked to `/leases` and its row click went nowhere, while `/rental-agreements` had a "…" button with no menu. `/leases` is deleted and `/rental-agreements` is the single list with real detail pages. Check for the same pattern before adding a second screen for an existing entity.
49. ✅ **Deposit refunds were a typed-in number.** `MoveOutRequest.depositRefundAmount` could be any figure with nothing behind it. Refunds are now derived from itemised `MoveOutDeduction` rows minus unpaid rent, with a pure calculator that is unit-tested, and paying one requires a reference and locks further deductions. Anything else that takes a money figure from the client should be treated the same way.
50. ✅ **Lease `status` was freely settable.** A `PATCH` could move a lease to any state, and nothing connected a lease to unit occupancy. Status is now excluded from the update DTO and only moves through validated actions that sync the unit.
51. Open: **role *names* are not mapped onto `UserRole`.** `RoleAssignment` stores names ("Leasing Officer") while `@Roles(...)` compares the `UserRole` column, so the seeded roles only ever grant permissions — they cannot be selected for a user. Module 5 added the missing `LEASING_OFFICER` enum value, but the name→enum mapping (or dropping the name column in favour of the enum) is still open.
52. ✅ **`import type` on a `@Body()` DTO silently disables validation.** `POST /inspections` received an empty object because the type-only import erased the class from `design:paramtypes`, so Nest skipped the pipe and the Prisma call failed with "argument is missing". Import DTOs used in `@Body()` as values, never as types.
53. ✅ **The tenant self-service portal is built** (Module 5's last open item). The auth half was done in Module 1: User.portalTenantId links a login to exactly one tenant, it is re-read from the user row on every request, TenantPortalGuard rejects staff sessions, and POST /users forces a portal login's role to USER. GET /portal/{me,summary,lease,invoices,receipts,documents} and a guarded document download are scoped by the session tenant alone. Portal logins are demo-seeded (	enant@rohi.co.ke).
54. Open: **role *names* still are not mapped onto UserRole** (see 51) — a portal login sidesteps it by being forced to USER, but a staff Leasing Officer still cannot be created through the UI.55. ✅ **Resident requests are queued, not self-applied** (Module 5 follow-up). A new `tenant_requests` table with
    `TenantRequestType { RENEWAL, MOVE_OUT, PAYMENT_PLAN, MAINTENANT, LEASE_AMENDMENT }` and
    `TenantRequestStatus { PENDING, APPROVED, REJECTED, WITHDRAWN }`: the resident submits against their own
    session tenant, staff decide under a new `tenant_requests` permission, and **approval delegates to
    `RentalAgreementsService` / `MoveoutsService`** — so the same gates, successor-agreement chain, occupancy sync
    and audit trail apply as for a change made by hand. A short-notice move-out is flagged `earlyNotice` rather
    than refused; a rejection requires a note because that note is what the resident reads; a delegated refusal
    leaves the request PENDING. `PAYMENT_PLAN`/`MAINTENANT`/`LEASE_AMENDMENT` record the decision as
    `RECORDED_ONLY` until their owning modules can act.
56. ✅ **`getUserId()` read the wrong property**, so *nothing* was attributed: `JwtStrategy` puts the id on
    `request.user.userId`, but `common/utils.getUserId()` read `request.user.id` — every move-out approval, deposit
    refund, sale commission approval and inspection completion was storing a null actor. Found by a live test of
    the request queue (the decider came back empty) and fixed to accept both. Worth remembering: any helper that
    reads `req.user` must match what the strategy puts there.
57. Open: **`PAYMENT_PLAN` has nothing to execute** — there is no payment-plan model, so approving one only records
    the decision. Finance needs a plan entity (instalments, dates, what happens on a missed payment) before this
    becomes real.
58. Open: **demo leases were all rolling monthlies** (no `endDate`, no `noticePeriodDays`), which made renewal
    and the early-notice flag unreachable in a seeded database. The seed now gives about half of residential
    leases a 6–12 month term and every tenancy a 30-day notice period.

**New issues found 2026-10-04 (Module 6 — Landlord Management pass):**

59. ✅ **`LandlordsModule` was imported in `app.module.ts` but never registered in the `imports` array**, so every
    `/landlords` route 404'd — the module had never actually run, and its list query was not tenant-scoped either
    (it returned landlords from every organization). Registered, and `findAll` now filters on the caller's
    `organizationId`. Worth a look at `app.module.ts` whenever a new module is added: importing it proves nothing.
60. ✅ **Owner statements now exist and are derived, not typed.** `OwnerStatement` freezes its money columns and
    its `incomeLines`/`expenseLines` snapshots at generation time, so an issued statement keeps reconciling to its
    own lines after the underlying invoices change; re-issuing means generating a new statement. Income comes from
    `Payment` rows against that landlord's **rental** invoices (sale invoices are excluded via
    `Invoice.saleTransactionId IS NULL`), which is the first consumer of that column as a filter rather than a link.
61. ✅ **The double-payout hazard needed a real guard.** Rent is attributed by payment date, so two statements
    covering overlapping dates would pay an owner twice for the same month; generation now refuses, and only a VOID
    statement frees a period (a DRAFT does not — it already claimed the rent).
62. Open: **owner payouts are recorded, not executed.** There is no banking integration, so `LandlordPayout` logs
    intent plus the bank reference. `PAID` requires that reference (an unreferenced payout is not an audit trail),
    the amount cannot exceed what the statement still owes, and paying one in full flips the statement to SETTLED.
    A provider transfer id has nowhere to live yet.
63. Open: **`LandlordCharge` is the owner-facing slice of an expense model Finance does not have.** It is
    deliberately not a general `Expense` table — Module 7 owns the ledger. When it lands, decide then whether a
    charge links to an expense row or is replaced by one; do not migrate this table blindly. Statements will also
    need to gain derived columns for arrears fees and VAT on the fee before a real management agreement fits.
64. Open: **the owner portal is scoped but not built.** `Landlord` now holds read-only `owner_statements` /
    `owner_payouts`, so the Phase 2 portal is additive: `User.portalLandlordId` + a guard + read-only screens,
    copying the tenant portal's pattern (see `07-MODULE-landlord-management.md`).
65. Open: **statement emails are a one-line call away** (Module 18) — `OwnerStatementsService.issue()` and the
    payout `PAID` transition are the two triggers; the document already renders from the frozen snapshot.

### 3.4 Benchmark gaps (what a real PMS/ERP has that TU Properties doesn't yet)

Verified absent or partial against AppFolio/Buildium/Propertyware/MRI/Yardi/Rent Manager:

| Capability | TU Properties state |
|---|---|
| CRM / leads / listing syndication | ⚠️ Partial (leads, pipeline board, contacts, communication log, lead→contact conversion, public capture webhook — no listing syndication, no delivery of emails/SMS/WhatsApp, no dedupe of repeat enquirers) |
| Sales pipeline (quotation → handover) | ✅ Built (stage gates, instalment billing through Finance, commission splits with approval, per-agent report — no offers/discount history, no sale documents, no pipeline forecast) |
| Tenant portal | ✅ Self-service (/portal: overview, invoices, receipts, documents) plus a resident **request queue** (	enant_requests: renewal, move-out, payment plan, repair) that staff approve — approval delegates to the leasing/move-out services, so a resident-approved renewal goes through the same gates |
| Owner/landlord portal | ⚠️ Partial — owner statements, charges and payouts are built and audited (derived figures, frozen documents, payout state machine, printable statement), and the `Landlord` role already holds read-only statement/payout permissions; the **self-service portal screens are Phase 2** |
| Accounting / general ledger | ⚠️ Partial (chart of accounts, double-entry GL, auto-posting from invoices/receipts/payments, reversals, trial balance, account ledger and GL pages are live — still no accounts payable, no bank reconciliation, no period close) |
| Maintenance / work orders / inspections | ❌ Absent |
| Documents / e-signature | ⚠️ Partial (Document Center upload/list/download/versioning live on backend; e-signature deferred to a 3rd party, no signing infrastructure) |
| Communications (email/SMS/WhatsApp) | ❌ Absent |
| Automation / workflow / scheduler / webhooks | ❌ Absent |
| Mobile money (M-Pesa, etc.) + reconciliation | ❌ Absent (only a paybill config field exists, no live integration) |
| Local tax compliance integration (eTIMS/KRA and equivalents per jurisdiction) | ❌ Absent (only a boolean field exists) |
| Payment allocation to invoices, reversal logic | ✅ Built 2026-10-04 (payments update `paidAmount`/`balanceAmount`/`status` inside the invoice's own transaction, `POST /finance/payments/:id/reverse` re-derives the invoice from the non-reversed payments and posts a reversing journal entry — no manual DB edit needed; see issues 41/42) |
| Owner statements / draws | ✅ Built in Module 6 |
| Recurring/batch invoicing | ❌ Absent |
| Arrears automation, dunning, payment plans | ❌ Absent |
| Reporting / custom report builder / exports | ⚠️ Partial (dashboard hardcoded, no real reports) |
| Granular permissions + immutable audit trail | ⚠️ Partial backend-complete (granular RBAC enforced on all controllers, structured Role.permissions model added, audit trail wired + tenant-scoped, login history with IP/UA) — UI role-visibility gaps remain, and `req.user` is typed `any` (no global Express augmentation, per AGENTS.md)
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
4. Arrears tracking, reminders, ~~landlord/owner statements~~ (built in Module 6, 2026-10-04 — reminders remain).
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
| 0 | `01-MODULE-stabilization.md` | Stabilization / bug fixes / security hardening | ✅ COMPLETE 2026-10-03 — all checklist items done: nav/URL contract fixed app-wide, invoice detail page, dashboard wired to live stats, rent-receipt + receipt flows real + transactional, MFA (TOTP) + session revocation + auth rate limiting, `AuditLog.organizationId` with tenant-scoped audit reads, `.gitattributes`, CI pipeline, 36 green tests (auth/CRUD/utils pattern) |
| 1 | `02-MODULE-core-platform.md` | Core Platform (org, users, roles, auth, settings, documents) | ✅ Backend COMPLETE 2026-10-03: structured `Role.permissions` RBAC (12 system roles + legacy UserRole fallback), **Plus tenant-scoped auth (added 2026-10-03 for Module 5's portal):** User.portalTenantId links a login to exactly one tenant, is re-read from the user row on every request, is enforced by TenantPortalGuard + getPortalTenantId(), and POST /users forces a portal login's role to USER. See `02-MODULE-core-platform.md`. PermissionsGuard across controllers, tenant-scoped Branches CRUD, Document Center (local FS driver default, S3/MinIO driver, versioning + list/download/delete + cross-tenant isolation), System Settings backend (`GET/PATCH /organizations/me` persists currency/timezone/legalName/taxId), Users (`POST /users` invite w/ temp password, `GET /users/roles`, `PATCH /users/:id/roles`, `DELETE /users/:id`), audit IP/UA + login history, auth rate limiting (429). Bug fix during verification: `DELETE /users/:id` 500 (audit/docs FK RESTRICT) → made `AuditLog.userId` & `Document.uploadedById` nullable `SetNull`. 20/20 smoke checks pass, `tsc --noEmit` clean, 36/36 jest pass. Frontend (users/branches/documents/settings pages) is a follow-up. |
| 2 | `03-MODULE-property-management.md` | Property Management | ✅ COMPLETE 2026-10-03: schema gaps closed (`Property.status` enum, `Property.branchId` → Branch, new `PropertyAmenity` table + migration `20261003132000_module2_property_management`, which also records the two Module 1 FK nullability changes that `db push` had left out of migration history). `class-validator` DTOs replace raw `Prisma.*CreateInput` bodies on both create endpoints, global `ValidationPipe` now runs `whitelist+transform`. Closed a cross-tenant hole: `UnitsService.create` no longer connects an arbitrary `propertyId`. Occupancy became a validated state machine (`units/occupancy.ts`) whose only entry point is `PATCH /units/:id/status`, synced from the leases module on every agreement change; delete guards return 409 instead of FK 500s. New endpoints: availability + occupancy rollup, amenities CRUD, CSV export/import-template/import (server-side parser, per-row report, dry run) for properties and units. Frontend: property + unit detail and edit pages, step-based shared `PropertyForm`/`UnitForm` (replacing the 831/609-line field dumps, whose field names did not match the DB), shared loading/empty/error states, row-action menus, CSV import modal with dry-run preview, Document Center upload for photos/floor plans, list filters by status/type/branch, availability calendar view. Verified live on both demo tenants (incl. cross-tenant 404s and lease-driven OCCUPIED→VACANT sync); `tsc --noEmit` clean both apps, `next build` clean, 105/105 jest pass. |
| 3 | `04-MODULE-crm.md` | CRM (leads, contacts, pipeline) | ✅ COMPLETE 2026-10-03: new `leads` / `contacts` / `communication_logs` tables plus `LeadSource`, `LeadStage`, `ContactType`, `CommChannel`, `CommDirection` enums and `Tenant.contactId` (unique, `SetNull`) — migration `20261003145000_module3_crm`, applied with no drift. Pipeline stage is a validated state machine (`crm/leads/lead-pipeline.ts`, pure + unit-tested): WON/LOST terminal, WON refused until the lead is converted, LOST requires a reason, and `stage` is only settable through `PATCH /crm/leads/:id/stage` (never through the generic PATCH). `POST /crm/leads/:id/convert` creates or links a Contact, carries the enquiry onto its timeline, marks the lead WON, and can create the Tenant in the same step; a second conversion is refused. Public capture at `POST /crm/public/leads` is `@Public()` behind a constant-time shared-secret guard that fails closed and takes the organization from config, never the payload. Frontend: `/crm/leads` with a list *and* a hand-rolled HTML5 drag-and-drop pipeline board (no new dependency), lead + contact detail/edit pages, contact type filtering, communication timeline with inline logging, convert dialog, CSV exports, and a sidebar CRM group. Two new RBAC modules (`crm_leads`, `crm_contacts`) granted to Property Manager / Leasing Officer / Sales Agent. Demo seed now produces one lead per pipeline stage including a converted won lead. Verified live on both demo tenants (incl. cross-tenant 404s and webhook 401s); `tsc --noEmit` clean both apps, `next build` clean, 165/165 jest pass. |
| 4 | `05-MODULE-sales.md` | Sales Management | ✅ COMPLETE 2026-10-03: new `sale_transactions` / `sale_installments` / `commissions` tables plus `SaleStage`, `InstallmentStatus`, `CommissionStatus` enums and `Invoice.saleTransactionId` — migration `20261003170000_module4_sales`, applied with no drift. Sale stage is a validated state machine (`sales/sale-stage.ts`, pure and unit-tested): one stage forward at a time, no skipping, HANDOVER/CANCELLED terminal, with gates — reservation needs an agreed price, agreement needs a buyer, payment needs a raised invoice, **handover needs zero outstanding balance** (the 409 names the amount) and archives the property. A property can only carry one open sale. Instalments are billed through `InvoicesService` (`transactionClass = 'SALE'`, linked via `invoice.saleTransactionId`) rather than a parallel billing path; the payments themselves are the source of truth for what is owed. Commission splits are computed in integer cents so a 70/30 split always reconciles to the total exactly, with PENDING → APPROVED → PAID enforced (payment reference required) and a per-agent report. Frontend: `/sales` with list + board (now on the shared `KanbanBoard` extracted from the CRM board), sale detail with a stage rail and money panel (schedule, invoicing, commission split), create/edit, and a commission report with approve/pay actions. Verified end to end on a live sale from quotation to handover including every refused shortcut and the cross-tenant 404; `tsc --noEmit` clean both apps, `next build` clean, 231/231 jest pass, demo seed produces a six-sale funnel. |
| 5 | `06-MODULE-lease-tenancy.md` | Lease & Tenancy | ✅ COMPLETE 2026-10-03 (including the tenant portal, whose auth landed in Module 1): three migrations — `20261003190000_module5_leasing` (renewal chain `renewedToId`/`renewedFromId`, `activatedAt`/`terminatedAt`/`terminatedReason`/`expiredAt`, new `move_out_deductions`, `inspection_reports`, `inspection_items`, `lease_templates`), `20261003200000_add_leasing_officer_role` (`UserRole += LEASING_OFFICER` — the seeded role had no enum value so nobody could hold it), `20261003210000_add_moveout_completed_status`. Lease status is a validated state machine (`leases/lease-lifecycle.ts`, pure and unit-tested): activate needs a started lease and a free unit, renew opens 60 days before the end date and creates a **successor agreement** with the chain linked both ways, extend moves the end date, terminate records the reason and vacates the unit unless a successor took over, expire/reactivate handle end-of-term. Every action syncs unit occupancy — the acceptance criterion. `status` is not in the update DTO. Move-outs: the tenant comes from the lease, and the deposit refund is **derived** (`deposit − itemised deductions − unpaid rent`, floored at zero with the remainder carried forward as a debt) with a reference-required refund action — the typed-in total is gone. New inspection workflow with a move-out-vs-move-in comparison listing only what got worse. `GET /leases/expiring` is the reminder stub; `/leases/units/:id/occupancy-history` derives tenancies plus vacant gaps. Frontend: `/rental-agreements` is now the single lease list (the orphan `/leases` page with its dead row click was deleted) with an expiry banner, lease detail with lifecycle actions + ledger + renewal chain, lease edit, the deposit settlement screen, tenant detail, and an occupancy-history panel on the unit page. Verified end to end live (draft → activate → renew → extend → move-out → deductions → refund → COMPLETED, with every illegal transition refused and cross-tenant 404s); `tsc --noEmit` clean both apps, `next build` clean, 291/291 jest pass. The tenant self-service portal also landed (tenant-scoped auth in Module 1). |
| 6 | `07-MODULE-landlord-management.md` | Landlord Management | ✅ COMPLETE 2026-10-04: new `owner_statements`, `landlord_payouts`, `landlord_charges` tables plus the `ManagementFeeType`, `OwnerStatementStatus`, `PayoutStatus`, `ChargeCategory` enums and `Landlord.notes` + management-agreement terms — migration `20261004000000_module6_landlords`, and `migrate diff --from-migrations` now reports an empty migration (a rebuilt database matches the live one). Owner statements are **derived, never typed**: income from the `Payment` rows dated in the period against that landlord's rental invoices (sale invoices excluded via `Invoice.saleTransactionId IS NULL`), expenses from unclaimed `LandlordCharge` rows which the same transaction claims so they cannot be double-deducted, a percentage-or-flat management fee, and unpaid earlier periods carried forward — all in integer cents, with an overlapping-period guard that refuses to pay an owner twice for the same month. `GET /owner-statements/preview` runs the identical calculation and writes nothing, which is what the generate dialog shows before a document exists; generation freezes the line snapshots so an ISSUED statement keeps reconciling after the underlying invoices change. Payouts are a validated state machine (`payouts/payout-status.ts`, pure and unit-tested): born PENDING, a transfer reference required to become PAID, a reason required to become FAILED, no overpayment, PAID terminal, and paying a statement in full flips it to SETTLED. A charge on an issued statement is frozen against edit and delete. The "PDF" is a printable HTML document rendered from the frozen snapshot (`GET /owner-statements/:id/document`) — there is no PDF library anywhere in the stack and adding one for a single document is a poor trade. **Incidental fix: `LandlordsModule` was imported in `app.module.ts` but never registered, so `/landlords` had never worked**, and its list was not tenant-scoped. Frontend: owner list with working row actions, a shared landlord form (create + edit), the owner detail page (portfolio, outstanding, statements, charges), the statement register and detail, the payout register, and a sidebar group of Owners / Owner statements / Owner payouts. Verified live end to end on both tenants including every refusal path and cross-tenant 404s; `tsc --noEmit` clean both apps, `next build` clean, 384/384 jest pass, demo seed produces statements that reconcile against the payments it just created. **Deferred to Phase 2: the owner self-service portal** (RBAC groundwork is in place — the `Landlord` role holds read-only `owner_statements`/`owner_payouts`) **and statement emails** (Module 18; triggers specified in the module doc). |
| 7 | `08-MODULE-finance-accounting.md` | Finance & Accounting | ⚠️ **GL COMPLETE 2026-10-04**, rest of the module open. Added `accounts`, `journal_entries`, `journal_lines` plus the `AccountType`, `BalanceSide`, `JournalEntrySource` and `JournalEntryStatus` enums, and `Payment.isReversed`/`reversedAt`/`reversedBy` — migration `20261004010000_module7_accounting`. The chart of accounts is seeded **lazily per organization** (42 system accounts, codes 1000–5900, auto-posting resolves them by code) so a new tenant has a ledger without a setup step. `AccountingService.postEntry` is the only way anything reaches the ledger and it refuses unbalanced, single-sided, negative-amount and header-account lines — so the trial balance cannot drift; every caller passes its own Prisma transaction client, meaning an invoice/payment/receipt commits **with** its journal entry or not at all. Auto-posting: invoice issued → Dr AR (gross) / Cr VAT / Cr revenue (net, VAT-inclusive and -exclusive invoices both handled); money received → Dr cash/bank/M-Pesa (mapped from `PaymentMethod`) / Cr AR, or Cr 2500 "rent collected on behalf of landlords" for money collected for an owner, since that is a liability until the owner statement is paid out. Cancelling or deleting an invoice/receipt, and deleting a payment, **reverse** the source's entries rather than leaving them standing — an entry is never edited or deleted, only reversed (`reversedByEntryId`/`reversesEntryId`, status `REVERSED`). `POST /finance/payments/:id/reverse` re-derives the invoice's paid/balance/status from the non-reversed payments. `POST /finance/payments` now allocates to the invoice it names — this closes issues 41 and 42. New `accounting` RBAC module (full for Company Admin/Accountant, view-only for Leasing Officer). Frontend: `/finance/chart-of-accounts`, `/finance/journal-entries` (source filter, expandable lines, manual-entry form that refuses to submit until it balances, one-click reversal) and `/finance/trial-balance` (period filter, explicit out-of-balance banner), all in the sidebar under Billing & Finance. Verified live: a 11,600 invoice posts a balanced entry (Dr AR 11,600 / Cr VAT 1,600 / Cr rent 10,000) and cancelling it returns the trial balance to zero; `tsc --noEmit` clean in both apps, eslint clean apart from the documented `any` baseline, 393/393 jest. **Still open: accounts payable, credit notes, recurring/batch invoicing, the configurable tax-rules engine, local tax compliance (eTIMS/KRA), bank reconciliation, period close.** |
| 8 | `09-MODULE-payments.md` | Payments (global, incl. Stripe, M-Pesa) | Config fields only (`mpesaPropertyPayNumber`); no real STK/C2B/B2B or gateway integration exists |
| 9 | `10-MODULE-maintenance.md` | Maintenance Management | Absent — confirmed by audit |
| 10 | `11-MODULE-procurement.md` | Procurement | Absent — confirmed by audit |
| 11 | `12-MODULE-inventory.md` | Inventory | Absent — confirmed by audit |
| 12 | `13-MODULE-hr-payroll.md` | HR & Payroll | Absent — confirmed by audit |
| 13 | `14-MODULE-facilities.md` | Facilities Management | Absent — confirmed by audit |
| 14 | `15-MODULE-utilities.md` | Utilities (meters/billing) | Absent — confirmed by audit |
| 15 | `16-MODULE-documents-legal.md` | Documents & Legal | Absent — no document management or e-signature found |
| 16 | `17-MODULE-reports-analytics.md` | Reports & Analytics | Dashboard hardcoded, confirmed; no report builder, no exports |
| 17 | `18-MODULE-notifications.md` | Notifications | Absent — confirmed by audit. **Two triggers are already built and waiting:** resident request decisions (Module 5's `tenant_requests` queue audits `TENANT_REQUEST_*` at each transition) and lease-expiry reminders (`RentalAgreementsService.expiring()` already returns the leases + contact details). Both are a one-line call and a scheduled job away — see `06-MODULE-lease-tenancy.md` → *Blocked on other modules* |
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
