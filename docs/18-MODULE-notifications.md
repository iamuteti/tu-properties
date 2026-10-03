# Module 17: Notifications

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

> **Two triggers are already built and waiting for this module.** The Lease & Tenancy module
> (`06-MODULE-lease-tenancy.md`) finished its work with the domain logic in place and the delivery deliberately
> left to here — its doc has the full write-up under *Known Gaps → Blocked on other modules*:
> 1. **Resident request decisions** — `TenantRequestsService.createFromPortal()` / `.decide()` / `.withdraw()`
>    already audit `TENANT_REQUEST_SUBMITTED` / `_APPROVED` / `_REJECTED`; each is a one-line notification call
>    away. The resident to notify is reached via `User.portalTenantId`.
> 2. **Lease expiry reminders** — `RentalAgreementsService.expiring()` already returns the leases ending inside a
>    window together with the tenant contact details a reminder needs; it only needs a scheduled job over it
>    instead of the banner the dashboard currently shows.
>
> Pick both up from that doc rather than re-deriving them.

## Module Goal
Automated reminders and alerts across email, SMS, push, and WhatsApp.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No notifications infrastructure reported as existing.

## Scope / Sub-modules
- Triggers: rent due, late payment, lease expiry, maintenance updates, approval requests, owner payouts
- Channels: in-app (always on), email (always on), SMS (must-have v1 — pluggable provider: Twilio, Africa's Talking, etc.), push notifications, WhatsApp (later phase)

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Notifications

## Tasks Checklist
- [ ] Add `Notification` model per `01-DATABASE-SCHEMA.md`
- [ ] Build a notification dispatch service with a pluggable channel interface — each channel (email, SMS, push, WhatsApp) implements a common provider interface. SMS as must-have v1: configure provider (Twilio or similar) in settings, one active at a time. Email as default external channel.
- [ ] Build trigger points: rent due (scheduled job against RentalAgreement billing cycle), late payment (scheduled job against overdue Invoice), lease expiry (scheduled job), maintenance status change (event-driven from Maintenance module), approval requests (event-driven from Workflow Engine), owner payouts (event-driven from Landlord module)
- [ ] SMS as must-have v1 channel (configure provider in settings, one active at a time). Tenant notifications are mandatory (non-opt-out for critical alerts). In-app notification bell + list with read/unread state.
- [ ] **Wire the two triggers already built** (see Status Hint): resident request submitted/approved/rejected/withdrawn from `TenantRequestsService`, and lease expiry as a scheduled job over `RentalAgreementsService.expiring()`. Details in `06-MODULE-lease-tenancy.md`.

## Backend: NestJS Notes
- New module: `backend/src/notifications/`.
- Use a queue (check if one is already set up; if not, a simple scheduled job is acceptable for v1 rather than introducing new infra).

## Frontend: Next.js Notes
- New notification bell component in the dashboard shell.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- A rent-due event produces a notification visible to the correct user via at least one channel

## Dependencies on Other Modules
- Consumed by: Lease & Tenancy, Finance & Accounting, Maintenance, Workflow Engine, Landlord Management
