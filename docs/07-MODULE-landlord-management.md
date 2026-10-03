# Module 6: Landlord Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**Complete for statements, charges and payouts.** Landlord profiles gained a management agreement and payout
details, owner statements are generated from the rent payments actually recorded, costs charged to an owner are
deducted from the statement, and payouts move through a validated state machine until they are marked paid with a
bank reference. The statement renders as a printable document from `/owner-statements/:id/document`.

**Deferred to Phase 2, deliberately:** the **owner self-service portal** and **automatic owner statement
emails** → Module 20 (`20-MODULE-saas-administration.md`) for the tenant-scoped login and Module 18
(`18-MODULE-notifications.md`) for the sends. The RBAC groundwork for both is already in place: the `Landlord`
role is granted read-only `owner_statements` / `owner_payouts` permissions, so the portal is an additive screen
rather than a permission rewrite.

## Module Goal
Manage landlord-owned properties, generate owner statements, and process payouts.

## Existing Coverage in TU Properties (verified 2026-10-04)
- `Landlord` existed with identity, address and bank fields, plus `Invoice`/`Receipt`/`Property` relations — but
  **no management-agreement terms**, so there was nothing to deduct as a fee.
- **`LandlordsModule` was imported in `app.module.ts` but never registered in the `imports` array**, so every
  `/landlords` route 404'd. The module had never actually run.
- `GET /landlords` was tenant-agnostic: it returned landlords across **all** organizations in the database.
- The frontend list had a dead "…" menu (items rendered, no handlers), a delete that offered no reason, and no
  detail or edit page at all.
- No `OwnerStatement`, no `LandlordPayout`, no expense model of any kind (Finance owns that, in Module 7), and
  therefore no way to tell an owner what they were owed.

## Scope / Sub-modules
- Landlord Profiles: personal details, bank accounts, tax information, **management agreement terms**, notes
- Owner Charges: costs carried out on an owner's property that they owe back
- Owner Statements: rental income, expenses, management fees, net payout, printable/downloadable statement
- Payouts: recording, state tracking against a statement, payment history

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Landlord — now `landlord_charges`, `owner_statements`,
`landlord_payouts`, plus `landlords.managementFeeType/managementFeeRate/managementFeeAmount/notes`.

## Tasks Checklist
- [x] Audit existing Landlord model against `01-DATABASE-SCHEMA.md`; add bank account/tax fields if missing
- [x] Add `OwnerStatement` and `LandlordPayout` models if missing (plus `LandlordCharge` — see *Expenses* below)
- [x] Build owner statement generation (aggregate rental income minus expenses minus management fee, per period, per landlord)
- [x] Build downloadable statement document (print-to-PDF HTML; no PDF library exists in the stack — see *Statement document*)
- [x] Build payout recording + status tracking (does not need to auto-execute bank transfers in v1 — record intent/status, actual transfer can be manual/external initially)
- [x] Build a landlord detail page (previously absent — list+create only) showing statements history and payout history
- [x] Scope a basic Owner Portal (read-only statement/payout view, scoped auth like the Tenant Portal) — **scoped and seeded, not built**: `Landlord` role has read-only `owner_statements`/`owner_payouts`, and `User.portalTenantId` is the established pattern to copy. Recorded under *Known Gaps*.

## What Was Built

### Schema (one migration, applied, `migrate status` clean)
| Migration | Change |
| --- | --- |
| `20261004000000_module6_landlords` | `Landlord.notes`, `managementFeeType` (`ManagementFeeType`: `PERCENTAGE` \| `FIXED`), `managementFeeRate` (%), `managementFeeAmount` (flat, per period). New tables `owner_statements`, `landlord_payouts`, `landlord_charges` with the `OwnerStatementStatus`, `PayoutStatus` and `ChargeCategory` enums. Back-relations on `Organization` and `Property`. Also re-records the `ON DELETE SET NULL` on `audit_logs.userId` / `documents.uploadedById` — see *Incidental fixes*. |

`prisma migrate diff --from-migrations … --to-schema` now reports **an empty migration**, i.e. a database rebuilt
from the migration history is identical to the live one.

### Expenses: why `LandlordCharge` is not an `Expense`
The module spec asks for "rental income minus expenses". There is no expense table in the schema, and Finance &
Accounting (Module 7) owns the general ledger and will own expenses properly. Rather than invent a competing
`Expense` model or (worse) reuse `Receipt` for costs, this module adds `LandlordCharge`: **only** costs actually
charged to a landlord, with the property they relate to. That is the owner-facing slice of the idea — enough for a
real statement today, with no claim to be the GL. When Module 7 lands, its expense entity should supersede this and
`LandlordCharge` either becomes a link to it or is retired; that decision belongs there, not here.

