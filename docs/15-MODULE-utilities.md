# Module 14: Utilities

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status
**COMPLETE 2026-10-06** — backend, demo seed and frontend. 1156 tests / 57 suites, 59 live assertions, `tsc` clean both apps, `eslint` clean on every new file, `next build` clean, `migrate diff --from-migrations` no difference.

## Module Goal
Track utility meters and generate consumption-based billing.

## Existing Coverage in TU Properties (as described by project owner — verify before trusting)
- No utilities-specific tables or pages reported as existing.

### ⚠️ The owner's description is half wrong, and the half that's wrong matters

There *are* four utility-adjacent tables. All four are **empty (0 rows)**. They are not a partial implementation to build on; they are a half-built one, and the reason they are empty is the reason this module needed writing:

| Table | Rows | What it actually is |
|---|---|---|
| `UnitMeterNumber` | **0** | A meter registry with only `meterNo` and a `readingSetup` string. No type, no property, no readings, no rate. |
| `UnitServiceCharge` | 0 | A per-unit fixed charge. `serviceUtilityAmenity` is **free text**; `totalCost` is a **stored** derivation. |
| `PropertyStandingCharge` | 0 | A property-level standing charge. `chargeUtility`/`chargeMode` are **free text**. This is closest to a tariff table — and it has no validity window, so it cannot express "this rate applied until March". |
| `Unit.electricityAcno` / `waterAcno` / `electricityMeethno` / `waterMeethno` | 0 populated | Utility account + meter numbers as loose columns on the unit. Only four utility types hard-coded, and a fifth needs a migration. |

Also: `TRANSACTION_CLASSES` in `frontend/lib/constants.ts` has `ELECTRICITY` and `WATER` but **no `UTILITY` class**, and **0 invoices** use any utility class — so "consumption billing feeds Finance" has never run, in either direction.

A schema that cannot answer "who paid for this water" gets no data. That is what happened here.

## Scope / Sub-modules
- Meter Management: water, electricity, gas meters
- Readings: previous/current reading, consumption
- Billing: generate invoices from consumption

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domain(s): Facilities & Utilities (the `UtilityMeter` / `MeterType` / `MeterReading` target is ~line 1598).

### ⚠️ The target schema cannot meet its own acceptance criterion

The doc's sketch has no table for a **rate**, yet the acceptance criterion is "reading delta × rate". The rate has nowhere to live. It also has no `propertyId` (only `unitId`, so a bulk meter cannot be represented), no link to the invoice it produces, and it stores both `previousReading` and `currentReading` — i.e. it stores the delta, and lets it drift when one side is corrected.

## Tasks Checklist
- [x] Add `UtilityMeter`, `MeterReading` models per `01-DATABASE-SCHEMA.md` — and the `UtilityRate` the doc forgot and the `UtilityCharge` that makes billing idempotent
- [x] Write the migration — three of them, because two of the first one's constraints had bugs (see Bugs found)
- [x] Build meter registration per property (not per unit) — bulk/sub-meter scope, apportionment, rollover config
- [x] Build reading entry (manual for v1) — with rollover, estimation provenance, correction-not-duplication
- [x] Build consumption-based invoice generation (reading delta × rate), feeding Finance's `Invoice` model **through `InvoicesService`**
- [x] RBAC: `utilities-roles.ts` + four permission modules + `bill`/`void` actions, verified against the seeded roles in SQL
- [x] Demo seed producing every reachable state — 108 meters (100 bulk), 323 readings, 5 tariffs
- [x] Frontend: meter register, meter detail with the reading ledger, readings (list + entry), tariffs, billing

## Schema as built

Four models, six enums, all under a `UTILITIES (Module 14)` section at the end of `schema.prisma`. `UnitMeterNumber` was **renamed and reshaped into `UtilityMeter`** rather than left alongside a new `UtilityMeter` — two "meter" tables is how an estate ends up with two halves of the truth and no way to reconcile them (the same failure the master doc records for `Supplier`). Renaming was free: 0 rows. Only `seed.ts:30` and `demo-data.ts:3759` referenced it, both `deleteMany` cleanup ordering.

| Model | Why it exists |
|---|---|
| `UtilityMeter` | The device. `propertyId` required, `unitId` nullable, `type`, `scope`, `digits`/`digitWrapAt`, `readingSetup` preserved from the old table. |
| `MeterReading` | One register value at one moment. Consumption is **derived** from the pair. |
| `UtilityRate` | A tariff with a validity window, scoped meter → property → org. This is the table the doc forgot, and the reason the criterion is unmeetable without it. |
| `UtilityCharge` | One billable event, and the module's **audit spine and idempotency anchor**. |

