# TU Properties — Product & Engineering Guide

> The architecture, data model and module reference for the platform. Read this once at the start of a
> session, then work from `ROADMAP.md`, which is the single source of truth for progress.
>
> **Doc set (deliberately small):**
> - `AGENTS.md` — commands, environment rules and hard-won build gotchas. Read before running anything.
> - `GUIDE.md` — this file: what the product is, how it is built, what each module owns and guarantees.
> - `ROADMAP.md` — phases, tasks, sub-tasks, checkboxes and the current focus. Update it as you work.
> - `docs/DEPLOYMENT.md` — production VPS, nginx, TLS, env, Stripe operations, backups.
> - `docs/Testing.md` — database seeding, demo accounts and manual test scenarios.

---

## 1. What the product is

TU Properties is a multi-tenant property-management SaaS: organizations (agencies, owners, estates) run
properties, units, tenants, leases, money, staff, maintenance and facilities from one audited system.
Every organization is its own tenant with its own currency, locale, tax jurisdiction and enabled modules.

Two claims must stay precise, because the landing page is held to them:

- **Subscription billing is real.** Paid plans are charged through Stripe Checkout (hosted redirect); see §9.
- **Rent and estate money is recorded, not processed.** Payments, allocations, credits and refunds are
  double-entry accounting over rows an operator or an importer supplies. There is no M-Pesa STK push, no
  gateway collection of rent, and no card processing inside the app. Say "records payments", not "collects
  payments".
- **Notifications are email/SMS/in-app.** Email and SMS providers exist and are configurable per
  organization; WhatsApp and push have enum values but no provider. Say "sends in-app, email and SMS".
- **Jurisdictions are configuration.** Fifteen jurisdiction profiles ship; tax and payroll rules are rows
  with country/region/validity. The platform is *priced* in two currencies (KES, USD) — that is a price-list
  fact, not a country limit.

---

## 2. Stack and layout

| Layer | Technology |
|---|---|
| Backend | NestJS 11, TypeScript, port **3003** |
| ORM / DB | Prisma 7, PostgreSQL (`tu-properies` on localhost:5432) |
| Auth | Passport JWT, bcrypt, TOTP MFA, server-side `Session` rows |
| Frontend | Next.js 16 App Router, React 19, port **3002** |
| Styling | Tailwind CSS 4 with semantic tokens (`bg-canvas`, `text-ink`, `border-line`, `brand-*`, `success/warning/danger/info`) |
| Frontend data | Axios client in `frontend/lib/api.ts`, TanStack Table, Recharts, React Hook Form + Zod |
| Editor | `react-quill-new` (not `react-quill`) |

```
backend/    NestJS API. schema.prisma is at backend/src/prisma/schema.prisma
frontend/   Next.js app. Dashboard routes live under app/(dashboard)/ — the group adds no URL segment
docs/       DEPLOYMENT.md and Testing.md only
```

Route-group rule that has broken links before: `app/(dashboard)/finance/invoices/page.tsx` is served at
`/finance/invoices`, **not** `/dashboard/finance/invoices`. The only real `/dashboard` route is the dashboard
itself.

---

## 3. Multi-tenancy

Shared database, shared schema.

- Every tenant-scoped model carries `organizationId` (FK to `Organization`, indexed). Global tables
  (`Organization`, `User`, system `Role`, `SubscriptionPlan`, `SupportTicket`, platform tables) do not.
- Services scope every query through the caller's organization. Tenant id comes from the JWT/session, never
  from a request body or query parameter.
- Cross-tenant or missing record reads return **404** via `requireRecord()` in `backend/src/common/utils.ts`,
  not 200-with-empty and not someone else's row.
- `Unit` has no `organizationId`: its scope flows through `{ property: { organizationId } }`. Every module
  that references a unit verifies the parent property before connecting.