### Backend (`backend/src/modules/landlords/`)
- **`statements/statement-calculator.ts`** — pure, unit-tested arithmetic:
  - `computeManagementFee` — a percentage of what was actually collected, or a flat fee per period (a flat fee is
    charged even in a month that collected nothing, which is the honest reading of the agreement).
  - `computeStatementTotals` — `net = gross − expenses − fee − carriedForward`, all in integer cents so a
    percentage fee never leaves a stray cent. A negative net is reported as a real negative ("owed by you"), not
    clamped to zero.
  - `findOverlappingPeriod` — **the double-pay guard**. Two statements covering overlapping dates would both claim
    the same rent, so generation refuses (voided statements are ignored; drafts are not, because a draft already
    claimed the period).
  - `computeOutstandingBalance` — what is still owed across all issued statements, less payouts that are actually
    `PAID` (a `PROCESSING` transfer is still owed).
- **`statements/owner-statements.service.ts`** — derives, never accepts money:
  - income = `Payment` rows dated in the period against this landlord's **rental** invoices, grouped per invoice
    (a line per invoice, so the owner can find the bill). Sale invoices are excluded via
    `Invoice.saleTransactionId IS NULL` — sale proceeds belong to the seller through Sales, not to a rental account.
  - Both the direct link (`Invoice.landlordId`) and the legacy path (a rental invoice for the landlord's property
    raised without naming them) are counted, because `Invoice.landlordId` is nullable.
  - expenses = unclaimed `LandlordCharge` rows in the period; generation **claims** them inside the same
    transaction so the next statement cannot roll them in again, and `void` releases them.
  - `GET /owner-statements/preview` runs the identical calculation and writes nothing, which is what the generate
    dialog shows before a document exists.
  - `carriedForward` = unpaid balance of statements whose period ended before this one.
  - Period guards: end ≥ start, ≤ 400 days, and cannot cover a period that has not finished.
  - `incomeLines`/`expenseLines` are **frozen JSON snapshots** alongside the five money columns: an issued
    statement is a document the owner has, so it must keep reconciling to its own lines after an invoice
    underneath it is edited. Re-issuing means generating a new statement.
- **`payouts/payout-status.ts`** — pure, unit-tested state machine:
  `PENDING → PROCESSING → PAID`, with `→ FAILED` from either open state and `FAILED → PROCESSING` for a retry.
  Gates: `PAID` requires a transfer reference (an unreferenced payout is not an audit trail) and cannot exceed what
  the statement still owes; `FAILED` requires a reason; `PAID` is terminal; a void statement cannot be paid against.
- **`payouts/landlord-payouts.service.ts`** — a payout is created `PENDING` (`status` is not in the create DTO, so
  it cannot be born paid) and moves only through `PATCH /landlord-payouts/:id/status`. Overpayment is refused at
  creation, while the operator is still on the form. Marking a payout `PAID` flips its statement to `SETTLED` once
  the recorded payouts cover the net amount (and to `ISSUED` if it was still a draft) — a statement that has been
  paid must never read as merely issued.
- **`charges/landlord-charges.service.ts`** — a charge must belong to a landlord in this tenant and, when it names
  a property, one of **that landlord's** properties. A charge already on a statement is frozen: it belongs to a
  document the owner has, so editing or deleting it is refused.
- **`statements/statement-document.ts`** — the printable statement (see below).
- **Landlord CRUD** — tenant-scoped on every read and write (`requireTenantId` + `organizationId` on every query);
  `LLD-###` codes generated per organization with a retry; the update DTO is mapped field by field so a `PATCH`
  cannot set `organizationId`, `code` or `deletedAt`; deletion is refused when the landlord has properties,
  invoices or statements, and is otherwise a soft delete + `INACTIVE` rather than an orphaning hard delete.
  `GET /landlords/:id` returns the profile, portfolio, recent statements/payouts/charges and the totals the detail
  page needs. `GET /landlords/:id/outstanding` is the single "what do we owe this owner" call.
- **DTOs everywhere** with `class-validator`; `GenerateStatementDto` deliberately has **no money fields** — the
  only inputs are a landlord and a period (plus optional one-off fee overrides for a genuinely unusual period).
- **RBAC** — two new permission modules: `owner_statements` and `owner_payouts`. Company Admin / Property Manager /
  Accountant get full rights on both; `landlords.view` was added to Accountant; the `Landlord` role gets read-only
  access to both, which is the groundwork for the Phase 2 portal.
- CSV exports for landlords, charges, statements and payouts (shared `toCsv` helper, filtered by the same
  query parameters as the list).

