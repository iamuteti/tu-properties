# Module 2: Property Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
List + create only, audit-verified. Property creation form alone is 831 lines with no detail/edit page behind it. No photos/floor-plan management, no import, no availability calendars.

## Module Goal
Manage the property registry and unit-level inventory that every other module (leasing, sales, maintenance) references — and bring it up to a real, usable standard, not just data entry.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Properties and units models with occupancy status — implemented and real.
- `properties/new` form exists (831 lines) and `units/new` form exists (609 lines) — but no detail page, no edit page, no row actions beyond delete, and no bulk operations, confirmed by audit.
- No photo/floor-plan upload, no amenities as structured data, no availability calendar, no import/bulk-upload capability found.

## Scope / Sub-modules
- Property Registry: residential, commercial, mixed-use, land/plots, warehouses, apartments, villas
- Property details: code, name, type, status, owner, branch, address, GPS, floor plans, amenities, photos, documents
- Units Management: buildings, blocks, floors, individual units, numbering, bedrooms, bathrooms, area, occupancy status

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Property

## Tasks Checklist
- [ ] Audit existing Property/Unit models against `01-DATABASE-SCHEMA.md`; reconcile gaps (GPS coords, amenities, floor plans likely missing as structured fields)
- [ ] Build property detail page and edit capability (currently absent — see `00-UX-CROSS-CUTTING-STANDARDS.md`)
- [ ] Build unit detail page and edit capability; add explicit occupancy-status transition actions rather than a raw dropdown
- [ ] Add amenities as structured data (Json or separate table) rather than free text
- [ ] Wire photo/floor-plan upload to the Document Center once Module Core Platform builds it — don't build a separate ad hoc upload mechanism for this module
- [ ] Add property/unit list filtering by status, type, branch (verify current filter coverage against the audit's note that filters exist 'in some places' only)
- [ ] Add CSV/bulk import for properties and units — flagged in `00-UX-CROSS-CUTTING-STANDARDS.md` as expected for high-volume entities
- [ ] Consider an availability calendar view for vacant units, since this is standard in competitor products and currently absent
- [ ] Break the 831-line property form and 609-line unit form into logical sections/steps with validation-before-advancing, per the UX standards doc

## Backend: NestJS Notes
- Likely at `backend/src/properties/`, `backend/src/units/` — check before creating new modules.
- Occupancy status should be derived/validated against active RentalAgreement records where possible, not just manually set.

## Frontend: Next.js Notes
- This module is a primary target for `00-UX-CROSS-CUTTING-STANDARDS.md` — it has the largest forms in the app and currently zero detail/edit pages behind them.

## Acceptance Criteria
- Can create a property, add units to it, view/edit both via real detail pages, and see accurate occupancy status reflecting real lease state
- Property list can be filtered by type/status/branch and supports bulk import

## Dependencies on Other Modules
- Depended on by: Lease & Tenancy, Sales, Maintenance, Utilities, Facilities
