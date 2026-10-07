# Module 17: Notifications

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint

**Infrastructure complete and a message has now actually been sent — verified against a live SMTP relay on 2026-10-07.** This module's standing claim used to be that *no message had ever been sent by this app*: email and SMS both reported `SUPPRESSED` until a vendor was configured, and nothing had been configured. That is no longer true. Configuring Rohi's EMAIL channel with a real Brevo relay and running the sweep produced **145 lease-expiry emails recorded `SENT`**, plus a test send through the same path.

**Most of the trigger wiring this doc's Status Hint calls open is in fact already done**, which the table in `00-MASTER-ARCHITECTURE.md` §4b still gets wrong in the opposite direction to its usual error. Wired today: leases (request decisions), the notifications sweep itself (rent due, overdue rent, lease expiry, **contract expiry**), **maintenance** (new report, assignment, every status change to the resident), **inventory** (post-movement and daily reorder sweep), **facilities** (booking awaiting approval, booking decision, visitor arrival, card expiring), **workflow** (`APPROVAL_REQUESTED` / `_DECIDED` / `_ESCALATED`) and **procurement** (purchase-request approvals). Each owning module wraps `NotificationsService` in its own thin `*-notifications.service.ts` — so grepping for `NotificationType.X` finds almost nothing and is the wrong way to audit this. **Ask what each module's notifications service can do and who calls it.**

**Genuinely still open: the two owner-facing triggers.** `OWNER_STATEMENT_READY` and `PAYOUT_PAID` exist in the enum and nothing sends them, because a `Landlord` is neither a `User` nor a `Tenant` — the `notifications` table has only `userId`/`tenantId`, `NotificationsService.notify()` requires one of those two, and there is no landlord login (the owner portal is Phase 2, issue 64). All 120 demo landlords have an email and a phone, so the contact details are not the obstacle; **the recipient model is.** See "Owner statements and payouts" below.

**SMS is still unproven in the running app.** Both providers are implemented and unit-tested against stubbed HTTP, credentials round-trip encrypted, and a test-send reaches the vendor and reports the vendor's own rejection — but no SMS has left the building, because no SMS credentials are configured. The channel reports `SUPPRESSED` with the reason *"No SMS provider is active — configure one in the admin panel"*, which is the honest behaviour and is verified live.

### Verified live, 2026-10-07

Against seeded demo data with a real SMTP relay configured, as `admin@rohi.co.ke` (a **Company Admin**, which is the point — see the permission defect below):

| Check | Result |
|---|---|
| `GET /notifications/config/providers` | 200, both SMS providers with masked-field metadata |
| `POST /notifications/config` (save) | 200, `credentialsEncrypted: "v1:…"`, **`isActive: false`** — saving does not activate |
| `GET /notifications/config` | never returns the secret; only `settings.from` |
| `POST /notifications/config/EMAIL/activate` | `isActive: true` |
| `POST /notifications/config/EMAIL/test` | **`{"ok":true,"status":"SENT"}`** — a real message left the building |
| `POST /notifications/triggers/run` | `{"leases":145,"due":0,"overdue":1105,"contracts":6}` |
| Notifications written | `LEASE_EXPIRING` 145 IN_APP **SENT** + 145 EMAIL **SENT**; `RENT_OVERDUE` 1105 IN_APP SENT + 1105 SMS SUPPRESSED; `CONTRACT_EXPIRING` 30 IN_APP SENT |
| Dedupe key shape | `lease-expiring:<leaseId>:60` — per lease **per band**, so a lease 20 days out gets one message and not four |
| Second sweep, same day | `{"leases":0,"due":0,"overdue":0,"contracts":0}` and **2,530 rows before and after** — idempotent |
| After deactivating EMAIL, sweep again | email rows recorded **SUPPRESSED**, reason *"No email provider is active — configure SMTP in the admin panel"* — not silently dropped and not falsely `SENT` |

