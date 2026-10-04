# Module 7: Finance & Accounting

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**General ledger and the configurable tax-rules engine both landed 2026-10-04.** The GL (chart of accounts, double-entry `JournalEntry`/`JournalLine`, auto-posting from invoice/receipt/payment creation, reversals, trial balance, account ledger) and the tax engine (`TaxRule`, per-jurisdiction rates, inclusive/exclusive basis, withheld tax, per-tax ledger accounts, invoice pricing) are built and verified live against three different jurisdictions on the same engine. Frontend: `/finance/chart-of-accounts`, `/finance/journal-entries`, `/finance/trial-balance`, `/finance/credits`, `/finance/refunds`. **Still missing:** accounts payable (supplier bills), standalone credit-note issuance, recurring/batch invoicing, statutory e-invoicing / fiscal-device integration, bank reconciliation, period close.

**This module is multi-country by design.** Tax is configuration, not code: `TaxRule` rows carry the country, optional region, code, rate, whether the price includes the tax, and which ledger account collects it, and an organization declares where it is taxed (`Organization.taxCountryCode`/`taxRegionCode`). Nothing in the codebase assumes a country, a currency, or a particular rate. Do not reintroduce a hardcoded tax or a single-country assumption — including in docs, examples and seed data.

Note when continuing: `AccountingService.postEntry` is the only write path to the ledger and refuses unbalanced/single-sided/negative lines. Any new money-moving module (AP, credit notes, payouts) must post through it rather than writing `JournalLine` rows directly, and must pass the caller's transaction client so the source record and its entry commit together. Account codes are the contract with auto-posting — see `accounting/chart-of-accounts.ts` before renaming anything there. On the tax side, calculation lives in the pure `tax/tax-calculator.ts` (25 tests, no database) and resolution in `tax/tax.service.ts`; invoices are priced through it unless the caller supplies an explicit tax amount, which is respected as typed.

## Module Goal
Full accounting backbone: chart of accounts, AR/AP, general ledger, recurring billing, multi-jurisdiction tax, and statutory e-invoicing compliance per jurisdiction.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Invoices, payments, receipts exist as CRUD with tax-related fields — real but shallow (`invoices/new` form is 615 lines, `payments/new` 444, `receipts/new` 409).
- Accounting-adjacent fields already sit unused in the schema: `acReceivable`, `InvoiceItem.incomeAccount`, `spotRate`, `Receipt.bankingDate` — no logic consumes them. `Invoice.signOnEfims` is a legacy single-country flag (see below). Wire to these where it fits, don't duplicate them.
- Legacy `billingApi` in frontend was removed in Module 0 (2026-10-03); all finance UI now calls `/finance/*` exclusively.
- Confirmed **absent**: accounts payable, recurring/batch invoicing, statutory e-invoicing transmission, bank reconciliation, period close. (The chart of accounts, journal entries, trial balance, allocation, reversals and the tax rules engine have since been built — see Status Hint.)
- Receipt invoice-selection UI is now a real searchable picker (`receipts/new`) — done in Module 0.

### `Invoice.signOnEfims` — legacy, and misleadingly named
The field is a boolean named after one country's e-invoicing system. It is **not** a multi-country compliance flag and must not be treated as one: statutory e-invoicing differs per jurisdiction (different transmission APIs, document formats, QR/verification schemes, fiscal-device rules). When the compliance work below is done, it should be **replaced** by a jurisdiction-driven status on the invoice (e.g. transmission state + the provider/adapter that handled it), not extended with more single-country booleans. Until then the field stays unused — the tax-rules engine does not read it.

## Scope / Sub-modules
- Chart of Accounts: assets, liabilities, equity, revenue, expenses
- Accounts Receivable: tenant invoices, buyer invoices, outstanding balances, credit notes
- Accounts Payable: supplier bills, contractor invoices, utilities, office expenses
- General Ledger: journal entries, trial balance, ledger reports — auto-post journal entries from invoice/payment/lease creation (no manual double-entry from users for routine transactions)
- Banking: bank accounts, mobile money, cash accounts, reconciliation
- Recurring Billing: monthly rent, parking, service charge, utilities, HOA fees
- Taxes: VAT, withholding tax, property tax, sales tax, tax reports (multi-jurisdiction)

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Finance & Accounting

