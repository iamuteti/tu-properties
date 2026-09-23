# Module 13: Facilities Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

## Module Goal
Manage shared facility bookings and access.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No facilities-specific tables or pages reported as existing.

## Scope / Sub-modules
- Parking allocation
- Visitor management
- Access cards
- Clubhouse bookings
- Meeting rooms
- Amenities reservations

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Facilities & Utilities

## Tasks Checklist
- [ ] Add `FacilityBooking` model per `01-DATABASE-SCHEMA.md`
- [ ] Build facility booking CRUD with time-slot conflict prevention
- [ ] Build visitor management (log entry, optionally link to a Contact) — can be a simple log for v1
- [ ] Access card tracking — decide if this is data tracking only (v1) or requires hardware integration (later phase)

## Backend: NestJS Notes
- New module: `backend/src/facilities/`.

## Frontend: Next.js Notes
- New routes under `(dashboard)/facilities/`.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- A facility can be booked without double-booking the same slot

## Dependencies on Other Modules
- Depends on: Property Management, CRM/Contacts
