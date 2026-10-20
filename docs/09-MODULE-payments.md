# Module 8: Payments

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**Payment allocation, overpayment credit and refunds landed 2026-10-04** — the parts of this module that can be built and verified without live gateway credentials. Allocations are explicit rows (`PaymentAllocation`), overpayments become spendable `CustomerCredit`, refunds record their own direction and issue a credit note, and every figure an invoice shows is *derived* rather than decremented. Frontend: `/finance/credits`, `/finance/refunds`, plus an Allocate action on the payments list. **Still missing:** Stripe (the doc's priority gateway) and M-Pesa STK push — both need live credentials, a callback URL and a webhook signature story, so they are deliberately left for a session that can test against the sandbox rather than half-built here. Also missing: standalone credit notes (they are currently only issued by refunds), FX handling (`Payment.spotRate` is recorded but the ledger posts the record's own currency), and gateway settlement tracking.

Audit correction: M-Pesa is a **config field only** (`Property.mpesaPropertyPayNumber`), not a working integration. No STK push, no C2B/B2B callback handling, no reconciliation exists yet. Multi-currency fields exist on `Payment` but nothing converts between them.

Note when continuing: `PaymentAllocation` is the record of *how much of a payment settled which invoice*, and `invoice-settlement.ts` is the only place allowed to recompute `Invoice.paidAmount`/`balanceAmount`/`status` — `livePaidAmount` reads allocations, not `Payment.amount`, because a payment is usually larger than the bill it paid and the difference is credit. Do not add a fourth path that decrements `Invoice.paidAmount` directly; refunds, reversals and credits all go through `syncInvoiceSettlement`. `allocateToInvoice` in `invoice-allocation.ts` is the shared rule for "how much of this amount does the bill absorb, and what is surplus" — every money path uses it. For the gateway work: a webhook that confirms money must call `PaymentsService.create`/`allocate`, not write payment rows itself, so the allocation rows and the GL posting cannot be skipped; and webhook bodies must be verified with the provider's signature before anything is trusted.

## Module Goal
Handle all payment collection methods, with correct allocation to invoices — Stripe as the primary global payment gateway, with extensibility for regional methods (M-Pesa, etc.).

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- Currency is configurable per organization (per org setting), but actual multi-currency payment processing is not yet built.
- Credit card / digital wallet payments via Stripe — confirmed absent (no integration, no config field confirmed).
- M-Pesa: only a paybill/till number config field exists on Property (`mpesaPropertyPayNumber`) — **no STK push, no C2B/B2B callback handling, no reconciliation logic exists**. This was previously assumed to be 'implemented' based on the owner's description; the audit corrects that.
- Stripe: no config field or integration confirmed; this is the primary gateway to build for a global product.
- No payment allocation to invoices, no overpayment/credit handling, no refund workflow confirmed.

## Scope / Sub-modules
- Payment Methods: bank transfer, credit card/digital wallet (Stripe), mobile money (M-Pesa, etc.), cash, cheque
- Payment Features: auto allocation, partial payments, overpayments, refunds, receipts

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Payments

## Tasks Checklist
- [ ] Build the Stripe integration from scratch: payment intent creation, webhook handling, refund support, idempotent reconciliation against the existing payment config fields — this is a from-zero build for the primary gateway. **Not started 2026-10-04:** the money-handling layer a webhook needs (allocation, overpayment credit, refund) now exists, so a confirmed-payment webhook only has to call `PaymentsService.create`/`allocate` — do not have it write payment rows directly
- [ ] Secure the Stripe webhook endpoint properly (signature verification), not just an open POST endpoint
- [x] Build payment-to-invoice allocation: a payment should apply to the oldest outstanding invoice by default, with manual override — done 2026-10-04. `POST /finance/payments/:id/allocate` walks outstanding invoices oldest-due-first (or follows explicit `invoiceIds` in the order given); the frontend shows an Allocate action on any payment not tied to an invoice
- [x] Build partial payment support (invoice status = PARTIALLY_PAID) if not present — done 2026-10-04 via `deriveInvoiceStatus`, shared by every money path
- [x] Build overpayment handling (credit balance on tenant/contact account, applicable to next invoice) — done 2026-10-04. `CustomerCredit` records the surplus, is spent oldest-invoice-first by `CreditsService.applyToInvoices`, and shows per-customer on `/finance/credits`. A credit moves no cash (the money was already received) so it posts no journal entry
- [x] Build refund flow (linked to a payment, produces a negative payment or credit note — decide and document which pattern; recommend credit note for auditability) — done 2026-10-04, **credit note** pattern as recommended. `PaymentRefund` rows record the direction, a `CreditNote` is issued and linked, the invoice is re-derived from live allocations minus refunds, and cash leaves the ledger (Dr 4290 contra revenue / Cr the account the payment landed in). Refunds are capped at what is still refundable, and a reversed payment is refused
- [ ] Verify receipt generation is automatic on successful payment, and downloadable as PDF
- [ ] Every payment/refund action must call `logAction()` (Module 0 Stabilization) — money movement is exactly the kind of action that needs a real audit trail
- [x] Capture money that arrives outside the system, by hand, against a resident — done 2026-10-20 as **Capture Manually**. `POST /finance/receipts` is the write; the two screens (`/tenants/[id]/capture` and `/finance/capture-manually`) are the front door. The payment method is a dropdown, and the reason it is a dropdown rather than a free-text note is the sixth method: `DIRECT_REMIT` — the payer sent the money straight to the party it was due to (usually the owner) and it never reached an account of ours. Filing that under `CASH` produced a receipt claiming the estate was holding money it had never seen, so it is its own method and its own ledger treatment: Dr 1400 *Rent Receivable from Landlords* / Cr 1200 *Accounts Receivable*. It never touches 1000 or 1010, because nothing of ours moved. See the accounting note in `08-MODULE-finance-accounting.md`

