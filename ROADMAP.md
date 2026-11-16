# TU Properties — Development Roadmap

> **This file is the single source of truth for development progress.** If a session dies, a context window
> fills, or a new agent picks the project up, start here — nothing else needs rediscovering.
>
> Tick a checkbox **when the work is verified**, not when it is written. Add a dated line to §7 when a phase
> or module changes state. Keep §2 current; a stale status table is worse than none.
>
> Companion docs: `GUIDE.md` (architecture and module reference), `AGENTS.md` (commands and environment
> traps), `docs/DEPLOYMENT.md` (production), `docs/Testing.md` (seeds and demo accounts).

---

## 0. Resume protocol — do this first, every session

1. **Look at reality.**
   ```bash
   git log --oneline -10
   git status --short
   ```
   Uncommitted work from a previous session is the most important thing on this page. Read the diff before
   doing anything else.
2. **Read §2 (status snapshot) and §3 (current focus).** Then read the relevant module entry in `GUIDE.md` §6.
3. **Verify the baseline** for the area you will touch (§1 commands). Do not assume green.
4. **Pick the first unchecked task in the current focus**, or the next unchecked sub-task if a task is partly
   done. Work in small verified increments.
5. **Tick as you go** — mark a sub-task `[x]` in the same change that verifies it. Update §2's percentage and
   §7's changelog before ending the session.
6. **If you find the roadmap wrong** (a task already done, a gap it did not list), correct the file and note it
   in §7 with the evidence. The roadmap is maintained by the work, not before it.

---

## 1. Ground truth, definition of done, and commands

### Ground truth rules

- **Code beats docs.** `backend/src/prisma/schema.prisma` is the schema of record. A status line here or in
  `GUIDE.md` is a claim with a date; verify it against the tree before trusting it.
- **Never recreate what exists.** Read the module's folder, controller and pages first; extend rather than
  rewrite unless it is fundamentally broken.
- **A green test suite is not proof a module works.** For anything with read endpoints or exports: seed, then
  call the endpoints with `curl` as the role the UI would use, against a second organization. The bugs this
  rule has caught (a trend that ignored its parameter, an ROI report reading zero, a 403 on the one screen
  that used it) were all in call sites, not in the pure functions the tests covered.
- **Rebuild the client after installs:** `npm run db:generate` in `backend/` (Prisma 7 has no postinstall).
- **Do not introduce a second concept for an existing noun.** One supplier, one document store, one ledger
  write path, one settlement recomputation.

### Definition of done for any task

- [ ] `npx tsc --noEmit` clean in `backend/` and `frontend/`
- [ ] `npx jest` relevant suites (and the full run before declaring a module done)
- [ ] `npx eslint` clean on files you created or rewrote (existing repo-wide warnings are baseline)
- [ ] Schema change applied and `migrate diff --from-migrations` empty (or the hand-written indexes in
      `AGENTS.md` checked, if a generated migration was involved)
- [ ] Seeded and exercised live for read/money paths, including a cross-tenant 404
- [ ] Frontend page loaded in a browser (empty, loading and error states checked)
- [ ] Permission matrix re-seeded if a permission changed (`npm run db:seed:roles`)
- [ ] This file ticked, §2 refreshed, `GUIDE.md` updated if behaviour changed

### Environment

| Thing | Value |
|---|---|
| Backend | `cd backend && npm run start:dev` — port **3003** |
| Frontend | `cd frontend && npm run dev` — port **3002** |
| Database | `postgresql://postgres:admin@localhost:5432/tu-properies?schema=public` |
| Demo data | `cd backend && npm run db:seed:demo` (KE + US by default) |
| Roles | `npm run db:seed:roles` — required after any permission change |
| Auth transport | `AUTH_MODE=cookie` (default) or `bearer` in `backend/.env`; session lifetime 1 hour |