### Statement document (the "PDF")
The spec asks for a downloadable statement PDF and says to check for existing PDF tooling first. **There is none**
in either app — no `pdfkit`, no headless browser, no `jspdf` — and adding a rendering library for one document is a
poor trade. So `GET /owner-statements/:id/document` serves a self-contained HTML document with print CSS: the
browser's own print dialog produces the PDF ("Save as PDF"), and `?download=true` serves it as a file to email. It
renders identically everywhere, needs no client-side fonts or charts, and stays inspectable when a landlord
disputes a line. The template is one pure function, so swapping in a real PDF renderer later touches one file.

### Frontend
- `/landlords` — the owner list: filters, sort, pagination, CSV export, and **working row actions** (view, edit,
  generate statement, record payout). The delete action was removed rather than kept as a dead button: the API
  refuses to delete a landlord with any financial history, and a menu item that always errors is worse than none.
- `/landlords/new`, `/landlords/[id]/edit` — one `LandlordForm` (create and edit), with the management agreement
  in its own section that says the fee is deducted from every statement.
- `/landlords/[id]` — the owner screen: portfolio, paid-out / outstanding / unstated-charges tiles, agreement and
  payout details, properties, statements, charges, and the actions (charge a cost, record a payout, generate a
  statement).
- `/landlords/statements` — the statement register with status filter, search and CSV export.
- `/landlords/statements/[id]` — one statement: summary, income lines with their invoice numbers, expense lines,
  payouts against it, and the actions that its status allows (issue, void, delete draft, print/PDF, download,
  record payout).
- `/landlords/payouts` — the payout register with a status filter; each row's menu offers exactly its legal
  transitions, and a paid payout offers none.
- `components/landlords/` — `landlord-form`, `statement-generate-dialog` (with the live preview),
  `statement-summary` (the money block, shared by preview and detail so both read the same way), `statement-table`,
  `statement-status-badge`, `payout-form-dialog`, `payout-status-dialog` (asks for the reference/reason the gate
  requires instead of failing at the API), `charge-form-dialog`.
- The sidebar's "Landlords" entry became a group: **Owners / Owner statements / Owner payouts**, visible to
  Accountant too.

### Demo data
`generateOwnerData()` picks the 12 landlords with the largest portfolios, gives each a percentage management
agreement, dates most charges inside the two completed months before today, and writes two statements per owner
from the payments that were just seeded — so the module opens with figures that reconcile rather than zeros.
Typical result: ~20 charges, 24 statements (mostly `ISSUED`, one `SETTLED` per owner where the payout cleared),
~15 payouts including a `PROCESSING` and a `FAILED` one, and a handful of unstated charges waiting for the next
run. The arithmetic is duplicated in the seed on purpose: the script writes directly through Prisma, outside Nest,
so it cannot reach `OwnerStatementsService`.

### Tests
93 new tests, 384 total (was 291). `statement-calculator.spec.ts` (34 cases across both pure modules) covers the
cent arithmetic, the overlapping-period guard, carry-forward, and every payout gate. Service specs cover the
derivation (including the sale-invoice exclusion in the exact query shape), the double-pay refusal, charge
freezing, tenant isolation (404 not 403 — existence is itself information), and the payout lifecycle.

### Verification performed
- `npx tsc --noEmit` clean in both apps; `npx jest` 384/384; `npm run build` compiles all six module 6 routes.
- ESLint: every new **source** file is clean (the spec files carry the same `no-unsafe-*` noise the rest of the
  suite does).
- Live API, both tenants: preview → generate → issue → payout (process → paid) → settle, plus each refusal path —
  duplicate period (409), future period (400), edit/delete a frozen charge (409), delete an issued statement (409),
  `FAILED` without a reason (409), `PAID` without a reference (409), `PROCESSING → PENDING` (409), re-paying a paid
  payout (409), overpayment (400), cross-tenant read (404). Settlement flipped the statement to `SETTLED`; the
  next month's preview carried the balance forward correctly; voiding released its charges and let the period be
  reissued. All four CSV exports and the statement document return 200.
- Frontend: `/landlords`, `/landlords/new`, `/landlords/[id]`, `/landlords/[id]/edit`,
  `/landlords/statements`, `/landlords/statements/[id]`, `/landlords/payouts` all render 200 with no server error.

### Incidental fixes
- **`LandlordsModule` was never registered** in `app.module.ts`, so `/landlords` had never worked. Now wired in.
- `GET /landlords` returned landlords from every tenant; it is now scoped to the caller's organization.
- The landlord list's "…" menu rendered items with no click handlers; the delete prompt said "this cannot be
  undone" about an operation the API would refuse for any landlord with history.

## Known Gaps / Follow-ups (not blocking)
- **The owner portal is scoped, not built.** `User.portalTenantId` links a login to exactly one tenant record;
  `Landlord` is already a seeded role with read-only `owner_statements`/`owner_payouts`. Building the portal is the
  same shape as the tenant portal (Module 5): a `User.portalLandlordId` column, a `LandlordPortalGuard`, and
  `GET /landlord-portal/{summary,statements,statement/:id/document}`. Phase 2 per the Master doc's roadmap.
