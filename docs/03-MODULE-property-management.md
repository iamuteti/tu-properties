# Module 2: Property Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**Complete (backend + frontend).** Property/unit detail and edit pages exist, occupancy status is a validated
state machine driven by rental agreements, amenities are structured rows, photos/floor plans go through the
Document Center, lists filter by status/type/branch with row actions, and CSV import/export is wired for both
entities. Follow-ups are listed at the bottom.

## Module Goal
Manage the property registry and unit-level inventory that every other module (leasing, sales, maintenance) references — and bring it up to a real, usable standard, not just data entry.

## Existing Coverage in TU Properties (as described by project owner — verified during Module 2)
- Properties and units models with occupancy status — implemented and real.
- `properties/new` form existed (831 lines) and `units/new` form existed (609 lines) with **no** detail page, **no** edit page, **no** row actions beyond delete, and no bulk operations. Both have since been replaced by shared, sectioned form components.
- Photo/floor-plan upload, structured amenities, availability calendar and bulk import were all absent; all four now exist.

## Scope / Sub-modules
- Property Registry: residential, commercial, mixed-use, land/plots, warehouses, apartments, villas
- Property details: code, name, type, status, owner, branch, address, GPS, floor plans, amenities, photos, documents
- Units Management: buildings, blocks, floors, individual units, numbering, bedrooms, bathrooms, area, occupancy status

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Property

