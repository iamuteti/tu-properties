# Module 16: Reports & Analytics

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**BACKEND COMPLETE, FRONTEND NOT STARTED** (verified against the tree 2026-10-07, not taken from this doc's own say-so). The backend is `backend/src/modules/reports/` — a controller with six read endpoints and four CSV exports, a 34 KB service, and `occupancy.ts` carrying the arithmetic with 34 passing tests. It is registered in `app.module.ts` and its `reports` permission is seeded. **There is no frontend at all**: no `/reports` route, no sidebar entry, no `reportsApi` in `frontend/lib/api.ts`. Every figure this module computes is currently unreachable from a browser. The dashboard is *not* hardcoded — it reads `dashboardApi.getStats()` from `/dashboard/stats`, which the Stabilization module built on 2026-10-03 — so the original Status Hint on this page is out of date on that point too. Benchmarked competitors have 450+ reports with drill-down and export on all of them; what exists here is five real reports with no way to open them.

## Module Goal
Provide real executive dashboards and reports across occupancy, financial, sales, maintenance, and landlord ROI — with export, since the audit found zero export capability anywhere in the current app.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Dashboard page exists but shows hardcoded stats/charts — needs to be wired to real data (also listed in Stabilization module as an active bug). No other reporting UI exists.

**Corrected 2026-10-07**: the dashboard was wired to real data by the Stabilization module (`GET /dashboard/stats`), not by this module, and a backend reports module exists that this page did not know about. See "What Is Actually Built" below.

## What Is Actually Built

**Zero new tables.** This is the first module in the roadmap whose entire footprint is a service and a controller, and it is the reason a name-based audit read this module as absent — see the note in `00-MASTER-ARCHITECTURE.md` §4b. Nothing here needs to be stored because a report is a function of rows that already exist.

| File | What it is |
|---|---|
| `backend/src/modules/reports/reports.controller.ts` | 6 read endpoints + 4 CSV exports. **No POST/PATCH/DELETE**, deliberately. |
| `backend/src/modules/reports/reports.service.ts` | 34 KB. All aggregation in SQL; every figure carries its own exclusions. |
| `backend/src/modules/reports/occupancy.ts` | Pure occupancy arithmetic shared by every report. No DB, no Nest. |
| `backend/src/modules/reports/occupancy.spec.ts` | 34 tests. |
| `backend/src/modules/reports/reports-roles.ts` | One permission, five documented exclusions. |
| `backend/src/modules/reports/reports.module.ts` | Registered in `app.module.ts`. |
| `frontend/` | **Nothing.** No route, no sidebar entry, no API client. |

### Routes

| Method | Path | Notes |
|---|---|---|
| GET | `/reports/occupancy` | Snapshot now, by property. Flags units whose flag disagrees with its lease. |
| GET | `/reports/occupancy/trend` | Month-end over a window. A *different query* — see below. |
| GET | `/reports/financial` | Invoiced, collected, outstanding, net. |
| GET | `/reports/sales` | Sales value, stage breakdown, agent performance, lead conversion. |
| GET | `/reports/maintenance` | Throughput, average completion time and cost, by source. |
| GET | `/reports/landlords/:id/roi` | One landlord's return. `null`, not a 404 body, when the id is not theirs. |
| GET | `/reports/{occupancy,financial,sales,maintenance}/export` | `text/csv` with a `Content-Disposition` filename. |

### Five decisions worth keeping

1. **Everything is aggregated in the database.** No report loads rows into Node to add them up. The existing dashboard *does* (`invoices.findMany` then bucket in JS) and is fine at demo scale; a report that stops working at exactly the scale it is needed is worse than no report. Scalar totals use Prisma `aggregate`; the month series uses `$queryRaw` with `date_trunc`, because Prisma's `groupBy` cannot truncate a timestamp.
2. **A nullable `organizationId` is counted, not ignored.** `Invoice.organizationId` and `Payment.organizationId` are both optional in this schema. Money with no organization belongs to no tenant, so it is excluded — but the excluded count is **returned alongside**, because a revenue report whose denominator nobody can see is a number nobody should act on. Silently including it is a cross-tenant leak; silently excluding it is a quiet lie.
3. **Occupancy comes from the leases, not from `Unit.status`.** `Unit.status` is what the operations team last recorded; the lease is the evidence. Where the two disagree, the report counts it *and* flags it — silently preferring either source is how a report becomes confidently wrong.
4. **Snapshot and trend are different queries and must not be shared.** "How full is the estate today?" asks which agreement is live now. "How full was it in March?" asks which agreement covered that date, including one now `RENEWED` or `TERMINATED`, because at that date it *was* in force. Using the snapshot test for the trend understates history and makes occupancy appear to jump when nothing happened.
5. **An estate with no units is `null`, not 100% and not 0%.** Dividing by zero gives `NaN`, which renders as a blank cell and reads as "no data" rather than "nothing to measure". Percentages are clamped to [0, 100] and rounded once, at the end.

### RBAC — one permission, and the exclusions are the point

`REPORTS_VIEW_ROLES` is the narrowest list in the product. The line is **money across the whole organization**: a report has no single owning record, and there is no sensible way to scope a P&L to one property manager's buildings. Deliberately excluded: `LEASING_OFFICER` (most likely to want the occupancy report — it is their job, and they can get occupancy per property from the property screens; what they must not have is the revenue attached to it, because a leasing officer who can see what a unit earns has a number to negotiate against), `MAINTENANCE_MANAGER` and `TECHNICIAN` (their own throughput is on the work-order queue; cost *per property* across an estate they do not manage is a budget conversation), and `PROCUREMENT_OFFICER` (supplier spend is Finance's picture). One permission module `reports` rather than one per category, because a role holding `reports.occupancy` without `reports.financial` is not more confidential, just less useful.