- The only cross-organization role is SUPER_ADMIN, and only through the separate `/platform/*` controllers.
- Portal logins (`User.portalTenantId`) are scoped to one household by `TenantPortalGuard`; staff sessions
  cannot use portal routes and portal routes ignore any tenant id in the URL.

---

## 4. Auth, sessions and account security

- Transport is a deployment switch, `AUTH_MODE=cookie|bearer`:
  - `cookie` sets an httpOnly, `SameSite=Strict` `auth_token`; requires the frontend to share a registrable
    domain with the API.
  - `bearer` returns `accessToken`; the frontend stores it in `localStorage['tu_auth_token']` and sends
    `Authorization: Bearer`. Required when frontend and API are on different domains.
- Session lifetime is one hour in both modes; the JWT is checked against the `Session` row on every request,
  so revocation and password reset take effect immediately.
- MFA (TOTP) is a two-step login: `{ mfaRequired, mfaToken }` until `/auth/mfa/verify`.
- Platform impersonation mints a 15-minute bearer token for the target user, requires a reason, refuses
  suspended organizations, wins over the session token, and is audited start/end.
- Login rate limiting returns 429; audit rows carry IP and user agent.

---

## 5. Data-model principles

`backend/src/prisma/schema.prisma` is the source of truth for what exists. There is no separate "target
schema" document any more; if the schema and a comment disagree, the schema wins and the comment is a bug.

Rules that every new table and service follows:

1. **Derived, never stored, when a number can be recomputed.** `Invoice.paidAmount/balanceAmount/status` come
   from `PaymentAllocation` + credits + refunds (`invoice-settlement.ts`). Stock levels are the sum of
   `StockMovement` rows (`stock-ledger.ts`). Occupancy is reconciled from agreements. `overdue`, `noticeDue`,
   booking/visit states and card status are computed from timestamps on read. Do not add a counter that a
   second writer can leave wrong.
2. **Money is integer cents or `Decimal`.** Never float. Percentage splits use integer cents so they sum
   exactly; the remainder goes on the last row.
3. **Statutory rules are rows, not code.** Tax (`TaxRule`) and payroll (`PayrollRule`) carry country, region,
   rate/shape, ledger account and validity window. An organization with no matching rule has no tax. A rate
   change supersedes with an end date instead of editing history, so old invoices/payslips still explain
   themselves.
4. **State machines move through named actions.** A `status` field is not in an update DTO; it changes only
   via an action endpoint that enforces its gates (see §7).
5. **Constraints belong in PostgreSQL where concurrent writers exist.** The facility no-overlap rule is a GiST
   exclusion constraint; recurring rent is `@@unique([rentalAgreementId, billingPeriod])`; a stock take and a
   PM run are idempotent through unique keys, not job memory. Some indexes are hand-written SQL and invisible
   to Prisma — see the maintenance note in `AGENTS.md` before applying a generated migration.
6. **Do not duplicate an existing concept.** Suppliers, contacts, documents and the chart of accounts each
   exist once. New modules extend the existing table or borrow its service; a second table for the same noun
   is how two halves of the truth appear.
7. **Unused legacy columns are signals, not features.** `acReceivable`, `incomeAccount`, `spotRate`,
   `Property.mpesaPropertyPayNumber`, `Invoice.signOnEfims` etc. are not wired. Do not delete them and do not
   assume they work; wire them or leave them.

Database workflow: `npx prisma db push --accept-data-loss` for local iteration, `npm run db:generate` after any
install, seeds in `docs/Testing.md`. Hand-maintained indexes are documented in `AGENTS.md`.

---

## 6. Module catalogue

Status lines are last verified dates; refresh them (and `ROADMAP.md`) when you touch a module.

### Core

#### Module 0 — Stabilization & security hardening — ✅ complete 2026-10-03
- **Owns:** the baseline that made the rest safe: routing, dead code, dashboard wiring, receipt persistence,
  CORS, sessions, MFA, rate limiting, audit.
