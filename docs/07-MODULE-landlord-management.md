# Module 6: Landlord Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Landlord CRUD exists; owner portal, statements, and payouts are confirmed absent by audit — this is a significant, benchmarked gap (competitors all have owner portals).

## Module Goal
Manage landlord-owned properties, generate owner statements, and process payouts.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Landlord CRUD exists (list + create only, per the same pattern as other entities — no detail/edit page).
- Owner Statements, Payouts, and Owner Portal — all confirmed **absent** by audit. This is one of the largest gaps vs. every benchmarked competitor (AppFolio, Propertyware, MRI, Yardi, Rent Manager all have this).

## Scope / Sub-modules
- Landlord Profiles: personal details, bank accounts, tax information, contracts
- Owner Statements: rental income, expenses, management fees, net payout, downloadable statements
- Payouts: monthly disbursement, bank transfers, payment history

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Landlord

## Tasks Checklist
- [ ] Audit existing Landlord model against `01-DATABASE-SCHEMA.md`; add bank account/tax fields if missing
- [ ] Add `OwnerStatement` and `LandlordPayout` models if missing
- [ ] Build owner statement generation (aggregate rental income minus expenses minus management fee, per period, per landlord)
- [ ] Build downloadable statement PDF (reuse Document Center or a PDF generation utility — check for existing PDF tooling before adding a new dependency)
- [ ] Build payout recording + status tracking (does not need to auto-execute bank transfers in v1 — record intent/status, actual transfer can be manual/external initially)
- [ ] Build a landlord detail page (currently absent — list+create only) showing statements history and payout history
- [ ] Scope a basic Owner Portal (read-only statement/payout view, scoped auth like the Tenant Portal) — flag this as a Phase 2 item per the Master doc's roadmap rather than trying to do it alongside basic statement generation

## Backend: NestJS Notes
- New sub-module likely needed: `backend/src/landlords/statements/`, `backend/src/landlords/payouts/`.
- Statement generation should be a query/aggregation over existing Invoice/Payment/expense data — don't duplicate financial data, derive it.

## Frontend: Next.js Notes
- Extend existing landlords pages rather than creating a parallel route tree.

## Acceptance Criteria
- For a given landlord and period, an owner statement can be generated showing income, expenses, management fee, and net payout that reconciles with underlying invoices/payments
- A payout can be recorded against a statement and marked paid

## Dependencies on Other Modules
- Depends on: Finance & Accounting (income/expense data), Property Management
