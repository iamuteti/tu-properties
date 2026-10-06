# Module 15: Documents & Legal

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history - everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ?? Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today - do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**COMPLETE** - backend, demo seed and frontend. See "What Is Actually Built" below.

## Module Goal
Track contracts and legal compliance documents with expiry/renewal visibility.

## What Is Actually Built

### Audit result first, because it changed the design

The "Existing Coverage" hint above was right about the Document Center and wrong to
build on. `Document` and `backend/src/modules/documents/` already exist and work
(108-line controller, 209-line service, `storage/{local,s3}-storage.ts` behind one
interface). They already version a re-upload (`version = max + 1`) and already attach
a file to any record through `(entityType, entityId)`.

So this module adds **one table** and **borrows** the rest. A second file store beside
the Document Center would be the same error this schema has already committed twice -
`landlordId`/`tenantId` standing in for a real owner relationship, and `Supplier`
invented alongside `Contact` - and the first symptom would be an organization whose
contracts and whose documents disagree about which file is the signed one.

The gap was `Contract` and nothing else.

### Files

| File | What it is |
|---|---|
| `backend/src/modules/legal/contract-expiry.ts` | Pure rules: derived status, notice deadlines, warning bands, renewal-chain walking, human sentences for a malformed contract. No DB, no Nest. |
| `backend/src/modules/legal/contract-expiry.spec.ts` | 54 tests. |
| `backend/src/modules/legal/legal-roles.ts` | Five permission tiers and the argument for each. |
| `backend/src/modules/legal/contracts.service.ts` | One table, one service. |
| `backend/src/modules/legal/contracts.service.ts` spec | 58 tests, weighted towards refusals. |
| `backend/src/modules/legal/contracts.controller.ts` | Seven routes. One controller, not four sharing a prefix. |
| `backend/src/modules/legal/routing.spec.ts` | 7 tests. Asserts `expiry-report` is declared before `:id`, **and** that it fails when it is not. |
| `backend/src/modules/legal/dto/contracts.dto.ts` | |
| `backend/src/modules/legal/legal.module.ts` | Imports only `AuditModule`. Exports nothing. |
| `backend/src/prisma/migrations/20261006100000_module15_contracts/` | Table, enum, 8 FKs, 4 CHECK constraints. |
| `backend/src/prisma/migrations/20261006120000_module15_contract_notification_type/` | `ALTER TYPE ... ADD VALUE 'CONTRACT_EXPIRING'`. |

### Routes

| Method | Path | Permission |
|---|---|---|
| GET | `/contracts/expiry-report` | `contracts.view` |
| GET | `/contracts` | `contracts.view` |
| GET | `/contracts/:id` | `contracts.view` |
| POST | `/contracts` | `contracts.create` |
| PATCH | `/contracts/:id` | `contracts.update` |
| POST | `/contracts/:id/renew` | `contracts.renew` |
| DELETE | `/contracts/:id` | `contracts.delete` |

No `PATCH .../status` anywhere. A contract's status is derived from the clock and is
never stored.

## The Seven Decisions That Shaped This

### 1. Four typed foreign keys, not the doc's polymorphic pair

The doc specified `relatedEntityType String` / `relatedEntityId String`. That pair is a
polymorphic reference with **no referential integrity at all**: it can name a row that
never existed or was deleted yesterday, nothing cascades, and every read has to
hand-resolve the type.

`Contract` instead has `rentalAgreementId`, `saleTransactionId`, `supplierId` and
`landlordId` - four real columns, four real cascades. More schema, in exchange for
indexing, cascades, and a shape the database can enforce.

`assertRelatedExists` closes the gap a CHECK cannot: it verifies the id belongs to
*this* organization, because the constraints can count the columns and match them
against `type` but cannot see tenancy.

### 2. `COMPLIANCE` was added to `ContractType`, and the shape rule permits zero FKs for it

