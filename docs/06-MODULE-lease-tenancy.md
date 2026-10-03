# Module 5: Lease & Tenancy Management

> **Self-contained doc.** If you are resuming after a session timeout or context limit, you do not need prior chat history — everything needed to continue is here and in `00-MASTER-ARCHITECTURE.md` / `01-DATABASE-SCHEMA.md`.

## ⚠️ Before You Start (do this every session, not just the first time)

1. Read `00-MASTER-ARCHITECTURE.md` in full (stack, multi-tenancy rules, conventions, known issues).
2. Read `01-DATABASE-SCHEMA.md` for this module's target tables.
3. **Inspect the live repo** (`backend/src/`, `frontend/app/(dashboard)/`, `backend/src/prisma/schema.prisma`) to see what actually exists today — do not trust "Existing Coverage" below blindly, it is a starting hint from the project owner's description, not a verified audit.
4. Update the Tasks Checklist below as you go (check items off in this file) so a future session can resume without rediscovery.

## Status Hint
**Complete, with two items deliberately deferred to other modules.** The lease lifecycle (activate / renew /
extend / terminate / expire) is a validated state machine with unit occupancy side-effects, move-outs settle an
auditable deposit refund, inspections record the condition a tenant received a unit in, and the **tenant
self-service portal** is live — including the resident request queue (`tenant_requests`) whose approval
delegates to the leasing and move-out services. Its auth work landed in Module 1 (`02-MODULE-core-platform.md`).

**Deferred, and where to pick them up:**
- **Request and lease-expiry notifications** → need Module 18 (`18-MODULE-notifications.md`). The exact call
  sites and triggers are written up under *Known Gaps → Blocked on other modules*.
- **`PAYMENT_PLAN` execution** → needs a payment-plan entity from Finance (Modules 8/9); approving one today
  records the decision honestly as `RECORDED_ONLY` rather than pretending to act.

## Module Goal
Manage the full tenancy lifecycle: lease creation, rent billing, renewals, tenant communication, move-ins/move-outs, inspections, and the tenant portal.

## Existing Coverage in TU Properties (verified 2026-10-03)
- `Tenant`, `TenantEmergencyContact`, `RentalAgreement`, `MoveOutRequest` existed, and `/leases`,
  `/rental-agreements`, `/tenants`, `/moving-out` listed them.
- **No lifecycle.** `status` could be set to anything by a plain `PATCH`; no activate/renew/terminate flow and no
  occupancy side-effects.
- **The refund was a typed-in number** (`depositRefundAmount`), so it was not auditable.
- **No inspections, no templates, no occupancy history.**
- **Two overlapping lease lists**: an orphan `/leases` page (nothing linked to it) whose row click did nothing,
  and `/rental-agreements` with a dead "…" button. Both are now one list with real detail pages.
- `Leasing Officer` existed as a seeded *role name* but had no `UserRole` value, so it could grant permissions
  and never be held.

## Scope / Sub-modules
- Lease Management: create/activate lease, terms, deposits, escalation
- Renewals / extensions / early termination
- Tenant Management: profile, documents, communication history
- Move-In / Move-Out workflow including inspections and deposit settlement
- Lease expiry reminders (stubbed until Notifications exists)
- Tenant Portal (self-service) — built; see the portal section below

## Relevant Database Tables
See `01-DATABASE-SCHEMA.md`, domains: Leasing + Move-Outs — now `rental_agreements` (renewal chain),
`move_out_deductions`, `inspection_reports`, `inspection_items`, `lease_templates`, plus `tenants.contactId`.