Enums: `UtilityType` (WATER, ELECTRICITY, GAS, **SEWAGE**), `MeterScope` (SUBMETER, BULK), `ApportionmentMethod` (AREA, EQUAL, OCCUPANCY, MANUAL), `MeterStatus` (ACTIVE, RETIRED), `MeterReadingSource` (MANUAL, SMART, ESTIMATED), `UtilityChargeStatus` (PENDING, INVOICED, VOID).

### The two constraints that carry the correctness

- **`MeterReading @@unique([meterId, readingDate])`** — one reading per meter per day. Two readings on the same day is either a correction (which is an `update`, not a second row) or a double entry that would double-bill the period.
- **`UtilityCharge @@unique([meterId, unitId, billingPeriod])`** — **the load-bearing constraint of the whole module.** Billing the same meter to the same unit for the same period twice hands a resident two bills for one month's water. It is in the database rather than a `findFirst` because two concurrent requests both pass a `findFirst` (the Module 13 lesson, applied up front this time).
- **`UtilityCharge @@unique` is null-safe by accident, and that is a real hole.** Postgres treats NULLs as distinct, so `(meterId, unitId='NULL', period)` could be inserted twice — bulk meters have no `unitId`. The migration must add a partial unique index on `COALESCE(unitId,'')` instead. **Do not forget this.**

## Backend: NestJS Notes
Module: `backend/src/modules/utilities/`. Imports `AuditModule` and `FinanceModule`; **exports nothing**.

Pure file: `meter-rates.ts` (43 tests) — consumption delta incl. rollover, bulk apportionment (areal / equal / occupancy / manual, with period proration), tariff resolution, and integer-cent money.

### Bugs found while building this

Four, three of them mine, recorded because each is a shape worth recognising:

1. **A `CHECK` constraint that did not enforce what it said.** `utility_meters_rollover_consistent` read as "digits implies a wrap point of exactly 10 ** digits" — and accepted `digits = 5, digitWrapAt = NULL`. Three-valued logic: the predicate evaluates to `NULL`, and a CHECK rejects only on `FALSE`. The constraint whose entire job is to make rollover arithmetic safe was the one that could be quietly absent. All three nullable-column CHECKs rewritten as `CASE ... ELSE false`. Migration `20261006061000`.
2. **A rollover guard that rejected the valid case.** `if (to < wrapAt || from >= wrapAt) → refuse` refuses 99998 → 00003, which is the case the code exists for. Replaced with the modulus form `(wrapAt - from) + to`.
3. **An unreachable branch with a good error message.** "The register went round twice" — provably impossible, since `to <= from - 1` forces consumption `<= wrapAt - 1`. Deleted rather than kept.
4. **A period window in the wrong time frame** — see the decision on UTC below. Found by live verification, and it is master doc issue 97 arriving through the database.

### Decisions worth keeping

**The invoice seam is `InvoicesService.create`, and it is enough — but only because of what it will *not* set.** `Invoice` carries `@@unique([rentalAgreementId, billingPeriod])` because a lease gets one **rent** bill per month, and `recurring-billing.service.ts:45` relies on a second attempt failing that constraint and being reported as *skipped*. So a utility invoice that claimed that key would make the recurring rent run **skip the month, and the resident would never be billed rent at all.** Therefore: utility invoices leave `billingPeriod` **null** and are classified `transactionClass = 'UTILITY'` — the same convention `Invoice.saleTransactionId` sets for the Sales module. `UtilityCharge.billingPeriod` holds the period instead. *Never "fix" this by setting `billingPeriod`.* Verified live: the raised invoice has `billingPeriod === null`.

**A meter's period window is computed in UTC, not local time.** `DateTime` is `TIMESTAMP(3) WITHOUT TIME ZONE` and Prisma writes UTC, while a bare `"2026-08-01"` arrives as `2026-08-01T00:00:00Z`. Building the window at *local* midnight put its start at `2026-07-31T21:00:00Z` on this UTC+3 server, so a reading taken **on** the 1st sorted *after* the period it opens and the month could not be priced at all — the API told an operator to go and record an opening reading they had already recorded. `utcPeriodWindow` exists for queries; there is deliberately **no** local-time sibling, because a second function whose only job is to be wrong somewhere is speculative surface.

