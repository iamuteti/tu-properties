# Module 17: Notifications

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

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
