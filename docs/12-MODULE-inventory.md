# Module 11: Inventory

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
Not started per owner description.

## Module Goal
Track maintenance-related stock items across warehouses.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No inventory-specific tables or pages reported as existing.

## Scope / Sub-modules
- Items: paint, pipes, tiles, cement, bulbs, etc.
- Inventory Features: stock in/out, warehouses, minimum stock, reorder levels, stock valuation

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Inventory

## Tasks Checklist
- [ ] Add `InventoryItem`, `Warehouse`, `StockMovement` models per `01-DATABASE-SCHEMA.md`
- [ ] Build item + warehouse CRUD
- [ ] Build stock movement recording (in/out) with running balance calculation
- [ ] Build reorder-level alerting (feeds Notifications module)
- [ ] Link to Maintenance module (work orders can consume inventory items) and Procurement module (POs replenish stock)

## Backend: NestJS Notes
- New module: `backend/src/inventory/`.
- Stock balance should be computed from StockMovement sum, not stored as a separately-updatable field, to avoid drift.

## Frontend: Next.js Notes
- New routes under `(dashboard)/inventory/`.
- Follow `00-UX-CROSS-CUTTING-STANDARDS.md` from the start for this module's pages (detail/edit pages, row actions, bulk ops, exports, empty/error/loading states, mobile) — since this module is net-new, there's no excuse to repeat the list+create-only pattern the audit found everywhere else.

## Acceptance Criteria
- Stock levels accurately reflect the sum of movements
- Items below reorder level are flagged/visible

## Dependencies on Other Modules
- Depends on: Procurement (stock-in), Maintenance (stock-out)
