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
- [x] Add `Notification` model per `01-DATABASE-SCHEMA.md` — done 2026-10-04, migration `20261004060000_module17_notifications`: `notifications` and `notification_preferences` with the `NotificationType`/`NotificationChannel`/`NotificationPriority`/`NotificationStatus` enums, plus `User.notifications` and `Tenant.notifications`. Residents have no login of their own, so a notification is addressed by `userId` **or** `tenantId`
- [x] Build a notification dispatch service with a pluggable channel interface — done 2026-10-04. `NotificationChannelProvider` is the interface; in-app is implemented and always available; email and SMS implement the same interface and report SUPPRESSED with a reason until a vendor client is added. Adding WhatsApp or a real SMS provider is a new class registered in `NotificationsModule`, not a change to the service — each channel (email, SMS, push, WhatsApp) implements a common provider interface. SMS as must-have v1: configure provider (Twilio or similar) in settings, one active at a time. Email as default external channel.
- [x] Build trigger points — done 2026-10-04 for rent due, overdue rent and lease expiry, daily at 06:15 via `@Cron`. Two subtleties the tests pin: a milestone only fires when the lease is **inside** that window (60/30/14/7, banded, so a lease 20 days out gets one message and not four), and overdue reminders escalate at 1/7/30 days rather than daily, because a tenant told about arrears every morning stops reading any of it. Maintenance, approval and payout triggers remain open — those modules do not exist yet (scheduled job against RentalAgreement billing cycle), late payment (scheduled job against overdue Invoice), lease expiry (scheduled job), maintenance status change (event-driven from Maintenance module), approval requests (event-driven from Workflow Engine), owner payouts (event-driven from Landlord module)
- [x] SMS as must-have v1 channel (Twilio and Africa's Talking, one active at a time, configured from the admin panel) — done 2026-10-04, migration `20261004070000_module17_provider_config`. Both providers are implemented as REST clients (`sms-providers.ts`) and resolved through `SmsProviderRegistry`; `NotificationChannelConfig` stores the choice and encrypted credentials. Three decisions worth keeping: **only one row exists per `(organizationId, channel)`**, so "only one provider active" is a property of the schema rather than a check that can be raced — choosing a provider replaces the previous one; **saving does not activate**, so a half-typed SID cannot break a live channel, and `POST /notifications/config/:channel/test` sends through the saved config first; and **credentials are AES-256-GCM encrypted at rest** under `NOTIFICATION_CREDENTIALS_KEY`, never returned in full (masked hints only) — an admin panel that writes secrets to a readable column turns every backup into a credential leak. In-app bell + list with read/unread state is done (`/notifications`, bell in the shell, unread count polled). Admin panel at `/settings/notifications`. **Still open: an SMTP client for the email channel** — SMTP is catalogued so the panel can describe it, but it is refused at activation because reporting a working channel that sends nothing is worse than not offering it (configure provider in settings, one active at a time). Tenant notifications are mandatory (non-opt-out for critical alerts). In-app notification bell + list with read/unread state.
- [x] **Wire the two triggers already built** — done 2026-10-04: resident request decisions are dispatched from `TenantRequestsService.decide()`/`.withdraw()` via `NotificationTriggersService.notifyRequestDecision`, reaching the portal login through `User.portalTenantId` and falling back to the tenant record; and lease expiry is now the scheduled sweep over the same query `RentalAgreementsService.expiring()` used. Notification failure is swallowed deliberately — turning a successful approval into an error because a row could not be inserted would be worse than a resident who opens the portal and sees the outcome (see Status Hint): resident request submitted/approved/rejected/withdrawn from `TenantRequestsService`, and lease expiry as a scheduled job over `RentalAgreementsService.expiring()`. Details in `06-MODULE-lease-tenancy.md`.

## Backend: NestJS Notes
- New module: `backend/src/modules/notifications/`, registered in `app.module.ts` and imported by `TenantRequestsModule`.
- Use a queue (check if one is already set up; if not, a simple scheduled job is acceptable for v1 rather than introducing new infra).

## Frontend: Next.js Notes
- Bell component is `components/notifications/notification-bell.tsx`, mounted in the sidebar shell and polled every 60s (no websocket layer; a stale-by-a-minute badge is acceptable where a missing badge is not). List and preferences at `/notifications`, arrears at `/finance/arrears`.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- ✅ A rent-due event produces a notification visible to the correct user via at least one channel — verified live: the sweep delivered in-app reminders for lease expiry and overdue rent, email/SMS rows recorded SUPPRESSED with a reason, and a second sweep the same day created nothing (528 rows before and after)

## Dependencies on Other Modules
- Consumed by: Lease & Tenancy, Finance & Accounting, Maintenance, Workflow Engine, Landlord Management