**Both period bounds are inclusive, which is not the half-open rule used everywhere else here.** A reading on the 1st *is* the month it opens: August is (1 Sep − 1 Aug). One reading closes one period and opens the next, but the deltas are adjacent rather than overlapping, so nothing is counted twice. The obvious "that double-counts" objection is wrong, and the fix was found by failing.

**A meter belongs to a *property*, and `unitId` is optional.** `propertyId` required is also what makes the module scopable at all: `Unit` has no `organizationId` (master doc issue 25), so a meter scoped only by unit needs a join on every read. Live-verified: attaching a meter to a unit on another property is refused.

**Bulk apportionment is chosen as data, and billing refuses until it is.** Verified live: a bulk meter with no method is refused with a sentence explaining that the module will not pick one, because each method produces a different bill. A sub-meter carrying a method is refused too, and so is a bulk meter carrying a `unitId`.

**Rates are data with a validity window, and are superseded, never edited.** Resolution is most-specific-wins (meter → property → org default), verified live: a meter with no tariff of its own billed correctly at the organization default. The resolved rate is **snapshotted onto the charge**, so a tariff change cannot retroactively reprice history.

**Consumption and amount are derived; the inputs are stored.** `UtilityCharge` names its two readings, its share and its rate, and every read recomputes from them. The share is the one input that genuinely cannot be re-derived — the units' areas and occupancy dates *at the time* are not preserved.

**Meter rollover is handled explicitly, and opt-in.** `digits`/`digitWrapAt` are null by default, so an ordinary meter cannot be affected by the logic. Verified live: 99998 → 00003 on a 5-digit meter prices as **5** units, not −99995, and the run reports that it rolled.

**A reading stores the index it showed, and only that.** The doc's `previousReading`/`currentReading` are what the API *returns*, not what the table stores.

**A reading that has already been billed cannot be edited.** Verified live: the refusal says the corrected figure and the resident's invoice would disagree. A charge stores its two reading ids precisely so this is checkable.

**Voiding requires a reason, and the reason is kept.** `VoidChargeDto` demands ten characters and three columns (`voidReason`, `voidedAt`, `voidedByUserId`) exist to hold them, enforced by a CHECK. Validation that demands a sentence and discards it is worse than not asking. Migration `20261006062000`.

**Voiding an invoiced charge is refused, and it names the Finance action instead.** Cancelling an invoice reverses its GL entry, and Finance owns that — a void here could not, so the two would drift.

### RBAC

Four permission modules, two new actions (`bill`, `void`), absent-means-denied. Verified against the seeded roles in SQL:

| | record reading | register meter | write tariff | bill | void |
|---|---|---|---|---|---|
| Technician | yes | **no** | no | **no** | no |
| Maintenance Manager | yes | yes | no | no | no |
| Accountant | **no** | no | **no** | yes | no |
| Leasing Officer | no | no | no | no | no |
| Sales Agent | — | — | — | — | — |
| Property Manager | yes | yes | yes | yes | yes |

The three separations, each verified by a live request: a technician may report that a meter reads 4,212 and may not decide what that costs; an accountant may bill and may write neither a tariff nor a reading; a leasing officer may read all of it and touch none. Procurement Officer and HR Manager carry read-only for stated reasons (the utility company bills the estate; a payslip carries a utilities deduction).

## Acceptance Criteria
- ✅ **A meter reading entry produces a correctly-calculated consumption invoice.** Verified live: readings of 4000 (1 Aug) and 4150 (1 Sep) on a tariff of 55.50 with 16% VAT produced **consumption 150 → subtotal 8,325.00 → VAT 1,332.00 → total 9,657.00**, on a real `Invoice` row created through `InvoicesService`, classified `UTILITY`, with `billingPeriod` null.

## Verified live
59 assertions, all passing, against a running API with real cookies:
- **The criterion**, end to end, including the arithmetic and the resulting Finance document.
- **Meter registration refusals**, each with a sentence rather than a code: bulk with no method; bulk carrying a `unitId`; sub-meter carrying a method; `digits=5` with wrap 500000 (names the correct 100000); duplicate meter number; bulk-meter MANUAL with no weights.
- **Tenant scoping**: a meter id belonging to Westhill returns **404** from Rohi — not 403, not an empty 200.
- **Exactly-once**: a second run for the same meter + unit + period is refused naming the existing charge, while a *different* meter on the same unit and period bills successfully.
- **Rollover**, live, as above.
- **Readings**: a duplicate reading on one day is refused and says to *correct* rather than add; one reading alone prices nothing and explains why; a billed reading cannot be edited.
- **Tariffs**: a second open rate for the same scope is refused; a meter with no rate of its own falls back to the organization default.
- **RBAC role by role**, as tabled above — 14 assertions across four roles.
- **Void**: a short reason is refused; a charge already on an invoice is refused and names the Finance action.
- **All three CSV exports** return CSV.

