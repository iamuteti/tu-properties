# Module 16: Reports & Analytics

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**BACKEND COMPLETE AND VERIFIED LIVE, FRONTEND NOT STARTED** (verified against the tree and a running server 2026-10-07, not taken from this doc's own say-so). The backend is `backend/src/modules/reports/` — a controller with six read endpoints and four CSV exports, a 34 KB service, `occupancy.ts` and `period.ts` carrying the arithmetic with 59 passing tests. It is registered in `app.module.ts` and its `reports` permission is seeded. **There is no frontend at all**: no `/reports` route, no sidebar entry, no `reportsApi` in `frontend/lib/api.ts`. Every figure this module computes is currently unreachable from a browser. The dashboard is *not* hardcoded — it reads `dashboardApi.getStats()` from `/dashboard/stats`, which the Stabilization module built on 2026-10-03 — so the original Status Hint on this page is out of date on that point too.

**The backend was wrong in five places on arrival, and only a live run against seeded data found them.** All five are fixed; see "Bugs the live run found" below, because the shape of them is the most useful thing on this page. The remaining work is the frontend, plus the two open items in the checklist.

## Bugs the live run found (all fixed 2026-10-07)

The module shipped with **34 passing tests and a green typecheck**, and five defects. Not one was caught by the tests, and the reason is the same each time: **the tests covered pure functions correctly while the defects lived in the composition.** This is the third time this codebase has hit it (issues 82, 84, 91), and the first time the untested layer was a *call site*.

| # | Defect | Why no test caught it |
|---|---|---|
| 1 | `GET /reports/occupancy/trend` returned **exactly one point for any `months`** | `monthEnds` was called as `monthEnds(new Date(), new Date(), months)` — `from` *and* `to` both now. Its own guard broke on the second iteration. All four `monthEnds` tests passed a real `from`, so the function was correctly tested and wrongly called. |
| 2 | `?from=2026-06-01` answered **the eighteen months before it**, while reporting `clamped: false` | `resolvePeriod` subtracted the 12-month default from `from` unconditionally. It was a *module-private* function in a 34 KB service, so no test could reach it, and `setMonth(getMonth() - 12)` reads as obviously correct. |
| 3 | **Landlord ROI returned `billed: 0` for every landlord, always** | The query used `where: { landlordId }` on `Invoice` — a column nothing maintains. `recurring-billing.service.ts` never sets it; all 15,063 demo invoices had it NULL. |
| 4 | A cross-tenant landlord id returned **200 with an empty body** | Deliberate, and documented as deliberate in two places. It is the exact shape issue 24 fixed everywhere else. |
| 5 | `GET /reports/occupancy/export` emitted **a header and no rows** | It exported `data.flagged` — the *disagreement* list — under unit columns, so on any estate whose data was clean (i.e. nearly always) the file was empty. |

Two of these are worth generalising, because the pattern will recur:

- **A `@@unique`-shaped assumption about a stored column is a claim about who writes it.** `Invoice.landlordId` exists, so `where: { landlordId }` compiles, type-checks, and reads as obviously right. Nothing writes it on the path that creates 99% of invoices. **The check is to ask who populates the column, not whether it exists** — and Module 6's owner statements, which *do* reconcile, get there by joining `invoice → rentalAgreement → unit → property → landlordId`.
- **An export that mirrors an exception list is empty exactly when the system is healthy.** The occupancy report's headline finding is the disagreement list, so exporting *that* made the export's row count inversely related to the data's quality.

**Also changed while fixing these:** both date helpers now build boundaries in **UTC**. On this UTC+3 server a *local* October 1 is `2025-09-30T21:00:00Z`, so an October report silently carried three hours of September — issue 97 arriving through the date layer rather than through SQL, and the same answer Module 14 gave it in `utcPeriodWindow` (`no local-time sibling`). `resolvePeriod` moved to its own file (`period.ts`) precisely so it could be tested, and `trendRange()` was extracted so the trend's *window* is tested rather than only the arithmetic inside it. Two of my own new tests were wrong on first run and said so — one asserted `getMonth()` on a now-UTC value, one assumed a month-end is never in the future. Both were bad assertions, not bad code, and the correction is noted where it matters.

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
- [ ] Add CSV/PDF export on every report and on major list pages generally, per `00-UX-CROSS-CUTTING-STANDARDS.md` — **partly done 2026-10-07.** CSV exists on 4 of 5 reports and all four now emit real rows (the occupancy one did not — see the bug table). **Landlord ROI still has no export route**, and there is **no PDF anywhere in the app**. Major list pages export for properties, units, landlords, landlord charges, owner statements, landlord payouts, sales and leases (8 resources). **Still without export: finance (invoices, receipts, payments), tenants, HR, inventory, procurement, work orders, facilities, utilities and contracts** — so issue 31 is partly open, and this module's own scope says "on every report", which is one route short.
- [ ] Frontend: replace hardcoded Recharts data with real API-driven data; keep Recharts as the charting library already in use — **not started.** The hardcoded data was already removed by Stabilization; what remains is the six endpoints and four exports with no route, no sidebar entry and no API client. Recharts is installed and in use elsewhere, so this is wiring, not a new dependency. **The data is now trustworthy**, which is the precondition this item was waiting on — see "Bugs the live run found".

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
