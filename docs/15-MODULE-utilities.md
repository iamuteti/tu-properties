# Module 14: Utilities

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status
**In progress — schema designed and written, `prisma validate` passes. No migration yet, no code.**

Last worked on: 2026-10-06.

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
- [~] Add `UtilityMeter`, `MeterReading` models per `01-DATABASE-SCHEMA.md` — **models written and `prisma validate` passes; migration not yet written**
- [ ] Write the migration (incl. the two correctness constraints — see below)
- [ ] Build meter registration per property (not per unit — see decisions)
- [ ] Build reading entry (manual for v1; smart-meter integration is a later phase) — with rollover and estimation
- [ ] Build consumption-based invoice generation (reading delta × rate), feeding Finance's `Invoice` model
- [ ] RBAC: `utilities-roles.ts` + permission modules + role grants, verified in SQL
- [ ] Demo seed producing every reachable state
- [ ] Frontend: meters, readings, rates, billing runs

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
Module: `backend/src/modules/utilities/`. Will import `AuditModule`, `NotificationsModule` and `FinanceModule` (for `InvoicesService`); **exports nothing**.

Pure file planned: `meter-rates.ts` — consumption delta incl. rollover, bulk apportionment (areal / equal / occupancy / manual, with period proration), billing-period boundaries, and integer-cent rounding.

### Decisions worth keeping

**The invoice seam is `InvoicesService.create`, and it is enough — but only because of what it will *not* set.** `Invoice` carries `@@unique([rentalAgreementId, billingPeriod])` because a lease gets one **rent** bill per month, and `recurring-billing.service.ts:45` relies on a second attempt failing that constraint and being reported as *skipped*. So a utility invoice that claimed that key would make the recurring rent run **skip the month, and the resident would never be billed rent at all.** Therefore: utility invoices leave `billingPeriod` **null** and are classified `transactionClass = 'UTILITY'` — the same convention `Invoice.saleTransactionId` sets for the Sales module. `UtilityCharge.billingPeriod` holds the period instead. *Never "fix" this by setting `billingPeriod`.*

**One charge, one invoice; many charges, one lease.** The FK points `UtilityCharge.invoiceId → Invoice`, **not** the reverse, because a monthly bill collects several charges (water, electricity, a standing charge). Modelling it as a one-to-one on `Invoice` the way `saleTransactionId` does would be wrong here. There is **no merge-into-existing-invoice method** on `InvoicesService` and none is needed, for the reason above.

**A meter belongs to a *property*, and `unitId` is optional.** A meter is a device bolted to a building. `propertyId` required is also what makes the module scopable at all: `Unit` has no `organizationId` (master doc issue 25), so a meter scoped only by unit needs a join through `unit.property.organizationId` on every single read.

**`MeterScope` exists because "has no `unitId`" is ambiguous.** It means either *bulk* — the riser meter the estate re-sells — or *not yet allocated to a unit*. Different states, different consequences, and a nullable FK cannot tell them apart.

**Bulk apportionment is chosen as data, and billing refuses until it is.** Splitting water twenty ways is a **decision**, not a computation: area, headcount, occupancy days and a negotiated fixed split are all defensible and all produce different bills. So `apportionmentMethod` is stored (DB-enforced non-null when `scope = BULK`) and the module refuses to bill a bulk meter with no method rather than defaulting to area and quietly overcharging somebody every month. This is the same refusal discipline as procurement declining to pick between competing bids.

**Rates are data with a validity window, and are superseded, never edited.** Identical reasoning to `TaxRule` (Module 7) and `PayrollRule` (Module 12). Resolution is most-specific-wins (meter → property → org default) and the result is **snapshotted onto the charge**, so a tariff change cannot retroactively reprice history. `ratePerUnit` is `Decimal(12,4)`: a gas tariff per MMBtu is quoted to more than two decimals, and truncating the *rate* to cents quietly moves money.

**Consumption and amount are derived; the inputs are stored.** `UtilityCharge` snapshots the rate and the allocation share, then derives consumption from its two readings and amount from consumption × rate. The allocation share is the one input that genuinely cannot be re-derived — the units' areas and occupancy dates *at the time* are not preserved, so storing the share is the difference between an audit trail and an assertion.

**Meter rollover is handled explicitly, and opt-in.** A 5-digit electromechanical register that reads 99998 → 00003 consumed 5 units, not −99995. `digits`/`digitWrapAt` carry it, and **null disables the logic entirely** so the ordinary meters that count up are both cheaper and impossible to mis-handle. Naive delta arithmetic on a rolled-over meter produces a catastrophic negative bill, which is why this is a named decision rather than an edge case.

**A reading stores the index it showed, and only that.** The doc's `previousReading`/`currentReading` columns are what the API *returns* (a presentation of the pair) but not what the table stores — storing a derived delta means a corrected reading silently disagrees with it.

**Estimates are marked, not hidden.** `MeterReadingSource.ESTIMATED` exists because a real case has no honest reading (access denied, sealed, tenant away) and estimating is the standard industry response. Marking it is what lets a later audit tell an estimate from a real reading.

## Acceptance Criteria
- ⏳ **A meter reading entry produces a correctly-calculated consumption invoice.** Not yet verified. Requires: two readings bounding a period (one reading alone computes nothing), a resolvable rate, an open rental agreement, then `InvoicesService.create` with a line of `qty = consumption`, `unitPrice = ratePerUnit`, `amount` derived in integer cents.

## Dependencies on Other Modules
- Depends on: **Property Management** (units) — and the tenant's **Rental Agreement**, without which there is nobody to bill
- Feeds: **Finance & Accounting** — through `InvoicesService.create`, never by writing `Invoice` rows directly (the same seam procurement's supplier bills and sales instalments use)

## Known issues / open items
1. **Bulk-meter null `unitId` needs a partial unique index** (see above). The Prisma-level `@@unique` does not cover it.
2. **`UnitServiceCharge.totalCost` is a stored derivation** (`costPerArea` × area). Pre-existing debt — **note it, do not refactor it unasked.** It is a fixed *service* charge, not a metered one, so it is arguably out of this module's scope; the standing-charge table `PropertyStandingCharge` is the nearest true relative and also has no validity window.
3. **`Unit.electricityAcno` / `waterAcno` / `electricityMeethno` / `waterMeethno` are now redundant** with `UtilityMeter.meterNumber`, and they only cover four utility types. Candidate for removal in a later module once nothing reads them — they are 0-populated, so it is cheap, but do not remove them as part of this module.
4. **Bulk-meter vacancy is unspecified.** A bulk meter feeds units that are vacant; nobody is there to pay for the water. `UtilityCharge.rentalAgreementId` is nullable for this, but *where the cost goes* when it lands on an empty unit is undecided.
5. **`ESTIMATED` has no estimator.** The source is recorded but not who estimated it or how, so an estimate cannot yet be audited. `User.assignedToMe`-style provenance is not modelled for utilities.
6. **No `TRANSACTION_CLASSES.UTILITY` on the frontend** yet; and no utility invoice is reachable from a lease's invoice list unless the utility charge link is surfaced.
7. **Occupancy-based apportionment needs occupancy-day data** that this schema does not have — it would mean reading lease start/end dates per unit and prorating by occupied days in the period. Not designed yet.