- **Invariants:** the `(dashboard)` group adds no URL segment; cross-tenant reads are 404; every JWT carries a
  `jti` checked against `Session`; CORS uses the callback form (a sync allowlist array hangs every request).
- **Open:** MFA secrets are stored unencrypted; rate-limit state is per process, so multi-instance needs a
  shared store.

#### Module 1 — Core platform — ✅ complete 2026-10-03
- **Owns:** organizations, branches, users, roles/permissions, audit, system settings, document centre,
  tenant-scoped portal logins.
- **Tables:** `Organization`, `Branch`, `User`, `Role`, `RoleAssignment` (`user_roles`), `AuditLog`, `Document`,
  `Session`.
- **Invariants:** structured `Role.permissions` overrides the legacy `UserRole` enum (fallback only) and is
  enforced by `PermissionsGuard` + `@Permissions()`; twelve system roles are seeded with `organizationId = null`;
  document versions are `max + 1` per entity/file; `AuditLog.userId` and `Document.uploadedById` are `SetNull`
  so deleting a user keeps history.
- **Open:** e-signature is deferred to a third-party embed; an `organizationId NOT NULL` migration on
  `AuditLog` was deferred.

#### Module 2 — Property & units — ✅ complete 2026-10-03
- **Tables:** `Property` (status, branchId), `PropertyAmenity`, `Unit`.
- **Invariants:** occupancy is a validated state machine (`units/occupancy.ts`); only `PATCH /units/:id/status`
  moves it; every agreement change syncs it; a maintenance hold is never auto-cleared; deletes return 409 while
  dependants exist; unit create verifies the parent property's organization.
- **Open:** amenities are not in list search; no per-unit photos; floor plans are generic documents; landlord
  filtering depends on finance links.

#### Module 3 — CRM — ✅ complete 2026-10-03
- **Tables:** `Lead`, `Contact`, `CommunicationLog`; `Tenant.contactId` (unique, `SetNull`).
- **Invariants:** `lead-pipeline.ts` is the only stage transition path; WON/LOST terminal; WON requires a
  contact; LOST requires a reason; a second conversion is refused; tenant and contact stay separate tables.
  `POST /crm/public/leads` is public behind a constant-time shared secret and takes the organization from config.
- **Open:** nothing is delivered (log only); no lead dedupe or bulk import; lost leads cannot be reopened.

#### Module 4 — Sales — ✅ complete 2026-10-03
- **Tables:** `SaleTransaction`, `SaleInstallment`, `Commission`; `Invoice.saleTransactionId`.
- **Invariants:** `sale-stage.ts` advances one stage at a time; HANDOVER needs zero outstanding and archives the
  property; one open sale per property; instalments bill through `InvoicesService`; commissions are integer-cent
  splits with PENDING → APPROVED → PAID.
- **Open:** invoice balance reconciliation belongs to Finance; no sale documents; commission payouts do not post
  to the ledger.

### Revenue

#### Module 5 — Lease & tenancy — ✅ complete 2026-10-03
- **Tables:** `Tenant`, `RentalAgreement`, `MoveOutRequest`, `MoveOutDeduction`, `InspectionReport`,
  `InspectionItem`, `LeaseTemplate`, `TenantRequest`, `PropertyUnitType`, `PropertyDepositRule`.
- **Invariants:** `lease-lifecycle.ts` — activate needs a started lease and a free unit; renew opens 60 days
  before end and creates a successor agreement linked both ways (an open-ended lease is extended, not renewed);
  terminations record a reason and vacate the unit; every action syncs occupancy. Deposit settlement is derived
  (`deposit − itemised deductions − unpaid rent`, floored at zero, remainder carried as debt); refund needs a
  reference. Deposit rules hang off unit type; **no rule refuses to guess**. An agreement cannot activate until
  its deposit is paid or waived. Portal scoping is per `User.portalTenantId`. The RBAC module key is
  `agreements`.