## Scope / Sub-modules
- Occupancy: occupancy %, vacancy %, vacant units — **done** (snapshot + trend)
- Financial: revenue, expenses, profit, cash flow — **partly done**: invoiced, collected, outstanding, net. Expenses and profit come from the ledger (Module 7), not from here.
- Sales: conversion rate, top agents, sales value — **done**
- Maintenance: open work orders, average completion time, cost per property — **done**
- Landlord: ROI, income statements, expense analysis — **partly done**: ROI endpoint only.

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Reporting. **Net-new: none.** This module adds no tables and no enums, by design.

## Tasks Checklist
- [x] Build backend aggregation endpoints per report category (start simple: direct SQL/Prisma aggregation queries; consider materialized views only if performance requires it) — done 2026-10-07: six endpoints. No materialized views; `aggregate` plus one `$queryRaw` for the month series.
- [x] Wire the existing dashboard page to real occupancy + financial endpoints first (closes the Stabilization bug) — closed 2026-10-03 by the **Stabilization** module, which built `GET /dashboard/stats`; the dashboard page reads it and is no longer hardcoded. Note it was **not** wired to this module's endpoints, and does not need to be — `/dashboard/stats` is the right shape for four headline cards, and this module's endpoints are the drill-down behind them.
- [x] Build sales and maintenance report endpoints once those modules have real data — done 2026-10-07.
- [x] Build landlord ROI report (depends on Landlord Management's OwnerStatement data) — done 2026-10-07 as `/reports/landlords/:id/roi`. It reads the landlord's invoices, payments and charges directly rather than `OwnerStatement`, because a statement is a frozen document for a settled period and a report asks about a live one.
- [ ] Add CSV/PDF export on every report and on major list pages generally, per `00-UX-CROSS-CUTTING-STANDARDS.md` — **partly done 2026-10-07.** CSV exists on 4 of 5 reports; **landlord ROI has no export**, and there is **no PDF anywhere in the app**. Major list pages now export for properties, units, landlords, landlord charges, owner statements, landlord payouts, sales and leases (8 resources). **Still without export: finance (invoices, receipts, payments), tenants, HR, inventory, procurement, work orders, facilities, utilities and contracts** — so issue 31 is partly open, and this module's own scope says "on every report", which is one route short.
- [ ] Frontend: replace hardcoded Recharts data with real API-driven data; keep Recharts as the charting library already in use — **not started.** The hardcoded data was already removed by Stabilization; what remains is the six endpoints and four exports with no route, no sidebar entry and no API client. Recharts is installed and in use elsewhere, so this is wiring, not a new dependency.

## Backend: NestJS Notes
- New module: `backend/src/reports/`. *(Shipped at `backend/src/modules/reports/` — the doc's path predates the `modules/` convention used by every other module.)*
- Prefer read-optimized query endpoints over reusing transactional CRUD endpoints for dashboard data.
- **Route ordering:** the controller declares all four CSV routes before `/landlords/:id/roi` and explains why — `/reports/financial/export` is two segments and would be swallowed by a `:id` route declared first. **Today no bare `@Get(':id')` exists on the `reports` prefix, so the hazard is latent rather than live, and nothing pins the ordering.** If a `:id` route is ever added, add a `routing.spec.ts` for this module the way `legal/` and `facilities/` each have one, or re-open the Module 13 shadowing bug (issue 91).

## Frontend: Next.js Notes
- `frontend/app/(dashboard)/dashboard/page.tsx` is the known hardcoded entry point to fix first. *(Done 2026-10-03 by Stabilization — no longer hardcoded.)*
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.
- A reports frontend has one obligation the rest of the app does not: **it must handle `null` occupancy** (an estate with no units), not render it as 0% or a blank cell. `occupancy.ts` rule 4 exists for this and the type forces the case.

## Acceptance Criteria
- Dashboard numbers change correctly when underlying data (a new payment, a new lease, etc.) changes — **met**, via `/dashboard/stats` since 2026-10-03.
- *Added 2026-10-07, because the one above is satisfied by a different module and says nothing about this one:* a new payment or lease must move the corresponding `/reports/financial` and `/reports/occupancy` figures. Not yet verified in a browser, because there is no browser page to verify it in; the aggregation is covered by the service and `occupancy.spec.ts`.

## Dependencies on Other Modules
- Depends on: every module that produces data (Property, Leasing, Finance, Sales, Maintenance, Landlord). **All five are now built**, which is what unblocked this module — it could not be finished before Module 15's landlord data and Module 9's work orders existed.
