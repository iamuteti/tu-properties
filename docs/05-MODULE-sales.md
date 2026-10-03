# Module 4: Sales Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**Complete (backend + frontend).** A sale moves through all seven stages with the money gates enforced
server-side, instalments are billed through the Finance module (no parallel billing path), and commission
splits reconcile to the cent and are reportable per agent. Remaining work is sales-side reporting and the
finance-side invoice reconciliation listed under Known Gaps.

## Module Goal
Manage the property sales pipeline from quotation to handover, including commissions.

## Existing Coverage in TU Properties (verified 2026-10-03)
- **No sales tables and no sales pages existed.** `grep` for `Sale`/`Commission` models in `schema.prisma`
  found nothing; there was no `backend/src/modules/sales/` and no `(dashboard)/sales` route.
- The pieces this module had to assemble from existing work: properties (Module 2), contacts (Module 3),
  invoices/payments (Finance), and the RBAC permission matrix (Module 1).

## Scope / Sub-modules
- Property Sales: quotations, offers, reservations, booking fees, sale agreements, installment plans
- Sales Workflow: Quotation → Offer → Reservation → Agreement → Payment → Handover (or Cancelled)
- Commission Management: agent, broker, referral commission, split commissions

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Sales — now `sale_transactions`, `sale_installments`,
`commissions`, plus `invoices.saleTransactionId`.

## Tasks Checklist
- [x] Add `SaleTransaction`, `Commission` models per `01-DATABASE-SCHEMA.md`
- [x] Build sale transaction CRUD + stage transitions
- [x] Build installment plan support (link to Finance module's Invoice generation, don't duplicate invoicing logic)
- [x] Build commission calculation + approval flow
- [x] Frontend: sales pipeline view, sale detail page, commission report

## What Was Built

### Schema (`backend/src/prisma/schema.prisma`)
| Model / change | Notes |
| --- | --- |
| `SaleTransaction` | `code` (`SALE-2026-0001`), `propertyId` (**Restrict** — a property with an open sale cannot be deleted), `propertyTitle` snapshot, `buyerContactId` → `Contact`, `leadId` → `Lead`, `agentUserId` → `User`, money fields (`askingPrice`, `agreedPrice`, `bookingFee`, `depositAmount`, `currency`, `commissionRate`) and a stage-date per stage for an audit trail. Tenant-scoped with `organizationId`. |
| `SaleInstallment` | `sequence` + `description` + `amount` + `dueDate` + `status` (`SCHEDULED/INVOICED/PAID/OVERDUE/WAIVED`) and `invoiceId` → `Invoice`. Unique `(saleTransactionId, sequence)`. |
| `Commission` | `agentUserId` (Restrict), `amount`, `splitPercentage`, `currency`, `basis`, `status` (`PENDING/APPROVED/PAID/REJECTED`), `approvedById`/`approvedAt`, `paidAt`/`paidRef`. Carries an optional `rentalAgreementId` so the leasing side of the same concept can reuse it (Module 5). |
| `Invoice.saleTransactionId` | Nullable, `SetNull` — sale invoices are finance invoices classified `transactionClass = 'SALE'`, not a parallel billing model. |

Migration `20261003170000_module4_sales` (applied; `migrate status` clean).

### Backend (`backend/src/modules/sales/`)
- **`sale-stage.ts`** — pure transition rules, unit-tested: strictly one stage forward, no skipping, no
  backwards moves, `HANDOVER`/`CANCELLED` terminal, cancel allowed from any open stage. Gates:
  - `→ RESERVATION` requires an agreed price (a reservation is a commitment),
  - `→ AGREEMENT` requires a buyer contact,
  - `→ PAYMENT` requires at least one raised invoice,
  - `→ HANDOVER` requires **zero outstanding balance**, and the 409 names the amount.
  `stage` is only settable through `PATCH /sales/:id/stage`; `PATCH /sales/:id` does not accept it.
- **`commission-calculator.ts`** — pure arithmetic in integer cents, unit-tested: the split must add up to
  100% (±0.01 tolerance for floating point) and the shares always sum to the total exactly, with the
  rounding remainder on the last row. A 3% split of 10,000.007 three ways reconciles to the cent.
- **`sales.service.ts`**
  - CRUD with tenant scoping, `stage`/`propertyId`/`agentUserId`/`buyerContactId` filters, search, pipeline feed, CSV export.
  - **One open sale per property** — a second live sale on the same asset is refused with the existing sale's code.
  - **Handover archives the property** (`Property.status = ARCHIVED`): it is no longer an available asset.
  - **Installments**: `createInstallmentPlan` builds an equal monthly schedule (optional up-front deposit/booking-fee row, rounding on the last row), refusing to re-plan once invoices exist. `invoiceInstallment` raises the invoice through **`InvoicesService`** (Finance), tags it `transactionClass = 'SALE'` with a sale line item, links `invoice.saleTransactionId`, and flips the instalment to `INVOICED`.
  - `refreshInstallmentStatus` re-derives PAID/INVOICED from the payments actually recorded.
  - **Commissions**: `generateCommissions` validates the split, protects any APPROVED/PAID row from being
    re-split, verifies the agents belong to the organization, and replaces the PENDING rows.
    `setCommissionStatus` enforces PENDING → APPROVED → PAID (PAID needs a reference) and keeps the
    "back to pending only after rejection" rule. `commissionReport` totals per agent by status.