## Tasks Checklist
- [x] Audit existing Lease/Tenant/MoveOut models and endpoints against this spec and the UX standards doc
- [x] Add missing fields: renewal/termination audit trail, lease→tenant history, tenant documents
- [x] Implement lease status transitions (activate → active → expired/terminated) as explicit server-side actions with validation and audit fields
- [x] Build lease renewal/extension flow
- [x] Implement early-termination flow (with notice period handling)
- [x] Implement move-in/move-out workflow: checklist, inspections, deposit deduction, refund, unit status update
- [x] Add lease expiry reminders (stub as a scheduled query until Notifications exists)
- [x] Add lease templates and evaluate e-signature integration (stub: templates only, see Known Gaps)
- [x] Build tenant portal (read-only invoice/receipt/lease view) — done: `User.portalTenantId` is a tenant-scoped login (the auth work is in Module 1, the screens here), `GET /portal/{me,summary,lease,invoices,receipts,documents}` plus a guarded `GET /portal/documents/:id/download` are all scoped by the session's tenant, and `/portal` is a resident-only shell with no staff navigation. Demo login: `tenant@rohi.co.ke`. The portal is no longer read-only: `/portal/requests` submits to the staff queue at `/tenant-requests` (see *Resident requests* below)
- [x] Build occupancy history tracking as a queryable view (previous tenants, vacancy duration)
- [x] Build tenant communication history view

## What Was Built

### Schema (three migrations, all applied, `migrate status` clean)
| Migration | Change |
| --- | --- |
| `20261003190000_module5_leasing` | `RentalAgreement.renewedToId`/`renewedFromId` (self-relation, unique) so a renewal is a linked chain; `activatedAt`, `terminatedAt`, `terminatedReason`, `expiredAt`. New tables `move_out_deductions`, `inspection_reports`, `inspection_items`, `lease_templates` with the `DeductionCategory`, `InspectionType`, `InspectionStatus`, `ConditionRating` enums. `MoveOutRequest.deductions/refundedAt/refundedById`. |
| `20261003200000_add_leasing_officer_role` | `UserRole += LEASING_OFFICER`. The role existed in the seed but had no enum value, so no user could ever hold it. |
| `20261003210000_add_moveout_completed_status` | `MoveOutStatus += COMPLETED` — paying out a deposit refund is a real end state, not just "approved". |

### Backend (`backend/src/modules/leases/`, `moveouts/`, `inspections/`)
- **`lease-lifecycle.ts`** — pure, unit-tested rules: `DRAFT → ACTIVE → (RENEWED) / EXPIRED / TERMINATED`.
  Activate needs a started lease and a free unit; renew opens 60 days before the end date (and refuses an
  open-ended lease — that is an extension); terminate is always allowed (a tenant leaving owing money is
  ordinary, and the arrears are reported instead of hidden); expire needs the end date to have passed.
  `status` is not in the update DTO — it only moves through the action endpoints.
- **`rental-agreements.service.ts`** — CRUD with tenant scoping, one live lease per unit, and the actions:
  - `activate` → ACTIVE + `activatedAt`, syncs the unit to OCCUPIED
  - `renew` → creates the **successor agreement** (new rent/deposit/term allowed), links both sides of the chain, closes the old one as RENEWED, leaves the unit occupied
  - `extend` → moves the end date later in place
  - `terminate` → records the reason, deactivates a tenant with no other active lease, and vacates the unit **unless a successor took over**
  - `expire` / `reactivate` for end-of-term and "the tenant never left"
  - Every action calls `UnitsService.syncOccupancyStatus`, which is the acceptance criterion for this module.
  - `GET /leases/expiring?days=` — the reminder stub, returning the lease plus the contact details a reminder
    needs (delivery is Module 18).
  - `GET /leases/:id/ledger` and `GET /leases/units/:unitId/occupancy-history` (tenancies + the vacant gaps
    between them, derived from the agreements so it cannot drift).
  - Money is measured from the recorded payments, because finance never reconciles
    `Invoice.balanceAmount` (master doc issue 41).