## Tasks Checklist
- [x] Resolve `/billing/*` vs `/finance/*` confusion and finish the receipt invoice-selection stub — done 2026-10-03 in Module 0 (billingApi removed; "Add Invoice" is a searchable picker over open invoices with editable per-line payment amounts)
- [x] Audit existing Invoice/Payment/Receipt models against `01-DATABASE-SCHEMA.md`; identify how `acReceivable`/`incomeAccount`/`spotRate` map to the target Account/JournalEntry structure — done 2026-10-04. `acReceivable` and `InvoiceItem.incomeAccount` remain free-text and are **not** wired to the ledger (auto-posting resolves system accounts by fixed code); wiring them per-line would let an invoice post to an account that does not exist, so they need a validated account picker first. `spotRate` still unused by the ledger: entries are posted in the record's own currency, and FX difference is not modelled.
- [x] GL is confirmed in scope (internal tool, no external sync needed). Build full double-entry GL using existing `Account`, `JournalEntry`, `JournalLine` models. Auto-post journal entries from invoice/payment/lease creation — done 2026-10-04 for invoice/receipt/payment; **lease creation itself does not post** (a lease only bills once an invoice is raised against it, which does post)
- [x] Build payment-to-invoice allocation logic first, even before full GL — done 2026-10-04: `POST /finance/payments` now updates `paidAmount`/`balanceAmount`/`status` and posts the cash leg inside the same transaction as the payment. The receipt allocation path was completed in Module 0 and now posts too
- [x] Build payment reversal workflow (a payment applied in error needs a real, audited undo path, not a manual DB edit) — done 2026-10-04: `POST /finance/payments/:id/reverse` marks the payment reversed (the row is kept, never deleted), re-derives the invoice from the payments that remain, and posts a reversing journal entry. Deleting a payment routes through the same reversal
- [x] Add Account, JournalEntry, JournalLine models to schema; wire auto-posting of journal entries from invoice/payment/lease creation — done 2026-10-04, migration `20261004010000_module7_accounting`, plus `AccountType`/`BalanceSide`/`JournalEntrySource`/`JournalEntryStatus` and `Payment.isReversed`
- [ ] Add CreditNote model + issuance flow — the model and the refund-driven issuance path exist (Module 8), so this is the standalone flow: issue a credit note against an invoice for a write-off or billing correction, outside a refund
- [ ] Add SupplierBill (AP side) — confirmed fully missing
- [ ] Build recurring/batch billing: scheduled job to generate rent invoices per active RentalAgreement on its billing cycle — confirmed absent, this blocks any real production use. Note the generated invoices will auto-post to the GL and be priced by the tax engine, so this depends on nothing else here but should reuse `InvoicesService.create`
- [x] Build configurable tax rules engine (per organization, per jurisdiction) — done 2026-10-04, migrations `20261004030000_module7_tax_rules`, `20261004031000_module7_tax_rate_variants`, `20261004032000_module7_tax_variant_key`. `TaxRule` rows (country + optional region, code, rate, exclusive/inclusive basis, charged vs withheld, optional compound-on-another-tax, ledger account, `appliesToCategory`, `validFrom..validTo`) plus `Organization.taxCountryCode`/`taxRegionCode`/`taxRegistrationNumber`; `TaxService` resolves the applicable rules at a date and the pure `tax-calculator.ts` does the arithmetic in integer cents. An organization with no rules for its country correctly has **no** tax — nothing defaults to a particular country. Invoices are priced by the engine unless the caller passes an explicit tax amount, and each tax type posts to its own ledger account rather than all merging into VAT payable
- [ ] Build statutory e-invoicing compliance integration, per jurisdiction — transmission, document format, verification code/QR, fiscal-device rules and authority acknowledgement all differ by country, so this is a **provider-adapter** concern, not one integration: define the interface, implement one adapter per target market, and drive it from the organization's jurisdiction. Replace the legacy `Invoice.signOnEfims` boolean with a jurisdiction-driven transmission status (see the note above). This is a legal requirement for invoicing in each target market, not optional polish — but it cannot be completed without registrations and credentials for each authority, so scope it per market rather than as one task
- [ ] Build bank reconciliation UI (match payments to bank statement lines) — lower priority, can be Phase 3 per the Master doc's roadmap. `Account` rows for bank accounts exist in the seeded chart, so this is additive
- [~] Build invoice/payment/receipt detail pages per `00-UX-CROSS-CUTTING-STANDARDS.md` — **partially done 2026-10-03:** invoice detail page `finance/invoices/[id]` now exists (view, status transitions Mark-as-Paid/Cancel/Reopen, delete, line items, payment history). Payment and receipt detail pages are still missing
- [x] GL read-and-post UI — done 2026-10-04: chart of accounts, journal entries (source filter, expandable lines, manual entry, reversal) and trial balance, all under Billing & Finance in the sidebar
- [~] Tax settings UI — done 2026-10-04: `/settings/tax` manages the jurisdiction and the rules, splitting "applied here" from other jurisdictions, with enable/disable rather than destructive edits