- **Open:** request/lease-expiry notifications are wired through Module 18 but payment-plan execution is not; no
  e-signature; no inspection photo panel; `LEASING_OFFICER` has no role picker.

#### Module 6 — Landlord management — ✅ complete 2026-10-04
- **Tables:** `Landlord`, `LandlordCharge`, `OwnerStatement`, `LandlordPayout`.
- **Invariants:** statements are **derived, never typed** — income from payments in period against rental
  invoices (sale invoices excluded), expenses from unclaimed charges claimed inside the generation transaction,
  percentage or flat fee, carried-forward arrears; integer cents; overlapping-period guard; line snapshots are
  frozen on issue. `GET /owner-statements/preview` runs the same math and writes nothing. Payouts:
  PENDING → PROCESSING → PAID/FAILED, reference required to pay, never overpay, PAID flips the statement to
  SETTLED. `LandlordCharge` is deliberately not an `Expense`; Module 7's payable entity supersedes it.
- **Open:** owner portal (Phase 2); payouts do not move money; one fee basis and one bank account per landlord;
  statement document is print-CSS HTML, not a PDF library.

#### Module 7 — Finance & accounting — ⚠️ 60%
- **Tables:** `Account`, `JournalEntry`, `JournalLine`, `TaxRule`, `Supplier`, `SupplierBill`, `BillPayment`,
  `SupplierCredit`, `RecurringBillingRun`, plus invoices/payments/receipts.
- **Invariants:** `AccountingService.postEntry` is the **only** ledger write path and refuses unbalanced,
  single-sided or negative entries; account codes are the auto-posting contract. Withheld tax is recognised on
  the invoice and never revenue. `DIRECT_REMIT` debits rent receivable from landlords and touches no bank
  account. Tax is configuration resolved by country/region at the invoice date; invoices snapshot the rule. Rent
  billing runs daily at 02:05 against each lease's own payment day; `billingPeriod` is set at insert and the
  unique constraint is the exactly-once guard. Payables mirror receivables: bill columns are derived, overpayment
  becomes supplier credit, a paid bill cannot be voided.
- **Open:** standalone credit-note issuance; bank reconciliation; period close; statutory e-invoicing adapter;
  `acReceivable`/`incomeAccount`/`spotRate` still unwired; budgets and fixed assets absent.

#### Module 8 — Payments — ⚠️ 50% (money handling built; rent gateways absent)
- **Tables:** `PaymentAllocation`, `CustomerCredit`, `PaymentRefund`, `CreditNote`, plus payments/receipts.
- **Invariants:** `PaymentAllocation` rows are what happened; `invoice-settlement.ts` is the only code allowed
  to recompute invoice money columns; `invoice-allocation.ts` is the one "how much does this bill absorb"
  rule; allocation walks oldest due first. A credit moves no cash and posts no journal entry. Refunds use the
  credit-note pattern and are capped at refundable balance. Capture-manually requires the method to say what
  actually happened; `DIRECT_REMIT` is never cash; a receipt is evidence and property managers get no
  update/delete. Future gateway webhooks must call `PaymentsService`/`allocate`, never write rows directly.
- **Open:** rent-collection gateways (M-Pesa STK/C2B, gateway settlement), receipt PDFs, FX, standalone credit
  notes, audit wiring on every money action.

> Subscription billing is a *separate* path from rent: Stripe Checkout + webhook in
> `backend/src/modules/payments/`, covering plan subscriptions only. See §9.

### Operations

#### Module 9 — Maintenance — ✅ complete 2026-10-04
- **Tables:** `WorkOrder`, `Asset`, `PreventiveMaintenanceSchedule`.
- **Invariants:** `CANCELLED` exists so duplicates are not faked to completion; approval and assignment are one
  action; EMERGENCY is the only fast-track; response windows are derived on read; PM runs on a daily idempotent
  cron keyed by `(pmScheduleId, pmDueOn)`; tenant `MAINTENANT` requests file a work order.
