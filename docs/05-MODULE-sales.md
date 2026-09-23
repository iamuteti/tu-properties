# Module 4: Sales Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

## Module Goal
Manage the property sales pipeline from quotation to handover, including commissions.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No sales-specific tables or pages reported as existing yet. Note: this is distinct from Leasing, which is already built.

## Scope / Sub-modules
- Property Sales: quotations, offers, reservations, booking fees, sale agreements, installment plans
- Sales Workflow: Lead → Viewing → Offer → Negotiation → Reservation → Agreement → Payment → Handover
- Commission Management: agent, broker, referral commission, split commissions

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Sales

## Tasks Checklist
- [ ] Add `SaleTransaction`, `Commission` models per `01-DATABASE-SCHEMA.md`
- [ ] Build sale transaction CRUD + stage transitions
- [ ] Build installment plan support (link to Finance module's Invoice generation, don't duplicate invoicing logic)
- [ ] Build commission calculation + approval flow
- [ ] Frontend: sales pipeline view, sale detail page, commission report

## Backend: NestJS Notes
- New module: `backend/src/sales/`.
- Reuse Finance module's Invoice/Payment models for installment billing rather than building parallel billing logic.

## Frontend: Next.js Notes
- New routes under `(dashboard)/sales/`.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- A sale can move through all stages to Handover
- Commission is calculated and visible per agent, with split support

## Dependencies on Other Modules
- Depends on: Property Management, CRM (contacts), Finance & Accounting (invoicing)
