# Module 7: Finance & Accounting

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
CRUD-only for invoices/payments/receipts. Basic payment-to-invoice allocation now exists (receipt creation runs in a transaction and updates invoice `paidAmount`/`balanceAmount`/status); the invoice detail page and the receipt "Add Invoice" picker exist. **Still missing:** GL / chart of accounts, journal entries, payment reversal workflows, bank reconciliation, accounts payable, recurring/batch invoicing, real local tax compliance (only the `Invoice.signOnEfims` flag exists).

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
- [ ] Audit existing Invoice/Payment/Receipt models against `01-DATABASE-SCHEMA.md`; identify how `acReceivable`/`incomeAccount`/`spotRate` map to the target Account/JournalEntry structure
- [ ] GL is confirmed in scope (internal tool, no external sync needed). Build full double-entry GL using existing `Account`, `JournalEntry`, `JournalLine` models. Auto-post journal entries from invoice/payment/lease creation — don't require manual double-entry from users for routine transactions
- [~] Build payment-to-invoice allocation logic first, even before full GL — **partially done 2026-10-03:** `POST /finance/receipts` now runs in a transaction and, for each applied invoice, updates `paidAmount`/`balanceAmount`/status (`PARTIALLY_PAID`/`PAID`), validates the sum of payments equals `amountReceived`, and rejects CANCELLED/PAID invoices. This is the *receipt* allocation path. The `payments` module itself still doesn't allocate payments to invoices — that remains this module's work
- [ ] Build payment reversal workflow (a payment applied in error needs a real, audited undo path, not a manual DB edit)
- [ ] Add Account, JournalEntry, JournalLine models to schema; wire auto-posting of journal entries from invoice/payment/lease creation (no manual double-entry from users for routine transactions)
- [ ] Add CreditNote model + issuance flow
- [ ] Add SupplierBill (AP side) — confirmed fully missing
- [ ] Build recurring/batch billing: scheduled job to generate rent invoices per active RentalAgreement on its billing cycle — confirmed absent, this blocks any real production use
- [ ] Build configurable tax rules engine (per organization, per jurisdiction) — tax types (VAT, sales tax, withholding tax, etc.) and rates managed through System Settings, not hardcoded. Tax calculation applies configured rules automatically on invoice generation
- [ ] Build local tax compliance integration (eTIMS/KRA for Kenya, and equivalent systems for other target jurisdictions) — transmission, QR code, ETR handling — wiring to the existing `Invoice.signOnEfims` flag rather than adding a parallel field; this is a compliance requirement for invoicing in each target market, not optional polish
- [ ] Build bank reconciliation UI (match payments to bank statement lines) — lower priority, can be Phase 3 per the Master doc's roadmap
- [~] Build invoice/payment/receipt detail pages per `00-UX-CROSS-CUTTING-STANDARDS.md` — **partially done 2026-10-03:** invoice detail page `finance/invoices/[id]` now exists (view, status transitions Mark-as-Paid/Cancel/Reopen, delete, line items, payment history). Payment and receipt detail pages are still missing

## Backend: NestJS Notes
- Likely at `backend/src/finance/` — extend, don't parallel-build.
- Recurring billing needs a scheduler — check if `@nestjs/schedule` or similar is already installed before adding a new dependency.

## Frontend: Next.js Notes
- Remove legacy `billingApi`; all finance UI should call `/finance/*` exclusively — done 2026-10-03.
- Rent receipt creation bug (logs instead of persisting) is in this module's frontend — fixed 2026-10-03 (form now posts `POST /finance/receipts` with lines + per-invoice `Payment` + invoice balance updates; "Apply to Invoices" is populated via `rental-agreements.findAll` which now includes `invoices`).

## Acceptance Criteria
- Every payment recorded correctly updates invoice status and (if GL is in scope) posts a balanced journal entry
- Recurring rent invoices generate automatically on schedule for active leases
- Tax is applied per the organization's configured rules and shown correctly on invoices
- A trial balance (if GL in scope) balances to zero

## Dependencies on Other Modules
- Feeds: Landlord Management (owner statements), Reports & Analytics, Sales (installments)
- Depends on: Core Platform (org tax settings)
