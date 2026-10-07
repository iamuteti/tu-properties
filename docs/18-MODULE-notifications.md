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

**The two owner-facing triggers are now wired** — `OWNER_STATEMENT_READY` and `PAYOUT_PAID` were the last genuinely-open items, blocked for a month on the recipient model rather than on a missing call. Fixed by adding `landlordId` to `notifications` and to `NotificationRecipient` (migration `20261007120000_module17_landlord_notifications`), which is issue 123 below. **What remains open is narrower:** SMS has still never sent, there is no WhatsApp or push provider at all, and an owner cannot opt out of a channel (issue 124) because preferences are keyed on `userId` and there is no owner portal to record the choice in.

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

### Owner statements and payouts — DONE 2026-10-07 (issue 123)

Option A, as recommended: **`landlordId` added to `notifications` and to `NotificationRecipient`** by migration `20261007120000_module17_landlord_notifications`, with `contactFor()` learning a third branch. An owner is now a first-class recipient on exactly the footing a portal resident is.

Four decisions in the migration and the wiring:

1. **`notifications_one_recipient` CHECK — `num_nonnolls("userId","tenantId","landlordId") >= 1`.** The service has always thrown on a recipient-less notification, but three nullable columns with no constraint is how a row becomes an orphan nobody can find. Probed with four inserts: landlord-only **accepted**, no recipient **refused by the CHECK**, landlord+user **accepted**, bogus landlord **refused by the FK**. The existing 2,924 rows were verified compliant before the constraint was added (0 with a NULL `organizationId`, 0 with no recipient).
2. **`>= 1`, not `== 1`.** When the Phase 2 owner portal lands a landlord *will* also be a `User`, and a row may legitimately carry both. Writing it as `>= 1` means that transition needs no second migration — the same reasoning as Module 15's `contracts_one_related_entity`.
3. **Owners are reached on EMAIL and SMS and deliberately *not* `IN_APP`.** In-app notifications are read out of a signed-in user's own list, and a landlord has no login, so an in-app row would sit unread in a list nobody can open — which makes the one screen an administrator *does* check look busy rather than making the owner informed. `IN_APP` comes back here and nowhere else when the portal lands.
4. **Both triggers fire on the *transition*, not on the value.** `issue()` on a DRAFT only (an already-`ISSUED` statement returns early, so re-issuing does not re-notify), and `updateStatus` only when `payout.status !== PAID` — the DTO can restate a status the row already holds, and a second "your money has been paid" for one payment is what teaches a recipient to ignore the first. `dedupeKey` would also catch it, but a key that hides a duplicate would equally hide a genuine second payment, so the state change is the guard.

**A consequence worth stating rather than discovering:** preferences are keyed on `userId`, so a landlord has no preference row and is therefore always "wanting" every channel. **An owner cannot currently opt out of SMS, and this module will send them one.** There is no owner portal in which to record the choice — recorded as **issue 124** rather than left as a surprise when the first owner complains.

### Verified live, 2026-10-07 (owner triggers)

| Check | Result |
|---|---|
| `POST /owner-statements` then `/issue` | 2 rows written, addressed by `landlordId` — SMS and EMAIL both `SUPPRESSED` with an accurate reason |
| `/issue` twice more | rows for that statement stayed at **2** — the transition guard holds |
| `PATCH /landlord-payouts/:id/status` → PAID | EMAIL **SENT**, SMS `SUPPRESSED`; the local sink captured the message at the landlord's real address |
| Subject line | "Your payout of 3322883.05 KES has been paid" |
| Every owner-facing row | 6 of 6 carry a non-null `landlordId` |

Two real fixes came out of the live run rather than from review. The **first** payout message read *"Payout cmuxt37b6128pn1i09xm7lnnb has been paid"* — `LandlordPayout` has no payout number (its `reference` column is the *bank* reference), so the cuid was the only identifier available and an internal row id was in a sentence addressed to a person; the title now leads with the figure and the bank reference stays in the body where it belongs. The **second** was `535 Authentication not implemented` from the local sink — my sink's bug, and the application behaved correctly throughout by recording `FAILED` with the server's own reason rather than claiming a send that never happened.

Every new statement is annotated with why, `LandlordsModule` imports `NotificationsModule` **one-directionally** (the issue-85 rule), and the new service swallows its own failures: failing an issued statement because a mail server was slow would be worse than an owner who finds out by looking.

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