## Backend: NestJS Notes
- `backend/src/modules/finance/` — extended in place. `accounting/` holds the GL: `accounting.service.ts` (posting, reversal, trial balance, ledger, chart of accounts), `chart-of-accounts.ts` (the seeded standard chart and the codes auto-posting resolves), and the controller at `/finance/accounting/*` guarded by the new `accounting` RBAC module. `AccountingService` is exported by `AccountingModule` and imported by the invoice/receipt/payment modules.
- `tax/` holds the rules engine: `tax-calculator.ts` is pure (no Prisma) and unit-tested on its own, `tax.service.ts` does resolution and CRUD, `tax.controller.ts` exposes `/finance/tax/*` behind the `tax` RBAC module. `tax/withheld.ts` reads the withheld amount off an invoice for the posting path. `backend/src/prisma/tax-rules-seed.ts` holds example rule sets per jurisdiction — examples for an accountant to confirm, never a default.

### Withheld tax: the treatment, because it is easy to get wrong
Withholding is recognised **on the invoice**, not on the payment, and it is not revenue — the customer sends that money straight to the authority, so it never reaches us:

```
Issue:   Dr AR (invoice total)      Cr WHT payable (withheld)
                                Cr VAT payable / other taxes
                                Cr Revenue (net − withheld)

Payment: Dr Bank (cash received)   Cr AR (cash + withheld)
         Dr WHT payable (customer remitted it)
```

Three consequences worth knowing, each of which was found by running it:

1. **AR is credited by cash *plus* withheld**, because both settle the invoice — crediting only the cash leaves the invoice looking partly unpaid forever.
2. **Revenue is net of withheld.** It was charged to the customer but we never keep it.
3. **The invoice's business columns must count withheld as settled** or they disagree with the ledger by exactly that amount. `invoice-settlement.ts` is the one place that recomputes them, and it now counts payments, credit applied *and* withheld — which is why the payment, receipt and credit paths all call `syncInvoiceSettlement` instead of each adding up the sources it happens to know about.

`POST /finance/tax/remit` (`Dr payable / Cr bank`) is for the other flow, where the company collects the money and pays the authority later. Calling it when the customer already remitted takes the account negative rather than silently doing nothing — deliberate.

- Recurring billing needs a scheduler — check if `@nestjs/schedule` or similar is already installed before adding a new dependency (it is **not** currently installed).

## Frontend: Next.js Notes
- Remove legacy `billingApi`; all finance UI should call `/finance/*` exclusively — done 2026-10-03.
- Rent receipt creation bug (logs instead of persisting) is in this module's frontend — fixed 2026-10-03 (form now posts `POST /finance/receipts` with lines + per-invoice `Payment` + invoice balance updates; "Apply to Invoices" is populated via `rental-agreements.findAll` which now includes `invoices`).
- `/settings/tax` is the management screen for the engine: jurisdiction (country, optional region, registration number), the rules that apply there, and the rest grouped under other jurisdictions. Rate changes go through "New Rule" with the existing rule's id, which supersedes rather than edits — the screen has no rate-edit control on purpose.

## Acceptance Criteria
- ✅ Every payment recorded correctly updates invoice status and posts a balanced journal entry — `POST /finance/payments` and `POST /finance/receipts` both do it in one transaction (verified live 2026-10-04)
- ❌ Recurring rent invoices generate automatically on schedule for active leases
- ✅ Tax is applied per the organization's configured rules and shown correctly on invoices — `TaxService` resolves the rules for the organization's jurisdiction at the invoice date, the calculator prices each line in integer cents (inclusive prices are stripped back to net, withheld tax never reaches the customer's bill), and each tax type posts to its own ledger account. Verified live across three jurisdictions on one engine
- ✅ A trial balance balances to zero — `/finance/accounting/trial-balance` reports `balanced` and refuses nothing silently; `postEntry` rejects any entry that would unbalance it
- ✅ Invoices issued in one jurisdiction stay explicable after the rules change — the invoice snapshots `taxJurisdiction`, `taxBasis` and a per-rule `taxSummary`, and each line snapshots `taxRuleId`/`taxCode`, so a superseded rate does not rewrite an issued document
- ✅ Withheld tax reaches the ledger — recognised as a liability on the invoice, discharged by the payment, with the invoice's own columns counting it as settled (see Backend Notes for the entries and why each line is there)

## Dependencies on Other Modules
- Feeds: Landlord Management (owner statements), Reports & Analytics, Sales (installments)
- Depends on: Core Platform (organization profile — the jurisdiction the tax engine resolves against lives there)