- **Open:** repair cost does not create a payable; no contractor entity; attachments not wired to the document
  centre; technician view is not "mine" filtered; no PM recurrence expansion.

#### Module 10 — Procurement — ✅ complete 2026-10-05
- **Tables:** `Supplier` (extended), `PurchaseRequest(+Line)`, `Rfq`, `RfqInvitation`, `RfqQuote(+Line)`,
  `PurchaseOrder(+Line)`, `GoodsReceipt(+Line)`.
- **Invariants:** supplier is reused, never duplicated; `RfqStatus.CLOSED` is reversible, `CANCELLED` is
  terminal with a reason; comparison recommends only when one quote wins on both price and lead time; received
  quantity is derived from receipt rows; approvals go through Module 18; PO completion creates a real
  `SupplierBill` through AP; purchase categories map to bill categories in one table.
- **Open:** goods returns/credit notes; request attachments; supplier portal; supplier lead times.

#### Module 11 — Inventory — ✅ complete 2026-10-05
- **Tables:** `InventoryItem`, `Warehouse`, `StockMovement`.
- **Invariants:** no `quantityOnHand` column anywhere — `stock-ledger.ts` (pure) sums movements with
  deterministic ordering and perpetual weighted-average valuation; movements take a positive quantity plus a
  direction; a transfer is two rows sharing a `transferGroup`; a stock take records *what was counted* and
  derives the variance; imports point from procurement/maintenance into inventory, never back.
- **Open:** reorder suggestions cannot say *when* (no supplier lead time); list joins all movements in memory;
  no barcode scanning or cycle counting; tenant portal sees nothing from this module.

#### Module 12 — HR & payroll — ✅ complete 2026-10-05
- **Tables:** `Employee`, `LeaveRequest`, `Payslip`, `PayrollRun`, `PayrollRule`, plus leave policies,
  holidays and pay components.
- **Invariants:** statutory rules are data (Kenya seeded); calculation is pure/integer cents; a run moves
  `calculate → approve → post → pay` with `payroll.pay` distinct from approve; posting is one journal entry;
  `DIRECTORY_SELECT` cannot include compensation; `/hr/me/*` derives the employee from the login.
- **Open:** attendance/check-in-out is deliberately absent.

#### Module 13 — Facilities — ✅ complete 2026-10-05
- **Tables:** `Facility`, `FacilityBooking`, `FacilityBlackout`, `Visitor`, `VisitorVisit`, `AccessCard`.
- **Invariants:** no double-booking is enforced by a PostgreSQL GiST exclusion constraint on half-open
  `tsrange`, scoped per facility and partial on holding states; opening hours are minutes from local midnight;
  no `COMPLETED` booking state (derived); visits have no status column (clock-derived); a lost card is never
  reactivatable; a booker cannot approve their own booking; route order `expiry-report`/specific before `:id`
  is pinned by routing specs.
- **Open:** booking fees are snapshotted but never invoiced; no reader/turnstile integration; no resident
  self-booking, waitlist or recurring bookings; cards are not revoked on move-out.

#### Module 14 — Utilities — ✅ complete 2026-10-06
- **Tables:** `UtilityMeter`, `MeterReading`, `UtilityRate`, `UtilityCharge`.
- **Invariants:** exactly-once billing is `@@unique([meterId, unitId, billingPeriod])` plus a partial unique
  index on `COALESCE(unitId, '')` for bulk meters; a utility invoice leaves `Invoice.billingPeriod` **null**
  and uses `transactionClass = 'UTILITY'` or it would silence the rent run; tariffs resolve meter → property →
  organization, most-specific wins, and are snapshotted onto the charge; rollover is opt-in per meter; billed
  readings cannot be edited.
- **Open:** no smart/AMI ingestion, no tenant-facing consumption view; `REDISTRIBUTE` vacancy policy is refused
  rather than implemented; `readingSetup` is preserved but unread.

