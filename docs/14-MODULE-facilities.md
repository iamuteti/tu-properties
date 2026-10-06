# Module 13: Facilities Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status

✅ **COMPLETE 2026-10-05.** Backend, frontend, migration, RBAC and demo seed all landed and were verified live. 187 tests for this module (1073 across the backend), `tsc --noEmit` clean on both apps, `next build` clean, and the module's one acceptance criterion proven by concurrent live requests rather than asserted.

## Module Goal
Manage shared facility bookings and access.

## Existing Coverage in TU Properties
Was absent, as the audit said. Six tables now exist: `facilities`, `facility_bookings`, `facility_blackouts`, `visitors`, `visitor_visits`, `access_cards`.

## Scope / Sub-modules
All six named in the original scope, and how each landed:

| Sub-system | How it is modelled | Note |
|---|---|---|
| Clubhouse bookings | `Facility` of kind `CLUBHOUSE`, booked in whole-slot blocks | The slot grid is a property of the facility, not of each booking |
| Meeting rooms | `Facility` of kind `MEETING_ROOM` | One row per room, so the diary can show it |
| Amenities reservations | `Facility` of kind `GYM` / `POOL` / `TENNIS_COURT` / `LAUNDRY` / `RECREATION` | The doc said "amenities"; splitting it by kind is what makes the register filterable |
| Parking allocation | Two mechanisms, deliberately | Bookable visitor parking is a `Facility` of kind `PARKING` (a bookable resource); resident parking allocation is an `AccessCard` of type `PARKING` (an entitlement, not a slot) |
| Visitor management | `Visitor` (a person) + `VisitorVisit` (an arrival) | Two tables, not the "simple log" the doc suggested — see below |
| Access cards | `AccessCard` | Data tracking only, as the doc's v1 decision said |

### One deliberate departure from the doc
The doc's target schema had `FacilityBooking.facilityName String // clubhouse, meeting room, parking slot` and no `Facility` table at all. That is a booking with a name typed into it and nothing behind it: it cannot answer "when is the clubhouse free", cannot carry opening hours or a booking grid, and cannot refuse an overlapping booking. So **the facility is its own row and the booking points at it** — which is also what makes a schedule possible. The doc's free-text comment names three different *kinds* of thing in one column, which is the same problem `Property.type` had (master doc issue 33).

## Relevant Database Tables
Migration `20261005130000_module13_facilities`. `migrate diff --from-migrations` reports **no difference** against the live database.

### The guarantee, and where it lives
The module's acceptance criterion — "A facility can be booked without double-booking the same slot" — is enforced **by PostgreSQL, not by the API**:

```sql
ALTER TABLE facility_bookings
    ADD CONSTRAINT facility_bookings_no_overlap
    EXCLUDE USING gist (
        "facilityId" WITH =,
        tsrange("startsAt", "endsAt", '[)') WITH &&
    )
    WHERE ("status" IN ('PENDING', 'CONFIRMED'));
```

A `SELECT`-then-`INSERT` cannot deliver it: two receptionists pressing Confirm in the same instant both read an empty slot and both write. The service check still runs, because it has to *name the conflicting booking* in the error, and the constraint is what makes that check honest. Both are load-bearing. Requires `btree_gist` from `postgresql-contrib`.

`tsrange` not `tstzrange` because `DateTime` is `TIMESTAMP(3) WITHOUT TIME ZONE` in this schema — pairing a naive column with a zoned range type would make the comparison depend on the server's `TimeZone` setting, i.e. a double booking that reproduces only on one machine. The `[)` bound is not decoration: it is what lets 10:00–12:00 and 12:00–14:00 coexist, which is every diary anybody draws.

**Live-verified** by five probes against the running database: overlap refused, head-overlap refused, abutting accepted, `CANCELLED` not occupying the slot, same slot on a different facility accepted.

## Tasks Checklist
- [x] Add `FacilityBooking` model per `01-DATABASE-SCHEMA.md` — and the `Facility` it points at
- [x] Build facility booking CRUD with time-slot conflict prevention — with the guarantee in the database, not just the service
- [x] Build visitor management (log entry, optionally link to a Contact) — two tables, because a name on a gate-book row cannot answer "have we had this person before" or "are they barred"
- [x] Access card tracking — data tracking only (v1), as the doc's decision said
- [x] CSV export for facilities, bookings, visitors, visits and access cards
- [x] Bulk approve/decline/cancel with per-row outcomes
- [x] Notifications for booking decisions, visitor arrival and card expiry
- [x] Demo seed producing every reachable state