Known traps (full detail in `AGENTS.md`): global raw body parser breaks every JSON write; `npm ci` needs
`--legacy-peer-deps` in `backend/`; `react-quill-new`, not `react-quill`; two hand-maintained Postgres indexes
are invisible to Prisma and generated migrations try to drop them.

---

## 2. Status snapshot

Last module audit: **2026-10-07**, with the rows below refreshed where later work landed. Percentages are of
each module's documented scope. "Refresh on touch" — update the row when you finish work in that module.

| # | Area | State | What is still missing |
|---|---|---|---|
| 0 | Stabilization & security | ✅ 100% | MFA secret encryption; shared rate-limit store for multi-instance |
| 1 | Core platform | ✅ 100% | e-signature (third-party); `organizationId NOT NULL` migration deferred |
| 2 | Property & units | 🟡 95% | amenities in search; per-unit photos; landlord filter |
| 3 | CRM | 🟡 90% | delivery of messages; dedupe; bulk import; reopen WON/LOST |
| 4 | Sales | 🟡 90% | invoice balance reconciliation; sale documents; commission ledger posting |
| 5 | Lease & tenancy | 🟡 90% | e-signature; payment-plan execution; inspection photos; leasing role picker |
| 6 | Landlord management | 🟡 95% | owner portal; statement emails; general expense model; fee arrears/VAT; multi-account payouts |
| 7 | Finance & accounting | 🟡 60% | standalone credit notes; bank reconciliation; period close; statutory e-invoicing; budgets/fixed assets |
| 8 | Rent payments | 🟡 50% | M-Pesa STK/C2B; gateway settlement; receipt PDFs; FX; audit on money actions |
| 9 | Maintenance | 🟡 85% | cost → payable; contractor entity; document attachments; "my jobs" view; PM recurrence |
| 10 | Procurement | 🟡 80% | returns/credits; attachments; supplier portal; supplier lead times; remembered receipt pairing |
| 11 | Inventory | 🟡 90% | lead-time-aware reorder; list performance; barcode; cycle counting; resident visibility |
| 12 | HR & payroll | 🟡 85% | attendance/timesheets (deliberate) |
| 13 | Facilities | 🟡 85% | booking-fee invoicing; reader integration; resident self-booking; card revocation on move-out |
| 14 | Utilities | 🟡 90% | smart/AMI ingestion; tenant consumption view; `REDISTRIBUTE`; batch charges |
| 15 | Documents & legal | ✅ 100% | e-signature; counterparty access (portal) |
| 16 | Reports & analytics | ✅ 90% | export coverage for remaining lists (finance, tenants, HR, inventory, procurement, work orders, facilities, utilities, contracts) |
| 17 | Notifications | 🟡 90% | SMS never sent (no credentials); WhatsApp/push providers; owner opt-out |
| 18 | Workflow engine | 🟡 85% | only refunds route through it; refund requests finance-only; escalation failure alerting |
| 19 | SaaS administration | 🟡 85% | `SubscriptionPlan`/`PlatformInvoice` billing tables; knowledge base/live chat; API metering |

**Commercial surface (landing, pricing, checkout) — refreshed 2026-11-15:** ✅ five-block landing page,
twenty-module `/features`, seeded `/demo`, `/security`, `/contact`; pricing quoted in KES/USD; markets and
currencies are deployment config; trial signup creates org + admin + TRIALING subscription in one transaction;
Stripe subscription checkout and webhook verified; onboarding accepts any ISO-4217 currency; demo seed defaults
to KE and US.

---

## 3. Current focus

Ordered, with the first unchecked item being the next thing to do unless the user directs otherwise.

- [ ] **Rent collection gateway — M-Pesa (STK push / C2B) + callback verification.** The largest gap between
      "records payments" and "collects rent"; everything downstream (allocation, credit, refunds, ledger) is
      already correct and idempotent. Sub-tasks:
  - [ ] Provider adapter interface under `backend/src/modules/payments/` (signature verification first)
  - [ ] STK push initiation + callback endpoint that calls `PaymentsService.create`/`allocate` only
  - [ ] Reconciliation report for unmatched references
  - [ ] Guardrails: idempotency on provider reference; no direct payment-row writes