#### Module 15 — Documents & legal — ✅ complete 2026-10-06
- **Tables:** `Contract` only; files borrow the document centre.
- **Invariants:** four typed foreign keys (lease, sale, supplier, landlord) with CHECKs for shape and type;
  status/Superseded/NoticeDue are clock-derived, never stored; `renewalOfId` points at the predecessor and
  renewal creates a new row; lease contracts inherit agreement dates/notice unless overridden; filters read
  columns; `expiry-report` is declared before `:id`.
- **Open:** e-signature absent; landlord/tenant access to their own contracts is deferred to the portal module.

### Intelligence & platform

#### Module 16 — Reports & analytics — ✅ complete 2026-10-07 (backend 10-07, frontend 10-11)
- **No new tables.** Read-only aggregation endpoints plus CSV exports for occupancy (snapshot and trend),
  financial, sales, maintenance and landlord ROI.
- **Invariants:** aggregation happens in SQL (`aggregate`, `date_trunc`); GET-only; occupancy is derived from
  leases and flags disagreements with `Unit.status`; empty estate yields `null`, not 0%; date windows are UTC
  and testable; a nullable `organizationId` row is excluded but counted; the `reports` permission excludes
  leasing, maintenance, technician and procurement roles.
- **Open:** sales report dates on `createdAt` rather than a business date (decision needed); no PDF; list
  exports for finance/tenants/HR/inventory/procurement/work orders/facilities/utilities/contracts.

#### Module 17 — Notifications — ✅ 90%
- **Tables:** `Notification`, `NotificationPreference`, `NotificationChannelConfig`.
- **Invariants:** `SUPPRESSED` is distinct from `FAILED` and always carries a reason; saving a channel config
  does not activate it (one row per org/channel); credentials are AES-256-GCM encrypted and never returned;
  a notification is addressed to exactly one of user/tenant/landlord; triggers fire on state transitions;
  dedupe keys are per recipient per band (lease expiry 60/30/14/7, arrears 1/7/30); the sweep runs at 06:15;
  each owning module wraps dispatch in its own thin notifications service and a delivery failure never fails
  the business action.
- **Open:** SMS has never actually sent (no credentials); no WhatsApp/push provider; owners cannot opt out
  (preferences are keyed on `userId`, and the owner portal is not built).

#### Module 18 — Workflow engine — ✅ built 2026-10-04
- **Tables:** `WorkflowDefinition`, `WorkflowInstance`, `WorkflowStep`, `WorkflowEvent`, `WorkflowDelegation`.
- **Invariants:** no public start endpoint — only the owning module starts an instance with its own context;
  no policy means auto-approve inside the transaction with an `AUTO_APPROVED` event; nobody approves their own
  request (absolute); administrator overrides are recorded as overrides; instances keep a frozen step copy and a
  nullable definition id so policy edits cannot rewrite in-flight approvals; escalation reassigns rather than
  copies; the completion handler runs inside the deciding transaction.
- **Open:** only refunds route through the engine; refund requests are finance-only; escalation failures are
  logged only; inbox filters in JS after loading ≤200 steps.

#### Module 19 — SaaS administration — ⚠️ platform surface complete, billing tables deferred
- **Tables:** `Subscription`, `SupportTicket`, `ContactInquiry`; `Organization.plan` remains a string and
  `maxUsers`/`maxProperties` are the enforced limits.
- **Invariants:** platform controllers live under `/platform/*` behind class-level SUPER_ADMIN; public signup
  and contact are `@Public` and rate-limited; suspension is enforced on login and on every JWT validation;
  impersonation rules in §4; usage is counted on read and over-limit creates return 409; onboarding is one
  transaction; support-ticket status is a pure state machine; cross-tenant reads 404.
- **Open:** `SubscriptionPlan`/`PlatformInvoice` billing tables; knowledge base/live chat; API usage metering.

