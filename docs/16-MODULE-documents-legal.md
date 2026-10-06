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
## The `demo-data.ts` diff, audited

The Module 15 commit shows `demo-data.ts` as **743 insertions / 271 deletions** in a
shared seed file, which is unreviewable. The claim made at the time was "roughly 270
lines are prettier normalising pre-existing formatting". That claim is now checked
rather than asserted.

Method: take the file at `619132c` and at `30f3b2d`, strip **all** whitespace, and
compare the two token streams line by line.

- **0 pre-existing lines lost their content.** Every line before is present after.
- **~258 insertions and ~258 deletions were whitespace or line-wrapping.**
- The 13 residual differences git still reported under `diff -w` are two things:
  - **12 are trailing commas.** Prettier's `trailingComma: "all"` adds a comma to the
    last property of an object once the object is broken across lines, so a wrapped
    statement's squashed text differs from the unwrapped one by exactly one `,`.
  - **1 is a type expression prettier re-parenthesised**:
    `typeof properties[number]` became `(typeof properties)[number]`. Verified
    equivalent rather than assumed: both forms declared over the same array are
    mutually assignable with no compile error, so the type is identical.

So the diff is the ~450 added lines of `generateContractsData` plus its call site, and
nothing else. `tsc` is clean and all 1310 tests pass against the reformatted file,
which is the second half of the argument.

**The lesson for the next module:** run `eslint --fix` on a shared file as its own
commit, before the feature that touches it, so a review never has to separate the two.

## Frontend verification

Two harnesses, because the first one could not answer the question that mattered.

**Fetch-based (11 assertions).** Confirms each route is served without a server error
and is distinguishable from a bogus path. Its limit is structural: the dashboard guard
is a client-side `router.push('/auth/login')` inside `useAuth()`, not Next middleware,
so a server fetch always receives 200 with the app shell and never observes the
redirect or the rendered table. Its first version asserted "is protected" and passed
for the wrong reason; it now asserts only what it can.

**Browser-based (32 assertions, all passing).** Drives real Chrome over the DevTools
Protocol - no npm install, since Chrome is installed and Node 24 ships a global
`WebSocket`. It asserts what the fetch harness structurally cannot:

- a **contract reference is in the DOM**, so the API call succeeded, the state landed
  and the table rendered it;
- the status pill reads **"Notice period passed", not `Notice_due`** - proving the badge
  that exists precisely because `StatusBadge` renders the raw string works;
- the counterparty label the **API actually returned** is on the page, and a null
  counterparty renders as "held centrally" rather than a blank cell;
- the **expired-session redirect really happens** in a real client;
- switching the type dropdown to `COMPLIANCE` makes the counterparty field disappear,
  which is the one genuinely surprising rule in the form;
- readiness is **polled, not slept on** - Next dev compiles a route on first request,
  and a fixed delay is a race that passes warm and fails cold.

### What the browser harness found

Driving a real browser turned up two defects that a build and a fetch could not.

**1. An infinite `/auth/logout` loop** (`frontend/lib/api.ts`, `context/auth-context.tsx`).
An expired session makes any call 401; the interceptor dispatches `unauthorized`;
`logout()` posts `/auth/logout`; *that* call 401s too, because the session is already
gone; the interceptor dispatches again - and it repeats until the page navigates away.

Measured by intercepting every API call through CDP's `Fetch` domain and fulfilling it
with a real 401:

| | API calls | `/auth/logout` | rate |
|---|---|---|---|
| before | 1,459 | **1,458** | 123/s, sustained across both windows |
| after | 2 | **1** | 0/s for the following 8s |

121 requests a second to the backend from one unauthenticated page load, on the server
that also serves every resident and every rent run.

Two fixes. The interceptor no longer reacts to a 401 from the logout call, which carries
no new information. And `logout` became **idempotent** on a ref - several 401s arrive in
the same tick before any re-render, so a state guard would not have updated in time -
because a page firing five requests on mount produced five logout posts and five
`router.push('/auth/login')`, a redirect race for a page only trying to say "your session
expired". `login` clears the guard, or signing back in during the same page's life would
leave it latched and silently disable every later logout.

Pre-existing and shared, not Module 15's, but it was making this module's verification
unstable.

**2. Every `<Label for=...>` in the app pointed at nothing** (`components/ui/select.tsx`).
`Select` is a div+button and spread its `id` onto the wrapping div, so `for="type"` bound
to a non-labelable element and the association silently did nothing - a screen reader
announces an unlabelled button. The id now sits on the button (which *is* labelable),
with `aria-labelledby`, `aria-haspopup`, `aria-expanded`, `aria-required` and
`aria-invalid`. Module 15's pages followed the existing convention, which is how the
defect reached them.

**A note on the measurements.** The first attempt counted requests through a proxy
redirected by `--host-resolver-rules`, which remaps hostnames and *not* ports - so every
API call reached the real backend and the counter received nothing. It reported 4/4
passing on the strength of static-asset traffic, which is the same false pass as a SQL
probe against an empty table. Both harnesses here were then run against a control with
the fix reverted (1,458 logout calls; 5 calls from 5 events) to confirm they can fail
before being trusted for the numbers they report.

`next build` compiles and all four routes appear in the output:

```
/contracts
/contracts/[id]
/contracts/expiry-report
/contracts/new
```