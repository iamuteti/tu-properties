# Module 10: Procurement

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

## Module Goal
Manage purchase requests through to purchase orders, with supplier and RFQ support.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No procurement-specific tables or pages reported as existing.

## Scope / Sub-modules
- Purchase Requests: department requests, approval workflow
- RFQ: request quotations, multiple suppliers, bid comparison
- Purchase Orders: PO generation, supplier acceptance, delivery tracking
- Suppliers: vendor profiles, performance, contracts

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Procurement

## Tasks Checklist
- [ ] Add `Supplier`, `PurchaseRequest`, `RFQ`, `PurchaseOrder` models per `01-DATABASE-SCHEMA.md`
- [ ] Build supplier CRUD
- [ ] Build purchase request creation + approval flow (integrate with Workflow Engine module if built first; otherwise a simple single-approver flow as a placeholder)
- [ ] Build RFQ creation + bid comparison view
- [ ] Build PO generation from an accepted RFQ/approved PR, with delivery status tracking
- [ ] Link PO completion to Inventory module (stock-in) and Finance module (SupplierBill creation)

## Backend: NestJS Notes
- New module: `backend/src/procurement/`.

## Frontend: Next.js Notes
- New routes under `(dashboard)/procurement/`.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- A purchase request can be approved, converted to an RFQ, compared across suppliers, and turned into a PO
- PO delivery marks corresponding inventory as received

## Dependencies on Other Modules
- Feeds: Inventory (stock-in), Finance & Accounting (supplier bills)
- Benefits from: Workflow Engine for approvals