- **Move-outs** — the tenant comes from the lease (a move-out cannot be raised against someone else's tenancy),
  `approve` terminates the lease and vacates the unit unless a successor exists, `reject`, and the deposit
  settlement: itemised `POST /move-outs/:id/deductions`, a derived `GET /move-outs/:id/deposit`, and
  `POST /move-outs/:id/refund` which needs a payment reference and locks further deductions.
- **`lease-deposit.ts`** — pure arithmetic: `deposit − deductions − unpaid rent`, floored at zero with the
  excess carried forward as a debt, plus deduction validation. Unit-tested.
- **Inspections** — move-in / periodic / move-out reports with a checklist, completion (an empty report is
  refused), and a move-out-vs-move-in comparison that returns only the items that got worse with their cost.
- **Lease templates** — reusable default terms; a template prefills the create form and never becomes the lease,
  so editing one cannot rewrite a signed agreement. Deleting deactivates it.
- **DTOs everywhere** with `class-validator`; the leases endpoints previously took raw `Prisma` input like the
  sales one did.
- **RBAC** — a new `leases` permission module; Leasing Officer and Property Manager get full lease/move-out
  rights, Sales Agents nothing here.
- **Incidental bug fixed**: `POST /inspections` silently dropped the whole body because the controller
  type-imported its DTO, which erases the class from `design:paramtypes` and makes Nest skip validation. The
  same trap will bite any future `import type` on a `@Body()` parameter.

### Frontend
- `/rental-agreements` — the single lease list: status/type filters, search, sort, pagination, CSV export,
  row actions, and an **expiry banner** listing leases ending within 60 days with links straight to them.
- `/rental-agreements/[id]` — money summary (rent, outstanding, arrears, days left), advisory notices, the
  lifecycle action buttons, the renewal chain, the invoice ledger, inspections, and a move-out prompt.
- `/rental-agreements/[id]/edit` — the commercial terms (status is deliberately not editable here).
- `/moving-out/[id]` — the deposit settlement screen: derived refund, the deduction list, an add/remove form,
  and a separate "refund" action that demands a reference. The list page now links into it.
- `/tenants/[id]` — tenant profile with the current tenancy and a link to the shared contact record.
- `/units/[id]` — an **occupancy history** panel: every tenancy in order with the vacant gaps between them.
- The orphan `/leases` route was **deleted** (nothing linked to it; it was a second list for the same data with
  a dead row click).
- `components/leases/` — `agreement-status-badge`, `lease-lifecycle-actions` (named next-step buttons driven by
  what the API says is legal), plus the hooks/types/constants/API entries.

### Tenant portal (the module's last open item)
- **Auth (Module 1).** `User.portalTenantId` links a login to exactly one tenant record. It rides in the session,
  is re-read from the user row on every request (so revoking access takes effect immediately), and
  `TenantPortalGuard` refuses any session without it — staff get 403 rather than a portal view of a tenant they
  choose. Creating a user with `portalTenantId` forces the role to `USER`.
- **API (`backend/src/modules/portal/`).** `GET /portal/me|summary|lease|invoices|receipts|documents` and
  `GET /portal/documents/:id/download`, all scoped by `getPortalTenantId(request)` — the session tenant, never a
  parameter. Document downloads verify ownership before touching storage and stream through the Document
  Center's driver.
- **Frontend (`frontend/app/(portal)/portal/`).** A resident-only shell (no staff sidebar) with an overview
  (rent, outstanding, arrears, days left, next due), invoices, receipts and documents. Logging in as a resident
  lands on `/portal`; the dashboard layout redirects residents away and the portal layout redirects staff back.

### Resident requests (portal -> staff queue)

A request never changes a tenancy by itself: the resident asks, a staff member decides, and **approval
delegates to the same services staff would have called by hand** - so a resident-approved renewal goes through
the renewal-window gate, creates the successor agreement and syncs unit occupancy exactly as a staff-initiated
one does.

- `TenantRequest` (`tenant_requests`) with `TenantRequestType { RENEWAL, MOVE_OUT, PAYMENT_PLAN, MAINTENANT,
  LEASE_AMENDMENT }`, `TenantRequestStatus { PENDING, APPROVED, REJECTED, WITHDRAWN }`, a snapshotted `payload`,
  `preferredDate`, `earlyNotice`, the decider (`decidedById`/`decidedAt`/`decisionNote`) and a `result` recording
  what the approval actually did. Migration `20261003230000_add_tenant_requests`.
- Resident: `POST|GET /portal/requests`, `POST /portal/requests/:id/withdraw`. Staff: `GET /tenant-requests`,
  `GET /tenant-requests/:id`, `POST /tenant-requests/:id/decide`, behind a new `tenant_requests` permission
  module granted to Property Manager, Leasing Officer and Company Admin.
- Queue rules: one open request per (lease, type); a move-out inside the notice period is **flagged
  `earlyNotice`, not refused**; a rejection requires a note because that note is what the resident reads; a
  delegated refusal (renewal outside its window, a lease already terminated) propagates unchanged and leaves the
  request PENDING. `PAYMENT_PLAN`/`MAINTENANT`/`LEASE_AMENDMENT` record the decision as `RECORDED_ONLY` until
  their owning modules can act on it.
- **Frontend** - `/portal/requests` (request desk + history with the decision note shown verbatim) and
  `/tenant-requests` (staff queue with notice badges, approve/reject, and a deep link into the lease), wired
  into the sidebar under Tenants & Leases.

## Verification Performed
- `npx tsc --noEmit` clean (backend and frontend); `next build` succeeds; `npx jest` — **319/319** across 23
  suites (was 291), including `lease-lifecycle.spec.ts` (the full action matrix), `lease-deposit.spec.ts`
  (the refund arithmetic incl. the carried-forward case), `rental-agreements.service.spec.ts` (renewal chain,
  termination side-effects, occupancy history, delete guards) and `portal.service.spec.ts` (session scoping,
  staff refusal, client-supplied tenantId ignored).
- **Live lifecycle**: draft → activate (unit → OCCUPIED) → renew (new successor, chain linked, unit RESERVED
  because the new term starts in the future) → extend → move-out → two itemised deductions → derived refund
  90,000 − 20,000 = 70,000 → refund with a reference → COMPLETED, with a second refund and further deductions
  refused. Duplicate leases, renew-before-activation, activate-while-moving-out and an incomplete inspection
  were each refused with the reason shown.
- Inspections: a move-in and a move-out on the same unit produce a comparison listing exactly the item that got
  worse (FAIR → DAMAGED, cost 12,000).
- Cross-tenant: lease read and terminate from the other organization return 404.
- **Portal (live)**: `tenant@rohi.co.ke` sees only their own household — 1 lease, 8 invoices, 7 receipts,
  arrears and days remaining computed from the recorded payments; the other organization's resident sees a
  different tenant; a staff session gets 403 "The tenant portal is for tenant accounts only"; an
  unauthenticated call gets 401; a `?tenantId=` the client invents is ignored.
- All eight leasing frontend routes and the four `/portal` routes return 200 in dev, and the removed `/leases`
  returns 404.

## Known Gaps / Follow-ups (not blocking)
- **The portal's write path is a request queue, not direct access.** Residents *ask*; staff decide. A renewal a
  resident wanted still needs someone to press approve, even when it is obviously due — automating that (auto-renew
  inside the window with notice) is a policy change, not a code one.
- **Portal logins are staff-free by construction**: creating a user with `portalTenantId` forces the role to
  `USER`, so a resident login cannot be handed a staff role by accident.
- **E-signature is not integrated.** Templates exist; signing is not started.
- **Lease creation on the frontend still uses the old form** at `/rental-agreements/new`, which was not part of
  this pass (the shared-form refactor pattern from Module 2 applies). It still works against the new DTO.
- **Inspection photos** attach through the Document Center (`entityType = 'InspectionReport'`) but no upload
  panel is wired into the inspection screen yet.
- **`RentalAgreement` has no `notes` field** — renewal and termination reasons live in `terminatedReason`.
  Worth adding a general notes column if terms get annotated later.
- **`UserRole.LEASING_OFFICER` has no user-facing role picker yet**: `RoleAssignment` stores role *names*, and
  nothing maps those names onto `UserRole` values, so the seeded role still only grants permissions rather than
  becoming a selectable role (master doc issue 51).
- **Leases are not blocked from overlapping on a unit across organizations** — correct, but note the
  double-letting check is per organization.

### Blocked on other modules — finish these when the dependency lands

Two items are deliberately **not** finished here because they belong to a module that has not been built. They
are recorded in full so the work can be picked up cold when that module lands, without re-investigating.

#### 1. Request + lease notifications — blocked on Module 18 (`18-MODULE-notifications.md`)

**Today:** a decision is recorded on the request (`decidedById`, `decidedAt`, `decisionNote`) and written to the
audit log, and the resident sees it when they open `/portal/requests`. Nothing is sent. Lease expiry is
similarly a query (`GET /leases/expiring`, shown as a banner on `/rental-agreements`) rather than a send.

**When Module 18 lands, wire these four triggers** (all of them are one-line calls from an existing service —
none of the domain logic needs to move):

| Trigger | Where to call it from | Who is notified |
| --- | --- | --- |
| Request submitted | `TenantRequestsService.createFromPortal()`, next to the existing `auditRequest('TENANT_REQUEST_SUBMITTED', …)` | Staff with `tenant_requests.view` |
| Request approved / rejected | `TenantRequestsService.decide()`, next to `auditRequest('TENANT_REQUEST_APPROVED' \| 'TENANT_REQUEST_REJECTED', …)` | The resident — via `User.portalTenantId` → `Tenant`, and their `decisionNote` is the body |
| Request withdrawn | `TenantRequestsService.withdraw()` (no audit row exists here yet — add one in the same shape) | Staff, so a withdrawn ask is not chased |
| Lease expiring | A scheduled job over `RentalAgreementsService.expiring()` (already returns the contact details a reminder needs) | The resident, per policy on which reminders are non-optional |

**Frontend seam:** `frontend/app/(portal)/portal/layout.tsx` is the resident shell — a bell/unread badge belongs
in its header, reading the notification list. The staff queue is `frontend/app/(dashboard)/tenant-requests/page.tsx`.

**Done when:** a resident gets an email/SMS on decision without opening the portal, and an expiry reminder is
scheduled rather than pulled.

#### 2. `PAYMENT_PLAN` execution — blocked on a Finance payment-plan model (Module 8/9)

**Today:** approving a `PAYMENT_PLAN` request records the decision and returns
`{ action: 'RECORDED_ONLY', note: '… complete it in the owning module' }` from `TenantRequestsService.execute()`.
That is deliberate rather than a stub pretending to work: there is no payment-plan entity in the schema, so there
is nothing to create.

**What is needed first (Finance owns it):** a payment-plan entity — instalments with amounts and due dates, the
arrears it covers, and what happens on a missed payment (auto-flag? suspend?). Nothing in the leasing module can
be built on top of that shape before it exists.

**Then, in this module:** add a branch to `TenantRequestsService.execute()` that creates the plan through the
Finance service and returns `{ action: 'PAYMENT_PLAN_CREATED', planId }`, so the staff queue shows what was
actually done (the `result` column already renders it). The same treatment applies to `MAINTENANT`
(Module 10 owns the workflow) and `LEASE_AMENDMENT` (no owner yet — decide whether the lease module should
delegate to it directly or whether an amendment should be a lease template).

**Done when:** approving a payment-plan request produces a plan the tenant can see in the portal, and the queue
row links to it.

## Backend: NestJS Notes
- `RentalAgreementsModule` and `MoveoutsModule` both import `UnitsModule` because every lifecycle action has to
  leave the unit's occupancy status in step.
- The pure rule modules (`lease-lifecycle.ts`, `lease-deposit.ts`, `inspections.service.compareReports`) are
  where the business rules live; the services only do I/O around them.

## Frontend: Next.js Notes
- `/rental-agreements` is the canonical lease list (the sidebar's "Leases" entry points there).
- Lifecycle actions are named buttons driven by `lease.timeline.availableActions`, never a status dropdown —
  the same pattern the unit and lead screens use.

## Acceptance Criteria
- [x] A lease can be created, activated, renewed and terminated, with correct unit occupancy state changes at each step
- [x] Move-out request produces a deposit refund calculation that's auditable

## Dependencies on Other Modules
- Depends on: Core Platform (tenants, documents), Property Management (units + occupancy sync), Finance
  (invoice ledger, arrears)
- Feeds into: Maintenance (turnovers), Reports & Analytics (arrears ageing, occupancy, lease expiries)
- **Waiting on, and the two places to pick that work up:**
  - Notifications (Module 18) — request decisions and lease-expiry reminders; triggers and call sites are
    specified in this doc under *Known Gaps → Blocked on other modules*.
  - Finance (Modules 8/9) — a payment-plan entity, so an approved `PAYMENT_PLAN` request can execute instead of
    recording `RECORDED_ONLY`.
