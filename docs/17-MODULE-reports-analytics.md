# Module 16: Reports & Analytics

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Dashboard hardcoded, audit-confirmed (`frontend/app/(dashboard)/dashboard/page.tsx:19-52,69-105`); no report builder, no exports anywhere in the app. Benchmarked competitors have 450+ reports and drill-down/export on all of them.

## Module Goal
Provide real executive dashboards and reports across occupancy, financial, sales, maintenance, and landlord ROI — with export, since the audit found zero export capability anywhere in the current app.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Dashboard page exists but shows hardcoded stats/charts — needs to be wired to real data (also listed in Stabilization module as an active bug). No other reporting UI exists.

## Scope / Sub-modules
- Occupancy: occupancy %, vacancy %, vacant units
- Financial: revenue, expenses, profit, cash flow
- Sales: conversion rate, top agents, sales value
- Maintenance: open work orders, average completion time, cost per property
- Landlord: ROI, income statements, expense analysis

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Reporting (materialized summaries/KPIs — aggregates data from every other domain)

## Tasks Checklist
- [ ] Build backend aggregation endpoints per report category (start simple: direct SQL/Prisma aggregation queries; consider materialized views only if performance requires it)
- [ ] Wire the existing dashboard page to real occupancy + financial endpoints first (closes the Stabilization bug)
- [ ] Build sales and maintenance report endpoints once those modules have real data
- [ ] Build landlord ROI report (depends on Landlord Management's OwnerStatement data)
- [ ] Add CSV/PDF export on every report and on major list pages generally, per `00-UX-CROSS-CUTTING-STANDARDS.md` — audit found zero export capability anywhere in the app today
- [ ] Frontend: replace hardcoded Recharts data with real API-driven data; keep Recharts as the charting library already in use

## Backend: NestJS Notes
- New module: `backend/src/reports/`.
- Prefer read-optimized query endpoints over reusing transactional CRUD endpoints for dashboard data.

## Frontend: Next.js Notes
- `frontend/app/(dashboard)/dashboard/page.tsx` is the known hardcoded entry point to fix first.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- Dashboard numbers change correctly when underlying data (a new payment, a new lease, etc.) changes

## Dependencies on Other Modules
- Depends on: every module that produces data (Property, Leasing, Finance, Sales, Maintenance, Landlord)
