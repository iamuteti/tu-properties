# Module 7: Finance & Accounting

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**General ledger landed 2026-10-04.** Chart of accounts, double-entry `JournalEntry`/`JournalLine`, auto-posting from invoice/receipt/payment creation, reversals, trial balance, account ledger, GL screens and payment-to-invoice allocation are all built and verified live (`/finance/chart-of-accounts`, `/finance/journal-entries`, `/finance/trial-balance`). **Still missing:** accounts payable (supplier bills), credit notes, recurring/batch invoicing, the configurable per-organization tax-rules engine, local tax compliance (only the `Invoice.signOnEfims` flag is wired to anything), bank reconciliation, period close.

Note when continuing: `AccountingService.postEntry` is the only write path to the ledger and refuses unbalanced/single-sided/negative lines. Any new money-moving module (AP, credit notes, payouts) must post through it rather than writing `JournalLine` rows directly, and must pass the caller's transaction client so the source record and its entry commit together. Account codes are the contract with auto-posting — see `accounting/chart-of-accounts.ts` before renaming anything there.

## Module Goal
Full accounting backbone: chart of accounts, AR/AP, general ledger, recurring billing, multi-tax-jurisdiction support, local tax compliance per jurisdiction.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Invoices, payments, receipts exist as CRUD with tax-related fields — real but shallow (`invoices/new` form is 615 lines, `payments/new` 444, `receipts/new` 409).
- Accounting-adjacent fields already sit unused in the schema: `acReceivable`, `incomeAccount`, `spotRate`, `Invoice.signOnEfims` (local tax compliance flag), `Receipt.bankingDate` — no logic consumes any of them yet. Wire to these, don't duplicate them.
- Legacy `billingApi` in frontend was removed in Module 0 (2026-10-03); all finance UI now calls `/finance/*` exclusively.
- Confirmed **absent**: chart of accounts, journal entries, trial balance/GL, payment allocation to specific invoices, payment reversal workflows, bank reconciliation, accounts payable, recurring/batch invoicing, real local tax compliance transmission (only the boolean flag exists, no KRA integration).
- Receipt invoice-selection UI is now a real searchable picker (`receipts/new`) — done in Module 0.

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
- [ ] Add CreditNote model + issuance flow
- [ ] Add SupplierBill (AP side) — confirmed fully missing
- [ ] Build recurring/batch billing: scheduled job to generate rent invoices per active RentalAgreement on its billing cycle — confirmed absent, this blocks any real production use. Note the generated invoices will auto-post to the GL, so this depends on nothing else here but should reuse `InvoicesService.create`
- [ ] Build configurable tax rules engine (per organization, per jurisdiction) — tax types (VAT, sales tax, withholding tax, etc.) and rates managed through System Settings, not hardcoded. Tax calculation applies configured rules automatically on invoice generation. Today VAT reaches the ledger as whatever `Invoice.vatAmount` holds
- [ ] Build local tax compliance integration (eTIMS/KRA for Kenya, and equivalent systems for other target jurisdictions) — transmission, QR code, ETR handling — wiring to the existing `Invoice.signOnEfims` flag rather than adding a parallel field; this is a compliance requirement for invoicing in each target market, not optional polish
- [ ] Build bank reconciliation UI (match payments to bank statement lines) — lower priority, can be Phase 3 per the Master doc's roadmap. `Account` rows for bank accounts exist in the seeded chart, so this is additive
- [~] Build invoice/payment/receipt detail pages per `00-UX-CROSS-CUTTING-STANDARDS.md` — **partially done 2026-10-03:** invoice detail page `finance/invoices/[id]` now exists (view, status transitions Mark-as-Paid/Cancel/Reopen, delete, line items, payment history). Payment and receipt detail pages are still missing
- [x] GL read-and-post UI — done 2026-10-04: chart of accounts, journal entries (source filter, expandable lines, manual entry, reversal) and trial balance, all under Billing & Finance in the sidebar

## Backend: NestJS Notes
- `backend/src/modules/finance/` — extended in place. `accounting/` holds the GL: `accounting.service.ts` (posting, reversal, trial balance, ledger, chart of accounts), `chart-of-accounts.ts` (the seeded standard chart and the codes auto-posting resolves), and the controller at `/finance/accounting/*` guarded by the new `accounting` RBAC module. `AccountingService` is exported by `AccountingModule` and imported by the invoice/receipt/payment modules.
- Recurring billing needs a scheduler — check if `@nestjs/schedule` or similar is already installed before adding a new dependency (it is **not** currently installed).

## Frontend: Next.js Notes
- Remove legacy `billingApi`; all finance UI should call `/finance/*` exclusively — done 2026-10-03.
- Rent receipt creation bug (logs instead of persisting) is in this module's frontend — fixed 2026-10-03 (form now posts `POST /finance/receipts` with lines + per-invoice `Payment` + invoice balance updates; "Apply to Invoices" is populated via `rental-agreements.findAll` which now includes `invoices`).

## Acceptance Criteria
- ✅ Every payment recorded correctly updates invoice status and posts a balanced journal entry — `POST /finance/payments` and `POST /finance/receipts` both do it in one transaction (verified live 2026-10-04)
- ❌ Recurring rent invoices generate automatically on schedule for active leases
- ⚠️ Tax is applied per the organization's configured rules and shown correctly on invoices — the configured-rules engine does not exist yet; today the invoice's own `vatAmount` is posted to VAT payable
- ✅ A trial balance balances to zero — `/finance/accounting/trial-balance` reports `balanced` and refuses nothing silently; `postEntry` rejects any entry that would unbalance it

## Dependencies on Other Modules
- Feeds: Landlord Management (owner statements), Reports & Analytics, Sales (installments)
- Depends on: Core Platform (org tax settings)