- [ ] **Receipt PDFs.** A receipt is evidence with no printable artefact. Print-CSS HTML first (the owner
      statement precedent), PDF renderer only if the print path proves insufficient.
- [ ] **Bank reconciliation.** Import a statement, match to `Payment`/`BillPayment`, report unmatched both ways.
      Prerequisite for period close.
- [ ] **Period close.** Lock a month so postings cannot land in it; requires reconciliation and a closing entry.
- [ ] **Owner portal (Phase 2 scope).** Statements, charges, payouts, and a channel-preference page that
      closes the owner opt-out gap (notifications are keyed on `userId` today). Includes landlord-scoped
      auth (`User.portalLandlordId`) and read-only permissions.

---

## 4. Phases and tasks

Legend: `[x]` verified done · `[ ]` open · `[~]` partly done (sub-tasks carry the detail).

### Phase 0 — Foundation (✅ complete)
- [x] Fix the `(dashboard)` URL contract app-wide and verify every sidebar link on a production build
- [x] Invoice detail page and status transitions
- [x] Dashboard wired to live stats with loading/error/retry states
- [x] Transactional receipts and rent receipts (no console-only submits)
- [x] MFA (TOTP), session revocation on every request, login rate limiting
- [x] `AuditLog.organizationId` and tenant-scoped audit reads
- [x] CI pipeline and baseline test suite
- [x] Structured RBAC (`Role.permissions`) with twelve seeded roles and `PermissionsGuard`
- [x] `requireRecord()` 404 semantics across every tenant service
- [x] CORS callback form (sync allowlist hangs requests)
- [ ] Encrypt MFA secrets at rest
- [ ] Shared rate-limit store so limits survive multiple instances
- [ ] `AuditLog.organizationId` NOT NULL migration

### Phase 1 — Core revenue workflow (nearly complete)
- [x] Property/unit/tenant onboarding with CSV import, dry-run reports and import templates
- [x] Lease lifecycle: draft → activate → renew (successor chain) → extend → terminate/expire, syncing occupancy
- [x] Move-outs with derived deposit settlement, deductions, refunds and inspections
- [x] Recurring rent billing (daily run, per-lease payment day, exactly-once per period)
- [x] Multi-jurisdiction tax engine as data, with per-tax GL accounts and invoice snapshots
- [x] Double-entry GL, trial balance, account ledger
- [x] Payment allocation, overpayment credit, credit-note refunds, `DIRECT_REMIT`
- [x] Accounts payable: supplier bills, bill payments, supplier credits, AP aging
- [x] Arrears reporting and the reminder sweep
- [x] Owner statements (derived, frozen snapshots, preview) and payouts with a state machine
- [x] Live dashboards and the five core report families with CSV export
- [x] Stripe **subscription** checkout + webhook (plan upgrades)
- [ ] Rent-collection gateways: M-Pesa STK/C2B, provider callbacks, settlement reconciliation
- [ ] Receipt PDFs and FX handling
- [ ] Standalone credit-note issuance (apart from refunds)
- [ ] Statutory e-invoicing adapter per jurisdiction (needs credentials; not obtainable from the repo)
- [ ] Payment-plan execution (currently `RECORDED_ONLY` on tenant requests)
- [ ] Invoice balance reconciliation for sale instalments (sales currently sums payments itself)