The doc's own scope asks for compliance documents. A gas safety certificate, a fire
inspection, a lift maintenance licence - these are the most compliance-critical
instruments in the register and they have **no counterparty**, because the obligation
runs to the authority rather than to a tenant or a supplier.

So the constraint is *at most one*, not *exactly one*, and `COMPLIANCE` is the
exception. A schema that required a related entity could not represent them.

```
contracts_one_related_entity   -- <= 1 for COMPLIANCE, = 1 otherwise
contracts_entity_matches_type  -- LEASE→lease, SALE→sale, VENDOR→supplier,
                                 MANAGEMENT→landlord, COMPLIANCE→none
contracts_notice_days_sane     -- >= 0
contracts_term_is_ordered      -- expiresAt > startDate
```

`num_nonnulls()` is how "at most one" is written. A long OR-chain over nullable
columns would evaluate to NULL and silently pass - the same failure as Module 14's
`utility_meters_rollover_consistent`, which did exactly that.

All four were probed live: mismatched type/entity refused, two entities refused,
zero-entity COMPLIANCE accepted, negative notice refused, inverted term refused,
duplicate reference refused.

### 3. `noticeDays` exists because **the notice deadline is not the expiry date**

This is the rule the module doc does not contain and the reason the column is there at
all. A contract that expires in 45 days but needs 90 days' notice is *already* past
its notice deadline - it is already committed, and the expiry date will sail past
while the landlord believes they still have options.

An `expiresAt`-only view reports that contract as comfortably active for another six
weeks. `NOTICE_DUE` is what catches it, and `reminderDaysFor(noticeDays)` folds the
notice period into the warning bands so a 90-day-notice contract alerts at 90 days out
rather than first surfacing at the generic 30-day band - by which point serving notice
was already impossible.

### 4. `Lease` contracts inherit the lease's own dates instead of duplicating them

`RentalAgreement` already carries `startDate`, `endDate` and `noticePeriodDays`. This
module does **not** add a second copy of them. `effectiveTerm()` falls back to the
lease when the contract's own columns are empty, which stops the register disagreeing
with the lease module about when a tenancy ends.

A value set on the contract still wins, and that is deliberate rather than a loophole:
the register records what was *signed*, and an addendum may legitimately have moved
the term. Where the two disagree the contract wins, because the register is the
evidence and the lease row is the operational view.

### 5. `renewalOfId` points at the predecessor, so "am I superseded?" is not on the row

`renewalOfId` points at the **predecessor**. The contract carrying that column is the
*new* term; the superseded one is its parent.

This was a live bug during the build: `deriveContractStatus` originally read
`renewalOfId IS NOT NULL` as "superseded", which flagged the renewal and marked the
original as live - exactly backwards. `SUPERSEDED` is therefore **not** derivable from
the row and is passed in as `isSuperseded`, resolved by the service from the reverse
`renewals` relation. `buildRenewalChain` walks child→parent and terminates on a cycle,
because `renewalOfId` is typed in by hand from scanned paperwork.

### 6. Renewal creates a new row rather than editing the old one

The old contract's end date is evidence. Updating it in place would overwrite the date
somebody is relying on in a renewal argument. The new row inherits `type` and the
counterparty - it is the contract's identity, and a renewal naming a different landlord
would not be a renewal - and must end after the predecessor does.

The reference is derived as `<root>-R<n>`, skipping any suffix already taken, so a chain
reads `CON-0001 → -R2 → -R3` and never reuses its own predecessor's identifier.

### 7. Filters read the columns, never the derived status

`ContractQueryDto` filters on `type`, an `expiresFrom`/`expiresTo` window, `relatedId`
and `hasDocument` - **not** on `status`. A status is derived (rules 1-5), so filtering
on it would require either a stored column that can contradict `expiresAt` or a second
implementation of the same rules in SQL that drifts from the tested one. Filtering on
the columns the derivation reads cannot drift.