## Backend: NestJS Notes
Module: `backend/src/modules/facilities/`. Imports `AuditModule` and `NotificationsModule`; **exports nothing**.

Three pure files carry the rules, with no database and no Nest in them:

| File | What it decides |
|---|---|
| `booking-slots.ts` | When a facility is available and whether two slots collide. Half-open intervals, the slot grid, opening hours in minutes-from-midnight, the diary |
| `booking-lifecycle.ts` | The five booking states and the gates between them |
| `access-card-lifecycle.ts` | The five card states, and why a lost card is never reactivated |

### Decisions worth keeping

**No `COMPLETED` on a booking.** Every other module with a "finished" state sets it from a button, and in each case that is right because somebody did the work. A booking is different: it is over when the clock says so, so `COMPLETED` would be a second copy of a fact somebody has to keep in step. "Has this already happened" is derived on read (`bookingTiming`). `NO_SHOW` is the only past-tense state, because it is a judgement — somebody looked at an empty room at 14:00 and recorded it.

**A visitor visit has no status column either.** `checkedInAt`/`checkedOutAt` are the facts; `ON_SITE`, `OVERSTAY`, `EXPECTED`, `MISSED` and `COMPLETED` are comparisons against the clock. `OVERSTAY` is the one that matters — it stops being true without a single write happening anywhere — which is precisely why it cannot be a column.

**Opening hours are minutes from local midnight, not a pair of clock times.** A facility is open at 08:00 on every day it exists; storing that as two `DateTime`s means storing today's date too, and then the row is wrong tomorrow. Minutes also let a 24-hour car park need no overnight special case.

**A lost access card is never reactivatable.** The transition everybody expects and must not get. A lost card has been in somebody else's pocket, so its number is compromised; reactivating it means two people hold "AC-0007" and one of them found it. The way back is a *new* card recorded in `replacementCardId`, which is also the only way the history answers "how many times has this resident lost their fob".

**A card's *effective* status is derived, and the column is not the answer.** A card whose `expiresAt` has passed opens nothing whether or not anybody flipped the column — because nobody is standing at a reader at 23:59 on the expiry date. The register shows `effectiveStatus` and labels it "by date" when it disagrees with the column; `?status=EXPIRED` filters on the derived value, so it also finds cards whose column still says ACTIVE.

**Whoever books on a resident's behalf must not be the person who approves.** Two layers, because either alone is insufficient: `facility_bookings.decide` is a permission separate from `.create` (so a `LEASING_OFFICER` can book but not authorise), and `booking-lifecycle.ts` refuses to let one person approve their own request (which covers the case where a property manager booked on their own behalf).

**Closure and grid changes refuse to orphan a live booking**, naming the ones affected. Same guard as Module 6's overlapping owner statements (master doc issue 61). The rationale for the grid check is in the code: Prisma cannot express a modulo on a timestamp portably, so a partial SQL guard would let through exactly the change it was written to stop.

## Frontend: Next.js Notes
Routes under `(dashboard)/facilities/`: register, detail (with the slot-grid diary), new, edit, book, bookings list, booking detail, visitors list/detail/new/edit, visits (the gate book), access cards list/detail/new. Sidebar group added, with the two gate screens restricted to the gate roles.

The two screens that earn their shape:
- **The facility detail page is a slot grid, not a list.** "When is the clubhouse free?" is a question about *empty* slots, and a list of bookings cannot answer it. The grid comes from the server, so a 15-minute facility and a two-hour one are both drawn correctly by the same code.
- **The booking form's picker *is* the grid.** An hour+minute picker would let somebody ask for 10:37 on a 60-minute facility and then be refused by the API for a rule the form never showed them. A live `POST /preview` call — same `checkSlot` the create path runs — surfaces the refusal while the form is still open.

Every state change on the booking detail page comes from the record's server-computed `availableActions`, so the menu cannot offer something the API would refuse.

## Acceptance Criteria
- ✅ **A facility can be booked without double-booking the same slot.** Verified live: a duplicate returns 409 naming the holder; a booking abutting the next one returns 201; a partial overlap is refused; a start off the grid is refused with the nearest valid time suggested; and **six simultaneous requests for the same slot produced exactly one 201 and five 409s.**