### Phase 2 — Operations and portals
- [x] Work orders with validated pipeline, emergency fast-track, PM schedules and the asset register
- [x] Facility bookings with a database-enforced no-double-booking guarantee; visitor log; access cards
- [x] Utility meters, readings, tariffs, bulk apportionment and consumption invoicing
- [x] Contract register with derived expiry/notice status and renewal chains
- [x] Tenant portal: overview, invoices, receipts, documents, request queue
- [x] Notifications infrastructure (in-app, email, SMS), preferences and channel config
- [x] Email actually sent and verified (145 lease-expiry emails on a real sweep)
- [ ] Owner portal (statements, payouts, preferences) — see §3
- [ ] Resident self-service: report maintenance with photos, book facilities, see utility consumption
- [ ] Revoke access cards on move-out
- [ ] Couple a unit to `UnitStatus.MAINTENANCE` while a work order is open
- [ ] WhatsApp and push providers (enum values exist, no implementation)
- [ ] Verify SMS end to end with credentials; document provider setup
- [ ] Mobile/PWA pass: usable mobile navigation, touch-sized actions, form ergonomics

### Phase 3 — ERP maturity
- [x] Chart of accounts and auto-posting from invoices/receipts/payments
- [x] Tax and payroll as configuration with validity windows
- [ ] Bank reconciliation (statement import, matching, unmatched reporting)
- [ ] Period close and locking
- [ ] Budgets and fixed-asset register with depreciation
- [ ] General expense model superseding `LandlordCharge`
- [ ] Automation surface: webhooks out, scheduled jobs registry, open API
- [ ] Advanced analytics/forecasting; compliance (data retention, GDPR/ODPC posture)

### Phase 4 — Supply chain
- [x] Purchase requests → RFQ → quote comparison → purchase order → goods receipt → supplier bill
- [x] Inventory movements, weighted-average valuation, transfers, stock takes, reorder alerts
- [ ] Supplier portal (own invitations, quotes, orders, outstanding lines)
- [ ] Goods returns and supplier credit notes from a PO
- [ ] `Supplier.leadTimeDays` feeding reorder suggestions and PO dates
- [ ] Remembered receipt-line → inventory-item pairing
- [ ] Stock-count scheduling/cycle counting; barcode scanning; PO-based purchase suggestions
- [ ] Procurement request attachments; contract renewal reminders for vendor contracts

### Phase 5 — Platform, packaging and launch
- [x] Platform surface: onboard, suspend/activate (enforced at login and per request), list/read
- [x] Derived usage with limit enforcement (409 naming the limit)
- [x] Audited 15-minute impersonation with reason and banner
- [x] Support tickets (state machine) and public contact/signup
- [x] Landing page consolidation to five blocks; module list; seeded demo; security page
- [x] Two-currency pricing and deployment-driven market/currency display
- [x] Currency boundary: trial signup priced-only, onboarding any ISO-4217
- [ ] `SubscriptionPlan` and `PlatformInvoice` tables (replace `Organization.plan` string)
- [ ] Knowledge base / live chat (third-party embed) or an explicit decision to omit
- [ ] API usage metering v2
- [ ] Owner notification opt-out (blocked on owner portal identity)

### Phase 6 — Cross-cutting debt and polish
- [ ] Exports on the remaining list pages (finance, tenants, HR, inventory, procurement, work orders,
      facilities, utilities, contracts)
- [ ] Type `req.user` properly (remove the `any` baseline across controllers)
- [ ] Bring the oldest list/create pages up to the UX standard: detail, edit, row actions, states
- [ ] Replace the remaining hand-rolled forms with sectioned/stepped forms where they are 400+ lines
- [ ] Route-order specs for any controller with a `:id` route and literal siblings
- [ ] Add a build check that the doc set stays consolidated (see §6 decision log)

---

## 5. Backlog — needs a decision before it becomes a task

- **Sales report date basis.** `createdAt` is not the business date. Choose: reservation, agreement, or
  handover date, or report on a date range of stages. Owner's call.
- **Arrears fees and VAT on the management fee.** Statement calculator supports percentage/flat only.
- **Parking model.** `Facility(kind=PARKING)` versus `AccessCard(type=PARKING)` — untested against a real
  estate; pick one home for a parking bay.