## Capture Manually — the rules it follows
- **The dropdown says what actually happened.** Six instruments (cash, bank transfer, cheque, M-Pesa, card, other) plus `DIRECT_REMIT`. There is no "nearest match": a method that is not what happened is a wrong ledger entry, not an approximate one.
- **`DIRECT_REMIT` is not cash and does not become cash.** The estate holds nothing, so no account of ours is debited. What the receipt leaves behind is a receivable from the party that took the money, and the tenant's bill is settled by the credit side exactly as it would be for any other method. The service sets `receiptTo: 'Landlord'` server-side for this method — the client does not get to say the money went somewhere else.
- **The amount and the applications must agree.** The service refuses a receipt whose `payments` do not add up to `amountReceived`, so the form derives the amount from the invoices it applies to and offers a separate on-account amount for money that cannot be matched to a bill yet.
- **A receipt is a direct receipt.** `drtOrDrf` defaults to `DirectReceipt`. The old default was `DepositRefund`, which described the opposite event and disagreed with every seeded receipt.
- **Who may capture.** Super admin, company admin and accountant (the `receipts` module at `full()`), and the **property manager** at `{ view: true, create: true }` — they are the person at the estate who receives the money, so they may record that it arrived. No `update`, no `delete`: a receipt is evidence, and the person who witnessed the handover is not the person who may remove it. The organization-wide register under `/finance/receipts` stays with finance — the controller's own role list is what keeps it there, the same arrangement the accountant has with `deposits`. A property manager reads a resident's receipts on the resident's file and prints them from there.

## Backend: NestJS Notes
- Stripe: use environment-based API credentials (publishable + secret key), never hardcoded; this is a from-scratch integration, budget real time for sandbox testing of payment flows, refunds, and their failure/timeout paths.
- Built in `backend/src/modules/finance/`: `credits/` (`CreditsService` — creation, per-customer balances, oldest-first application), `refunds/` (`RefundsService` — the credit-note refund pattern), plus two shared files used by every money path: `invoice-allocation.ts` (pure rules: how much an invoice absorbs, what is surplus, what status follows) and `invoice-settlement.ts` (recomputes an invoice's money columns from allocations, refunds and credit). Both are dependency-light and unit-tested on their own.

## Frontend: Next.js Notes
- Payment recording UI should support method selection and reference number capture per method.
- Built: `/finance/credits` (balances, open credits, one-click oldest-first apply), `/finance/refunds` (record a refund against a live payment with the refundable amount pre-filled), and an Allocate action on the payments list. `creditsApi`/`refundsApi` in `lib/api.ts`.
- Built: **Capture Manually** — `frontend/components/finance/capture-manually-form.tsx`, reached from the resident's file (`/tenants/[id]/capture`, behind the "Capture Manually" button on the tenant page) and from `/finance/capture-manually` (sidebar, Billing & Finance). It picks the tenant and the tenancy, shows the open invoices with a checkbox and an editable applied amount, and posts one receipt. The method dropdown lives in `lib/constants.ts` as `PAYMENT_METHODS`, and `paymentMethodLabel()` is what every receipt list, the resident's Financial tab and the receipt document use to name a method — the enum value is not the label, and a receipt a resident keeps should say what happened to the money rather than what the column is called.

## Acceptance Criteria
- ✅ A payment via any supported method correctly updates invoice status and generates a receipt — allocation runs through `allocateToInvoice`; **receipt PDF generation is still missing** (a receipt record exists, a downloadable document does not)
- ❌ Stripe payment flow works end-to-end in a test/sandbox environment — not started
- ✅ Overpayment creates a usable credit rather than being lost or erroring — verified live 2026-10-04: paying 5,000 against a 3,000 invoice leaves the invoice paid and creates a 2,000 credit that applies to the next bill oldest-first
- ✅ Money received outside the system is recorded as what it was, not as the nearest instrument — `DIRECT_REMIT` is a method of its own, the receipt and the ledger both carry it, and no account of ours is debited for money that never reached us

## Dependencies on Other Modules
- Tightly coupled with: Finance & Accounting — every payment, receipt, refund and credit application posts to the ledger through `AccountingService.postEntry`/`postRefund`, so a payment can never land without its journal entry
