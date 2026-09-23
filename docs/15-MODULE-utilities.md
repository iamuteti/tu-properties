# Module 14: Utilities

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

## Module Goal
Track utility meters and generate consumption-based billing.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No utilities-specific tables or pages reported as existing.

## Scope / Sub-modules
- Meter Management: water, electricity, gas meters
- Readings: previous/current reading, consumption
- Billing: generate invoices from consumption

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Facilities & Utilities

## Tasks Checklist
- [ ] Add `UtilityMeter`, `MeterReading` models per `01-DATABASE-SCHEMA.md`
- [ ] Build meter registration per unit
- [ ] Build reading entry (manual for v1; smart-meter integration is a later phase)
- [ ] Build consumption-based invoice generation (reading delta × rate), feeding into Finance module's Invoice model

## Backend: NestJS Notes
- New module: `backend/src/utilities/`.

## Frontend: Next.js Notes
- New routes under `(dashboard)/utilities/`.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- A meter reading entry produces a correctly-calculated consumption invoice

## Dependencies on Other Modules
- Depends on: Property Management (units)
- Feeds: Finance & Accounting