`GET /contracts/expiry-report` is where the derived statuses are *reported*, over a
bounded window (default 180 days, capped at 1095), ordered by urgency rather than by
date - because a contract past its notice deadline is committed to ending and can be 45
days out while one 14 days out is still freely renegotiable.

## Permission Matrix

One module, five tiers. Full argument in `legal-roles.ts`.

| Role | grant |
|---|---|
| Company Admin, Property Manager | view, create, update, delete, **renew** |
| Procurement Officer | view, create, update, **renew** (no delete) |
| Accountant | view, **renew** (no create - may not manufacture a lease) |
| Leasing Officer, Sales Agent, Technician | view |
| Maintenance Manager | view, create, update (**no renew**) |
| Landlord, Tenant, Staff Self-Service, HR Manager, Super Admin | *absent* |

Two absences are deliberate refusals, recorded in the seed so they do not read as
oversights:

- **Landlord and Tenant hold nothing.** Both are counterparties in this register and
  both will eventually need to read their own contract, but that is per-counterparty
  scoping (`only contracts whose landlordId is mine`) and these permissions are
  organisation-wide. Granting `view` today would hand a tenant every contract in the
  estate. That belongs with Module 19, where the self-service resolution machinery
  already exists - and no amount of later filtering fixes having already told a tenant
  they may read.
- **Staff Self-Service holds nothing.** `ContractType` has no employment value; an
  employee's own contract is payroll and employee data, which is why those carry `self`.

Verified in SQL against the seeded JSON, with six invariants including "`.renew`
without `.view`" and "no counterparty role appears anywhere in the matrix".

## Notifications

`NotificationTriggersService.remindExpiringContracts`, on the existing
`@Cron('0 15 6 * * *')` sweep.

Three things make it different from `remindExpiringLeases`:

1. **The audience is staff, not the resident** - resolved through `roleAssignments`,
   once per organization rather than once per contract.
2. **`CONTRACT_EXPIRING`, not `LEASE_EXPIRING`** - a separate enum value because the
   two are addressed to different people at the same moment.
3. **An auto-renewing contract is silent until the notice period is the issue.** It
   renews by itself; nagging trains people to ignore the report. What it needs is the
   notice deadline, because serving notice is how you *stop* it renewing.