## Verified live (both demo organizations)
21 assertions, all passing. The highlights:
- **The five resource routes all resolve** — see known issue 1 for the bug this session found in them.
- **Cross-tenant**: Westhill sees 0 facilities / 0 visitors, and `GET` on a Rohi facility, visitor or booking id returns **404** (not 403, not an empty 200 — a filter that cannot match the wrong row cannot return it).
- **The acceptance criterion, four ways**: a free slot books (201), the same slot is refused (409, naming the holder), the abutting slot books (201 — the half-open `[)` rule), and a slot beyond the facility's 90-day horizon is refused (409).
- **RBAC, role by role**: a Leasing Officer may read and take bookings but is 403 on approving one, on the visitor log and on the card register; an Accountant may read the register but is 403 on the cards; a Technician may read the register, the booking ledger and the visitor log but is 403 on the card register. The gate is the narrowest list in the product, and it is narrow in the right direction.
- **Lifecycle gates**: declining with no reason is refused; a lost card cannot be reactivated (*"Only a suspended card can be brought back into use; this one is reported lost."*); a barred visitor's arrival is refused outright, quoting the recorded reason.
- **Derived, not stored**: one card whose column says `ACTIVE` while its date has passed is reported as `EXPIRED` and unusable; 2 terminal cards; all five visit states present including a 159-minute overstay.

## Dependencies on Other Modules
- **Property Management** — a facility always belongs to a property; the unit a card opens is reached through `unit.property.organizationId`, because `Unit` has no `organizationId` (master doc issue 25).
- **CRM/Contacts** — `bookedByContactId`, the host of a visit and a card holder are all `Contact`, so a contractor is one row.
- **Notifications** — booking decisions, visitor arrival, card expiry.
- **Audit** — the global interceptor; barring a visitor and revoking a card are the actions that should be asserted rather than assumed.

## Known issues / open items
1. ✅ **`LEASING_OFFICER` was a role nobody could hold in the demo.** `UserRole.LEASING_OFFICER` existed and the seeded `Leasing Officer` role existed and held permissions — but no demo user was assigned it, so the module's *central* RBAC decision (**a Leasing Officer may book a facility but may not approve one**) could be neither demonstrated nor tested live. This is the same class as master doc issues 51/54/67/75, inverted: there the enum value was missing, here the login was. `leasing@rohi.co.ke` and `leasing@westhill.co.ke` now exist in both demo organizations, and the live run above exercises the split (403 on approve, 403 on the visitor log, 403 on the cards, 200 on the ledger).
2. ⚠️ **Route registration order is load-bearing.** `FacilitiesController` has `@Get(':id')` on the `facilities` prefix, and a one-segment wildcard matches `bookings`, `visitors` and `access-cards` just as happily as a cuid. With it registered first, all three sub-resources answered **404 "Facility not found"** — and the symptom read like a broken list filter rather than a broken route. The three sub-resource controllers are now registered **before** it; `routing.spec.ts` pins that order (and proves the test fails when reversed: 8 of 13 red). **Reordering the `controllers` array reintroduces the bug silently** — the module still boots and every other test still passes. If these prefixes ever need a second level, give them their own first segment instead.
3. Open: **the booking fee is recorded but not invoiced.** `Facility.bookingFee` is snapshotted onto each booking (so a fee change next month does not restate what last month's cost was) and surfaced in the UI with an honest note — but nothing posts an invoice. That is deliberately a Finance change: a facilities screen must not quietly create a money document behind a permission unrelated to money. Route it through `InvoicesService` the way Module 10's supplier bills do.
4. Open: **no reader integration.** `AccessCard.lastSeenAt` exists so adding one does not need a migration mid-project, but every card reads "no reader has seen it". Each vendor is vendor-specific, and the column is the only honest thing to add meanwhile.
5. Open: **parking allocation is two mechanisms and nobody has said whether that is right.** Bookable visitor parking is a `Facility` of kind `PARKING`; resident parking entitlement is an `AccessCard` of type `PARKING`. That split was reasoned rather than tested against a real estate — a bay that is *both* allocated to a resident and bookable by guests is the case neither shape covers, and it is not hypothetical.
6. Open: **the resident cannot book their own facility.** There is no portal route for facilities; a resident books through staff, as the tenant portal (Module 5) works. `GET /portal/maintenance` is the pattern to copy. It is the same gap as master doc issue 86.
7. Open: **no waitlist when a slot is taken.** The refusal names who holds it and when, which is the honest minimum, but "somebody else is interested in the same evening" is a fact this module does not keep.
8. Open: **no recurring bookings.** A clubhouse that is used every second Saturday re-entered weekly. The grid makes it tractable, but a repeating pattern raises exactly the overlap question this module spent its effort answering, so it is not a small addition.
9. Open: **the demo's clubhouse bookings sit at 10:00/12:00/16:00 and the pool at 08:00** because those are the only times that satisfy a two-hour grid. That is the module working, but it does mean the seeded diary is less varied than a real one.
