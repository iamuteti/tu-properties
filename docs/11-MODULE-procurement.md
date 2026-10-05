# Module 10: Procurement

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**Built.** Verified live against the running stack: 98 unit tests, plus 62 purchase-cycle
and 18 approval-gate checks driven through the real HTTP API on both demo tenants.

## Module Goal
Manage purchase requests through to purchase orders, with supplier and RFQ support.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No procurement-specific tables or pages reported as existing. Confirmed: nothing existed.
- **One thing did exist and is deliberately reused rather than duplicated:** `Supplier` and
  `SupplierBill` from Module 7 (accounts payable). A second vendor table would put two
  `SUP-NNNN` codes on one plumber and make an AP total wrong, so the procurement-only
  fields (`category`, `rating`, contract window) were *added to* the existing model and the
  procurement supplier endpoints read the same rows.

## Scope / Sub-modules
- Purchase Requests: department requests, approval workflow
- RFQ: request quotations, multiple suppliers, bid comparison
- Purchase Orders: PO generation, supplier acceptance, delivery tracking
- Suppliers: vendor profiles, performance, contracts

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Procurement

## Tasks Checklist
- [x] Add `Supplier`, `PurchaseRequest`, `RFQ`, `PurchaseOrder` models per `01-DATABASE-SCHEMA.md`
  — `PurchaseRequest(+Line)`, `Rfq`, `RfqInvitation`, `RfqQuote(+Line)`, `PurchaseOrder(+Line)`,
  `GoodsReceipt(+Line)`; `Supplier` extended rather than duplicated.
- [x] Build supplier CRUD
  — creation and contact/bank details stay with `PayablesService` (one code sequence, one record);
    `/procurement/suppliers` adds the procurement view: derived performance, contract window,
    category and rating, plus a spend-per-supplier report.
- [x] Build purchase request creation + approval flow (integrate with Workflow Engine module if built first; otherwise a simple single-approver flow as a placeholder)
  — integrated with Module 18 as the primary path (`entityType` `PURCHASE_REQUEST`), with the
    direct approve kept as the no-policy fallback.
- [x] Build RFQ creation + bid comparison view
  — `procurement-comparison.ts` does the arithmetic server-side; nothing recommended unless one
    quote wins on both price and lead time.
- [x] Build PO generation from an accepted RFQ/approved PR, with delivery status tracking
  — three routes in (awarded quote / approved request / standalone), goods receipts as rows,
    `receivedQuantity` derived from them.
- [x] Link PO completion to Inventory module (stock-in) and Finance module (SupplierBill creation)
  — SupplierBill creation **done** (through `PayablesService`, so the tax engine and the ledger
    entry are finance's). Stock-in is **not** done and not faked: Module 11 does not exist, so
    `GET /procurement/purchase-orders/:id/stock-in` reports what is waiting and says the module
    is unavailable. See the acceptance note below.

## Backend: NestJS Notes
- New module: `backend/src/modules/procurement/` (alongside the other modules, not
  `backend/src/procurement/` as the note assumed).
- Two pure, unit-tested files: `procurement-lifecycle.ts` (three state machines) and
  `procurement-comparison.ts` (the bid comparison and the receipt arithmetic).

## Frontend: Next.js Notes
- Routes under `(dashboard)/procurement/`: purchase requests (list/detail/new), RFQs
  (list/detail/new), purchase orders (list/detail/new), suppliers.
- Followed `00-UX-CROSS-CUTTING-STANDARDS.md`: real empty/loading/error states everywhere, row
  actions driven by the server's `availableActions` rather than re-implemented in the client,
  CSV exports, and detail pages for every record.

## Acceptance Criteria
- [x] A purchase request can be approved, converted to an RFQ, compared across suppliers, and
  turned into a PO — verified end to end over HTTP, including the refusal cases (a second
  approval, a second award, a quote for a non-approved request, an order cancelled after goods
  arrived).
- [ ] PO delivery marks corresponding inventory as received — **cannot be met yet.**
  `GoodsReceiptLine.stockInRecordedAt` exists and is reported as pending, but Inventory
  (Module 11) has not been built, so nothing here moves stock. Per master doc issue 70 no
  speculative `inventoryItemId` was added pointing at a table that does not exist; this is
  finished when Module 11 lands, not before.

## Dependencies on Other Modules
- Feeds: Inventory (stock-in — pending Module 11), Finance & Accounting (supplier bills — done)
- Benefits from: Workflow Engine for approvals — used for the primary approval path

## Notes / Decisions Worth Remembering

1. **`RfqStatus.CLOSED` was added.** The doc's round has no such state, so `close` originally
   wrote `CANCELLED` — which claimed the round had been called off with a reason when it had
   merely run its course. Closing takes no reason and is reversible; cancelling records one and
   is terminal.
2. **A single-supplier round is allowed but flagged, not blocked.** Refusing to issue an RFQ to
   one supplier would push the purchase into an email thread where nothing is recorded. The
   comparison view says "single source" out loud.
3. **The comparison never recommends on a trade-off.** Cheapest-and-fastest is the only
   automatic recommendation; a tie or a genuine trade-off recommends nobody, because that is a
   judgement the module has no business making on the buyer's behalf.
4. **`GET /workflows/instances/:id/decision` was missing three roles** (issue: `PROCUREMENT_OFFICER`,
   `MAINTENANCE_MANAGER`, `TECHNICIAN` were added to `UserRole` by Modules 9 and 10 but never to
   that endpoint's `@Roles`), so a policy naming one of them produced an approval nobody could
   act on. Fixed.
5. **`PurchaseCategory` and `BillCategory` are deliberately different enums.** The requester
   says what is being bought; finance decides which expense account the invoice lands in. The
   mapping is one table (`PURCHASE_CATEGORY_TO_BILL_CATEGORY`), applied when the bill is raised.