- **`sales.controller.ts`** — `GET/POST/PATCH/DELETE /sales`, `/sales/pipeline`, `/sales/export`,
  `/sales/commissions` (+ `PATCH /sales/commissions/:id/status`), `/sales/:id/stage`,
  `/sales/:id/installments/{plan,:id/invoice,:id/status,refresh}`, `POST /sales/:id/commissions`.
- **RBAC** — a new `sales` permission module (Company Admin + Property Manager full, Leasing Officer and
  Sales Agent read/write) so a leasing officer can register a sale but not run commissions.

### Frontend
- `/sales` — list **and** pipeline board (toggle), filters (stage/property/agent), row actions, CSV export.
- `/sales/[id]` — money summary (agreed / outstanding / schedule progress / commission), a stage rail with
  the legal next actions, parties, notes, and the payment schedule + commission panel.
- `/sales/[id]/edit`, `/sales/new` — one shared `sale-form.tsx`.
- `/sales/commissions` — per-agent totals plus the individual rows with approve / mark-paid / reject actions.
- `components/sales/` — `sales-board.tsx`, `sale-stage-actions.tsx`, `sale-money-panel.tsx`,
  `sale-form.tsx`.
- **`components/ui/kanban-board.tsx`** — the drag-and-drop board was extracted out of the CRM lead board and
  is now shared by both pipelines, so the sales board is ~120 lines of columns plus a card renderer instead
  of a second copy of the mechanics. The CRM board was rewritten on top of it and re-verified.
- `hooks/use-sales.ts` (`useSales` + `useSalesPipeline`), types/constants/API entries, sidebar **Sales** group.

### Demo data
`demo-data.ts` seeds six sales spread across the funnel (two quotations, offer, reservation, a sale in
payment collection with a 5-row schedule and raised finance invoices, and a completed handover whose
invoices carry payments). The handover sale has a commission marked paid; the payment-stage sale is
approved. Cleanup order was updated to delete commissions/installments/sales before properties and invoices.

## Verification Performed
- `npx tsc --noEmit` clean (backend and frontend); `next build` succeeds; `npx jest` — **231/231** across 16
  suites (was 165), including `sale-stage.spec.ts` (the full gate matrix), `commission-calculator.spec.ts`
  (exact splits) and `sales.service.spec.ts`.
- **Live end-to-end sale**: quotation → offer → reservation → agreement → payment → handover, with the gates
  refusing each illegal shortcut (skip a stage, reserve without a price, collect payment with no invoice,
  hand over with cash outstanding). Confirmed: the sale reached `HANDOVER` with a `handoverDate`, the
  property flipped to `ARCHIVED`, the closed sale refuses further moves, and a handed-over sale cannot be
  deleted.
- Instalments: 5-row plan summing exactly to the agreed price, 5 invoices raised through Finance with
  `transactionClass = 'SALE'`, duplicate invoicing refused, payments recorded through
  `POST /finance/payments`, `refresh` marking all five `PAID` and outstanding `0`.
- Commissions: 3% of 82,000,000 = 2,460,000 split 70/30 = 1,722,000 + 738,000, **sum reconciles exactly**;
  pay-before-approve refused; approve → pay with a reference works; report totals per agent.
- Cross-tenant: `GET /sales/:id` from the other organization returns 404.
- All five new frontend routes return 200, and the CRM lead/contact routes still do after the board refactor.
- `npm run db:seed:demo` re-runs cleanly and produces the funnel described above.

## Known Gaps / Follow-ups (not blocking)
- **`PaymentsService.create` never updates the parent invoice's `paidAmount`/`balanceAmount`/`status`.**
  Sale money state therefore sums the `Payment` rows itself instead of trusting those columns (deliberate,
  documented in `outstandingFromInstallments`). Reconciling the invoice columns is Finance module work and
  would also fix rent reporting, so it was left there rather than patched from Sales.
- **No sale documents.** Title deeds, sale agreements and receipts should attach through the Document
  Center the way property photos do (Module 2's `property-documents.tsx` is the pattern); the sale detail
  page has no documents panel yet.
- **Commission payouts are not posted to finance.** A paid commission records a reference and a timestamp;
  making it a payable in the ledger is Module 5/8 work.
- **No sales import.** Sales arrive one at a time by nature, so the CSV bulk import used by
  properties/units/leads was not built here.
- **No discount/offers table.** An offer is a stage plus `agreedPrice`, so a rejected offer leaves no
  separate record — worth revisiting when the pipeline needs deal comparisons.
- **`HANDOVER` archives the property.** That is the honest end state, but a resale later needs an explicit
  un-archive path (there is one: set the property status back).
- **Only one commission basis is wired** (`basis = 'SALE'`). Referral and booking-fee commissions are
  representable in the column but nothing creates them yet.

## Backend: NestJS Notes
- New module at `backend/src/modules/sales/`, registered in `app.module.ts`.
- `SalesModule` imports `InvoicesModule` because instalment billing reuses the finance invoicing service
  rather than writing a parallel billing path.

## Frontend: Next.js Notes
- Routes under `(dashboard)/sales/`, wired into the sidebar as a **Sales** group.
- The pipeline board is the shared `KanbanBoard` (native HTML5 drag and drop, no board library).

## Acceptance Criteria
- [x] A sale can move through all stages to Handover
- [x] Commission is calculated and visible per agent, with split support

## Dependencies on Other Modules
- Depends on: Property Management (Module 2), CRM contacts/leads (Module 3), Finance & Accounting
  (invoicing/payments)
- Feeds into: Reports & Analytics (Module 17 — pipeline value, conversion rate, commission cost)