- **Payouts do not move money.** No banking integration exists, so a payout records intent and its outcome and the
  transfer is made in the banking portal. When an integration arrives, `LandlordPayout` is where the provider's
  transfer id belongs.
- **Statement emails** need Module 18. The trigger is already a service return value
  (`OwnerStatementsService.issue()`), so it is one call from a notifier.
- **`LandlordCharge` duplicates nothing but will interact with Module 7.** When Finance owns expenses, decide then
  whether a charge links to an expense row or is replaced by one; do not migrate this table blindly.
- **Only one fee basis per landlord.** Real management agreements also have arrears fees, late-payment interest and
  VAT on the fee; adding them means new derived columns on the statement, not a new table.
- **Payouts are per landlord, not per bank account.** `Landlord` has one set of bank details; an owner with
  properties in two countries would need payout accounts.
- **The statement document is English-only and not localised**, and its header uses the organization's legal name
  (which falls back to the display name when unset).
- **`/landlords/statements` filters by landlord id rather than by name.** The list endpoint only exposes the
  landlords that appear on the current page; a proper picker wants a `landlords?limit=…` dropdown, which the
  generate dialog uses.

### Blocked on other modules — finish these when the dependency lands

#### 1. Owner statement emails — blocked on Module 18 (`18-MODULE-notifications.md`)

**Today:** `POST /owner-statements/:id/issue` marks the statement issued and returns it; the document is opened by
hand from the UI. Nothing is sent.

**When Module 18 lands, wire these triggers** (each is one call from an existing service — no domain logic moves):

| Trigger | Where to call it from | Who is notified |
| --- | --- | --- |
| Statement issued | `OwnerStatementsService.issue()`, next to the status update | The owner (`Landlord.email`), with the document attached |
| Payout paid | `LandlordPayoutsService.updateStatus()` when the status becomes `PAID` | The owner, as a receipt |
| Charges raised | `LandlordChargesService.create()` | Optionally the owner, if an owner-visible notification is wanted |

**Done when:** issuing a statement emails the owner a PDF (produced by `statement-document.ts`) without anyone
leaving the screen.

#### 2. A general expense model — blocked on Module 7 (`08-MODULE-finance-accounting.md`)

**Today:** owner statements deduct `LandlordCharge` rows — costs the company carried out on that owner's property.
Company-level expenses that are not the owner's (staff salaries, software, marketing) are not tracked anywhere.

**What is needed first (Finance owns it):** an `Expense` entity with a GL account, a category, a supplier and
whether it is chargeable to a property. Nothing here can be finalised before that exists.

**Then, in this module:** decide the relationship — either `LandlordCharge` becomes "a charge backed by an
expense row" (keeping the owner-facing detail) or it is retired in favour of a query over expenses. Either way the
statement's expense lines keep their shape, so `statement-document.ts` and the statement detail screen do not
change.

## Backend: NestJS Notes
- One `LandlordsModule` for the whole owner-money surface: profiles, charges, statements and payouts share the same
  derivation rules and the landlord detail page needs all four, so they are wired together rather than through
  modules that import each other.
- The pure rule modules (`statement-calculator.ts`, `payout-status.ts`) hold the business rules; the services only
  do I/O around them. Both are unit-tested without a database.
- `statementNumber` is `OST-YYYYMM-NNNN`, sequential within the month with a random fallback so two processes
  generating at once cannot collide.
- The read-back after `generate()` happens **after** the transaction commits — reading inside it uses a different
  connection and cannot see the new row.

## Frontend: Next.js Notes
- `/landlords` is the canonical owner list; statements and payouts are sibling routes under it, so
  `/landlords/statements` resolves to the static segment rather than being read as a landlord id.
- Actions are named buttons driven by what the API says is legal (statement status, payout transitions), never a
  status dropdown.
- Money is formatted once, in `statement-summary.tsx` and the detail tables, so the preview and the saved
  statement read identically.

## Acceptance Criteria
- [x] For a given landlord and period, an owner statement can be generated showing income, expenses, management fee, and net payout that reconciles with underlying invoices/payments
- [x] A payout can be recorded against a statement and marked paid

## Dependencies on Other Modules
- Depends on: Finance & Accounting (income/expense data), Property Management
- Feeds into: Reports & Analytics (owner income, fees earned, payouts), Notifications (statement emails),
  Owner portal (Module 20 for the tenant-scoped login)
- **Waiting on, and the places to pick that work up:**
  - Notifications (Module 18) — statement and payout emails; triggers and call sites are specified in this doc
    under *Known Gaps → Blocked on other modules*.
  - Finance (Module 7) — a general expense model, so owner statements can deduct company costs charged to a
    property rather than only `LandlordCharge` rows.