## Tasks Checklist
- [x] Audit existing Property/Unit models against `01-DATABASE-SCHEMA.md`; reconcile gaps (GPS coords, amenities, floor plans likely missing as structured fields)
- [x] Build property detail page and edit capability (currently absent — see `00-UX-CROSS-CUTTING-STANDARDS.md`)
- [x] Build unit detail page and edit capability; add explicit occupancy-status transition actions rather than a raw dropdown
- [x] Add amenities as structured data (Json or separate table) rather than free text
- [x] Wire photo/floor-plan upload to the Document Center once Module Core Platform builds it — don't build a separate ad hoc upload mechanism for this module
- [x] Add property/unit list filtering by status, type, branch (verify current filter coverage against the audit's note that filters exist 'in some places' only)
- [x] Add CSV/bulk import for properties and units — flagged in `00-UX-CROSS-CUTTING-STANDARDS.md` as expected for high-volume entities
- [x] Consider an availability calendar view for vacant units, since this is standard in competitor products and currently absent
- [x] Break the 831-line property form and 609-line unit form into logical sections/steps with validation-before-advancing, per the UX standards doc

## What Was Built

### Schema (`backend/src/prisma/schema.prisma`)
| Change | Why |
| --- | --- |
| `PropertyStatus { ACTIVE, INACTIVE, ARCHIVED }` + `Property.status` (default `ACTIVE`) | Lifecycle was missing; `type`/`category` classify the asset and cannot express "we stopped managing this". Archived rows are hidden from default lists. |
| `Property.branchId` → `Branch` | The Module 1 branch entity had no link to the property registry, so "filter by branch" (a checklist item) had nothing to filter on. Nullable so pre-existing rows keep working. |
| `PropertyAmenity` (unique `(propertyId, name)`, cascade delete) | Amenities were never stored at all. Structured rows can be filtered, grouped by `category` and reported on. |

Migration: `20261003132000_module2_property_management`. It also records, idempotently, the two FK
nullability relaxations (`AuditLog.userId`, `Document.uploadedById`) that Module 1 applied with
`prisma db push` and so never reached migration history — otherwise every fresh database drifts.

### Backend
- **DTOs with `class-validator`** (`modules/properties/dto/property.dto.ts`, `modules/units/dto/unit.dto.ts`).
  Both create endpoints previously took a raw `Prisma.*CreateInput`, so *any* column could be set from the
  browser, nested relation writes were possible, and nothing was validated. The global `ValidationPipe` now
  runs with `whitelist: true, transform: true`, so undeclared fields (e.g. `organizationId`) are stripped.
- **`common/dto/transforms.ts`** — blank form values (`""`) become `undefined`, numbers/booleans coerce.
- **Cross-tenant hole closed**: `UnitsService.create` connected whatever `propertyId` the client sent, so a
  tenant could attach units to another tenant's property. The parent property is now tenant-checked first.
- **Occupancy is a state machine** (`modules/units/occupancy.ts`, pure and unit-tested):
  - `OCCUPIED` requires an active agreement; `RESERVED` requires an active or upcoming one;
    `VACANT`/`MAINTENANCE` are refused while an agreement is active — with an explanatory 409.
  - `RentalAgreementsService` calls `UnitsService.syncOccupancyStatus` on agreement create/update/delete, so
    status follows real lease state. A maintenance hold is never cleared automatically.
  - `PATCH /units/:id/status` is the only way to change occupancy; `PATCH /units/:id` no longer accepts it.
- **Guards instead of FK 500s**: deleting a property that still has units, or a unit referenced by a rental
  agreement, now returns 409 with a readable reason.
- **New endpoints**: `GET /properties/availability`, `GET /properties/occupancy`, `GET|POST|PUT|DELETE
  /properties/:id/amenities`, `GET /properties/export`, `GET /properties/import-template`,
  `POST /properties/import`, the same four for units, plus `PATCH /units/:id/status` and
  `POST /units/:id/sync-status`.
- **CSV parsing/serialising lives on the server** (`common/csv.ts`) — quoted fields, embedded commas/newlines,
  CRLF, BOM; per-row import report (`created` / `skipped` / `failed` with a reason) and an optional dry run.
- List filters: properties by `status`, `type`, `category`, `landlordId`, `branchId`, `includeArchived`;
  units additionally by `floor`, `bedrooms` and `branchId` (through the parent property).
- **Incidental fix in the leases module**: lease create/update coerced ISO date strings to `Date` and pinned
  `organizationId` as a scalar (injecting a nested `organization.connect` into an unchecked payload made
  every lease create a 500). Without it, "occupancy reflects real lease state" was untestable.

### Frontend
- `properties/[id]` — overview (details, amenities, notes), units table with occupancy + current tenant,
  photos & documents tab, header actions (edit, active/inactive/archive, delete with reason).
- `properties/[id]/edit` and `units/[id]/edit` — real edit routes, both reusing the create form component.
- `units/[id]` — occupancy card with named next-state actions, specifications, features/charges, rental
  agreements, invoices and outstanding balance.
- `components/properties/property-form.tsx` and `components/units/unit-form.tsx` — one component per entity,
  step-based with validation before advancing and a localStorage draft; used by create *and* edit.
  Their field names now match the API (the old unit form sent `unitNumber`, `specifiedFloor`, `unitTypeId`,
  `carSpaceParking`, `marketRent`, … which the database silently discarded).
- `components/ui/entity-states.tsx` — `LoadingState` / `EmptyState` / `ErrorState` / `StatusBadge`.
- `components/ui/row-actions.tsx` — the row action menu every list was missing, with a reason shown for
  disabled actions (e.g. "delete blocked — this property still has units").
- `components/ui/csv-import-modal.tsx` — template download, file pick, dry-run preview, per-row report.
- `components/properties/property-documents.tsx` — uploads through `documentsApi` (Document Center).
- Lists: filters for status/type/branch/property/bedrooms, row actions, CSV export/import, availability view
  at `/properties/availability`.
- `types/index.ts` — `PropertyStatus`, `UnitStatus`, `PropertyAmenity`, `UnitFeature`, `ImportReport`, unit
  `occupancy`; removed the fictional `Property.categoryId` / `propertyTypeId` / `PropertyCategory` fields the
  database never had.

## Verification Performed
- `npx tsc --noEmit` clean (backend and frontend); `npx next build` succeeds.
- `npx jest` — 105 tests across 8 suites pass (was 36). New: `units/occupancy.spec.ts` (transition matrix and
  derivation), `units/units.service.spec.ts`, `common/csv.spec.ts`, extended `properties.service.spec.ts`.
- Live API smoke test against both demo tenants confirmed: create/patch/detail with amenities, occupancy
  rollup, availability feed, CSV export + import (including a deliberately bad row and a re-import skip),
  unit create + status transitions, and lease-driven sync OCCUPIED → VACANT on lease delete.
- Cross-tenant checks return 404 for read/status-change/property read, and creation under another tenant's
  property is refused.
- All new frontend routes return 200 in dev (`/properties`, `/properties/[id]`, `/properties/[id]/edit`,
  `/properties/availability`, `/units`, `/units/[id]`, `/units/[id]/edit`, `*/new`).

## Known Gaps / Follow-ups (not blocking)
- **Floor plans are ordinary documents.** The detail page groups files by mime type; a document *kind*
  (photo / floor plan / contract) belongs to Module 16 (Documents & Legal), so no field was invented here.
- **Landlords have no module of their own yet** (Module 7), so landlord filtering and the landlord pickers
  depend on that module landing first.
- **No property ↔ unit photo per unit**, only per property.
- **Rent roll / lease billing for a unit** is Module 5+ work; the unit page only *displays* the invoices
  that already exist.
- **Branding variants are still demo-only** (see `00-MASTER-ARCHITECTURE.md`).
- **Amenities are not yet rolled up into search** (`?amenities=Lift,Gym`); the table and grouping exist, the
  query filter does not.

## Backend: NestJS Notes
- Implemented at `backend/src/modules/properties/` and `backend/src/modules/units/`.
- Occupancy status is derived from/validated against `RentalAgreement` records — see `units/occupancy.ts`,
  which is deliberately pure so it can be unit-tested without a database.

## Frontend: Next.js Notes
- This module was a primary target for `00-UX-CROSS-CUTTING-STANDARDS.md`; the field-dump forms and missing
  detail pages are resolved. The shared form/step/state/row-action components are the pattern later modules
  should follow.

## Acceptance Criteria
- [x] Can create a property, add units to it, view/edit both via real detail pages, and see accurate occupancy status reflecting real lease state
- [x] Property list can be filtered by type/status/branch and supports bulk import

## Dependencies on Other Modules
- Depended on by: Lease & Tenancy, Sales, Maintenance, Utilities, Facilities