---

## 7. Cross-cutting engines and rules

### Ledger contract
Every money-moving module posts through `AccountingService.postEntry` with the caller's transaction client.
Account codes in `accounting/chart-of-accounts.ts` are the contract with auto-posting; renaming one silently
breaks posting. Withheld tax, refunds (`Dr 4290`), deposits (`Dr 1300 / Cr 2400`) and `DIRECT_REMIT`
(`Dr 1400 / Cr 1200`) each have a fixed treatment; see Modules 7 and 8.

### State machines
Pure, unit-tested modules own each lifecycle:
`units/occupancy.ts`, `leases/lease-lifecycle.ts`, `crm/leads/lead-pipeline.ts`, `sales/sale-stage.ts`,
`landlords/payouts/payout-status.ts`, `maintenance/work-order-lifecycle.ts`,
`procurement/procurement-lifecycle.ts`, `procurement/procurement-comparison.ts`,
`inventory/stock-ledger.ts`, `hr/payroll-calc.ts`, `facilities/booking-slots.ts`,
`facilities/booking-lifecycle.ts`, `facilities/access-card-lifecycle.ts`,
`finance/tax/tax-calculator.ts`, `workflow/workflow-rules.ts`, `platform/support-ticket-lifecycle.ts`.

If you change a rule, change its pure file and its test — do not embed the rule in a controller, where the
next module cannot reuse it.

### Notifications
Owning modules call their own `*-notifications.service.ts`, which wraps `NotificationsService`. Notification
failure is swallowed by design. A new event needs: a `NotificationType`, a dedupe key, a recipient rule
(user/tenant/landlord), and a band if it recurs. Owners receive email/SMS only.

### Approvals
A module that needs approval registers a completion handler with `WorkflowHooksRegistry` and calls
`WorkflowsService.start`; the handler runs in the decision transaction, so the approval and its effect cannot
diverge.

### Documents
One document centre (`backend/src/modules/documents/`) with local/S3 drivers and `(entityType, entityId)`
attachment. Contracts, floor plans and attachments borrow it; never add a second file store.

### CSV
Server-side parse/serialize in `backend/src/common/csv.ts`, with a dry-run report. Import endpoints must be
idempotent enough to retry after a partial failure.

### RBAC
`permission-keys.spec.ts` fails the build if a controller asks for a permission module the matrix does not
declare. Adding a permission means: add the module to `PERMISSION_MODULES`, grant it to the roles that should
hold it in `backend/src/prisma/roles-seed.ts`, then run `npm run db:seed:roles` — the matrix lives in the
database, so the code change alone is not live.

---

## 8. Frontend standards

Binding for every page, new or touched. A module's UI is **not** done with list + create only.

1. **List → detail → edit.** Every entity with a list page needs `/{entity}/[id]` and an edit path (inline or
   page). Do not ship a list without its detail route.
2. **Row actions.** Quick view/edit/delete and lifecycle actions from the list, not buried only in detail.
3. **Status transitions are explicit actions,** never a free-form status dropdown that permits illegal moves.
4. **Bulk operations and exports** where plausible (selected export, bulk status), not only bulk delete.
5. **Empty / loading / error are three real states** on every list and detail page, using the shared pattern
   (`components/ui/entity-states.tsx`), not a blank table or a silent failure.
6. **Forms** are sectioned/stepped where long, validate before advancing, never "log to console and pretend to
   succeed", and reach a real mutation with loading and error UI.
7. **Mobile:** every page must work at phone width; modals trap focus and restore it on close; labels are real
   `<label>`s, not placeholders.
8. **Design tokens:** use the semantic Tailwind tokens (`bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`,
   `border-line`, `brand-*`, `success/warning/danger/info`, `stage-*`). No raw palette colours.

---

## 9. Subscription billing and the public site