`dedupeKey = contract-expiring:{id}:{band}:{date}:{recipient}`.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx jest` | **1305 tests / 60 suites**, all passing |
| `npx eslint src/modules/legal` | **0 errors** (45 warnings, all `no-unsafe-argument` from `jest.Mock.calls`) |
| `npx eslint src/modules/notifications` | no net-new errors; the 25 remaining are pre-existing in `notification-triggers.service.spec.ts` |
| `prisma migrate diff` | **No difference detected** |
| Live harness | **78/78 assertions** |

Live assertions cover: route shadowing, all five derived statuses reaching the client,
urgency ordering, lease-date inheritance, cross-tenant **404 not 403**, the renewal
chain, attachments, every shape refusal arriving as a 400 with a sentence, duplicate
reference as **409 not 500**, a tenant getting 403 on the register, and a PATCH
carrying `status`/`type`/`renewalOfId` changing nothing.

Two real defects were found *by* that harness and fixed:

- **Duplicate reference returned 500.** Now pre-checked with `ConflictException` and a
  sentence, matching `utilities.service.ts`'s meter-number convention rather than
  adding a global P2002 filter.
- **`Tenant.firstName` does not exist** (it is `surname`/`otherNames`), which 500'd
  every read. The unit tests could not catch it because the *spec's own mock*
  invented the field - a useful reminder that a hand-written mock teaches you its own
  fiction unless its select is checked against the real schema.

## Demo Data

`generateContractsData` - 24 contracts: 7 lease, 5 vendor, 4 management, 2 sale,
5 compliance, 1 renewal. Coverage is the point, not volume: `ACTIVE`, `EXPIRED`,
`NOTICE_DUE`, `OPEN_ENDED` and `SUPERSEDED` all have rows, so every derived status is
visible without editing data.

- The `NOTICE_DUE` row is arithmetic, not decoration: `now + 40 days` with
  `noticeDays: 90`.
- Three lease contracts leave their own dates **empty on purpose**, to prove the
  inheritance fallback works; one is filled with a value that *disagrees* with the
  lease, to show the contract winning.
- Scans are written **to disk** through the Document Center's key format, so the
  attachment genuinely downloads. A `Document` row with no bytes behind it is a demo
  that 500s and hides whether the key convention still matches.

## Tasks Checklist
- [x] Add `Contract` model - four typed FKs, not the polymorphic pair
- [x] Enforce the shape in the database (4 CHECK constraints, probed live)
- [x] Pure logic in `contract-expiry.ts` with tests
- [x] RBAC: 5 tiers, `renew` action, verified in SQL
- [x] DTOs, service, controller, module registration
- [x] Contract list with expiry sorting and a date-window filter
- [x] Expiry report ordered by urgency
- [x] Renewal as a named action creating a new row
- [x] Wire expiry reminders to Notifications
- [x] Demo seed covering every derived status
- [x] Service spec + routing spec
- [x] Live verification (78 assertions)
- [x] Frontend: contracts list with derived status and the notice deadline
- [x] Frontend: expiry report screen
- [x] Frontend: contract detail with the renewal chain and attachments
- [x] Frontend: file-a-contract form, with the shape rule visible before submit

## Frontend Notes

Four routes under `frontend/app/(dashboard)/contracts/`, plus `_components.tsx` for the
shared status pill and expiry cell.

Built as described below. `StatusBadge` could **not** be reused for the status pill
because it derives its label from the raw string, which renders `NOTICE_DUE` as
"Notice_due" - and on this screen the word *is* the message, since the statuses exist so
that a user acts differently on each one. `_components.tsx` carries the wording, the
hint and the colour; the colour keys were added to the shared `STATUS_STYLES` map so a
contract and a purchase order that both mean "expired" look the same.

The three screens:

- `page.tsx` - the register. Filters map to the columns (`type`, date window,
  `relatedId`, `hasDocument`); the status is a **display** value, never a filter, per
  decision 7. Sort by `expiresAt` with open-ended last, matching the API.
- `expiry-report/page.tsx` - the pattern from `utilities/billing/page.tsx`: a result
  panel driven by a derived-state endpoint rather than a table with a status column.
- `[id]/page.tsx` - detail. The renewal chain is the reason to visit: it answers "what
  happened to this one?", which an end date cannot. Attachments list with the
  authoritative scan distinguished from addenda.

Add a Contracts group to `frontend/components/layout/sidebar.tsx` mirroring the role
grants, before `/users`.

## Dependencies on Other Modules
- Depends on: Core Platform (Document Center), Leases (`RentalAgreement.endDate` and
  `.noticePeriodDays` are read, not copied), Sales, Procurement, Landlords
- Feeds: Notifications
### Frontend verification

`next build` compiles and all four routes appear in the build output:

```
├ ○ /contracts
├ ƒ /contracts/[id]
├ ○ /contracts/expiry-report
├ ○ /contracts/new
```

`tsc --noEmit` is clean, and 11 live assertions against the running Next server confirm
each route is served without a server error and is distinguishable from a bogus path.

**What is not verified:** the pages rendering *populated* content in a browser. The
dashboard guard is a client-side `router.push('/auth/login')` inside `useAuth()`, not
Next middleware, so a server fetch always receives 200 with the app shell and never
observes the redirect - which means a fetch-based harness cannot prove either the
redirect or the rendered table. That needs a headless browser. The *data path* the
pages call is covered by the backend's 78 live assertions, so what is untested is the
render of data already known to be correct, not the data itself.