## Frontend: Next.js Notes
Seven routes under `(dashboard)/utilities/`: register, meter new, meter detail, readings, reading entry, tariffs, billing. Sidebar group with four screens whose role lists each mirror one in `utilities-roles.ts`.

The four screens that earn their shape:

- **The register's "Billed to" column.** The register answers two different questions — what meters exist, and *who does each one bill* — and a bulk meter bills nobody individually until its consumption is divided. `billsTo` is therefore a column, and it comes from the server: scope and apportionment are a fact about the row, not something a table should re-derive. `canBeBilled` likewise, so a form never lets somebody try and then explain a refusal the page could have shown.
- **The meter's reading ledger.** The column that makes it worth looking at is consumption, which is derived by pairing each reading with the one before it, so a corrected reading cannot leave a stale delta beside it. The oldest entry shows `baseline` rather than `0` — it establishes the starting point, it is not a period. A rolled-over register is flagged, because 99998 → 00003 is 5 units and without the flag it reads as a meter that ran backwards.
- **The registration form is driven by `scope`.** Choosing `BULK` *replaces* the unit field with the apportionment field, marks it required, and says why: there is no default, because area, occupancy and a negotiated split all produce different bills. And the rollover wrap point is **derived, not typed** — entering 5 digits fills in 100000 — because a hand-typed wrap point is exactly how it drifts from the digit count and the arithmetic breaks.
- **Billing has two buttons, not one.** "Price this period" creates a charge and stops; "Price and invoice" also raises the document. They fail independently, and a figure about to go to a resident should be reviewable first — which is also what makes a wrong bill correctable without a credit note. The result panel shows consumption, whether the register rolled, the invoices raised, and **`unbilled`** charges with their reason, because a vacant unit's water is measured whether or not anybody is there to be charged for it.

## Dependencies on Other Modules
- Depends on: **Property Management** (units), and the **Rental Agreement** — without a live lease there is nobody to bill, and `billAndInvoice` reports those charges as `unbilled` rather than dropping them silently
- Feeds: **Finance & Accounting** — through `InvoicesService.create`, never by writing `Invoice` rows directly (the same seam procurement's supplier bills and sales instalments use)

## Known issues / open items
1. **Bulk-meter null `unitId` needed a partial unique index** (see above) — shipped as `utility_charges_no_double_bill_bulk`, verified by the exactly-once probes.
2. **`UnitServiceCharge.totalCost` is a stored derivation** (`costPerArea` × area). Pre-existing debt — **noted, not refactored.** It is a fixed *service* charge, not a metered one, so it is arguably out of scope; `PropertyStandingCharge` is the nearest true relative and has a worse problem: **no validity window**, so it cannot express "this charge applied until March".
3. **`Unit.electricityAcno` / `waterAcno` / `electricityMeethno` / `waterMeethno` are now redundant** with `UtilityMeter.meterNumber`, and they cover only four utility types. 0-populated so removal is cheap, but it is not this module's job.
4. **Bulk-meter vacancy is unspecified.** `UtilityCharge.rentalAgreementId` is nullable and `billAndInvoice` reports such charges under `unbilled` with a sentence, but *where the cost goes* is undecided — the estate absorbs it, re-rates across occupied units, or suspends billing. Right now it is measured, priced and visibly unattached.
5. **`ESTIMATED` has no estimator.** `MeterReading.source` records that a figure was estimated but not who estimated it or how, so an estimate cannot yet be audited.
6. **Occupancy-based apportionment proration is coarse.** `apportion` takes an `occupiedDays` figure, but the service currently passes the month length and computes no per-unit occupancy — so `OCCUPANCY` behaves as `EQUAL` until lease start/end dates are walked. The pure function and the schema are ready; the data is not wired.
7. **No frontend and no demo seed yet**, so the module is reachable only by API. The login rate limiter (10 attempts / 5 min, in-memory) makes repeated live-verification runs need an API restart — worth knowing before writing the seed script's verification step.
8. **`billAndInvoice` recomputes each charge one at a time**, two queries per charge for the readings. Fine at estate scale; a property with a hundred bulk-fed units would want it batched.
9. **`UnitMeterNumber`'s `readingSetup` is preserved but unused** — carried over from the old table, with no logic reading it. Deliberate (it signalled intended functionality) but it is currently a string nobody interprets.