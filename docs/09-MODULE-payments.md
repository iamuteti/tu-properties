# Module 8: Payments

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Audit correction: M-Pesa is a **config field only** (`Property.mpesaPropertyPayNumber`), not a working integration. No STK push, no C2B/B2B callback handling, no reconciliation exists yet. Treat this module as effectively not-started for the integration itself, despite multi-currency support being configurable.

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
- [ ] Build the Stripe integration from scratch: payment intent creation, webhook handling, refund support, idempotent reconciliation against the existing payment config fields — this is a from-zero build for the primary gateway.
- [ ] Secure the Stripe webhook endpoint properly (signature verification), not just an open POST endpoint
- [ ] Build payment-to-invoice allocation: a payment should apply to the oldest outstanding invoice by default, with manual override — confirmed this doesn't exist yet, treat as highest priority in this module
- [ ] Build partial payment support (invoice status = PARTIALLY_PAID) if not present
- [ ] Build overpayment handling (credit balance on tenant/contact account, applicable to next invoice)
- [ ] Build refund flow (linked to a payment, produces a negative payment or credit note — decide and document which pattern; recommend credit note for auditability)
- [ ] Verify receipt generation is automatic on successful payment, and downloadable as PDF
- [ ] Every payment/refund action must call `logAction()` (Module 0 Stabilization) — money movement is exactly the kind of action that needs a real audit trail

## Backend: NestJS Notes
- Stripe: use environment-based API credentials (publishable + secret key), never hardcoded; this is a from-scratch integration, budget real time for sandbox testing of payment flows, refunds, and their failure/timeout paths.

## Frontend: Next.js Notes
- Payment recording UI should support method selection and reference number capture per method.

## Acceptance Criteria
- A payment via any supported method correctly updates invoice status and generates a receipt
- Stripe payment flow works end-to-end in a test/sandbox environment
- Overpayment creates a usable credit rather than being lost or erroring

## Dependencies on Other Modules
- Tightly coupled with: Finance & Accounting
