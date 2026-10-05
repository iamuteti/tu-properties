# Module 11: Inventory

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**COMPLETE — 2026-10-05.** Built as specified in the sketch below. The live repo now has
`backend/src/modules/inventory/`, `frontend/app/(dashboard)/inventory/`, three new tables, and the two
cross-module seams the sketch asked for. Master doc issues 81 and 82–87 record what is still open.

## Module Goal
Track maintenance-related stock items across warehouses.

## The one design rule, and why it is the whole module
**A stock level is the sum of the movements. There is no `quantityOnHand` column anywhere.**

The sketch asked for this directly ("Stock balance should be computed from StockMovement sum, not
stored as a separately-updatable field, to avoid drift"), and it is worth keeping the reason in view,
because the reason is stronger than "avoid drift" in the abstract: this schema has already paid for the
lesson twice. `Invoice.paidAmount` and `PurchaseOrderLine.receivedQuantity` are both derived columns now,
because a counter has to be kept in step by every writer and drifts the first time one of them forgets.
A store is a worse case than an invoice balance, not a better one — there are **five** kinds of writer
here (goods receipts, job issues, transfers, returns, counts) and any of them can leave a counter wrong
while the ledger stays right.

Every read in the module therefore goes through `stock-ledger.ts`, which is pure and is the only place a
stock number is computed. Consequences that are easy to trip over later:

- **`CreateInventoryItemDto` has no quantity field.** An item is created empty and gets stock through an
  `OPENING` movement. An `initialQuantity` would be a second writer of the balance.
- **`RecordStockMovementDto` takes a positive quantity plus a `direction`.** The sign is never taken from
  the client, so a goods receipt booked as `-5` cannot reach the ledger at all.
- **A list cannot be answered from the items table alone.** Every read pairs the item query with a
  `groupBy` over the movements and joins in memory. That is the price of the rule and it is cheap until
  issue 84's ceiling.

## Tasks Checklist
- [x] Add `InventoryItem`, `Warehouse`, `StockMovement` models per `01-DATABASE-SCHEMA.md` — with four
      deviations from the sketch, each recorded below and in the schema's own comments
- [x] Build item + warehouse CRUD
- [x] Build stock movement recording (in/out) with running balance calculation
- [x] Build reorder-level alerting (feeds Notifications module)
- [x] Link to Maintenance module (work orders can consume inventory items) and Procurement module (POs
      replenish stock)
- [x] Beyond the checklist, because the sketch's minimum did not cover its own acceptance criteria:
      transfers, stock takes, per-movement cost snapshots with weighted-average valuation, CSV exports,
      a reorder list, and the "this receipt line is not stock" answer

## Deviations from the schema sketch, and the reasoning
`01-DATABASE-SCHEMA.md` drew three small tables. Four things changed, and in each case the sketch was
under-specified rather than wrong:

| Sketch | Built | Why |
|---|---|---|
| `quantity Int` | `quantity Decimal @db.Decimal(12, 2)`, **signed** | A tin of paint is consumed in halves and a roll of pipe in metres. An `Int` cannot hold "2.5", and the module doc's own item list ("pipes, cement, tiles") is all countable-but-not-whole. Signed because a balance is then `sum(quantity)` and nothing else. |
| `reason String?` | required for `ADJUSTMENT`, optional elsewhere | An adjustment with no explanation is a mystery that never gets solved — the next person to read the ledger is trying to work out who changed what and why. Enforced in the service, which knows the type. |
| no cost anywhere | `unitCost` on the item, `unitCost` snapshot on every movement | The sketch's scope list includes "stock valuation" and there was nothing to value without a price. Costs are snapshotted **per movement** rather than read off the item: a bucket bought at 1,200 and one bought at 1,450 must value differently, and reading today's price for a movement made last year values both at the current price and quietly revalues the shelf. |
| no store on the item | `Warehouse` + `StockMovement.warehouseId` | The sketch has `Warehouse` as a model but no way to say where anything is, which makes "across warehouses" (the stated module goal) unanswerable. |

## Backend: NestJS Notes
- New module: `backend/src/modules/inventory/` — not `backend/src/inventory/`, matching where Modules
  9 and 10 actually live.
- `stock-ledger.ts` is pure and has no `@prisma/client` import: status types are string unions and
  `Numeric` accepts `{ toString(): string }` structurally, so a `Prisma.Decimal` fits without the
  generated client and the arithmetic can be unit-tested without a database. 50 tests.
- **The import direction is one-way and must stay that way.** `ProcurementModule` and
  `MaintenanceModule` both import `InventoryModule`; `InventoryModule` imports neither, and reads their
  rows through Prisma. The rule behind it: **the module that owns the balance owns every write to it**,
  and the other module passes the reference. Master doc issue 85 explains why this was worth deciding
  once rather than discovering as a circular-dependency error at boot.
- Reorder alerting goes through `NotificationsModule` as `STOCK_LOW`, with a daily 06:45 cron sweep and a
  post-movement trigger. Both are keyed `(item, day, recipient)` in the notification `dedupeKey`, so
  twenty issues of the same item in one afternoon is one fact rather than twenty, and an item that stays
  low is not nagged every morning.
- `InventoryNotificationsService` wraps every send, so a notification failure can never fail the movement
  that triggered it — the rule Modules 9 and 18 settled on.

## Frontend: Next.js Notes
- Routes under `(dashboard)/inventory/`: `items` (list/new/detail/edit), `warehouses`
  (list/new/detail/edit), `stock-movements` (the ledger).
- Shared pieces live in `components/inventory/`: `stock-display.tsx` (status badges, signed amounts, the
  valuation panel, and `movementErrorMessage`), `item-form.tsx`, `warehouse-form.tsx` and
  `movement-dialogs.tsx` (record / transfer / stock take).
- The two cross-module panels are `components/inventory/stock-in-panel.tsx` (rendered on the purchase
  order) and `work-order-materials-panel.tsx` (rendered on the work order), so the seam is visible from
  the module that owns the other half of the story.
- `StockInNotice` in `components/procurement/quote-comparison.tsx` was removed. It said "the Inventory
  module does not exist yet" under every goods receipt, which was honest and was also exactly why Module
  10 could not close. The replacement does the work.

## Acceptance Criteria
- **Stock levels accurately reflect the sum of movements.** Enforced structurally: there is no column to
  drift. Verified live — a seeded store whose movements are known by hand, a transfer whose two halves net
  to zero across the stores, and every refused shortcut (issuing 999 of 3, transferring from an empty
  store) returning the backend's own arithmetic in the message.
- **Items below reorder level are flagged/visible.** `GET /inventory/items` returns `status` and a
  `reorder` suggestion per row, `GET /inventory/items/reorder-list` returns the same worst-shortfall-first,
  `GET /inventory/items/stats` carries `belowReorder` / `outOfStock` / `negativeBalances`, and
  `STOCK_LOW` notifications go to the roles that buy. The demo seed deliberately puts one item exactly
  *at* its level (so the alert is visibly a `<`, not a `<=`), one below, one empty and one **negative** —
  the case the module refuses to paper over, because a count cannot be negative and the books are the
  thing that is wrong.

## Dependencies on Other Modules
- **Depends on:** Procurement (stock-in), Maintenance (stock-out), Notifications (reorder alerts),
  Audit (via the global interceptor — every mutation on these controllers is a tenant-scoped
  `POST`/`PATCH`/`DELETE`).
- **Now depended on by:** Procurement (`pendingStockIn`, `POST /stock-movements/book-in`) and Maintenance
  (`GET|POST /work-orders/:id/materials`, `…/materials/return`).
- **Not depended on:** nothing imports `InventoryModule` for its own sake. The two importers use it for
  the ledger, not for the item master.