That last row is the module's central design decision working in the real application rather than only in a test: **`SUPPRESSED` is a status distinct from `FAILED`**, because "we chose not to send" and "it broke" are different facts an operator has to be able to tell apart.

### Development note — do not send real mail while developing

The relay used for the verification above is **deactivated again** (`isActive: false`, credentials still encrypted in the local database, nothing in the repository). That matters because the sweep is a `@Cron` at 06:15 daily: leaving the channel active would keep sending real mail on every run.

For development, `backend/scripts/smtp-sink.ts` accepts mail and records it as JSON lines, so the whole path can be exercised with no vendor and no cost:

```bash
npm run smtp:sink            # listens on 127.0.0.1:2525, writes /tmp/opencode/smtp-sink.jsonl
# then save an EMAIL/SMTP config pointing at 127.0.0.1:2525 and activate it
```

`smtp-server` ships no types, which is why `backend/src/types/smtp-server.d.ts` declares the surface this repo actually uses. Adding it removed four now-obsolete `eslint-disable` directives from `email-smtp.integration.spec.ts` — those directives existed only because the import was `any`, and a disabled rule is a rule nobody reads.

### Owner statements and payouts — blocked on the recipient model

`OWNER_STATEMENT_READY` fires from `OwnerStatementsService.issue()` and `PAYOUT_PAID` from the payout `PAID` transition. Both are one call away, and the document an owner would receive already renders from the frozen statement snapshot, so there is nothing to build on the content side — **only the addressing question.** Three options, and they are not equivalent:

| Option | Cost | Consequence |
|---|---|---|
| **A. Add `landlordId` to `notifications` and to `NotificationRecipient`** | One migration; `contactFor()` learns a third branch | Matches the existing "addressed by `userId` or `tenantId`" design exactly. Keeps the audit trail, `dedupeKey` idempotency and the read/unread state that an owner's next notification will need. **Recommended.** |
| B. Mail `Landlord.email` directly from the landlords module | None | Loses the notification row entirely — no audit trail, no dedupe, and no record that anything was sent. Re-introduces exactly the kind of side-channel this module exists to avoid. |
| C. Notify internal staff instead of the owner | None | Defensible as an interim step (the accounts clerk *should* know a statement was issued), but it is not what the enum value means, and it would leave the owner-facing half of the module still unwired. |

Whichever is chosen, the trigger belongs in a `landlord-notifications.service.ts` alongside the existing per-module ones, so the landlords services stay about landlords.

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
- [x] SMS as must-have v1 channel (Twilio and Africa's Talking, one active at a time, configured from the admin panel) — done 2026-10-04, migration `20261004070000_module17_provider_config`. Both providers are implemented as REST clients (`sms-providers.ts`) and resolved through `SmsProviderRegistry`; `NotificationChannelConfig` stores the choice and encrypted credentials. Three decisions worth keeping: **only one row exists per `(organizationId, channel)`**, so "only one provider active" is a property of the schema rather than a check that can be raced — choosing a provider replaces the previous one; **saving does not activate**, so a half-typed SID cannot break a live channel, and `POST /notifications/config/:channel/test` sends through the saved config first; and **credentials are AES-256-GCM encrypted at rest** under `NOTIFICATION_CREDENTIALS_KEY`, never returned in full (masked hints only) — an admin panel that writes secrets to a readable column turns every backup into a credential leak. In-app bell + list with read/unread state is done (`/notifications`, bell in the shell, unread count polled). Admin panel at `/settings/notifications`. **Email is now closed too** — added the same day: `nodemailer`, `email-provider.ts` routing through the saved SMTP configuration, activation no longer refused for SMTP, and a test send through the saved (possibly inactive) config. Two real fixes came out of writing it: a missing `to` used to throw a `TypeError` out of the notification path instead of recording a suppressed row, and credential masking could have rendered "[object Object]" for a non-string value, which would have shown an administrator a plausible hint for a key that was never stored (configure provider in settings, one active at a time). Tenant notifications are mandatory (non-opt-out for critical alerts). In-app notification bell + list with read/unread state.
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