- **E-signature.** No infrastructure. Decide vendor/embed, or state explicitly that contracts are uploaded
  signed.
- **PDF strategy.** Print-CSS HTML is the current answer (owner statements). Decide whether receipts and
  contracts follow it or a renderer is added once, app-wide.
- **Attendance.** Deliberately unbuilt; confirm it stays out of scope or schedule it.

---

## 6. Decision log (append-only)

| Date | Decision | Rationale |
|---|---|---|
| 2026-11-15 | **Two currencies is a pricing claim, not a country limit.** `PRICED_CURRENCIES` (KES, USD) governs trial signup and the public price list only; onboarding accepts any ISO-4217. | The earlier `SUPPORTED_MARKETS` restriction blocked an operator from onboarding a ZA/GB organization for no reason: `Subscription` carries no amount/currency, so the restriction protected nothing but the self-serve price lookup. |
| 2026-11-15 | **Doc set reduced to five files**: `AGENTS.md`, `GUIDE.md`, `ROADMAP.md`, `docs/DEPLOYMENT.md`, `docs/Testing.md`. Module specs, master architecture, schema target and payment-integration docs were consolidated and deleted. | Twenty-five docs with overlapping status claims caused repeated contradictions (two module rows were wrong on the day they were written). Progress belongs in one place; this file. |
| 2026-11-15 | **The tax demo shows modelled jurisdictions, not supported markets.** ZA removed from the showcase because its 15% had no seeded rule; GB/DE stay because they do. | A demo may show capability; it must not imply a price list. |
| 2026-11-12 | **Stripe subscription billing stays on the hosted redirect; no frontend SDK.** | The webhook is the only writer of subscription state, and price matching by amount+currency+interval keeps the admin plan as the single price source. |
| 2026-10-06 | **Derived-not-stored for balances, stock, occupancy and time states.** | Every stored counter this codebase added was eventually contradicted by a second writer. |

---

## 7. Changelog

- **2026-11-15 — watch-mode compiler OOM fixed.** `nest start --watch` died at ~2 GB after ~18 minutes of file
  changes. Root cause was the TypeScript program, not the server: `declaration: true` forced a full symbol graph
  per rebuild over the Prisma 7 client's 16 MB `index.d.ts`, under Node's default 2 GB old-space limit.
  Fixes: `declaration: false`, `dist` excluded from `tsconfig.json`, dev/build scripts launched with
  `--max-old-space-size=6144/4096`, `*.tsbuildinfo` ignored, and the unused `process.on('beforeExit')` listener
  removed from `PrismaService`.
- **2026-11-15 — docs consolidation; pricing-currency boundary.**
  - Deleted 24 module/architecture docs and the package READMEs; created `GUIDE.md` and this roadmap.
  - `backend/src/common/supported-markets.ts` → `pricing-currencies.ts` (`PRICED_CURRENCIES`,
    `DEFAULT_DEMO_MARKETS`); onboarding now validates ISO-4217, trial signup stays priced-only; new
    `currency-boundary.spec.ts`.
  - Landing: footer claim reworded; `CURRENCY_SYMBOLS` typed; market constants renamed to display defaults.
  - Interactive showcase: ZA tab removed, sections relabelled as jurisdictions, CSV caption, KES/USD FIFO
    toggle, and the `KES $` double-symbol bug fixed in allocation and deposit panels.
- **2026-11-14 — landing page and market/currency surfaces.** Five-block landing, deployment-driven markets,
  module feature list, demo ordering, pricing in two currencies.
- **2026-10-11 — landlord ROI CSV** closed the last report export defect; row 15/16 corrections in the old
  audit table.
- **2026-10-07 — reports frontend, notifications verified live, platform phases A–C, impersonation, support
  tickets.**
- **2026-10-06 — utilities module complete (1175 tests).**