### Stripe subscription checkout
- `POST /payments/checkout` (ADMIN/SUPER_ADMIN) creates a hosted Checkout Session in the organization's
  currency; the webhook `POST /payments/webhooks/stripe` applies the purchased plan on
  `checkout.session.completed` and keeps it in sync on `invoice.payment_succeeded/failed` and
  `customer.subscription.*`.
- The backend **stores no Stripe price IDs**. It reads the plan's `prices` map, lists Stripe prices for the
  currency, and matches on exact amount (minor units) + billing interval. If the admin plan amount and the
  Stripe price disagree, checkout fails with "No Stripe price found".
- Webhook signatures are verified over `req.rawBody`. Do not add a global raw body parser; see the `rawBody`
  section in `AGENTS.md` — that mistake broke every JSON write endpoint once.
- Frontend needs no Stripe SDK: it receives `{ url }` and redirects. Full dashboard setup, events and test
  cards are in `docs/DEPLOYMENT.md` §Stripe.

### Public landing page
- Five blocks: hero, interactive engine, pricing, FAQ, final call to action. Reference material lives on
  `/features`, `/demo` (noindex), `/security`, `/contact`. Do not stack more promotional sections onto `/`.
- Every string must be traceable to code, seed data or this guide. No invented roles, gateways or countries.
- **Pricing is quoted in KES and USD** (`PRICED_CURRENCIES` in
  `backend/src/common/pricing-currencies.ts`). That is a price-list limit, not a country limit: onboarding
  accepts any ISO-4217 currency and any of the fifteen jurisdiction profiles. `TrialSignupDto` restricts the
  currency because self-serve needs a price.
- Markets/currencies shown on the page are deployment config: `NEXT_PUBLIC_LANDING_MARKETS` and
  `NEXT_PUBLIC_LANDING_CURRENCIES`, order-significant and inlined at build time. Components must read
  `MARKET_CODES` / `PRICING_CURRENCIES` from `frontend/components/landing/data/landingData.ts`, never hardcode a
  country list. `PricingSection.tsx`'s `CURRENCY_SYMBOLS` is a `Record<PricingCurrency, string>`, so a new
  priced currency fails to compile until it has a symbol and every tier has an amount.
- The interactive engine demonstrates FIFO allocation (KES/USD toggle), tax-as-configuration across modeled
  jurisdictions, CSV dry-run validation and derived deposit settlement. It is a rules demo, not a price list.

### Trial and onboarding
- `POST /platform/signup` creates an organization + first admin + a TRIALING subscription in one transaction,
  email verification required, rate-limited.
- Platform onboarding (`POST /platform/organizations`) is SUPER_ADMIN-only and accepts any ISO-4217 currency.
- Subscription plans are rows (`SubscriptionPlan`) with a `prices` map; Enterprise is custom priced.

---

## 10. Engineering conventions

- DTOs use `class-validator`, with `ValidationPipe({ whitelist: true, transform: true })` globally. Never
  accept a raw `Prisma.*CreateInput` from a request body.
- **Never** type an injected dependency as `import type { X }` and never give one a default value: both erase
  `design:paramtypes` and break Nest boot with an unresolvable dependency. Use an injection token for a test
  seam and `forwardRef` for genuine cycles.
- Errors are Nest exceptions; do not leak stack traces in production. Cross-tenant/missing reads are 404.
- Audit: call `logAction()` on sensitive create/update/delete, especially money and auth, with the
  organization id.
- Platform routes never relax tenant filters; they live in separate controllers behind SUPER_ADMIN.
- Frontend API access goes through `frontend/lib/api.ts`; delete dead clients rather than leaving them beside
  working ones.
- Money is `Decimal`/integer cents; the organization's default currency is a column, not a constant.
- Before adding a field that "sounds similar" to an existing one, check §5.7.

Commands, environment setup, install flags and the full list of build traps are in `AGENTS.md`. Progress,
phases and the next task are in `ROADMAP.md`.
